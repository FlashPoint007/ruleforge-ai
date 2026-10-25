import Phaser from "phaser";

import { ENEMY_ROW } from "@/game/levels/levelSchema";
import type { EnemyDef, EnemyKind } from "@/game/levels/levelSchema";

const FRAMES_PER_ROW = 4;

/**
 * A patrolling enemy.
 *
 * Enemies are intentionally dumb: constant patrol, contact damage, no pathing.
 * The interesting behaviour in this game comes from rules, not from AI, so the
 * baseline has to be predictable enough for a player to reason about.
 */
export class Enemy {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly kind: EnemyKind;

  private readonly scene: Phaser.Scene;
  private readonly originX: number;
  private readonly patrol: number;
  private direction: 1 | -1 = 1;
  private speedMultiplier = 1;
  private baseSpeed: number;
  private alive = true;

  constructor(scene: Phaser.Scene, def: EnemyDef) {
    this.scene = scene;
    this.kind = def.kind;
    this.originX = def.x;
    this.patrol = def.patrol;
    this.baseSpeed = def.speed;

    const frame = ENEMY_ROW[def.kind] * FRAMES_PER_ROW;
    this.sprite = scene.physics.add.sprite(def.x, def.y, "enemies", frame);
    // Centre origin: the atlas art fills nearly the whole 64px cell, so a
    // bottom origin would bury the enemy inside the platform it stands on.
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(15);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(38, 34);
    body.setOffset(13, 18);
    // Enemies are unaffected by world gravity: they hover or walk on a line, and
    // inverting the player's gravity must not scatter them.
    body.setAllowGravity(false);

    this.playWalk();
  }

  private playWalk(): void {
    const key = `enemy-${this.kind}-walk`;
    if (!this.scene.anims.exists(key)) {
      const start = ENEMY_ROW[this.kind] * FRAMES_PER_ROW;
      this.scene.anims.create({
        key,
        frames: this.scene.anims.generateFrameNumbers("enemies", {
          start,
          end: start + FRAMES_PER_ROW - 1,
        }),
        frameRate: 6,
        repeat: -1,
      });
    }
    this.sprite.play(key, true);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** Set by the rule runtime. 1 is the level-defined speed. */
  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  /** Reverses patrol direction, used by enemy.direction.reverse. */
  reverse(): void {
    this.direction = this.direction === 1 ? -1 : 1;
  }

  update(): void {
    if (!this.alive) {
      return;
    }

    const speed = this.baseSpeed * this.speedMultiplier;

    if (this.patrol <= 0) {
      this.sprite.setVelocityX(0);
      return;
    }

    if (this.sprite.x >= this.originX + this.patrol) {
      this.direction = -1;
    } else if (this.sprite.x <= this.originX - this.patrol) {
      this.direction = 1;
    }

    this.sprite.setVelocityX(speed * this.direction);
    this.sprite.setFlipX(this.direction < 0);
  }

  /** Vertical centre of the sprite, used for depth and spawn placement. */
  get centreY(): number {
    return this.sprite.y;
  }

  kill(): void {
    if (!this.alive) {
      return;
    }
    this.alive = false;
    this.sprite.setVelocity(0, 0);
    this.sprite.disableBody(true, true);
  }

  /** Restores a killed enemy on level reset. */
  revive(): void {
    this.alive = true;
    this.speedMultiplier = 1;
    this.direction = 1;
    this.sprite.enableBody(true, this.originX, this.sprite.y, true, true);
    this.playWalk();
  }
}