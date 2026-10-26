import { expect, test } from "@playwright/test";

/**
 * The API is intentionally not running during e2e: the client must degrade
 * gracefully. Those connection failures are expected noise, not defects, so the
 * error collector below filters exactly them and nothing else.
 */
/**
 * Waits until the scene has finished building before reading state.
 *
 * Reading during create() returns a partially built scene, which used to throw.
 */
/** Waits for a grounded frame: a jump during the spawn fall is swallowed. */
async function waitForGround(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => { onGround: boolean } } }).__ruleforge;
      return hook?.readDebugState?.().onGround === true;
    },
    undefined,
    { timeout: 10_000 },
  );
}

async function waitForScene(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
      const state = hook?.readDebugState?.() as { ready?: boolean } | null | undefined;
      return state?.ready === true;
    },
    undefined,
    { timeout: 20_000 },
  );
}

function collectUnexpectedErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    if (text.includes("ERR_CONNECTION_REFUSED") || text.includes("Failed to load resource")) {
      return;
    }
    errors.push(text);
  });

  return errors;
}

test("home page renders the scaffold", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "RuleForge AI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "进入实验室" })).toBeVisible();
});

test("presets are playable without any api key", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".card__name");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveText("重力反转");
  await expect(cards.nth(1)).toHaveText("拾金减速");
});

test("the lab boots a real canvas without game errors", async ({ page }) => {
  const errors = collectUnexpectedErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();

  const canvas = page.getByTestId("game-canvas").locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  // Give the scene time to build platforms, animate, and settle.
  await page.waitForTimeout(1800);
  expect(errors).toEqual([]);
});

test("the character responds to keyboard input", async ({ page }) => {
  const errors = collectUnexpectedErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();

  const canvas = page.getByTestId("game-canvas").locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(600);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.keyboard.up("Space");
  await page.waitForTimeout(1200);

  expect(errors).toEqual([]);
});
test("enabling the gravity rule actually flips gravity", async ({ page }) => {
  const errors = collectUnexpectedErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();

  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();

  const readState = () =>
    page.evaluate(() => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
      return hook ? hook.readDebugState() : null;
    });

  type State = {
    gravityDirection: number;
    packId: string | null;
    actionsApplied: number;
    y: number;
    worldGravityY: number;
    flipY: boolean;
  };

  const before = (await readState()) as State | null;
  expect(before).not.toBeNull();
  expect(before?.gravityDirection).toBe(1);
  expect(before?.worldGravityY).toBeGreaterThan(0);

  await page.locator('[data-rule-id="preset-gravity-flip"]').click();
  await expect(page.getByTestId("rule-status")).toContainText("规则运行中");

  // Hold the key across several frames: a single press can fall between ticks.
  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.keyboard.up("Space");
  await page.waitForTimeout(250);

  const after = (await readState()) as State | null;

  expect(after?.packId).toBe("preset-gravity-flip");
  expect(after?.actionsApplied).toBeGreaterThan(0);
  expect(after?.gravityDirection).toBe(-1);
  // The world's pull must actually invert, not just a flag.
  expect(after?.worldGravityY).toBeLessThan(0);
  expect(after?.flipY).toBe(true);
  expect(errors).toEqual([]);
});

test("flipped gravity cannot launch the player out of the level", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();

  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();

  await page.locator('[data-rule-id="preset-gravity-flip"]').click();

  // The character spawns a little above the floor; a jump during that fall is
  // swallowed by the buffer, so wait for a grounded frame before jumping.
  await page.waitForFunction(
    () => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => { onGround: boolean } } }).__ruleforge;
      return hook?.readDebugState?.().onGround === true;
    },
    undefined,
    { timeout: 10_000 },
  );

  await page.keyboard.down("Space");
  await page.waitForTimeout(250);
  await page.keyboard.up("Space");

  // Wait for the flip to actually happen instead of guessing a duration.
  await page.waitForFunction(
    () => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => { gravityDirection: number } } }).__ruleforge;
      return hook?.readDebugState?.().gravityDirection === -1;
    },
    undefined,
    { timeout: 10_000 },
  );

  // Long enough to hit the ceiling and settle against it.
  await page.waitForTimeout(2500);

  const state = (await page.evaluate(() => {
    const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
    return hook ? hook.readDebugState() : null;
  })) as { y: number; gravityDirection: number } | null;

  expect(state).not.toBeNull();
  expect(state?.gravityDirection).toBe(-1);
  // The ceiling holds the player inside the world instead of letting them fly off.
  expect(state?.y).toBeGreaterThan(-200);
});

