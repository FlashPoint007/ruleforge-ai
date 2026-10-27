import lab01 from "@content/levels/lab-01.json";
import lab02 from "@content/levels/lab-02.json";

import { parseLevel } from "@/game/levels/levelSchema";
import type { LevelDef } from "@/game/levels/levelSchema";

/** Raw level documents, keyed by id. Imported statically so the build is offline. */
const RAW_LEVELS: Record<string, unknown> = {
  "lab-01": lab01,
  "lab-02": lab02,
};

export const LEVEL_IDS = Object.keys(RAW_LEVELS);

export const DEFAULT_LEVEL_ID = "lab-01";

/**
 * Loads a level by id, validated.
 *
 * Parsing happens on read rather than at module load so a broken level fails when
 * it is actually selected, with an error that names the level, instead of
 * breaking the whole bundle at import time.
 */
export function loadLevel(levelId: string): LevelDef {
  const raw = RAW_LEVELS[levelId];
  if (raw === undefined) {
    throw new Error(`unknown level: ${levelId}. Known levels: ${LEVEL_IDS.join(", ")}`);
  }
  return parseLevel(raw);
}

export interface LevelSummary {
  id: string;
  name: string;
  theme: string;
  version: string;
}

export function listLevels(): LevelSummary[] {
  return LEVEL_IDS.map((id) => {
    const level = loadLevel(id);
    return { id: level.id, name: level.name, theme: level.theme, version: level.version };
  });
}
