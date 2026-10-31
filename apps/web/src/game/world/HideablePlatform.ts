import Phaser from "phaser";

import type { HideablePlatformDef } from "@/game/levels/levelSchema";

/**
 * A platform a rule can hide or show.
 *
 * Collision and visual switch together: hiding only the sprite would leave an
 * invisible floor, which reads as a physics bug rather than a rule.
 */
export class HideablePlatform {
  readonly body: Phaser.GameObjects.Rectangle;
  private readonly visual: Phaser.GameObjects.NineSlice;
  private visible = true;

  constructor(scene: Phaser.Scene, def: HideablePlatformDef) {
    this.visual = new Phaser.GameObjects.NineSlice(
      scene,
      def.x,
      def.y,
      "terrain-tech",
      undefined,
      def.width,
      def.height,
      5,
      5,
      7,
      4,
    );
    this.visual.setOrigin(0, 0);
    this.visual.setDepth(11);
    scene.add.existing(this.visual);

    this.body = scene.add.rectangle(def.x + def.width / 2, def.y + def.height / 2, def.width, def.height);
    this.body.setVisible(false);
    scene.physics.add.existing(this.body, true);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Restores the level's authored state. */
  reset(): void {
    this.setVisible(true);
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    this.visual.setVisible(visible);
    const body = this.body.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = visible;
  }
}