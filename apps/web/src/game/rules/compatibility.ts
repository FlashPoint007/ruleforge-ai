import { DSL_VERSION, ENGINE_VERSION } from "@ruleforge/rule-schema";

export type CompatibilityLevel = "ok" | "warning" | "rejected";

export interface CompatibilityResult {
  level: CompatibilityLevel;
  /** Human-readable reason, shown to the player. Empty when level is "ok". */
  reason: string;
}

export interface ChallengeVersions {
  dslVersion: string;
  engineVersion: string;
}

/**
 * Decides whether this client can replay a frozen challenge.
 *
 * A challenge pins the DSL and engine versions it was created with. Running a
 * pack built for a different DSL version would not fail loudly — it would apply
 * the wrong semantics — so a mismatch is surfaced before the rule is loaded
 * rather than after the player notices the game behaving oddly.
 */
export function checkChallengeCompatibility(challenge: ChallengeVersions): CompatibilityResult {
  if (challenge.dslVersion !== DSL_VERSION) {
    return {
      level: "rejected",
      reason: `这条挑战使用的是 DSL v${challenge.dslVersion}，当前客户端是 v${DSL_VERSION}，无法保证语义一致。`,
    };
  }

  if (challenge.engineVersion !== ENGINE_VERSION) {
    return {
      level: "warning",
      reason: `这条挑战来自引擎 v${challenge.engineVersion}，当前是 v${ENGINE_VERSION}，物理表现可能略有差异。`,
    };
  }

  return { level: "ok", reason: "" };
}
