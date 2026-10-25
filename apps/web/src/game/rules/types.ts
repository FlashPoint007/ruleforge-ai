import type { P0ActionOp, RulePack } from "@ruleforge/rule-schema";

import type { FactValue } from "@/game/rules/conditions";

/** Events the runtime can dispatch. A closed set: nothing else may be emitted. */
export type RuntimeEventName =
  | "level.start"
  | "player.jumpCommitted"
  | "player.landed"
  | "player.enterZone"
  | "player.damage"
  | "coin.collected"
  | "enemy.defeated"
  | "timer.interval";

export interface RuntimeEvent {
  name: RuntimeEventName;
  /** Simulated time of the dispatch, in ms. Never wall-clock. */
  atMs: number;
  /**
   * Event-scoped facts, only legal while this event is handled.
   * e.g. { zoneId: "coin-7" } for player.enterZone.
   */
  facts?: Record<string, FactValue>;
}

export interface EffectContext {
  /**
   * Reads the live gravity direction (1 down, -1 up).
   *
   * A function rather than a value on purpose: a captured snapshot goes stale
   * the moment a rule flips gravity, and every later toggle would then compute
   * from the wrong baseline.
   */
  getGravityDirection: () => 1 | -1;
  setGravityDirection: (direction: 1 | -1) => void;
  setPlayerSpeedMultiplier: (multiplier: number) => void;
  setPlayerJumpMultiplier: (multiplier: number) => void;

  /** Player position, needed by actions that react to the player. */
  getPlayerPosition: () => { x: number; y: number };
  /** Every live enemy, so rules can act on the whole set. */
  getEnemies: () => ReadonlyArray<{
    setSpeedMultiplier: (multiplier: number) => void;
    reverse: () => void;
  }>;
  /**
   * Reads a world fact by DSL path, e.g. "player.hp".
   *
   * Returns undefined for a path this world does not have. The evaluator turns
   * that into a loud ConditionError rather than a silent false.
   */
  readFact: (path: string) => FactValue | undefined;
  /** Every uncollected coin, so rules can act on the whole set. */
  getCoins: () => ReadonlyArray<{
    x: number;
    y: number;
    flee: (fromX: number, fromY: number, radius: number, speed: number) => void;
  }>;
}

/** A live effect. Timed effects revert themselves when they expire. */
export interface ActiveEffect {
  ruleId: string;
  op: P0ActionOp;
  /** Simulated ms when this effect must be reverted, or null if it is permanent. */
  expiresAtMs: number | null;
  revert: () => void;
}

export interface RuleRuntimeStats {
  eventsDispatched: number;
  eventsDropped: number;
  actionsApplied: number;
  actionsRejected: number;
  /** Events that matched a rule but failed its conditions. */
  conditionsBlocked: number;
}

/** Broadcast whenever the scene's rule state changes. */
export const RULES_CHANGED_EVENT = "ruleforge:rules-changed";

export interface RulesChangedPayload {
  packId: string | null;
  error: string | null;
  stats: RuleRuntimeStats;
}

export interface RuntimePackState {
  pack: RulePack | null;
  error: string | null;
}