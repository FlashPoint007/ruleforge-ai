import type { P0ActionOp, RuleAction } from "@ruleforge/rule-schema";

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
  private rules: Array<{ id: string; event: string; actions: RuleAction[] }> = [];
  private packId: string | null = null;

  readonly stats: RuleRuntimeStats = {
    eventsDispatched: 0,
    eventsDropped: 0,
    actionsApplied: 0,
    actionsRejected: 0,
  };

  constructor(context: EffectContext) {
    this.context = context;
  }

  /** Loads a pack. Throws RulePackError if any action cannot actually run. */
  load(raw: unknown): void {
    const parsed = parseExecutablePack(raw);
    this.reset();

    this.packId = parsed.id;
    this.rules = (parsed.rules as Array<{ id: string; trigger: { event: string }; actions: RuleAction[] }>).map(
      (rule) => ({ id: rule.id, event: rule.trigger.event, actions: rule.actions }),
    );
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
  emit(name: RuntimeEventName, atMs: number): void {
    if (this.queue.length >= MAX_QUEUE_PER_TICK) {
      this.stats.eventsDropped += 1;
      return;
    }
    this.queue.push({ name, atMs });
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
      for (const action of rule.actions) {
        this.apply(rule.id, action, event.atMs);
      }
    }
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

  private readDuration(action: RuleAction): number | null {
    const raw = action.params["durationMs"];
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
    return this.rules.map((rule) => `${rule.event} → ${rule.actions.map((a) => a.op).join(", ")}`);
  }
}

export type { P0ActionOp };