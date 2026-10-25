import type { P0ActionOp, RulePack } from "@ruleforge/rule-schema";

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