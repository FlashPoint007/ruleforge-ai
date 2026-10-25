import { beforeEach, describe, expect, it, vi } from "vitest";

import { RuleRuntime } from "@/game/rules/RuleRuntime";
import { RulePackError, parseExecutablePack } from "@/game/rules/rulePack";
import type { EffectContext } from "@/game/rules/types";

function makeContext() {
  let gravity: 1 | -1 = 1;
  let speed = 1;
  let jump = 1;

  const context: EffectContext = {
    getGravityDirection: () => gravity,
    setGravityDirection: (direction) => {
      gravity = direction;
    },
    setPlayerSpeedMultiplier: (value) => {
      speed = value;
    },
    setPlayerJumpMultiplier: (value) => {
      jump = value;
    },
  };

  return {
    context,
    read: () => ({ gravity, speed, jump }),
  };
}

const gravityPack = {
  dslVersion: "1.1.0",
  packId: "pack-gravity",
  levelId: "lab-01",
  rules: [
    {
      id: "rule-gravity-flip",
      trigger: { event: "player.jumpCommitted" },
      conditions: [],
      actions: [{ op: "player.gravity.toggle", target: "player", params: { magnitude: 980 } }],
    },
  ],
};

describe("RuleRuntime", () => {
  let harness: ReturnType<typeof makeContext>;
  let runtime: RuleRuntime;

  beforeEach(() => {
    harness = makeContext();
    runtime = new RuleRuntime(harness.context);
  });

  it("flips gravity when the triggering event fires", () => {
    runtime.load(gravityPack);
    expect(harness.read().gravity).toBe(1);

    runtime.emit("player.jumpCommitted", 0);
    runtime.tick(16);

    expect(harness.read().gravity).toBe(-1);
    expect(runtime.stats.actionsApplied).toBe(1);
  });

  it("flips back on the next jump", () => {
    runtime.load(gravityPack);

    runtime.emit("player.jumpCommitted", 0);
    runtime.tick(16);
    runtime.emit("player.jumpCommitted", 100);
    runtime.tick(120);

    expect(harness.read().gravity).toBe(1);
  });

  it("ignores events no rule listens to", () => {
    runtime.load(gravityPack);

    runtime.emit("coin.collected", 0);
    runtime.tick(16);

    expect(harness.read().gravity).toBe(1);
    expect(runtime.stats.actionsApplied).toBe(0);
    expect(runtime.stats.eventsDispatched).toBe(1);
  });

  it("unwinds every effect on reset", () => {
    runtime.load(gravityPack);
    runtime.emit("player.jumpCommitted", 0);
    runtime.tick(16);
    expect(harness.read().gravity).toBe(-1);

    runtime.reset();

    expect(harness.read().gravity).toBe(1);
    expect(runtime.activeEffects).toHaveLength(0);
  });

  it("reverts a timed effect when it expires", () => {
    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-speed",
          trigger: { event: "coin.collected" },
          conditions: [],
          actions: [
            {
              op: "player.speed.multiply",
              target: "player",
              params: { factor: 1.5, durationMs: 1000 },
            },
          ],
        },
      ],
    });

    runtime.emit("coin.collected", 0);
    runtime.tick(0);
    expect(harness.read().speed).toBe(1.5);

    runtime.tick(999);
    expect(harness.read().speed).toBe(1.5);

    runtime.tick(1000);
    expect(harness.read().speed).toBe(1);
  });

  it("keeps a permanent effect until reset", () => {
    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-speed",
          trigger: { event: "level.start" },
          conditions: [],
          actions: [{ op: "player.speed.multiply", target: "player", params: { factor: 1.4 } }],
        },
      ],
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);
    runtime.tick(60_000);

    expect(harness.read().speed).toBe(1.4);
  });

  it("unwinds stacked effects in reverse order", () => {
    const order: number[] = [];
    const localRuntime = new RuleRuntime({
      getGravityDirection: () => 1,
      setGravityDirection: vi.fn(),
      setPlayerSpeedMultiplier: (value) => order.push(value),
      setPlayerJumpMultiplier: vi.fn(),
    });

    localRuntime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-a",
          trigger: { event: "level.start" },
          conditions: [],
          actions: [{ op: "player.speed.multiply", target: "player", params: { factor: 2 } }],
        },
        {
          id: "rule-b",
          trigger: { event: "level.start" },
          conditions: [],
          actions: [{ op: "player.speed.multiply", target: "player", params: { factor: 0.5 } }],
        },
      ],
    });

    localRuntime.emit("level.start", 0);
    localRuntime.tick(0);
    order.length = 0;

    localRuntime.reset();

    // Reverts happen newest-first, each restoring the neutral value.
    expect(order).toEqual([1, 1]);
  });

  it("drops events beyond the per-tick queue bound", () => {
    runtime.load(gravityPack);

    for (let i = 0; i < 200; i += 1) {
      runtime.emit("player.jumpCommitted", i);
    }

    expect(runtime.stats.eventsDropped).toBeGreaterThan(0);

    runtime.tick(0);
    expect(runtime.stats.eventsDispatched).toBeLessThan(200);
  });
});

describe("parseExecutablePack", () => {
  it("accepts the shipped gravity preset", () => {
    expect(() => parseExecutablePack(gravityPack)).not.toThrow();
  });

  it("rejects an action that is registered but not implemented", () => {
    expect(() =>
      parseExecutablePack({
        ...gravityPack,
        rules: [
          {
            id: "rule-spawn",
            trigger: { event: "coin.collected" },
            conditions: [],
            actions: [{ op: "enemy.spawn", target: "enemies", params: {} }],
          },
        ],
      }),
    ).toThrow(/not implemented yet/);
  });

  it("rejects a parameter outside the spec bounds", () => {
    expect(() =>
      parseExecutablePack({
        ...gravityPack,
        rules: [
          {
            id: "rule-gravity",
            trigger: { event: "player.jumpCommitted" },
            conditions: [],
            actions: [
              { op: "player.gravity.toggle", target: "player", params: { magnitude: 9999 } },
            ],
          },
        ],
      }),
    ).toThrow(/outside 500-1400/);
  });

  it("rejects an unknown event", () => {
    expect(() =>
      parseExecutablePack({
        ...gravityPack,
        rules: [
          {
            id: "rule-x",
            trigger: { event: "player.dance" },
            conditions: [],
            actions: [{ op: "player.gravity.toggle", target: "player", params: { magnitude: 900 } }],
          },
        ],
      }),
    ).toThrow(RulePackError);
  });

  it("rejects a pack with more than three rules", () => {
    const rule = gravityPack.rules[0];
    expect(() =>
      parseExecutablePack({ ...gravityPack, rules: [rule, rule, rule, rule] }),
    ).toThrow(/limit is 3/);
  });
});
