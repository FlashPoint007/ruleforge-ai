/** Tunable gameplay constants. One place, so tuning never means grepping scenes. */

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const PHYSICS = {
  gravityY: 1800,
  moveSpeed: 265,
  groundAcceleration: 2400,
  airAcceleration: 1500,
  groundDrag: 2600,
  jumpVelocity: -690,
  /** Grace window after leaving a ledge where a jump still counts. */
  coyoteMs: 110,
  /** Pressing jump slightly before landing still jumps on touchdown. */
  jumpBufferMs: 130,
  maxFallSpeed: 1150,
  /** Variable jump height: releasing early cuts upward velocity. */
  jumpCutMultiplier: 0.45,
} as const;

export const PLAYER = {
  /** Physics body is narrower than the sprite so the character can slip past edges. */
  bodyWidth: 26,
  bodyHeight: 44,
  spriteSize: 64,
  /** Frames in one animation row of the hero atlas. */
  framesPerRow: 6,
} as const;

export const CAMERA = {
  lerpX: 0.12,
  lerpY: 0.1,
  deadzoneWidth: 220,
  deadzoneHeight: 160,
  offsetY: 40,
} as const;

/** Periodic event cadence. Spec 4.6: the shortest allowed interval is 500ms. */
export const TIMER = {
  intervalMs: 1000,
  minIntervalMs: 500,
} as const;

export const RESPAWN = {
  fadeMs: 320,
  invulnerableMs: 900,
  /** Delay between death animation start and the respawn fade. */
  deathHoldMs: 620,
} as const;

/** Terrain nine-slice insets, measured from the sheet (see docs/ART_DIRECTION.md). */
export const TERRAIN_SLICE = {
  left: 5,
  right: 5,
  top: 7,
  bottom: 4,
  blockSize: 96,
} as const;

export const ANIMATIONS = {
  idle: { row: 0, frameRate: 6, repeat: -1 },
  run: { row: 1, frameRate: 12, repeat: -1 },
  jump: { row: 2, frameRate: 10, repeat: 0 },
  fall: { row: 3, frameRate: 10, repeat: 0 },
  hurt: { row: 4, frameRate: 10, repeat: 0 },
  death: { row: 5, frameRate: 8, repeat: 0 },
} as const;

export type AnimationName = keyof typeof ANIMATIONS;