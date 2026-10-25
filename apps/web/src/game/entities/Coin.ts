import Phaser from "phaser";

import { ART_PALETTE } from "@/app/theme";

const COIN_RADIUS = 11;

/**
 * A collectible coin.
 *
 * Drawn procedurally rather than sliced: the coin sheet is a design comp, not a
 * sprite, and inventing a fake slice would be worse than a clean placeholder in
 * the right palette.
 */
export class Coin {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private collected = false;
  private readonly homeX: number;
  private readonly homeY: number;
  private fleeTarget: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey: string) {
    this.homeX = x;
    this.homeY = y;

    this.sprite = scene.physics.add.sprite(x, y, textureKey);
    this.sprite.setDepth(12);
    this.sprite.setCircle(COIN_RADIUS);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
  }

  static createTexture(scene: Phaser.Scene, key: string): void {
    if (scene.textures.exists(key)) {
      return;
    }
    const size = COIN_RADIUS * 2;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor("#F2C14E").color, 1);
    graphics.fillCircle(COIN_RADIUS, COIN_RADIUS, COIN_RADIUS);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(ART_PALETTE.pureWhite).color, 0.9);
    graphics.fillCircle(COIN_RADIUS, COIN_RADIUS - 3, COIN_RADIUS * 0.42);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  get isCollected(): boolean {
    return this.collected;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  collect(): void {
    if (this.collected) {
      return;
    }
    this.collected = true;
    this.sprite.disableBody(true, true);
  }

  /** coin.flee: run away from the player, then settle. */
  flee(fromX: number, fromY: number, radius: number, speed: number): void {
    if (this.collected) {
      return;
    }

    const dx = this.sprite.x - fromX;
    const dy = this.sprite.y - fromY;
    const length = Math.hypot(dx, dy) || 1;

    // Clamp the escape to the rule's radius: a coin that flees forever is a bug.
    this.fleeTarget = {
      x: this.sprite.x + (dx / length) * radius,
      y: this.sprite.y + (dy / length) * radius,
    };
    this.sprite.setVelocity((dx / length) * speed, (dy / length) * speed);
  }

  update(): void {
    if (this.collected || this.fleeTarget === null) {
      return;
    }
    if (Math.hypot(this.sprite.x - this.fleeTarget.x, this.sprite.y - this.fleeTarget.y) < 8) {
      this.sprite.setVelocity(0, 0);
      this.fleeTarget = null;
    }
  }

  reset(): void {
    this.collected = false;
    this.fleeTarget = null;
    this.sprite.enableBody(true, this.homeX, this.homeY, true, true);
    this.sprite.setVelocity(0, 0);
  }
}
