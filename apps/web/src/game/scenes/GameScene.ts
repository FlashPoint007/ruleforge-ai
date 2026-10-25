import Phaser from "phaser";

import { CAMERA, GAME_HEIGHT, PHYSICS, RESPAWN } from "@/game/config";
import { Player } from "@/game/entities/Player";
import { parseLevel } from "@/game/levels/levelSchema";
import type { LevelDef } from "@/game/levels/levelSchema";
import { InputSystem } from "@/game/systems/InputSystem";
import { resetTouch } from "@/game/systems/inputBus";
import { createBackdrop } from "@/game/world/backdrop";
import { addPlatform } from "@/game/world/terrain";

import levelData from "@content/levels/lab-01.json";

/**
 * The playable arena.
 *
 * Scenes never call the network. Level data arrives as validated JSON, and every
 * path that can kill or move the player funnels through respawn().
 */
export class GameScene extends Phaser.Scene {
  private level!: LevelDef;
  private player!: Player;
  private inputSystem!: InputSystem;
  private platformBodies: Phaser.GameObjects.Rectangle[] = [];
  private checkpoint = { x: 0, y: 0 };
  private isRespawning = false;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.level = parseLevel(levelData);
    this.checkpoint = { ...this.level.spawn };

    this.physics.world.setBounds(0, 0, this.level.world.width, this.level.world.height);
    this.physics.world.gravity.y = PHYSICS.gravityY;

    createBackdrop(this);
    this.buildPlatforms();

    this.player = new Player(this, this.checkpoint.x, this.checkpoint.y);
    this.physics.add.collider(this.player.sprite, this.platformBodies);

    this.inputSystem = new InputSystem(this);
    this.configureCamera();

    this.cameras.main.fadeIn(RESPAWN.fadeMs, 0, 0, 0);
    this.scene.launch("UIScene");

    this.events.on(Phaser.Scenes.Events.PAUSE, () => this.inputSystem.reset());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.inputSystem.destroy());
  }

  private buildPlatforms(): void {
    this.platformBodies = this.level.platforms.map((def) => addPlatform(this, def).body);
  }

  private configureCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.level.world.width, this.level.world.height);
    camera.setDeadzone(CAMERA.deadzoneWidth, CAMERA.deadzoneHeight);
    camera.startFollow(this.player.sprite, true, CAMERA.lerpX, CAMERA.lerpY, 0, CAMERA.offsetY);
  }

  update(time: number): void {
    if (this.isRespawning) {
      return;
    }

    this.player.update(time, this.inputSystem.read());

    if (this.player.sprite.y > this.level.killPlaneY) {
      this.respawn(true);
    }
  }

  /** Single entry point for death: nothing else may move the player. */
  private respawn(fromDeath: boolean): void {
    if (this.isRespawning) {
      return;
    }
    this.isRespawning = true;

    this.player.setFrozen(true);
    if (fromDeath) {
      this.player.playDeath();
      this.cameras.main.shake(180, 0.006);
    }

    this.time.delayedCall(fromDeath ? RESPAWN.deathHoldMs : 0, () => {
      this.cameras.main.fadeOut(RESPAWN.fadeMs, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.placeAtCheckpoint();
        this.cameras.main.fadeIn(RESPAWN.fadeMs, 0, 0, 0);
        this.isRespawning = false;
      });
    });
  }

  private placeAtCheckpoint(): void {
    this.player.sprite.setPosition(this.checkpoint.x, this.checkpoint.y);
    this.player.sprite.setVelocity(0, 0);
    this.player.setFrozen(false);
    this.inputSystem.reset();
    resetTouch();
    this.cameras.main.centerOn(this.checkpoint.x, this.checkpoint.y - GAME_HEIGHT / 4);
  }
}