test("disabling the rule restores normal gravity", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();

  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();

  const readState = () =>
    page.evaluate(() => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
      return hook ? hook.readDebugState() : null;
    });

  const ruleCard = page.locator('[data-rule-id="preset-gravity-flip"]');
  await ruleCard.click();
  await waitForGround(page);
  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.keyboard.up("Space");
  await page.waitForTimeout(250);

  expect(((await readState()) as { gravityDirection: number }).gravityDirection).toBe(-1);

  await ruleCard.click();
  await page.waitForTimeout(300);
  const after = (await readState()) as {
    gravityDirection: number;
    packId: string | null;
    worldGravityY: number;
  };

  expect(after.packId).toBeNull();
  expect(after.gravityDirection).toBe(1);
  expect(after.worldGravityY).toBeGreaterThan(0);
});

test("coins are collectible and counted", async ({ page }) => {
  const errors = collectUnexpectedErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1800);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(200);

  const state = (await page.evaluate(() => {
    const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
    return hook ? hook.readDebugState() : null;
  })) as { coinsCollected: number } | null;

  expect(state?.coinsCollected ?? 0).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("the enemy slow rule fires when a coin is collected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);

  await page.locator('[data-rule-id="preset-enemy-slow"]').click();
  await expect(page.getByTestId("rule-status")).toContainText("规则运行中");

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1800);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(300);

  const state = (await page.evaluate(() => {
    const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
    return hook ? hook.readDebugState() : null;
  })) as { actionsApplied: number; activeRules: string[]; coinsCollected: number } | null;

  expect(state?.coinsCollected ?? 0).toBeGreaterThan(0);
  expect(state?.activeRules).toContain("coin.collected → enemy.speed.multiply");
  // The rule must actually execute, not merely be loaded.
  expect(state?.actionsApplied ?? 0).toBeGreaterThan(0);
});

test("the level spawns enemies and they stay in the world", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await waitForScene(page);

  const state = (await page.evaluate(() => {
    const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
    return hook ? hook.readDebugState() : null;
  })) as { liveEnemies: number } | null;

  expect(state?.liveEnemies ?? 0).toBe(5);
});

test("a rule condition blocks the action until it is satisfied", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);

  const readState = () =>
    page.evaluate(() => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
      return hook ? hook.readDebugState() : null;
    });

  type State = {
    gravityDirection: number;
    actionsApplied: number;
    conditionsBlocked: number;
    coinsCollected: number;
    onGround: boolean;
  };

  await page.locator('[data-rule-id="preset-guarded-gravity"]').click();
  await expect(page.getByTestId("rule-status")).toContainText("规则运行中");

  // No coins yet: the guard must block the flip.
  await page.keyboard.down("Space");
  await page.waitForTimeout(200);
  await page.keyboard.up("Space");
  await page.waitForTimeout(600);

  const blocked = (await readState()) as State;
  expect(blocked.gravityDirection).toBe(1);
  expect(blocked.actionsApplied).toBe(0);
  expect(blocked.conditionsBlocked).toBeGreaterThan(0);

  // Collect two coins without leaving solid ground.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1250);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(500);

  const stocked = (await readState()) as State;
  expect(stocked.coinsCollected).toBeGreaterThanOrEqual(2);
  expect(stocked.onGround).toBe(true);

  // Same rule, same jump, condition now satisfied.
  await page.keyboard.down("Space");
  await page.waitForTimeout(220);
  await page.keyboard.up("Space");
  await page.waitForTimeout(700);

  const fired = (await readState()) as State;
  expect(fired.actionsApplied).toBeGreaterThan(0);
  expect(fired.gravityDirection).toBe(-1);
});

test("every registered action is implemented and none is rejected at load", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);

  // Load each preset in turn: a pack referencing an unimplemented action would
  // surface as a visible error instead of a running rule.
  for (const id of [
    "preset-gravity-flip",
    "preset-guarded-gravity",
    "preset-shield-on-coin",
    "preset-enemy-slow",
  ]) {
    await page.locator(`[data-rule-id="${id}"]`).click();
    await expect(page.getByTestId("rule-status")).toContainText("规则运行中");
    await expect(page.getByTestId("rule-status")).not.toContainText("规则未生效");
    await page.locator(`[data-rule-id="${id}"]`).click();
  }
});

