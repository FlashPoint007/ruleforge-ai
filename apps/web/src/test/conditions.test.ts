import { describe, expect, it } from "vitest";

import type { ConditionNode } from "@ruleforge/rule-schema";

import {
  ConditionError,
  countConditionNodes,
  evaluateConditions,
} from "@/game/rules/conditions";
import type { FactSnapshot } from "@/game/rules/conditions";

function snap(values: Record<string, number | boolean | string>, eventName = "level.start"): FactSnapshot {
  return { values, eventName };
}

describe("evaluateConditions", () => {
  it("passes when there are no conditions", () => {
    expect(evaluateConditions([], snap({}))).toBe(true);
    expect(evaluateConditions(undefined, snap({}))).toBe(true);
  });

  it("compares numbers", () => {
    const facts = snap({ "player.hp": 2 });

    expect(evaluateConditions([{ op: "gt", fact: "player.hp", value: 1 }], facts)).toBe(true);
    expect(evaluateConditions([{ op: "lt", fact: "player.hp", value: 1 }], facts)).toBe(false);
    expect(evaluateConditions([{ op: "gte", fact: "player.hp", value: 2 }], facts)).toBe(true);
    expect(evaluateConditions([{ op: "lte", fact: "player.hp", value: 2 }], facts)).toBe(true);
    expect(evaluateConditions([{ op: "eq", fact: "player.hp", value: 2 }], facts)).toBe(true);
    expect(evaluateConditions([{ op: "neq", fact: "player.hp", value: 2 }], facts)).toBe(false);
  });

  it("compares booleans and strings with eq/neq only", () => {
    const facts = snap({ "player.grounded": true, "event.zoneId": "coin-1" }, "player.enterZone");

    expect(evaluateConditions([{ op: "eq", fact: "player.grounded", value: true }], facts)).toBe(true);
    expect(evaluateConditions([{ op: "neq", fact: "event.zoneId", value: "coin-2" }], facts)).toBe(true);
  });

  it("rejects ordering operators on non-numeric facts", () => {
    expect(() =>
      evaluateConditions(
        [{ op: "gt", fact: "player.alive", value: 1 }],
        snap({ "player.alive": true }),
      ),
    ).toThrow(ConditionError);
  });

  it("supports modEq and refuses a zero divisor", () => {
    const facts = snap({ "level.elapsedMs": 1000 });

    expect(evaluateConditions([{ op: "modEq", fact: "level.elapsedMs", value: 500 }], facts)).toBe(true);
    expect(evaluateConditions([{ op: "modEq", fact: "level.elapsedMs", value: 300 }], facts)).toBe(false);
    expect(() =>
      evaluateConditions([{ op: "modEq", fact: "level.elapsedMs", value: 0 }], facts),
    ).toThrow(/divisor/);
  });

  it("evaluates all and any groups", () => {
    const facts = snap({ "player.hp": 1, "player.coinCount": 5 });

    const all: ConditionNode[] = [
      { all: [{ op: "eq", fact: "player.hp", value: 1 }, { op: "gt", fact: "player.coinCount", value: 3 }] },
    ];
    expect(evaluateConditions(all, facts)).toBe(true);

    const any: ConditionNode[] = [
      { any: [{ op: "eq", fact: "player.hp", value: 9 }, { op: "gt", fact: "player.coinCount", value: 3 }] },
    ];
    expect(evaluateConditions(any, facts)).toBe(true);

    const anyFalse: ConditionNode[] = [
      { any: [{ op: "eq", fact: "player.hp", value: 9 }, { op: "gt", fact: "player.coinCount", value: 30 }] },
    ];
    expect(evaluateConditions(anyFalse, facts)).toBe(false);
  });

  it("refuses nesting deeper than two levels", () => {
    const tooDeep: ConditionNode[] = [
      { all: [{ all: [{ op: "eq", fact: "player.hp", value: 1 }] }] },
    ];
    expect(() => evaluateConditions(tooDeep, snap({ "player.hp": 1 }))).toThrow(/nesting/);
  });

  it("throws instead of silently treating a missing fact as false", () => {
    // A silent false would disable the player's rule without telling anyone.
    expect(() =>
      evaluateConditions([{ op: "eq", fact: "player.hp", value: 1 }], snap({})),
    ).toThrow(/not available/);
  });
});

describe("countConditionNodes", () => {
  it("counts atomic and nested nodes", () => {
    expect(countConditionNodes([])).toBe(0);
    expect(countConditionNodes([{ op: "eq", fact: "player.hp", value: 1 }])).toBe(1);
    expect(
      countConditionNodes([
        { op: "eq", fact: "player.hp", value: 1 },
        { all: [{ op: "eq", fact: "player.alive", value: true }] },
      ]),
    ).toBe(3);
  });
});
