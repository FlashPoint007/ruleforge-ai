import Phaser from "phaser";

import { ART_PALETTE } from "@/app/theme";

/**
 * Generates every placeholder texture at runtime: no art assets are committed
 * yet. Colours come from ART_PALETTE so the placeholder already reads like the
 * final art direction (see docs/ART_DIRECTION.md).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    this.createSolidTexture("player-placeholder", 28, 40, ART_PALETTE.techCyan);
    this.createSolidTexture(
      "platform-placeholder",
      160,
      20,
      ART_PALETTE.ocean,
      ART_PALETTE.pureWhite,
    );
    this.scene.start("GameScene");
  }

  private createSolidTexture(
    key: string,
    width: number,
    height: number,
    color: string,
    topFace?: string,
  ): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 1);
    graphics.fillRoundedRect(0, 0, width, height, 6);

    if (topFace) {
      // A white top face marks "you can stand here" at a glance.
      graphics.fillStyle(Phaser.Display.Color.HexStringToColor(topFace).color, 1);
      graphics.fillRoundedRect(0, 0, width, 3, 1);
    }

    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