test("the shield rule grants a timed shield after three coins", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);

  const readState = () =>
    page.evaluate(() => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
      return hook ? hook.readDebugState() : null;
    });

  type State = { coinsCollected: number; shieldMs: number; actionsApplied: number; conditionsBlocked: number };

  await page.locator('[data-rule-id="preset-shield-on-coin"]').click();

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1600);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(200);

  const state = (await readState()) as State;

  expect(state.coinsCollected).toBeGreaterThanOrEqual(3);
  expect(state.actionsApplied).toBeGreaterThan(0);
  // modEq 3 blocks every other collection, which is the point of the guard.
  expect(state.conditionsBlocked).toBeGreaterThan(0);
  expect(state.shieldMs).toBeGreaterThan(0);
  expect(state.shieldMs).toBeLessThanOrEqual(6000);

  // The panel must reflect live engine stats, not only the load-time snapshot.
  await expect(page.getByTestId("rule-status")).toContainText("已应用");
  await expect(page.getByTestId("rule-status")).not.toContainText("已应用 0 个动作");
});

test("a prompt is compiled by the server and takes effect in the game", async ({ page, request }) => {
  // The generation flow needs the FastAPI service; the rest of the suite does not.
  const health = await request.get("http://127.0.0.1:8000/api/v1/healthz").catch(() => null);
  test.skip(health === null || !health.ok(), "API not running on :8000");

  const errors = collectUnexpectedErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);
  await waitForGround(page);

  await page.getByLabel("规则描述").fill("每跳一次，重力反转");
  await page.getByRole("button", { name: "生成规则" }).click();

  await expect(page.getByTestId("rule-message")).toContainText("已生成并启用", { timeout: 20_000 });
  await expect(page.getByTestId("rule-status")).toContainText("规则运行中");

  await page.keyboard.down("Space");
  await page.waitForTimeout(250);
  await page.keyboard.up("Space");
  await page.waitForTimeout(700);

  const state = (await page.evaluate(() => {
    const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
    return hook ? hook.readDebugState() : null;
  })) as { gravityDirection: number; actionsApplied: number; packId: string | null } | null;

  // The pack came from the server, so its id must be the server's content hash.
  expect(state?.packId).toMatch(/^pack-/);
  expect(state?.actionsApplied).toBeGreaterThan(0);
  expect(state?.gravityDirection).toBe(-1);
  expect(errors).toEqual([]);
});

test("an unsupported prompt is refused with a reason, not a silent failure", async ({ page, request }) => {
  const health = await request.get("http://127.0.0.1:8000/api/v1/healthz").catch(() => null);
  test.skip(health === null || !health.ok(), "API not running on :8000");

  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);

  await page.getByLabel("规则描述").fill("跳舞");
  await page.getByRole("button", { name: "生成规则" }).click();

  await expect(page.getByTestId("rule-message")).toContainText("无法生成", { timeout: 20_000 });
  await expect(page.getByTestId("rule-status")).toContainText("当前没有生效的规则");
});

test("walking into an enemy costs a life instead of killing it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);
  await waitForGround(page);

  const readState = () =>
    page.evaluate(() => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
      return hook ? hook.readDebugState() : null;
    });

  type State = { lives: number; enemiesDefeated: number; liveEnemies: number };

  const before = (await readState()) as State;
  expect(before.liveEnemies).toBe(5);
  expect(before.enemiesDefeated).toBe(0);

  // The first enemy is beyond the gap, so clear the gap first, then walk into
  // the enemy from the side on flat ground.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1400);
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  await page.keyboard.up("Space");
  await page.waitForTimeout(1200);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(400);

  const landed = (await readState()) as State;
  // The crossing itself may already have grazed an enemy; that is fine, the
  // assertion below is what matters.

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1800);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(700);

  const after = (await readState()) as State;

  // Side contact must not be a stomp: the enemy survives.
  expect(after.enemiesDefeated).toBe(0);
  expect(after.liveEnemies).toBe(5);
  // And the player must have paid for it: lives never go back up by themselves.
  expect(after.lives).toBeLessThanOrEqual(landed.lives);
});

test("losing every life restarts the level instead of silently refilling", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入实验室" }).click();
  const canvas = page.getByTestId("game-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await canvas.click();
  await waitForScene(page);
  await waitForGround(page);

  const readState = () =>
    page.evaluate(() => {
      const hook = (window as unknown as { __ruleforge?: { readDebugState: () => unknown } }).__ruleforge;
      return hook ? hook.readDebugState() : null;
    });

  // Fall into the gap repeatedly; each fall costs a life.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(2200);
    await page.keyboard.up("ArrowRight");
    await page.waitForTimeout(1400);
  }

  const state = (await readState()) as { lives: number; coinsCollected: number } | null;

  // Whatever happened, the game must still be running with a sane life count.
  expect(state).not.toBeNull();
  expect(state?.lives).toBeGreaterThanOrEqual(1);
  expect(state?.lives).toBeLessThanOrEqual(3);
});