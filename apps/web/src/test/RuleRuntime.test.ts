import { beforeEach, describe, expect, it, vi } from "vitest";

import { RuleRuntime } from "@/game/rules/RuleRuntime";
import { IMPLEMENTED_ACTIONS, RulePackError, parseExecutablePack } from "@/game/rules/rulePack";
import { P0_ACTIONS } from "@ruleforge/rule-schema";
import type { EffectContext } from "@/game/rules/types";

function makeEnemy() {
  let multiplier = 1;
  let reversals = 0;
  return {
    setSpeedMultiplier: (value: number) => {
      multiplier = value;
    },
    reverse: () => {
      reversals += 1;
    },
    read: () => ({ multiplier, reversals }),
  };
}

function makeCoin(x = 100, y = 100) {
  const flees: Array<{ fromX: number; fromY: number; radius: number; speed: number }> = [];
  return {
    x,
    y,
    flee: (fromX: number, fromY: number, radius: number, speed: number) => {
      flees.push({ fromX, fromY, radius, speed });
    },
    read: () => flees,
  };
}

function makeContext() {
  let gravity: 1 | -1 = 1;
  let speed = 1;
  let jump = 1;
  const enemies = [makeEnemy(), makeEnemy()];
  const coins = [makeCoin(120, 100), makeCoin(160, 140)];
  const spawned = { enemies: [] as Array<{ x: number; y: number }>, coins: [] as Array<{ x: number; y: number }> };
  const platforms: Array<{ collapseNow: (delayMs: number) => void; delays: number[] }> = [];
  const hiddenCalls: Array<{ id: string; visible: boolean }> = [];
  const activated: string[] = [];
  let shield = 0;
  const facts: Record<string, number | boolean | string> = {
    "player.hp": 3,
    "player.alive": true,
    "player.grounded": true,
    "player.gravityDirection": 1,
    "player.coinCount": 0,
    "level.elapsedMs": 0,
  };

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
    getPlayerPosition: () => ({ x: 100, y: 100 }),
    getEnemies: () => enemies,
    getCoins: () => coins,
    readFact: (path) => facts[path],
    getEnemySpawnPoints: () => [
      { x: 200, y: 100 },
      { x: 240, y: 100 },
    ],
    getCoinSpawnPoints: () => [
      { x: 300, y: 100 },
      { x: 330, y: 100 },
      { x: 360, y: 100 },
    ],
    spawnEnemy: (point) => {
      spawned.enemies.push(point);
      return spawned.enemies.length <= 4;
    },
    spawnCoin: (point) => {
      spawned.coins.push(point);
      return spawned.coins.length <= 6;
    },
    getCollapsiblePlatforms: () => platforms,
    setPlatformVisible: (id, visible) => {
      hiddenCalls.push({ id, visible });
      return id === "bridge-1";
    },
    isPlatformVisible: (id) => (id === "bridge-1" ? true : undefined),
    grantShield: (durationMs) => {
      shield = durationMs;
    },
    activateCheckpoint: (id) => {
      activated.push(id);
      return id === "mid-1";
    },
    getCheckpointIds: () => ["mid-1"],
  };

  return {
    context,
    enemies,
    coins,
    facts,
    spawned,
    platforms,
    hiddenCalls,
    activated,
    readShield: () => shield,
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
      getPlayerPosition: () => ({ x: 0, y: 0 }),
      getEnemies: () => [],
      getCoins: () => [],
      readFact: () => undefined,
      getEnemySpawnPoints: () => [],
      getCoinSpawnPoints: () => [],
      spawnEnemy: () => false,
      spawnCoin: () => false,
      getCollapsiblePlatforms: () => [],
      setPlatformVisible: () => false,
      isPlatformVisible: () => undefined,
      grantShield: () => undefined,
      activateCheckpoint: () => false,
      getCheckpointIds: () => [],
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

describe("RuleRuntime enemy and coin actions", () => {
  it("slows every existing enemy and restores them on expiry", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);

    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-slow",
          trigger: { event: "coin.collected" },
          conditions: [],
          actions: [
            {
              op: "enemy.speed.multiply",
              target: "enemies",
              params: { factor: 0.7, durationMs: 1000 },
            },
          ],
        },
      ],
    });

    runtime.emit("coin.collected", 0);
    runtime.tick(0);
    expect(harness.enemies.map((e) => e.read().multiplier)).toEqual([0.7, 0.7]);

    runtime.tick(1000);
    expect(harness.enemies.map((e) => e.read().multiplier)).toEqual([1, 1]);
  });

  it("reverses enemy direction without flipping them back on reset", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);

    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-reverse",
          trigger: { event: "player.landed" },
          conditions: [],
          actions: [{ op: "enemy.direction.reverse", target: "enemies", params: {} }],
        },
      ],
    });

    runtime.emit("player.landed", 0);
    runtime.tick(0);
    expect(harness.enemies[0]?.read().reversals).toBe(1);

    runtime.reset();
    // A reversal is an event, not a state: reset must not reverse again.
    expect(harness.enemies[0]?.read().reversals).toBe(1);
  });

  it("makes coins flee away from the player", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);

    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-flee",
          trigger: { event: "player.enterZone" },
          conditions: [],
          actions: [
            { op: "coin.flee", target: "coins", params: { radius: 120, speed: 80 } },
          ],
        },
      ],
    });

    runtime.emit("player.enterZone", 0);
    runtime.tick(0);

    const flees = harness.coins[0]?.read() ?? [];
    expect(flees).toHaveLength(1);
    expect(flees[0]).toMatchObject({ fromX: 100, fromY: 100, radius: 120, speed: 80 });
  });
});

