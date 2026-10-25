import { expect, test } from "@playwright/test";

/**
 * The API is intentionally not running during e2e: the client must degrade
 * gracefully. Those connection failures are expected noise, not defects, so the
 * error collector below filters exactly them and nothing else.
 */
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

  await page.getByRole("button", { name: /重力反转/ }).click();
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

  await page.getByRole("button", { name: /重力反转/ }).click();
  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.keyboard.up("Space");

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

  const ruleCard = page.getByRole("button", { name: /重力反转/ });
  await ruleCard.click();
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
