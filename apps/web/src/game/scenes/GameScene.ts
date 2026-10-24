import Phaser from "phaser";

import { GAME_HEIGHT, GAME_WIDTH } from "@/game/createGame";

/**
 * Placeholder arena. No network calls are allowed inside Phaser scenes: rule
 * data reaches the runtime through the app layer, never from a scene.
 */
export class GameScene extends Phaser.Scene {
  private player?: Phaser.Physics.Arcade.Image;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0b1020");

    const ground = this.physics.add.staticImage(GAME_WIDTH / 2, GAME_HEIGHT - 30, "platform-placeholder");
    ground.setScale(6, 1).refreshBody();

    this.player = this.physics.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 140, "player-placeholder");
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, ground);

    const hint = this.add.text(24, 24, "占位场景 · 规则引擎将在 RF-003 接入", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      color: "#94a3b8",
    });
    hint.setScrollFactor(0);

    this.add.text(24, 52, "方向键 / A·D 移动，空格跳跃", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      color: "#475569",
    });

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.scene.launch("UIScene");
  }

  update(): void {
    if (!this.player || !this.cursors) {
      return;
    }

    const speed = 240;
    const left = this.cursors.left.isDown || this.input.keyboard?.addKey("A").isDown;
    const right = this.cursors.right.isDown || this.input.keyboard?.addKey("D").isDown;

    if (left) {
      this.player.setVelocityX(-speed);
    } else if (right) {
      this.player.setVelocityX(speed);
    } else {
      this.player.setVelocityX(0);
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (this.cursors.up.isDown && body.blocked.down) {
      this.player.setVelocityY(-520);
    }
  }
}
