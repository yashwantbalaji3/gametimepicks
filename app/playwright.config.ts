import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — browser QA against the BUILT STATIC EXPORT (Sprint 031 · Phase 4).
 *
 * This project is `output: "export"`. Under `next dev` several exported routes return 500, so a
 * dev-server harness could not test the pages that most needed testing — which is why the Market
 * Center spec previously parsed but never ran, and its assertions had to be checked by hand.
 *
 * The server under test is therefore the EXPORTED DIRECTORY, served statically. That is also what
 * production serves, so a passing run here means the same artifact a visitor receives.
 *
 * `--directory out` requires the export to exist. `npm run e2e` builds first; use
 * `npm run e2e:fast` to reuse an existing `out/` when iterating on specs.
 *
 * Browsers must be installed once:
 *   cd app && npm run e2e:install
 *
 * Run:
 *   cd app && npm run e2e                       # build + serve + test
 *   cd app && npx playwright test e2e/markets.spec.ts
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
    baseURL: "http://localhost:4173",
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
    // Serve the exported directory — NOT `next dev`, which 500s on these routes under output:export.
    command: "node scripts/serve-export.mjs 4173 out",
    url: "http://localhost:4173",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
