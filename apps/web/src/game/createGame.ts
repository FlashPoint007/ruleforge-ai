import Phaser from "phaser";

import { ART_PALETTE } from "@/app/theme";
import { GAME_HEIGHT, GAME_WIDTH, PHYSICS } from "@/game/config";
import { BootScene } from "@/game/scenes/BootScene";
import { GameScene } from "@/game/scenes/GameScene";
import { UIScene } from "@/game/scenes/UIScene";

export function createGame(parent: HTMLElement, levelId?: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: ART_PALETTE.abyss,
    // The art is pixel art: keep texels sharp and disable image smoothing.
    pixelArt: true,
    roundPixels: true,
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: PHYSICS.gravityY },
        debug: false,
        // Fixed tick keeps behaviour identical across refresh rates.
        fps: 60,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // GameScene is constructed with the chosen level, so one game instance is
    // tied to one level; switching levels rebuilds the game.
    scene: [BootScene, new GameScene(levelId), UIScene],
  });
}