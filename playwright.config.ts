import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Phaser boots a real WebGL canvas per worker. Running ten of those in
  // parallel on a laptop starves the CPU and teardown hits the test timeout, so
  // the worker count is capped deliberately rather than left to the default.
  workers: process.env.CI ? 2 : 3,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @ruleforge/web dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});