import type { ConditionNode, P0ActionOp, RuleAction } from "@ruleforge/rule-schema";

import { ConditionError, evaluateConditions } from "@/game/rules/conditions";
import type { FactValue } from "@/game/rules/conditions";
import { RulePackError, parseExecutablePack } from "@/game/rules/rulePack";
import type {
  ActiveEffect,
  EffectContext,
  RuleRuntimeStats,
  RuntimeEvent,
  RuntimeEventName,
} from "@/game/rules/types";

/** Effects are capped at 10s by the DSL spec; anything longer is a bug upstream. */
const MAX_EFFECT_MS = 10_000;
/** The event queue is bounded so a misbehaving rule cannot starve the frame. */
const MAX_QUEUE_PER_TICK = 64;

/**
 * The deterministic rule engine.
 *
 * Design constraints that matter more than features:
 * - Time is simulated, never wall-clock, so replay and tests are stable.
 * - Every effect registers an undo; reset() replays them all, so no rule can
 *   leak state into the next life.
 * - An action that cannot be applied is counted and skipped, never guessed at.
 */
export class RuleRuntime {
  private context: EffectContext;
  private queue: RuntimeEvent[] = [];
  private active: ActiveEffect[] = [];
  private rules: Array<{
    id: string;
    event: string;
    conditions: ConditionNode[];
    actions: RuleAction[];
  }> = [];
  private packId: string | null = null;

  readonly stats: RuleRuntimeStats = {
    eventsDispatched: 0,
    eventsDropped: 0,
    actionsApplied: 0,
    actionsRejected: 0,
    conditionsBlocked: 0,
  };

  constructor(context: EffectContext) {
    this.context = context;
  }

  /** Loads a pack. Throws RulePackError if any action cannot actually run. */
  load(raw: unknown): void {
    const parsed = parseExecutablePack(raw);
    this.reset();

    this.packId = parsed.id;
    this.rules = (
      parsed.rules as Array<{
        id: string;
        trigger: { event: string };
        conditions?: ConditionNode[];
        actions: RuleAction[];
      }>
    ).map((rule) => ({
      id: rule.id,
      event: rule.trigger.event,
      conditions: rule.conditions ?? [],
      actions: rule.actions,
    }));
  }

  unload(): void {
    this.reset();
    this.rules = [];
    this.packId = null;
  }

  get loadedPackId(): string | null {
    return this.packId;
  }

  get activeEffects(): readonly ActiveEffect[] {
    return this.active;
  }

  /** Queues an event. Never executes immediately: ordering stays deterministic. */
  emit(name: RuntimeEventName, atMs: number, facts?: Record<string, FactValue>): void {
    if (this.queue.length >= MAX_QUEUE_PER_TICK) {
      this.stats.eventsDropped += 1;
      return;
    }
    this.queue.push(facts === undefined ? { name, atMs } : { name, atMs, facts });
  }

  /**
   * Drains the queue for this tick, then expires timed effects.
   * Call exactly once per simulation step.
   */
  tick(nowMs: number): void {
    const pending = this.queue;
    this.queue = [];

    for (const event of pending) {
      this.dispatch(event);
    }

    this.expireEffects(nowMs);
  }

  private dispatch(event: RuntimeEvent): void {
    this.stats.eventsDispatched += 1;

    for (const rule of this.rules) {
      if (rule.event !== event.name) {
        continue;
      }

      if (!this.passesConditions(rule.conditions, event)) {
        this.stats.conditionsBlocked += 1;
        continue;
      }

      for (const action of rule.actions) {
        this.apply(rule.id, action, event.atMs);
      }
    }
  }

  /**
   * Evaluates a rule's conditions against the current world.
   *
   * A condition that cannot be evaluated (unknown fact, bad operand type) is
   * treated as blocking: the rule does not fire. Firing a rule whose guard could
   * not be checked would apply an effect the player never asked for.
   */
  private passesConditions(conditions: ConditionNode[], event: RuntimeEvent): boolean {
    if (conditions.length === 0) {
      return true;
    }

    const values: Record<string, FactValue | undefined> = {};

    try {
      for (const rule of conditions) {
        this.collectFacts(rule, values, event);
      }
      return evaluateConditions(conditions, { values, eventName: event.name });
    } catch (error) {
      if (error instanceof ConditionError) {
        return false;
      }
      throw error;
    }
  }

  /** Walks a condition tree and resolves every fact path it mentions. */
  private collectFacts(
    node: ConditionNode,
    into: Record<string, FactValue | undefined>,
    event: RuntimeEvent,
  ): void {
    const atomic = node as { op?: unknown; fact?: unknown; all?: ConditionNode[]; any?: ConditionNode[] };

    if (typeof atomic.op === "string" && typeof atomic.fact === "string") {
      into[atomic.fact] = this.resolveFact(atomic.fact, event);
      return;
    }

    for (const child of atomic.all ?? atomic.any ?? []) {
      this.collectFacts(child, into, event);
    }
  }

