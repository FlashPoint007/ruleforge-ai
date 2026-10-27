import type Phaser from "phaser";

import { RULES_CHANGED_EVENT } from "@/game/rules/types";
import type { RulesChangedPayload } from "@/game/rules/types";

type GameSceneLike = Phaser.Scene & {
  loadPresetPack?: (pack: unknown) => void;
  clearRules?: () => void;
  isReady?: () => boolean;
};

let activeGame: Phaser.Game | null = null;

export function registerGame(game: Phaser.Game | null): void {
  activeGame = game;
}

function getScene(): GameSceneLike | null {
  const scene = activeGame?.scene.getScene("GameScene");
  if (!scene) {
    return null;
  }
  // getScene() returns the scene as soon as it is registered, which is before
  // create() has built the runtime. Calling into it then throws on undefined.
  const ready = (scene as GameSceneLike).isReady?.();
  return ready === true ? (scene as GameSceneLike) : null;
}

/**
 * Applies a rule pack to the running game.
 *
 * Returns false when the game is not running yet: the caller should not pretend
 * a rule was applied. The scene reports validation failures through the
 * rules-changed event instead of throwing across the React boundary.
 */
/** True once the GameScene exists and can accept a pack. */
export function isGameReady(): boolean {
  return getScene() !== null;
}

export function applyRulePack(pack: unknown): boolean {
  const scene = getScene();
  if (!scene?.loadPresetPack) {
    return false;
  }
  scene.loadPresetPack(pack);
  return true;
}

export function clearRules(): boolean {
  const scene = getScene();
  if (!scene?.clearRules) {
    return false;
  }
  scene.clearRules();
  return true;
}

export interface DebugState {
  ready: boolean;
  gravityDirection: 1 | -1;
  packId: string | null;
  actionsApplied: number;
  x: number;
  y: number;
  velocityY: number;
  velocityX: number;
  worldGravityY: number;
  flipY: boolean;
  onGround: boolean;
  lastInput: { left: boolean; right: boolean; jumpPressed: boolean; jumpHeld: boolean };
  coinsCollected: number;
  enemiesDefeated: number;
  liveEnemies: number;
  activeRules: string[];
  lives: number;
  conditionsBlocked: number;
  shieldMs: number;
  checkpointId: string | null;
  levelId: string;
  levelName: string;
}

export function readDebugState(): DebugState | null {
  const scene = activeGame?.scene.getScene("GameScene") as
    | (GameSceneLike & { getDebugState?: () => DebugState })
    | null;
  return scene?.getDebugState?.() ?? null;
}

export function subscribeToRules(listener: (payload: RulesChangedPayload) => void): () => void {
  const handler = (event: Event): void => {
    listener((event as CustomEvent<RulesChangedPayload>).detail);
  };
  window.addEventListener(RULES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(RULES_CHANGED_EVENT, handler);
}