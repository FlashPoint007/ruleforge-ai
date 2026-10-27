import { describe, expect, it } from "vitest";

import { DEFAULT_LEVEL_ID, LEVEL_IDS, listLevels, loadLevel } from "@/game/levels/levelRegistry";

describe("level registry", () => {
  it("ships the two MVP levels", () => {
    expect(LEVEL_IDS).toEqual(["lab-01", "lab-02"]);
    expect(DEFAULT_LEVEL_ID).toBe("lab-01");
  });

  it("parses every level it lists", () => {
    // A level that ships must be loadable; otherwise the picker offers a broken
    // choice and the failure only shows up after the player clicks it.
    for (const id of LEVEL_IDS) {
      const level = loadLevel(id);
      expect(level.id).toBe(id);
      expect(level.platforms.length).toBeGreaterThan(0);
    }
  });

  it("lists summaries without loading a level twice", () => {
    const summaries = listLevels();

    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.name).toBeTruthy();
    expect(summaries.map((s) => s.id)).toEqual(LEVEL_IDS);
  });

  it("rejects an unknown level instead of silently falling back", () => {
    expect(() => loadLevel("lab-99")).toThrow(/unknown level/);
  });

  it("gives lab-02 content that exercises the rule actions", () => {
    const level = loadLevel("lab-02");

    expect(level.enemies.length).toBeGreaterThan(0);
    expect(level.coins.length).toBeGreaterThan(0);
    expect(level.crumbling.length).toBeGreaterThan(0);
    expect(level.hideablePlatforms.length).toBeGreaterThan(0);
    expect(level.checkpoints.length).toBeGreaterThan(0);
    expect(level.enemySpawnPoints.length).toBeGreaterThan(0);
    expect(level.coinSpawnPoints.length).toBeGreaterThan(0);
  });

  it("keeps both levels internally consistent", () => {
    for (const id of LEVEL_IDS) {
      const level = loadLevel(id);

      // Spawn must be above the floor and below the ceiling, or the level starts
      // the player in a falling or clipped state.
      expect(level.spawn.y).toBeLessThan(level.killPlaneY);
      expect(level.spawn.y).toBeGreaterThan(level.ceilingY);

      for (const platform of level.platforms) {
        expect(platform.x + platform.width).toBeLessThanOrEqual(level.world.width);
      }
    }
  });
});
