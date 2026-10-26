import Phaser from "phaser";

import { TERRAIN_SLICE } from "@/game/config";
import type { PlatformDef } from "@/game/levels/levelSchema";

/** Thickness of the walkable surface. Thin enough to never act as a wall. */
const COLLISION_STRIP_HEIGHT = 12;

/**
 * Builds a platform from the terrain sheet.
 *
 * The sheet blocks are stretchable nine-slices: a green cap band (y 0-5), solid
 * fill, a dark base, and 5px side borders. Stretching keeps the cap and base
 * crisp at any width, which repeating the 96px block would not.
 */
export function addPlatform(
  scene: Phaser.Scene,
  def: PlatformDef,
): { visual: Phaser.GameObjects.NineSlice; body: Phaser.GameObjects.Rectangle } {
  const visual = new Phaser.GameObjects.NineSlice(
    scene,
    def.x,
    def.y,
    `terrain-${def.material}`,
    undefined,
    def.width,
    def.height,
    TERRAIN_SLICE.left,
    TERRAIN_SLICE.right,
    TERRAIN_SLICE.top,
    TERRAIN_SLICE.bottom,
  );
  visual.setOrigin(0, 0);
  visual.setDepth(10);
  scene.add.existing(visual);

  // Collision is a thin strip along the top face rather than the whole block.
  //
  // Two reasons: the player must be able to land on the lip even when arriving a
  // pixel past it, and a full-height body turns the platform's side into a wall
  // that silently swallows jumps aimed at the edge. A thin top strip is the
  // standard platformer answer and it matches what the art implies.
  const body = scene.add.rectangle(
    def.x + def.width / 2,
    def.y + COLLISION_STRIP_HEIGHT / 2,
    def.width,
    COLLISION_STRIP_HEIGHT,
  );
  body.setVisible(false);
  body.setDepth(9);
  scene.physics.add.existing(body, true);

  const staticBody = body.body as Phaser.Physics.Arcade.StaticBody;
  // One-way: solid when falling onto it, passable when jumping up through it.
  staticBody.checkCollision.down = false;
  staticBody.checkCollision.left = false;
  staticBody.checkCollision.right = false;

  return { visual, body };
}