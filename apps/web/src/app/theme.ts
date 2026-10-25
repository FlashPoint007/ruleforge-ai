/**
 * Art colour tokens, measured from the design sheets in images/.
 * Single source of truth: docs/ART_DIRECTION.md section 2.
 * Keep global.css in sync — CSS cannot import TypeScript.
 */
export const ART_PALETTE = {
  /** Deep ocean base, page and scene background. */
  abyss: "#00162B",
  /** Deeper shade for masks and shadows. */
  abyssDeep: "#000E22",
  /** Primary ocean blue: large surfaces and headings. */
  ocean: "#216BAB",
  oceanDeep: "#2D6096",
  /** Starlight blue: highlights and glow rims. */
  starlight: "#79B4E6",
  /** Tech cyan: reserved for interactive and energetic elements only. */
  techCyan: "#61CDF4",
  /** Pure white: character bodies and body copy. */
  pureWhite: "#F2F4F9",
  /** Deep violet: rarity and magic accents. */
  deepViolet: "#6B63B2",
  /** Coral pink: warmth, hearts, danger gradients. */
  coral: "#E99BA6",
} as const;

/** Colour of a platform top face: "you can stand here" must read at a glance. */
export const SURFACE_HIGHLIGHT = ART_PALETTE.pureWhite;

/** Enemies are always one step darker than the player so they never steal focus. */
export const ENEMY_TINT = ART_PALETTE.oceanDeep;

export type ArtPalette = typeof ART_PALETTE;
