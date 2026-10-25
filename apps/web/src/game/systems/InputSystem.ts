import Phaser from "phaser";

import { touchState } from "@/game/systems/inputBus";

export interface InputFrame {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

/**
 * Merges keyboard and touch into one frame of intent.
 *
 * "Pressed" is edge-triggered and consumed once per frame, which is what makes
 * jump buffering behave predictably across both input sources.
 */
export class InputSystem {
  private readonly scene: Phaser.Scene;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly keyA: Phaser.Input.Keyboard.Key;
  private readonly keyD: Phaser.Input.Keyboard.Key;
  private readonly keySpace: Phaser.Input.Keyboard.Key;
  private readonly keyW: Phaser.Input.Keyboard.Key;

  private jumpWasDown = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error("Keyboard input is unavailable in this environment");
    }

    this.cursors = keyboard.createCursorKeys();
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  read(): InputFrame {
    const left = this.cursors.left.isDown || this.keyA.isDown || touchState.left;
    const right = this.cursors.right.isDown || this.keyD.isDown || touchState.right;
    const jumpDown =
      this.cursors.up.isDown || this.keyW.isDown || this.keySpace.isDown || touchState.jump;

    const jumpPressed = jumpDown && !this.jumpWasDown;
    this.jumpWasDown = jumpDown;

    return { left, right, jumpPressed, jumpHeld: jumpDown };
  }

  /** Clears edge state so a respawn does not inherit a stale press. */
  reset(): void {
    this.jumpWasDown = false;
  }

  destroy(): void {
    this.keyA.destroy();
    this.keyD.destroy();
    this.keyW.destroy();
    this.keySpace.destroy();
    this.cursors.left.destroy();
    this.cursors.right.destroy();
    this.cursors.up.destroy();
    this.cursors.down.destroy();
    this.scene.input.keyboard?.removeAllKeys(true);
  }
}