  /**
   * Resolves one DSL fact path.
   *
   * Event-scoped facts are only legal while their own event is being handled:
   * reading event.zoneId during coin.collected is a pack bug, and it must fail
   * rather than quietly read another event's data.
   */
  private resolveFact(path: string, event: RuntimeEvent): FactValue | undefined {
    if (path.startsWith("event.")) {
      const key = path.slice("event.".length);
      const scoped = event.facts?.[key];
      if (scoped === undefined) {
        throw new ConditionError(`event fact "${path}" is not available during ${event.name}`);
      }
      return scoped;
    }

    return this.context.readFact(path);
  }

  private apply(ruleId: string, action: RuleAction, atMs: number): void {
    try {
      const effect = this.buildEffect(ruleId, action, atMs);
      if (effect === null) {
        this.stats.actionsRejected += 1;
        return;
      }
      this.active.push(effect);
      this.stats.actionsApplied += 1;
    } catch {
      this.stats.actionsRejected += 1;
    }
  }

  private buildEffect(ruleId: string, action: RuleAction, atMs: number): ActiveEffect | null {
    const duration = this.readDuration(action);

    switch (action.op) {
      case "player.gravity.toggle": {
        const previous = this.context.getGravityDirection();
        this.context.setGravityDirection(previous === 1 ? -1 : 1);
        return {
          ruleId,
          op: action.op,
          // Gravity is a controller state, not a timed buff: it persists until
          // the next toggle or until the rules are unloaded.
          expiresAtMs: null,
          revert: () => this.context.setGravityDirection(previous),
        };
      }

      case "player.speed.multiply": {
        const factor = this.readNumber(action, "factor");
        this.context.setPlayerSpeedMultiplier(factor);
        return {
          ruleId,
          op: action.op,
          expiresAtMs: duration === null ? null : atMs + duration,
          revert: () => this.context.setPlayerSpeedMultiplier(1),
        };
      }

      case "player.jump.scale": {
        const factor = this.readNumber(action, "factor");
        this.context.setPlayerJumpMultiplier(factor);
        return {
          ruleId,
          op: action.op,
          expiresAtMs: duration === null ? null : atMs + duration,
          revert: () => this.context.setPlayerJumpMultiplier(1),
        };
      }

      case "enemy.speed.multiply": {
        const factor = this.readNumber(action, "factor");
        // Applies to the set of enemies alive right now. Enemies spawned later
        // are not retroactively slowed, which matches the spec wording
        // "all existing enemies".
        for (const enemy of this.context.getEnemies()) {
          enemy.setSpeedMultiplier(factor);
        }
        return {
          ruleId,
          op: action.op,
          expiresAtMs: duration === null ? null : atMs + duration,
          revert: () => {
            for (const enemy of this.context.getEnemies()) {
              enemy.setSpeedMultiplier(1);
            }
          },
        };
      }

      case "enemy.direction.reverse": {
        const enemies = this.context.getEnemies();
        for (const enemy of enemies) {
          enemy.reverse();
        }
        return {
          ruleId,
          op: action.op,
          // A reversal is an instantaneous event, not a state: reverting it on
          // reset would flip the enemies a second time and look like a bug.
          expiresAtMs: null,
          revert: () => undefined,
        };
      }

      case "player.shield.grant": {
        const shieldMs = this.readDuration(action) ?? 5000;
        this.context.grantShield(shieldMs);
        return {
          ruleId,
          op: action.op,
          expiresAtMs: atMs + shieldMs,
          revert: () => this.context.grantShield(0),
        };
      }

      case "enemy.spawn": {
        const count = this.readNumber(action, "count");
        const points = this.context.getEnemySpawnPoints();
        let spawned = 0;
        for (const point of points) {
          if (spawned >= count) {
            break;
          }
          if (this.context.spawnEnemy(point)) {
            spawned += 1;
          }
        }
        if (spawned === 0) {
          // No safe point left: refuse rather than spawning somewhere illegal.
          throw new RulePackError("no safe enemy spawn point available");
        }
        return {
          ruleId,
          op: action.op,
          expiresAtMs: null,
          // Spawned enemies are level content; removing them on reset would
          // erase something the player can see and is standing next to.
          revert: () => undefined,
        };
      }

      case "coin.spawn": {
        const count = this.readNumber(action, "count");
        const points = this.context.getCoinSpawnPoints();
        let spawned = 0;
        for (const point of points) {
          if (spawned >= count) {
            break;
          }
          if (this.context.spawnCoin(point)) {
            spawned += 1;
          }
        }
        if (spawned === 0) {
          throw new RulePackError("no safe coin spawn point available");
        }
        return {
          ruleId,
          op: action.op,
          expiresAtMs: null,
          revert: () => undefined,
        };
      }

      case "platform.collapseAfter": {
        const delayMs = this.readDelay(action);
        const platforms = this.context.getCollapsiblePlatforms();
        if (platforms.length === 0) {
          // The spec limits this action to collapsible platforms; a level with
          // none must fail loudly instead of collapsing something else.
          throw new RulePackError("level has no collapsible platforms");
        }
        for (const platform of platforms) {
          platform.collapseNow(delayMs);
        }
        return {
          ruleId,
          op: action.op,
          expiresAtMs: null,
          revert: () => undefined,
        };
      }

      case "platform.visibility.set": {
        const platformId = String(action.params["platformId"] ?? "");
        const visible = action.params["visible"] === true;
        if (!this.context.setPlatformVisible(platformId, visible)) {
          throw new RulePackError(`platform "${platformId}" is not a hideable platform in this level`);
        }
        return {
          ruleId,
          op: action.op,
          expiresAtMs: duration === null ? null : atMs + duration,
          revert: () => {
            this.context.setPlatformVisible(platformId, !visible);
          },
        };
      }

      case "checkpoint.activate": {
        const checkpointId = String(action.params["checkpointId"] ?? "");
        if (!this.context.activateCheckpoint(checkpointId)) {
          throw new RulePackError(`checkpoint "${checkpointId}" is not defined in this level`);
        }
        return {
          ruleId,
          op: action.op,
          expiresAtMs: null,
          // A checkpoint move is progress, not a buff: undoing it on reset would
          // send the player back to the start for no visible reason.
          revert: () => undefined,
        };
      }

      case "coin.flee": {
        const radius = this.readNumber(action, "radius");
        const speed = this.readNumber(action, "speed");
        const player = this.context.getPlayerPosition();
        for (const coin of this.context.getCoins()) {
          coin.flee(player.x, player.y, radius, speed);
        }
        return {
          ruleId,
          op: action.op,
          expiresAtMs: null,
          // Coins keep their new position: the flee already happened.
          revert: () => undefined,
        };
      }

      default:
        return null;
    }
  }

