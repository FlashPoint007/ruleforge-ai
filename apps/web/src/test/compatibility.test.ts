import { describe, expect, it } from "vitest";

import { DSL_VERSION, ENGINE_VERSION } from "@ruleforge/rule-schema";

import { checkChallengeCompatibility } from "@/game/rules/compatibility";

describe("checkChallengeCompatibility", () => {
  it("accepts a challenge from the current versions", () => {
    const result = checkChallengeCompatibility({
      dslVersion: DSL_VERSION,
      engineVersion: ENGINE_VERSION,
    });

    expect(result.level).toBe("ok");
    expect(result.reason).toBe("");
  });

  it("rejects a challenge built for another DSL version", () => {
    // Running it would apply different semantics without failing loudly.
    const result = checkChallengeCompatibility({
      dslVersion: "0.9.0",
      engineVersion: ENGINE_VERSION,
    });

    expect(result.level).toBe("rejected");
    expect(result.reason).toContain("0.9.0");
    expect(result.reason).toContain(DSL_VERSION);
  });

  it("warns but allows a challenge from another engine version", () => {
    const result = checkChallengeCompatibility({
      dslVersion: DSL_VERSION,
      engineVersion: "0.0.1",
    });

    expect(result.level).toBe("warning");
    expect(result.reason).toContain("0.0.1");
  });
});
