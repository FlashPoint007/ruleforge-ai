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

export const ENEMY_KINDS = ["slime", "crab", "urchin", "jellyfish", "drone"] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

/**
 * Enemy rows in the atlas. The sheet is 4 columns of frames by 5 rows of kinds,
 * so the row index is the kind and the columns are its animation.
 */
export const ENEMY_ROW: Record<EnemyKind, number> = {
  slime: 0,
  crab: 1,
  urchin: 2,
  jellyfish: 3,
  drone: 4,
};

export interface EnemyDef {
  kind: EnemyKind;
  x: number;
  y: number;
  /** Horizontal patrol distance in px. 0 means stationary. */
  patrol: number;
  speed: number;
}

export interface CoinDef {
  x: number;
  y: number;
}

/** Platforms that disappear a moment after being stood on. */
export interface CrumblingDef {
  x: number;
  y: number;
  width: number;
  delayMs: number;
}

/** A point the level author has vetted for spawning. Rules may only use these. */
export interface SpawnPointDef {
  x: number;
  y: number;
}

/** A platform a rule may hide or show, addressed by a stable id. */
export interface HideablePlatformDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CheckpointDef {
  id: string;
  x: number;
  y: number;
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
  enemies: EnemyDef[];
  coins: CoinDef[];
  crumbling: CrumblingDef[];
  enemySpawnPoints: SpawnPointDef[];
  coinSpawnPoints: SpawnPointDef[];
  hideablePlatforms: HideablePlatformDef[];
  checkpoints: CheckpointDef[];
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

  const enemies = parseEnemies(raw.enemies, worldWidth);
  const coins = parseCoins(raw.coins, worldWidth);
  const crumbling = parseCrumbling(raw.crumbling, worldWidth);
  const enemySpawnPoints = parsePoints(raw.enemySpawnPoints, worldWidth, "enemySpawnPoints");
  const coinSpawnPoints = parsePoints(raw.coinSpawnPoints, worldWidth, "coinSpawnPoints");
  const hideablePlatforms = parseHideable(raw.hideablePlatforms, worldWidth);
  const checkpoints = parseCheckpoints(raw.checkpoints, worldWidth);

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
    enemies,
    coins,
    crumbling,
    enemySpawnPoints,
    coinSpawnPoints,
    hideablePlatforms,
    checkpoints,
  };
}

function parsePoints(raw: unknown, worldWidth: number, label: string): SpawnPointDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    fail(`${label} must be an array`);
  }
  return raw.map((item, index) => {
    const at = `${label}[${index}]`;
    if (!isRecord(item)) {
      fail(`${at} must be an object`);
    }
    const x = finiteNumber(item.x, `${at}.x`);
    if (x < 0 || x > worldWidth) {
      fail(`${at} is outside the world width`);
    }
    return { x, y: finiteNumber(item.y, `${at}.y`) };
  });
}

function parseHideable(raw: unknown, worldWidth: number): HideablePlatformDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    fail("hideablePlatforms must be an array");
  }
  const seen = new Set<string>();
  return raw.map((item, index) => {
    const label = `hideablePlatforms[${index}]`;
    if (!isRecord(item)) {
      fail(`${label} must be an object`);
    }
    if (typeof item.id !== "string" || item.id.length === 0) {
      fail(`${label}.id must be a non-empty string`);
    }
    if (seen.has(item.id)) {
      // A duplicate id would make a rule target an ambiguous platform.
      fail(`${label}.id "${item.id}" is duplicated`);
    }
    seen.add(item.id);

    const x = finiteNumber(item.x, `${label}.x`);
    const width = positiveNumber(item.width, `${label}.width`);
    if (x < 0 || x + width > worldWidth) {
      fail(`${label} must stay inside the world width`);
    }
    return {
      id: item.id,
      x,
      y: finiteNumber(item.y, `${label}.y`),
      width,
      height: positiveNumber(item.height, `${label}.height`),
    };
  });
}

function parseCheckpoints(raw: unknown, worldWidth: number): CheckpointDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    fail("checkpoints must be an array");
  }
  const seen = new Set<string>();
  return raw.map((item, index) => {
    const label = `checkpoints[${index}]`;
    if (!isRecord(item)) {
      fail(`${label} must be an object`);
    }
    if (typeof item.id !== "string" || item.id.length === 0) {
      fail(`${label}.id must be a non-empty string`);
    }
    if (seen.has(item.id)) {
      fail(`${label}.id "${item.id}" is duplicated`);
    }
    seen.add(item.id);
    const x = finiteNumber(item.x, `${label}.x`);
    if (x < 0 || x > worldWidth) {
      fail(`${label} is outside the world width`);
    }
    return { id: item.id, x, y: finiteNumber(item.y, `${label}.y`) };
  });
}

function parseEnemies(raw: unknown, worldWidth: number): EnemyDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    fail("enemies must be an array");
  }

  return raw.map((item, index) => {
    const label = `enemies[${index}]`;
    if (!isRecord(item)) {
      fail(`${label} must be an object`);
    }
    if (typeof item.kind !== "string" || !ENEMY_KINDS.includes(item.kind as EnemyKind)) {
      fail(`${label}.kind must be one of ${ENEMY_KINDS.join(", ")}`);
    }

    const x = finiteNumber(item.x, `${label}.x`);
    const patrol = finiteNumber(item.patrol, `${label}.patrol`);
    if (patrol < 0) {
      fail(`${label}.patrol must not be negative`);
    }
    if (x - patrol < 0 || x + patrol > worldWidth) {
      fail(`${label} patrol range leaves the world`);
    }

    return {
      kind: item.kind as EnemyKind,
      x,
      y: finiteNumber(item.y, `${label}.y`),
      patrol,
      speed: positiveNumber(item.speed, `${label}.speed`),
    };
  });
}

function parseCoins(raw: unknown, worldWidth: number): CoinDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    fail("coins must be an array");
  }

  return raw.map((item, index) => {
    const label = `coins[${index}]`;
    if (!isRecord(item)) {
      fail(`${label} must be an object`);
    }
    const x = finiteNumber(item.x, `${label}.x`);
    if (x < 0 || x > worldWidth) {
      fail(`${label} is outside the world width`);
    }
    return { x, y: finiteNumber(item.y, `${label}.y`) };
  });
}

function parseCrumbling(raw: unknown, worldWidth: number): CrumblingDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    fail("crumbling must be an array");
  }

  return raw.map((item, index) => {
    const label = `crumbling[${index}]`;
    if (!isRecord(item)) {
      fail(`${label} must be an object`);
    }
    const x = finiteNumber(item.x, `${label}.x`);
    const width = positiveNumber(item.width, `${label}.width`);
    if (x < 0 || x + width > worldWidth) {
      fail(`${label} must stay inside the world width`);
    }
    const delayMs = finiteNumber(item.delayMs, `${label}.delayMs`);
    if (delayMs < 250 || delayMs > 5000) {
      fail(`${label}.delayMs must be within the 250-5000ms spec range`);
    }
    return { x, y: finiteNumber(item.y, `${label}.y`), width, delayMs };
  });
}