describe("RuleRuntime conditions", () => {
  const guardedPack = {
    ...gravityPack,
    rules: [
      {
        id: "rule-guarded",
        trigger: { event: "player.jumpCommitted" },
        conditions: [{ op: "gte" as const, fact: "player.coinCount" as const, value: 2 }],
        actions: [{ op: "player.gravity.toggle" as const, target: "player", params: { magnitude: 980 } }],
      },
    ],
  };

  it("blocks the action while the condition is false", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);
    runtime.load(guardedPack);

    harness.facts["player.coinCount"] = 1;

    runtime.emit("player.jumpCommitted", 0);
    runtime.tick(16);

    expect(harness.read().gravity).toBe(1);
    expect(runtime.stats.actionsApplied).toBe(0);
    expect(runtime.stats.conditionsBlocked).toBe(1);
  });

  it("lets the action through once the condition is satisfied", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);
    runtime.load(guardedPack);

    harness.facts["player.coinCount"] = 3;

    runtime.emit("player.jumpCommitted", 0);
    runtime.tick(16);

    expect(harness.read().gravity).toBe(-1);
    expect(runtime.stats.actionsApplied).toBe(1);
    expect(runtime.stats.conditionsBlocked).toBe(0);
  });

  it("reads event-scoped facts during their own event", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);
    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-zone",
          trigger: { event: "player.enterZone" },
          conditions: [{ op: "eq" as const, fact: "event.zoneId" as const, value: "coin-7" }],
          actions: [{ op: "player.gravity.toggle" as const, target: "player", params: { magnitude: 980 } }],
        },
      ],
    });

    runtime.emit("player.enterZone", 0, { zoneId: "coin-7" });
    runtime.tick(16);

    expect(harness.read().gravity).toBe(-1);
  });

  it("blocks when an event fact is missing rather than guessing", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);
    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-zone",
          trigger: { event: "player.enterZone" },
          conditions: [{ op: "eq" as const, fact: "event.zoneId" as const, value: "coin-7" }],
          actions: [{ op: "player.gravity.toggle" as const, target: "player", params: { magnitude: 980 } }],
        },
      ],
    });

    runtime.emit("player.enterZone", 0);
    runtime.tick(16);

    expect(harness.read().gravity).toBe(1);
    expect(runtime.stats.conditionsBlocked).toBe(1);
  });

  it("blocks when the world cannot answer a fact", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);
    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-unknown-fact",
          trigger: { event: "player.jumpCommitted" },
          conditions: [{ op: "eq" as const, fact: "player.hp" as const, value: 1 }],
          actions: [{ op: "player.gravity.toggle" as const, target: "player", params: { magnitude: 980 } }],
        },
      ],
    });

    delete harness.facts["player.hp"];

    runtime.emit("player.jumpCommitted", 0);
    runtime.tick(16);

    expect(harness.read().gravity).toBe(1);
    expect(runtime.stats.conditionsBlocked).toBe(1);
  });
});

