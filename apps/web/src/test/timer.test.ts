import { describe, expect, it } from "vitest";

import { TIMER } from "@/game/config";
import { RuleRuntime } from "@/game/rules/RuleRuntime";
import type { EffectContext } from "@/game/rules/types";

function baseContext(): EffectContext {
  let gravity: 1 | -1 = 1;
  return {
    getGravityDirection: () => gravity,
    setGravityDirection: (d) => {
      gravity = d;
    },
    setPlayerSpeedMultiplier: () => undefined,
    setPlayerJumpMultiplier: () => undefined,
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
  };
}

const timerPack = {
  dslVersion: "1.1.0",
  packId: "pack-timer",
  levelId: "lab-01",
  rules: [
    {
      id: "rule-timer",
      trigger: { event: "timer.interval" },
      conditions: [],
      actions: [{ op: "player.shield.grant", target: "player", params: { durationMs: 1000 } }],
    },
  ],
};

describe("timer.interval", () => {
  it("is a registered event the runtime accepts", () => {
    const runtime = new RuleRuntime(baseContext());
    expect(() => runtime.load(timerPack)).not.toThrow();
  });

  it("runs an action each time it fires", () => {
    const runtime = new RuleRuntime(baseContext());
    runtime.load(timerPack);

    runtime.emit("timer.interval", 1000);
    runtime.tick(1000);
    runtime.emit("timer.interval", 2000);
    runtime.tick(2000);

    expect(runtime.stats.actionsApplied).toBe(2);
  });

  it("respects the spec's 500ms floor", () => {
    // A faster cadence than the spec allows would turn a rule into a frame-rate
    // dependent effect.
    expect(TIMER.minIntervalMs).toBeGreaterThanOrEqual(500);
    expect(TIMER.intervalMs).toBeGreaterThanOrEqual(TIMER.minIntervalMs);
  });
});
