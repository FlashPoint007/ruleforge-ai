import Phaser from "phaser";

import { ANIMATIONS, PHYSICS, PLAYER } from "@/game/config";
import type { AnimationName } from "@/game/config";

/**
 * The player character. Movement is acceleration based so the character has
 * weight; jump uses coyote time and an input buffer so it feels fair rather
 * than twitchy.
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly scene: Phaser.Scene;

  private coyoteUntil = 0;
  private jumpBufferedUntil = 0;
  private jumpHeld = false;
  private currentAnim: AnimationName | null = null;
  private frozen = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    this.sprite = scene.physics.add.sprite(x, y, "hero", 0);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(20);
    this.sprite.setMaxVelocity(PHYSICS.moveSpeed, PHYSICS.maxFallSpeed);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight);
    // Align the narrow body to the bottom-centre of the 64px sprite: feet on floor.
    body.setOffset((PLAYER.spriteSize - PLAYER.bodyWidth) / 2, PLAYER.spriteSize - PLAYER.bodyHeight);

    this.registerAnimations();
  }

  private registerAnimations(): void {
    for (const [name, config] of Object.entries(ANIMATIONS)) {
      const key = `hero-${name}`;
      if (this.scene.anims.exists(key)) {
        continue;
      }

      this.scene.anims.create({
        key,
        frames: this.scene.anims.generateFrameNumbers("hero", {
          start: config.row * PLAYER.framesPerRow,
          end: config.row * PLAYER.framesPerRow + PLAYER.framesPerRow - 1,
        }),
        frameRate: config.frameRate,
        repeat: config.repeat,
      });
    }
  }

  private play(name: AnimationName): void {
    if (this.currentAnim === name) {
      return;
    }
    this.currentAnim = name;
    this.sprite.play(`hero-${name}`, true);
  }

  get isOnGround(): boolean {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    return body.blocked.down || body.touching.down;
  }

  /** Freezes control during death and respawn so input cannot fight the animation. */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    if (frozen) {
      this.sprite.setVelocity(0, 0);
    }
  }

  playDeath(): void {
    this.play("death");
  }

  playHurt(): void {
    this.play("hurt");
  }

  update(time: number, input: { left: boolean; right: boolean; jumpPressed: boolean; jumpHeld: boolean }): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (this.frozen) {
      return;
    }

    const onGround = this.isOnGround;
    if (onGround) {
      this.coyoteUntil = time + PHYSICS.coyoteMs;
    }

    // --- horizontal ---
    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const acceleration = onGround ? PHYSICS.groundAcceleration : PHYSICS.airAcceleration;

    if (direction !== 0) {
      body.setAccelerationX(direction * acceleration);
      this.sprite.setFlipX(direction < 0);
    } else {
      body.setAccelerationX(0);
      if (onGround) {
        // Ground friction stops the character crisply; air keeps momentum.
        body.setDragX(PHYSICS.groundDrag);
      } else {
        body.setDragX(0);
      }
    }

    if (direction !== 0 && onGround) {
      body.setDragX(0);
    }

    // --- jump ---
    if (input.jumpPressed) {
      this.jumpBufferedUntil = time + PHYSICS.jumpBufferMs;
    }

    const canJump = time <= this.coyoteUntil && time <= this.jumpBufferedUntil;
    if (canJump) {
      this.sprite.setVelocityY(PHYSICS.jumpVelocity);
      this.coyoteUntil = 0;
      this.jumpBufferedUntil = 0;
      this.jumpHeld = true;
    }

    // Variable jump height: releasing early trims the arc.
    if (this.jumpHeld && !input.jumpHeld) {
      this.jumpHeld = false;
      if (this.sprite.body !== null && (this.sprite.body as Phaser.Physics.Arcade.Body).velocity.y < 0) {
        this.sprite.setVelocityY(this.sprite.body.velocity.y * PHYSICS.jumpCutMultiplier);
      }
    }

    this.updateAnimation(onGround);
  }

  private updateAnimation(onGround: boolean): void {
    const velocity = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (!onGround) {
      this.play(velocity.velocity.y < 0 ? "jump" : "fall");
      return;
    }

    this.play(Math.abs(velocity.velocity.x) > 20 ? "run" : "idle");
  }
}
