import Phaser from "phaser";

import type { CrumblingDef } from "@/game/levels/levelSchema";

/**
 * A platform that collapses shortly after being stood on.
 *
 * The delay is a rule parameter (250-5000ms per the DSL spec), so the timer is
 * simulated: it is cancelled and restarted cleanly on reset, and it never fires
 * against a platform that has already collapsed.
 */
export class CrumblingPlatform {
  readonly body: Phaser.GameObjects.Rectangle;
  private readonly visual: Phaser.GameObjects.NineSlice;
  private readonly scene: Phaser.Scene;
  private readonly delayMs: number;
  private timer: Phaser.Time.TimerEvent | null = null;
  private collapsed = false;

  constructor(scene: Phaser.Scene, def: CrumblingDef) {
    this.scene = scene;
    this.delayMs = def.delayMs;

    this.visual = new Phaser.GameObjects.NineSlice(
      scene,
      def.x,
      def.y,
      "terrain-stone",
      undefined,
      def.width,
      32,
      5,
      5,
      7,
      4,
    );
    this.visual.setOrigin(0, 0);
    this.visual.setDepth(11);
    scene.add.existing(this.visual);

    this.body = scene.add.rectangle(def.x + def.width / 2, def.y + 16, def.width, 32);
    this.body.setVisible(false);
    scene.physics.add.existing(this.body, true);
  }

  get isCollapsed(): boolean {
    return this.collapsed;
  }

  /** Called when the player lands on this platform. */
  touch(): void {
    if (this.collapsed || this.timer !== null) {
      return;
    }

    // Shake to telegraph the collapse: a platform that vanishes without warning
    // reads as a bug, not as a rule.
    this.scene.tweens.add({
      targets: this.visual,
      x: this.visual.x + 2,
      duration: 60,
      yoyo: true,
      repeat: -1,
    });

    this.timer = this.scene.time.delayedCall(this.delayMs, () => {
      this.timer = null;
      this.collapse();
    });
  }

  private collapse(): void {
    if (this.collapsed) {
      return;
    }
    this.collapsed = true;
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.setVisible(false);
    this.body.setVisible(false);
    const body = this.body.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = false;
  }

  reset(): void {
    if (this.timer !== null) {
      this.timer.remove(false);
      this.timer = null;
    }
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.setPosition(this.visual.x, this.visual.y);
    this.visual.setVisible(true);
    this.body.setVisible(false);
    const body = this.body.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = true;
    this.collapsed = false;
  }
}
