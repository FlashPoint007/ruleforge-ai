import { describe, expect, it } from "vitest";

import levelData from "@content/levels/lab-01.json";
import { LevelParseError, MATERIALS, parseLevel } from "@/game/levels/levelSchema";

const validLevel = {
  id: "test-01",
  name: "测试关",
  version: "1.0.0",
  theme: "sky-ruins",
  world: { width: 2000, height: 720 },
  spawn: { x: 100, y: 500 },
  ceilingY: 40,
  killPlaneY: 900,
  platforms: [{ x: 0, y: 600, width: 400, height: 120, material: "moss" }],
};

describe("parseLevel", () => {
  it("parses the shipped lab-01 level", () => {
    const level = parseLevel(levelData);

    expect(level.id).toBe("lab-01");
    expect(level.platforms.length).toBeGreaterThan(0);
    for (const platform of level.platforms) {
      expect(MATERIALS).toContain(platform.material);
    }
  });

  it("rejects an unknown material instead of guessing", () => {
    expect(() =>
      parseLevel({ ...validLevel, platforms: [{ ...validLevel.platforms[0], material: "lava" }] }),
    ).toThrow(LevelParseError);
  });

  it("rejects a spawn outside the world", () => {
    expect(() => parseLevel({ ...validLevel, spawn: { x: 9999, y: 10 } })).toThrow(
      /inside the world bounds/,
    );
  });

  it("rejects a kill plane above the spawn", () => {
    expect(() => parseLevel({ ...validLevel, killPlaneY: 100 })).toThrow(/below the spawn/);
  });

  it("requires a ceiling above the spawn so flipped gravity stays inside", () => {
    expect(() => parseLevel({ ...validLevel, ceilingY: 600 })).toThrow(/above the spawn/);
  });

  it("parses the ceiling from the shipped level", () => {
    expect(parseLevel(levelData).ceilingY).toBeGreaterThan(0);
  });

  it("rejects an empty platform list", () => {
    expect(() => parseLevel({ ...validLevel, platforms: [] })).toThrow(/non-empty/);
  });

  it("rejects a platform that overflows the world width", () => {
    expect(() =>
      parseLevel({
        ...validLevel,
        platforms: [{ x: 1800, y: 600, width: 400, height: 120, material: "stone" }],
      }),
    ).toThrow(/inside the world width/);
  });
});