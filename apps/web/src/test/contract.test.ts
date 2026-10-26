import { describe, expect, it } from "vitest";

import { P0_ACTIONS, P0_CONDITION_OPERATORS, P0_EVENTS, DSL_VERSION } from "@ruleforge/rule-schema";

import gravityPack from "@content/../tests/golden/pack-gravity-flip.json";
import enemySlowPack from "@content/../tests/golden/pack-enemy-slow.json";
import guardedPack from "@content/../tests/golden/pack-guarded.json";
import { IMPLEMENTED_ACTIONS, parseExecutablePack } from "@/game/rules/rulePack";
import { RuleRuntime } from "@/game/rules/RuleRuntime";
import type { EffectContext } from "@/game/rules/types";

/**
 * Cross-language contract test.
 *
 * The server compiles Rule IR into RulePack JSON; this runtime is its only
 * consumer. These fixtures are emitted by the Python test suite
 * (tests/test_generate_api.py), so if the server ever produces a pack the client
 * cannot execute, this file fails instead of the browser failing at runtime.
 */
const SERVER_PACKS = [
  { name: "gravity-flip", pack: gravityPack },
  { name: "enemy-slow", pack: enemySlowPack },
  { name: "guarded", pack: guardedPack },
];

function makeContext() {
  let gravity: 1 | -1 = 1;
  let enemySpeed = 1;
  const context: EffectContext = {
    getGravityDirection: () => gravity,
    setGravityDirection: (direction) => {
      gravity = direction;
    },
    setPlayerSpeedMultiplier: () => undefined,
    setPlayerJumpMultiplier: () => undefined,
    getPlayerPosition: () => ({ x: 0, y: 0 }),
    getEnemies: () => [
      {
        setSpeedMultiplier: (value: number) => {
          enemySpeed = value;
        },
        reverse: () => undefined,
      },
    ],
    getCoins: () => [],
    readFact: (path) => {
      if (path === "player.coinCount") {
        return 3;
      }
      return undefined;
    },
    getEnemySpawnPoints: () => [],
    getCoinSpawnPoints: () => [],
    spawnEnemy: () => false,
    spawnCoin: () => false,
    getCollapsiblePlatforms: () => [],
    setPlatformVisible: () => false,
    grantShield: () => undefined,
    activateCheckpoint: () => false,
    getCheckpointIds: () => [],
  };
  return { context, readGravity: () => gravity, readEnemySpeed: () => enemySpeed };
}

describe("server-compiled packs are executable by the client runtime", () => {
  it("emits the same DSL version the client expects", () => {
    for (const { name, pack } of SERVER_PACKS) {
      expect(pack.dslVersion, `${name} dslVersion`).toBe(DSL_VERSION);
    }
  });

  it("accepts every server pack through the client's own pack validator", () => {
    for (const { name, pack } of SERVER_PACKS) {
      expect(() => parseExecutablePack(pack), `${name} rejected`).not.toThrow();
    }
  });

  it("only uses registered events, operators and implemented actions", () => {
    const events = new Set<string>(P0_EVENTS);
    const operators = new Set<string>(P0_CONDITION_OPERATORS);

    for (const { name, pack } of SERVER_PACKS) {
      for (const rule of pack.rules) {
        expect(events.has(rule.trigger.event), `${name} event ${rule.trigger.event}`).toBe(true);

        for (const action of rule.actions) {
          expect(P0_ACTIONS as readonly string[]).toContain(action.op);
          expect(IMPLEMENTED_ACTIONS.has(action.op as never), `${name} ${action.op}`).toBe(true);
        }

        for (const node of rule.conditions as Array<Record<string, unknown>>) {
          if (typeof node.op === "string") {
            expect(operators.has(node.op), `${name} operator ${node.op}`).toBe(true);
          }
        }
      }
    }
  });

  it("carries every field the runtime needs", () => {
    for (const { name, pack } of SERVER_PACKS) {
      expect(pack.packId, `${name} packId`).toBeTruthy();
      expect(pack.engineVersion, `${name} engineVersion`).toBeTruthy();
      expect(pack.levelId, `${name} levelId`).toBeTruthy();
      expect(typeof pack.seed, `${name} seed`).toBe("number");
      expect(pack.rules.length, `${name} rules`).toBeGreaterThan(0);

      for (const rule of pack.rules) {
        expect(rule.id).toBeTruthy();
        expect(Array.isArray(rule.conditions)).toBe(true);
        expect(rule.actions.length).toBeGreaterThan(0);
      }
    }
  });

  it("actually runs: the server-compiled gravity pack flips gravity", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);

    runtime.load(gravityPack);
    runtime.emit("player.jumpCommitted", 0);
    runtime.tick(16);

    expect(harness.readGravity()).toBe(-1);
    expect(runtime.stats.actionsApplied).toBe(1);
  });

  it("actually runs: the server-compiled enemy-slow pack slows enemies", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);

    runtime.load(enemySlowPack);
    runtime.emit("coin.collected", 0);
    runtime.tick(16);

    expect(harness.readEnemySpeed()).toBe(0.7);
  });

  it("actually runs: the server-compiled guarded pack honours its condition", () => {
    const harness = makeContext();
    const runtime = new RuleRuntime(harness.context);

    runtime.load(guardedPack);
    // readFact reports 3 coins, which satisfies the gte 2 guard.
    runtime.emit("player.jumpCommitted", 0);
    runtime.tick(16);

    expect(harness.readGravity()).toBe(-1);
    expect(runtime.stats.conditionsBlocked).toBe(0);
  });
});
