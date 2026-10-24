import { describe, expect, it } from "vitest";

import { DSL_VERSION, P0_ACTIONS, P0_EVENTS, validateRulePackShape } from "./index";

const validPack = {
  dslVersion: DSL_VERSION,
  engineVersion: "0.1.0",
  packId: "pack-1",
  levelId: "lab-01",
  levelVersion: "1",
  seed: 42,
  rules: [
    {
      id: "rule-1",
      trigger: { event: "player.jumpCommitted" },
      conditions: [],
      actions: [{ op: "player.gravity.toggle", target: "player", params: { magnitude: 980 } }],
    },
  ],
};

describe("validateRulePackShape", () => {
  it("accepts a valid minimal pack", () => {
    expect(validateRulePackShape(validPack)).toEqual({ ok: true, errors: [] });
  });

  it("rejects a mismatched dsl version", () => {
    const result = validateRulePackShape({ ...validPack, dslVersion: "1.0.0" });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("dslVersion");
  });

  it("rejects more than three rules", () => {
    const rule = validPack.rules[0];
    const result = validateRulePackShape({ ...validPack, rules: [rule, rule, rule, rule] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("limit is 3");
  });

  it("rejects an unregistered action op", () => {
    const result = validateRulePackShape({
      ...validPack,
      rules: [
        {
          ...validPack.rules[0],
          actions: [{ op: "player.teleport.anywhere", target: "player", params: {} }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("not a registered P0 action");
  });

  it("rejects an unregistered trigger event", () => {
    const result = validateRulePackShape({
      ...validPack,
      rules: [{ ...validPack.rules[0], trigger: { event: "player.dance" } }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("not a registered P0 event");
  });

  it("publishes the exact P0 registry sizes", () => {
    expect(P0_EVENTS).toHaveLength(8);
    expect(P0_ACTIONS).toHaveLength(12);
  });
});
