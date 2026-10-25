import Phaser from "phaser";

import { ART_PALETTE } from "@/app/theme";
import { DSL_VERSION } from "@ruleforge/rule-schema";

/** HUD chrome. Kept in its own scene so gameplay and UI never share a draw loop. */
export class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create(): void {
    this.add
      .text(20, 20, "天空遗迹 · lab-01", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: ART_PALETTE.pureWhite,
      })
      .setAlpha(0.75);

    this.add
      .text(20, 40, `DSL v${DSL_VERSION} · mock 模式 · 规则引擎在下一阶段接入`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: ART_PALETTE.starlight,
      })
      .setAlpha(0.6);

    this.add
      .text(20, 516, "← → / A D 移动 · 空格跳跃", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: ART_PALETTE.starlight,
      })
      .setAlpha(0.55);
  }
}
