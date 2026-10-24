import Phaser from "phaser";

/** Generates every placeholder texture at runtime: the scaffold ships no art. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    this.createSolidTexture("player-placeholder", 28, 40, 0x7dd3fc);
    this.createSolidTexture("platform-placeholder", 160, 20, 0x334155);
    this.scene.start("GameScene");
  }

  private createSolidTexture(key: string, width: number, height: number, color: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(0, 0, width, height, 6);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
