/** Level data contract. Pure data in, validated data out: no Phaser here. */

export const MATERIALS = ["moss", "stone", "ice", "tech"] as const;
export type Material = (typeof MATERIALS)[number];

/** Terrain sheet is 4 blocks of 3x3 tiles; the block index is the material order. */
export const MATERIAL_BLOCK: Record<Material, number> = {
  moss: 0,
  stone: 1,
  ice: 2,
  tech: 3,
};

export const TILE_SIZE = 32;

export interface PlatformDef {
  x: number;
  y: number;
  width: number;
  height: number;
  material: Material;
}

export interface LevelDef {
  id: string;
  name: string;
  version: string;
  theme: string;
  world: { width: number; height: number };
  spawn: { x: number; y: number };
  /** Y of the invisible ceiling. A flipped-gravity world needs one. */
  ceilingY: number;
  killPlaneY: number;
  platforms: PlatformDef[];
}

export class LevelParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LevelParseError";
  }
}

function fail(message: string): never {
  throw new LevelParseError(message);
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(`${label} must be a positive number, received ${String(value)}`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number, received ${String(value)}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates a level document. Unknown materials and out-of-world platforms are
 * rejected rather than silently clamped: a level that is quietly wrong is far
 * harder to debug than one that refuses to load.
 */
export function parseLevel(raw: unknown): LevelDef {
  if (!isRecord(raw)) {
    fail("level must be an object");
  }

  for (const key of ["id", "name", "version", "theme"] as const) {
    if (typeof raw[key] !== "string" || (raw[key] as string).length === 0) {
      fail(`${key} must be a non-empty string`);
    }
  }

  const world = raw.world;
  if (!isRecord(world)) {
    fail("world must be an object");
  }
  const worldWidth = positiveNumber(world.width, "world.width");
  const worldHeight = positiveNumber(world.height, "world.height");

  const spawn = raw.spawn;
  if (!isRecord(spawn)) {
    fail("spawn must be an object");
  }
  const spawnX = finiteNumber(spawn.x, "spawn.x");
  const spawnY = finiteNumber(spawn.y, "spawn.y");
  if (spawnX < 0 || spawnX > worldWidth || spawnY < 0 || spawnY > worldHeight) {
    fail("spawn must sit inside the world bounds");
  }

  const killPlaneY = finiteNumber(raw.killPlaneY, "killPlaneY");
  if (killPlaneY <= spawnY) {
    fail("killPlaneY must be below the spawn point");
  }

  const ceilingY = finiteNumber(raw.ceilingY, "ceilingY");
  if (ceilingY >= spawnY) {
    fail("ceilingY must be above the spawn point");
  }

  const platforms = raw.platforms;
  if (!Array.isArray(platforms) || platforms.length === 0) {
    fail("platforms must be a non-empty array");
  }

  const parsed = platforms.map((item, index) => {
    const label = `platforms[${index}]`;
    if (!isRecord(item)) {
      fail(`${label} must be an object`);
    }

    const material = item.material;
    if (typeof material !== "string" || !MATERIALS.includes(material as Material)) {
      fail(`${label}.material must be one of ${MATERIALS.join(", ")}`);
    }

    const platform: PlatformDef = {
      x: finiteNumber(item.x, `${label}.x`),
      y: finiteNumber(item.y, `${label}.y`),
      width: positiveNumber(item.width, `${label}.width`),
      height: positiveNumber(item.height, `${label}.height`),
      material: material as Material,
    };

    if (platform.x < 0 || platform.x + platform.width > worldWidth) {
      fail(`${label} must stay inside the world width`);
    }

    return platform;
  });

  return {
    id: raw.id as string,
    name: raw.name as string,
    version: raw.version as string,
    theme: raw.theme as string,
    world: { width: worldWidth, height: worldHeight },
    spawn: { x: spawnX, y: spawnY },
    ceilingY,
    killPlaneY,
    platforms: parsed,
  };
}