import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — Phase 13.
 *
 * Lightweight setup focused on smoke-level browser QA:
 *   - Single project (chromium) to keep CI fast.
 *   - Spins up `npm run dev` against the static build, points tests at it.
 *   - 30s default timeout — these are smoke tests, not deep integration.
 *
 * Browsers must be installed once via:
 *   cd app && npx playwright install chromium
 *
 * Run all tests:
 *   cd app && npm run e2e
 *
 * Run a single spec:
 *   cd app && npx playwright test e2e/navigation.spec.ts
 *
 * Run with UI for debugging:
 *   cd app && npx playwright test --ui
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
