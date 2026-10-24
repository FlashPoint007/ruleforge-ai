import { expect, test } from "@playwright/test";

test("home page renders the scaffold", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "RuleForge AI" })).toBeVisible();
  await expect(page.getByText("规则造物局", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "进入实验室" })).toBeVisible();
});

test("presets are playable without any api key", async ({ page }) => {
  await page.goto("/");

  const cards = page.locator(".card__name");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveText("重力反转");
  await expect(cards.nth(1)).toHaveText("拾金减速");
});

test("the lab stays collapsed until the player asks for it", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("game-canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "进入实验室" }).click();
  await expect(page.getByTestId("game-canvas")).toBeVisible();
});
