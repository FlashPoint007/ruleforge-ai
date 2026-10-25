import Phaser from "phaser";

import { TERRAIN_SLICE } from "@/game/config";
import { MATERIALS } from "@/game/levels/levelSchema";
import type { Material } from "@/game/levels/levelSchema";

/**
 * Loads the shipped art and prepares it for the renderer.
 *
 * Geometry was measured from the sheets, not guessed:
 * - hero / enemies: 64px grid sprite sheets
 * - terrain: one 384x96 sheet holding four 96x96 nine-slice blocks, which must
 *   be split into separate textures because NineSlice consumes a whole texture.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.load.spritesheet("hero", "assets/sprites/hero-atlas.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("enemies", "assets/sprites/enemies-atlas.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.image("terrain-sheet", "assets/tiles/terrain-nineslice.png");
  }

  create(): void {
    this.sliceTerrain();
    this.scene.start("GameScene");
  }

  /** Splits the terrain sheet into one texture per material. */
  private sliceTerrain(): void {
    const sheet = this.textures.get("terrain-sheet").getSourceImage();
    const { blockSize } = TERRAIN_SLICE;

    MATERIALS.forEach((material: Material, index: number) => {
      const key = `terrain-${material}`;
      if (this.textures.exists(key)) {
        return;
      }

      const canvasTexture = this.textures.createCanvas(key, blockSize, blockSize);
      if (!canvasTexture) {
        throw new Error(`Could not create terrain texture for ${material}`);
      }

      const context = canvasTexture.getContext();
      context.drawImage(
        sheet as CanvasImageSource,
        index * blockSize,
        0,
        blockSize,
        blockSize,
        0,
        0,
        blockSize,
        blockSize,
      );
      canvasTexture.refresh();
    });
  }
}
