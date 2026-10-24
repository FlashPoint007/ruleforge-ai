import Phaser from "phaser";

import { BootScene } from "@/game/scenes/BootScene";
import { GameScene } from "@/game/scenes/GameScene";
import { UIScene } from "@/game/scenes/UIScene";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#0b1020",
    pixelArt: false,
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 980 }, debug: false },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, GameScene, UIScene],
  });
}