  private readNumber(action: RuleAction, key: string): number {
    const value = action.params[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new RulePackError(`${action.op} requires numeric param "${key}"`);
    }
    return value;
  }

  private readDelay(action: RuleAction): number {
    const value = action.params["delayMs"];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new RulePackError("platform.collapseAfter requires a numeric delayMs");
    }
    if (value < 250 || value > 5000) {
      throw new RulePackError(`platform.collapseAfter delayMs=${value} is outside 250-5000`);
    }
    return value;
  }

  /**
   * Reads a duration parameter.
   *
   * The spec names this parameter differently per action: buffs use
   * `durationMs`, platform.collapseAfter uses `delayMs`. Reading only one name
   * would silently ignore the author's value and fall back to a default.
   */
  private readDuration(action: RuleAction): number | null {
    const raw = action.params["durationMs"] ?? action.params["delayMs"];
    if (raw === undefined) {
      return null;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      throw new RulePackError(`${action.op} has an invalid durationMs`);
    }
    if (raw > MAX_EFFECT_MS) {
      throw new RulePackError(`${action.op} durationMs exceeds the ${MAX_EFFECT_MS}ms cap`);
    }
    return raw;
  }

  private expireEffects(nowMs: number): void {
    if (this.active.length === 0) {
      return;
    }

    const surviving: ActiveEffect[] = [];
    for (const effect of this.active) {
      if (effect.expiresAtMs !== null && nowMs >= effect.expiresAtMs) {
        effect.revert();
      } else {
        surviving.push(effect);
      }
    }
    this.active = surviving;
  }

  /**
   * Reverts every active effect in reverse order.
   *
   * Reverse order matters: two effects on the same field must unwind the way
   * they were stacked, or the field is left at a value no rule ever set.
   */
  reset(): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      this.active[index]?.revert();
    }
    this.active = [];
    this.queue = [];
  }

  /** Debug surface for the HUD. */
  describe(): string[] {
    return this.rules.map((rule) => {
      const guard =
        rule.conditions.length > 0 ? ` 当 [${rule.conditions.length} 个条件] ` : " ";
      return `${rule.event}${guard}→ ${rule.actions.map((a) => a.op).join(", ")}`;
    });
  }
}

export type { P0ActionOp };