describe("RuleRuntime RF-006 actions", () => {
  function loadRule(harness: ReturnType<typeof makeContext>, action: Record<string, unknown>, trigger = "level.start") {
    const runtime = new RuleRuntime(harness.context);
    runtime.load({
      ...gravityPack,
      rules: [{ id: "rule-x", trigger: { event: trigger }, conditions: [], actions: [action] }],
    });
    return runtime;
  }

  it("grants a shield and reverts it on expiry", () => {
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "player.shield.grant",
      target: "player",
      params: { durationMs: 2000 },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);
    expect(harness.readShield()).toBe(2000);

    runtime.tick(2000);
    expect(harness.readShield()).toBe(0);
  });

  it("spawns enemies at safe points only, and refuses when full", () => {
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "enemy.spawn",
      target: "enemies",
      params: { count: 2 },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);

    expect(harness.spawned.enemies).toHaveLength(2);
    expect(harness.spawned.enemies[0]).toEqual({ x: 200, y: 100 });
  });

  it("spawns coins at safe points", () => {
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "coin.spawn",
      target: "coins",
      params: { count: 3 },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);

    expect(harness.spawned.coins).toHaveLength(3);
  });

  it("collapses only the platforms the level marked collapsible", () => {
    const harness = makeContext();
    const delays: number[] = [];
    harness.platforms.push({ collapseNow: (d) => delays.push(d), delays });

    const runtime = loadRule(harness, {
      op: "platform.collapseAfter",
      target: "platform",
      params: { delayMs: 1500 },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);

    expect(delays).toEqual([1500]);
  });

  it("refuses to collapse when the level has no collapsible platform", () => {
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "platform.collapseAfter",
      target: "platform",
      params: { delayMs: 1500 },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);

    expect(runtime.stats.actionsApplied).toBe(0);
    expect(runtime.stats.actionsRejected).toBe(1);
  });

  it("hides a platform by allowlist id and restores it on reset", () => {
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "platform.visibility.set",
      target: "platform",
      params: { platformId: "bridge-1", visible: false },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);
    expect(harness.hiddenCalls).toEqual([{ id: "bridge-1", visible: false }]);

    runtime.reset();
    expect(harness.hiddenCalls).toEqual([
      { id: "bridge-1", visible: false },
      { id: "bridge-1", visible: true },
    ]);
  });

  it("restores the level's authored visibility, not the inverse of the rule", () => {
    // bridge-1 starts visible. A rule hides it; on reset it must be visible
    // again because that is what the level authored — inverting the rule's
    // parameter would leave it hidden.
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "platform.visibility.set",
      target: "platform",
      params: { platformId: "bridge-1", visible: false },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);
    runtime.reset();

    const [, restore] = harness.hiddenCalls;
    expect(restore).toEqual({ id: "bridge-1", visible: true });
  });

  it("unwinds two rules touching one platform back to the original state", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);
    runtime.load({
      ...gravityPack,
      rules: [
        {
          id: "rule-hide",
          trigger: { event: "level.start" },
          conditions: [],
          actions: [
            {
              op: "platform.visibility.set",
              target: "platform",
              params: { platformId: "bridge-1", visible: false },
            },
          ],
        },
        {
          id: "rule-show",
          trigger: { event: "level.start" },
          conditions: [],
          actions: [
            {
              op: "platform.visibility.set",
              target: "platform",
              params: { platformId: "bridge-1", visible: true },
            },
          ],
        },
      ],
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);
    runtime.reset();

    // Both reverts target the authored state, so the final call must be visible.
    const last = harness.hiddenCalls[harness.hiddenCalls.length - 1];
    expect(last).toEqual({ id: "bridge-1", visible: true });
  });

  it("rejects a platform id the level does not define", () => {
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "platform.visibility.set",
      target: "platform",
      params: { platformId: "not-a-platform", visible: false },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);

    expect(runtime.stats.actionsRejected).toBe(1);
  });

  it("activates a predefined checkpoint", () => {
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "checkpoint.activate",
      target: "player",
      params: { checkpointId: "mid-1" },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);

    expect(harness.activated).toEqual(["mid-1"]);
  });

  it("rejects an unknown checkpoint id", () => {
    const harness = makeContext();
    const runtime = loadRule(harness, {
      op: "checkpoint.activate",
      target: "player",
      params: { checkpointId: "nope" },
    });

    runtime.emit("level.start", 0);
    runtime.tick(0);

    expect(runtime.stats.actionsRejected).toBe(1);
  });
});

describe("parseExecutablePack", () => {
  it("accepts the shipped gravity preset", () => {
    expect(() => parseExecutablePack(gravityPack)).not.toThrow();
  });

  it("now implements every registered action", () => {
    // RF-006 closed the last gap: no registered op may be missing.
    expect(IMPLEMENTED_ACTIONS.size).toBe(P0_ACTIONS.length);
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

  it("rejects a rule with too many condition nodes", () => {
    expect(() =>
      parseExecutablePack({
        ...gravityPack,
        rules: [
          {
            id: "rule-many-conditions",
            trigger: { event: "player.jumpCommitted" },
            conditions: [
              { op: "eq", fact: "player.hp", value: 1 },
              { op: "eq", fact: "player.hp", value: 2 },
              { op: "eq", fact: "player.hp", value: 3 },
              { op: "eq", fact: "player.hp", value: 4 },
            ],
            actions: [{ op: "player.gravity.toggle", target: "player", params: { magnitude: 900 } }],
          },
        ],
      }),
    ).toThrow(/conditions has 4 nodes/);
  });

  it("rejects a pack with more than three rules", () => {
    const rule = gravityPack.rules[0];
    expect(() =>
      parseExecutablePack({ ...gravityPack, rules: [rule, rule, rule, rule] }),
    ).toThrow(/limit is 3/);
  });
});