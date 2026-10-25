import Phaser from "phaser";

import { ART_PALETTE } from "@/app/theme";
import { GAME_HEIGHT, GAME_WIDTH } from "@/game/config";

const hex = (value: string): number => Phaser.Display.Color.HexStringToColor(value).color;

const ISLAND_BODY = "#0A2745";
const ISLAND_CAP = "#3E86BE";

/**
 * Parallax sky drawn procedurally, so the build stays asset-light and the
 * palette stays exactly on-model.
 *
 * Islands are stacked ellipses whose height overlaps heavily. A trapezoid under
 * a flat disc reads as a funnel, and slices that do not overlap read as a
 * stack of pancakes; overlapping, nearly-opaque slices read as rock.
 */
export function createBackdrop(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  const sky = scene.add.graphics();
  sky.fillGradientStyle(hex("#071F3B"), hex("#071F3B"), hex("#1D5E97"), hex("#1D5E97"), 1);
  sky.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  sky.setScrollFactor(0);
  sky.setDepth(-100);

  const far = scene.add.graphics();
  far.setScrollFactor(0.18);
  far.setDepth(-90);
  drawIslands(far, 9, 340, 170, 260, 0.9, 52, 44, 150);

  const mid = scene.add.graphics();
  mid.setScrollFactor(0.4);
  mid.setDepth(-80);
  drawIslands(mid, 6, 520, 110, 180, 0.85, 76, 58, 210);

  const haze = scene.add.graphics();
  haze.setScrollFactor(0.62);
  haze.setDepth(-70);
  for (let i = 0; i < 14; i += 1) {
    const x = i * 260 + 40;
    const y = 80 + ((i * 71) % 210);
    haze.fillStyle(hex(ART_PALETTE.pureWhite), 0.035);
    haze.fillEllipse(x, y, 320, 66);
    haze.fillEllipse(x + 90, y - 24, 190, 48);
  }

  return [sky, far, mid, haze];
}

function drawIslands(
  graphics: Phaser.GameObjects.Graphics,
  count: number,
  spacing: number,
  minTop: number,
  maxTop: number,
  alpha: number,
  minHalfWidth: number,
  widthSpread: number,
  maxDepth: number,
): void {
  const slices = 26;

  for (let i = 0; i < count; i += 1) {
    const x = i * spacing + ((i * 137) % 110);
    const topY = minTop + ((i * 89) % Math.max(1, maxTop - minTop));
    const halfWidth = minHalfWidth + ((i * 47) % widthSpread);
    const depth = maxDepth * (0.6 + ((i * 31) % 40) / 100);

    // A slight hue shift down the body sells the taper as volume.
    for (let s = 0; s < slices; s += 1) {
      const t = s / (slices - 1);
      const width = halfWidth * Math.pow(1 - t, 0.62);
      const y = topY + depth * t;
      // Overlap generously: each slice is ~3x taller than its step.
      const sliceHeight = Math.max(10, (depth / slices) * 3.4);
      const shade = t < 0.5 ? ISLAND_BODY : "#082039";
      graphics.fillStyle(hex(shade), alpha);
      graphics.fillEllipse(x, y, Math.max(4, width * 2), sliceHeight);
    }

    graphics.fillStyle(hex(ISLAND_CAP), alpha);
    graphics.fillEllipse(x, topY, halfWidth * 2, 18);
  }
}
