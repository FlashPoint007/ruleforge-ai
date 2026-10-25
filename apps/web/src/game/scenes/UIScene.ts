import Phaser from "phaser";

import { ART_PALETTE } from "@/app/theme";
import { DSL_VERSION } from "@ruleforge/rule-schema";

export interface HudState {
  coins: number;
  totalCoins: number;
  defeated: number;
  rules: string[];
}

const HUD_EVENT = "ruleforge:hud";

/**
 * HUD chrome. Kept in its own scene so gameplay and UI never share a draw loop.
 *
 * The scene listens for a HUD event rather than reaching into GameScene: the two
 * scenes must stay independent, and the numbers shown must come from the game,
 * not from a counter that drifts.
 */
export class UIScene extends Phaser.Scene {
  private coinText?: Phaser.GameObjects.Text;
  private rulesText?: Phaser.GameObjects.Text;

  constructor() {
    super("UIScene");
  }

  create(): void {
    this.add
      .text(20, 18, "天空遗迹 · lab-01", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: ART_PALETTE.pureWhite,
      })
      .setAlpha(0.8);

    this.add
      .text(20, 36, `DSL v${DSL_VERSION} · 规则引擎运行中`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: ART_PALETTE.starlight,
      })
      .setAlpha(0.55);

    this.coinText = this.add
      .text(20, 60, "", {
        fontFamily: "ui-monospace, monospace",
        fontSize: "13px",
        color: "#F2C14E",
      })
      .setAlpha(0.9);

    this.rulesText = this.add
      .text(20, 82, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: ART_PALETTE.techCyan,
      })
      .setAlpha(0.75);

    this.add
      .text(20, 514, "← → / A D 移动 · 空格 跳跃 · 踩敌人可以击败它", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: ART_PALETTE.starlight,
      })
      .setAlpha(0.5);

    const onHud = (event: Event): void => {
      const state = (event as CustomEvent<HudState>).detail;
      this.coinText?.setText(`金币 ${state.coins} / ${state.totalCoins}  击败 ${state.defeated}`);
      this.rulesText?.setText(state.rules.length > 0 ? `规则：${state.rules.join(" · ")}` : "规则：无");
    };

    window.addEventListener(HUD_EVENT, onHud);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener(HUD_EVENT, onHud);
    });
  }
}

export function publishHud(state: HudState): void {
  window.dispatchEvent(new CustomEvent<HudState>(HUD_EVENT, { detail: state }));
}
