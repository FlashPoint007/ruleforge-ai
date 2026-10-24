import Phaser from "phaser";

import { DSL_VERSION } from "@ruleforge/rule-schema";

/** Minimal HUD. Kept separate so gameplay and chrome never share a scene. */
export class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create(): void {
    this.add
      .text(24, 500, `DSL v${DSL_VERSION} · mock 模式 · 无模型调用`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#64748b",
      })
      .setScrollFactor(0);
  }
}
