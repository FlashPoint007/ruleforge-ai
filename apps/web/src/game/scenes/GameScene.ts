import Phaser from "phaser";

import { CAMERA, GAME_HEIGHT, PHYSICS, RESPAWN } from "@/game/config";
import { Coin } from "@/game/entities/Coin";
import { Enemy } from "@/game/entities/Enemy";
import { Player } from "@/game/entities/Player";
import { parseLevel } from "@/game/levels/levelSchema";
import type { LevelDef } from "@/game/levels/levelSchema";
import { RuleRuntime } from "@/game/rules/RuleRuntime";
import { RULES_CHANGED_EVENT } from "@/game/rules/types";
import type { RulesChangedPayload } from "@/game/rules/types";
import { publishHud } from "@/game/scenes/UIScene";
import { InputSystem } from "@/game/systems/InputSystem";
import { resetTouch } from "@/game/systems/inputBus";
import { createBackdrop } from "@/game/world/backdrop";
import { CrumblingPlatform } from "@/game/world/CrumblingPlatform";
import { addPlatform } from "@/game/world/terrain";

import levelData from "@content/levels/lab-01.json";

/**
 * The playable arena.
 *
 * Scenes never call the network. Level data arrives as validated JSON, rules
 * arrive as validated packs, and every path that can kill or move the player
 * funnels through respawn().
 */
export class GameScene extends Phaser.Scene {
  private level!: LevelDef;
  private player!: Player;
  private inputSystem!: InputSystem;
  private runtime!: RuleRuntime;
  private platformBodies: Phaser.GameObjects.Rectangle[] = [];
  private checkpoint = { x: 0, y: 0 };
  private isRespawning = false;
  private lastPackId: string | null = null;
  private lastPackError: string | null = null;
  private lastFrame = { left: false, right: false, jumpPressed: false, jumpHeld: false };

  private enemies: Enemy[] = [];
  private coins: Coin[] = [];
  private crumbling: CrumblingPlatform[] = [];
  private coinsCollected = 0;
  private enemiesDefeated = 0;
  private hasReachedGoal = false;
  private wasInZone = false;

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

    // The runtime is built before the player so the jump callback can never
    // fire against an uninitialised field.
    this.runtime = new RuleRuntime({
      getGravityDirection: () => this.player?.getGravityDirection() ?? 1,
      setGravityDirection: (direction) => this.player?.setGravityDirection(direction),
      setPlayerSpeedMultiplier: (multiplier) => this.player?.setSpeedMultiplier(multiplier),
      setPlayerJumpMultiplier: (multiplier) => this.player?.setJumpMultiplier(multiplier),
      getPlayerPosition: () => ({
        x: this.player?.sprite.x ?? 0,
        y: this.player?.sprite.y ?? 0,
      }),
      getEnemies: () => this.enemies.filter((enemy) => enemy.isAlive),
      getCoins: () => this.coins.filter((coin) => !coin.isCollected),
    });

    this.player = new Player(this, this.checkpoint.x, this.checkpoint.y, () =>
      this.runtime.emit("player.jumpCommitted", this.simulationNow()),
    );

    this.buildEnemies();
    this.buildCoins();
    this.buildCrumbling();

    this.physics.add.collider(this.player.sprite, this.platformBodies);
    this.physics.add.collider(this.player.sprite, this.buildCeiling());
    this.wireOverlaps();

    this.inputSystem = new InputSystem(this);
    this.configureCamera();

    this.cameras.main.fadeIn(RESPAWN.fadeMs, 0, 0, 0);
    this.scene.launch("UIScene");

    this.events.on(Phaser.Scenes.Events.PAUSE, () => this.inputSystem.reset());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputSystem.destroy();
      this.runtime.unload();
    });

    this.runtime.emit("level.start", 0);
  }

  /**
   * Loads a rule pack by id from game-content/presets.
   *
   * A pack that fails validation is reported, not swallowed: the player must
   * never believe a rule is active when it is not.
   */
  loadPresetPack(pack: unknown): void {
    try {
      this.runtime.load(pack);
      this.lastPackId = this.runtime.loadedPackId;
      this.lastPackError = null;
      // A rule enabled mid-run must be able to take effect immediately. Without
      // this, a rule listening to an event that already fired looks broken
      // until the player happens to trigger it again.
      this.runtime.emit("level.start", this.simulationNow());
    } catch (error) {
      this.lastPackId = null;
      this.lastPackError = error instanceof Error ? error.message : "unknown rule pack error";
    }
    this.broadcastRules();
  }

  clearRules(): void {
    this.runtime.unload();
    this.lastPackId = null;
    this.lastPackError = null;
    this.broadcastRules();
  }

  private publishHudState(): void {
    publishHud({
      coins: this.coinsCollected,
      totalCoins: this.coins.length,
      defeated: this.enemiesDefeated,
      rules: this.runtime.describe(),
    });
  }

  private broadcastRules(): void {
    const payload: RulesChangedPayload = {
      packId: this.lastPackId,
      error: this.lastPackError,
      stats: { ...this.runtime.stats },
    };
    window.dispatchEvent(new CustomEvent<RulesChangedPayload>(RULES_CHANGED_EVENT, { detail: payload }));
  }

  /**
   * Read-only probe for end-to-end tests.
   *
   * Asserting on a real value beats asserting on pixels: it proves the rule
   * engine changed physics, not that a sprite happened to move.
   */
  getDebugState(): {
    ready: boolean;
    gravityDirection: 1 | -1;
    packId: string | null;
    actionsApplied: number;
    x: number;
    y: number;
    velocityY: number;
    velocityX: number;
    worldGravityY: number;
    flipY: boolean;
    onGround: boolean;
    lastInput: { left: boolean; right: boolean; jumpPressed: boolean; jumpHeld: boolean };
    coinsCollected: number;
    enemiesDefeated: number;
    liveEnemies: number;
    activeRules: string[];
  } {
    if (!this.player) {
      return {
        ready: false,
        gravityDirection: 1,
        packId: this.lastPackId,
        actionsApplied: this.runtime?.stats.actionsApplied ?? 0,
        x: 0,
        y: 0,
        velocityY: 0,
        velocityX: 0,
        worldGravityY: this.physics.world.gravity.y,
        flipY: false,
        onGround: false,
        lastInput: { ...this.lastFrame },
        coinsCollected: 0,
        enemiesDefeated: 0,
        liveEnemies: 0,
        activeRules: [],
      };
    }

    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    return {
      ready: true,
      gravityDirection: this.player.getGravityDirection(),
      packId: this.lastPackId,
      actionsApplied: this.runtime.stats.actionsApplied,
      x: Math.round(this.player.sprite.x),
      y: Math.round(this.player.sprite.y),
      velocityY: Math.round(body.velocity.y),
      velocityX: Math.round(body.velocity.x),
      worldGravityY: this.physics.world.gravity.y,
      flipY: this.player.sprite.flipY,
      onGround: this.player.isOnGround,
      lastInput: { ...this.lastFrame },
      coinsCollected: this.coinsCollected,
      enemiesDefeated: this.enemiesDefeated,
      liveEnemies: this.enemies.filter((enemy) => enemy.isAlive).length,
      activeRules: this.runtime.describe(),
    };
  }

  /** Simulated milliseconds since scene start. Never Date.now(). */
  private simulationNow(): number {
    return Math.round(this.time.now);
  }

  /**
   * Invisible ceiling.
   *
   * Without it, inverting gravity launches the player out of the level and the
   * only way back is death — which makes the signature rule feel broken.
   */
  private buildCeiling(): Phaser.GameObjects.Rectangle {
    const ceiling = this.add.rectangle(
      this.level.world.width / 2,
      this.level.ceilingY - 20,
      this.level.world.width,
      40,
    );
    ceiling.setVisible(false);
    this.physics.add.existing(ceiling, true);
    return ceiling;
  }

  private buildEnemies(): void {
    this.enemies = this.level.enemies.map((def) => new Enemy(this, def));
  }

  private buildCoins(): void {
    Coin.createTexture(this, "coin");
    this.coins = this.level.coins.map((def) => new Coin(this, def.x, def.y, "coin"));
  }

  private buildCrumbling(): void {
    this.crumbling = this.level.crumbling.map((def) => new CrumblingPlatform(this, def));
  }

  private wireOverlaps(): void {
    this.physics.add.overlap(this.player.sprite, this.coins.map((c) => c.sprite), (_player, sprite) => {
      const coin = this.coins.find((c) => c.sprite === sprite);
      if (!coin || coin.isCollected) {
        return;
      }
      coin.collect();
      this.coinsCollected += 1;
      this.runtime.emit("coin.collected", this.simulationNow());
    });

    this.physics.add.overlap(this.player.sprite, this.enemies.map((e) => e.sprite), () => {
      this.handleEnemyContact();
    });

    for (const platform of this.crumbling) {
      this.physics.add.collider(this.player.sprite, platform.body, () => {
        platform.touch();
      });
    }
  }

  /**
   * Emits player.enterZone when the player comes within range of a coin.
   *
   * The DSL has no per-coin trigger, so proximity to a collectible is the
   * honest mapping for the coin.flee rule. It fires once per entry, not every
   * frame, otherwise the rule would spam the queue.
   */
  private checkZoneEntry(): void {
    const playerX = this.player.sprite.x;
    const playerY = this.player.sprite.y;
    const inside = this.coins.some(
      (coin) => !coin.isCollected && Math.hypot(coin.x - playerX, coin.y - playerY) < 90,
    );

    if (inside && !this.wasInZone) {
      this.runtime.emit("player.enterZone", this.simulationNow());
    }
    this.wasInZone = inside;
  }

  private handleEnemyContact(): void {
    if (this.isRespawning) {
      return;
    }

    const playerBody = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    // Stomping is allowed: landing on an enemy from above defeats it. Any other
    // contact costs a life. Without this, enemies are pure punishment.
    if (playerBody.velocity.y * this.player.getGravityDirection() > 0) {
      const enemy = this.enemies.find(
        (candidate) =>
          candidate.isAlive && Math.abs(candidate.x - this.player.sprite.x) < 46,
      );
      if (enemy) {
        enemy.kill();
        this.enemiesDefeated += 1;
        this.player.bounce();
        this.runtime.emit("enemy.defeated", this.simulationNow());
        return;
      }
    }

    this.runtime.emit("player.damage", this.simulationNow());
    this.respawn(true);
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

    const frame = this.inputSystem.read();
    // Surface edge-triggered input in the debug probe so e2e can prove the
    // keyboard actually reached the scene.
    this.lastFrame = frame;
    const wasOnGround = this.player.isOnGround;

    this.player.update(time, frame);

    for (const enemy of this.enemies) {
      enemy.update();
    }
    for (const coin of this.coins) {
      coin.update();
    }

    this.checkZoneEntry();

    this.runtime.tick(this.simulationNow());
    this.publishHudState();

    if (!wasOnGround && this.player.isOnGround) {
      this.runtime.emit("player.landed", this.simulationNow());
    }

    if (this.player.sprite.y > this.level.killPlaneY) {
      this.respawn(true);
    }

    const goalX = this.level.world.width - 120;
    if (!this.hasReachedGoal && Math.abs(this.player.sprite.x - goalX) < 80) {
      this.hasReachedGoal = true;
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
    this.player.setGravityDirection(1);
    // Rules survive a respawn: the player's rule is the point of the game, so
    // dying must not silently delete it.
    this.player.setFrozen(false);
    this.inputSystem.reset();
    resetTouch();
    this.cameras.main.centerOn(this.checkpoint.x, this.checkpoint.y - GAME_HEIGHT / 4);
  }
}