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
  /*
   * v1.4.1: CI ran 399 tests two at a time on a four-vCPU runner — measured wall time was the sum of the test
   * durations divided by two (403 s), with half the machine idle. `2` was the scaffold default from the first
   * Playwright commit, not a response to flakiness (no run in the history was flaky at 2). "100%" = one worker per
   * vCPU, so the same suite uses the machine it is given and shrinks automatically on a smaller runner.
   * Nothing about coverage changes: same specs, projects, retries and assertions.
   */
  workers: process.env.CI ? "100%" : undefined,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    /*
     * v1.4.1: was "retain-on-failure", which RECORDS video for every test and deletes it when the test passes —
     * measured 125 s → 104 s of the local suite (and 399 tests × 3 engines in CI) spent recording video that is
     * thrown away. "on-first-retry" matches the trace policy: CI retries once, so a failing test still produces a
     * video (and a trace) of its retry. Diagnostics for a real failure are unchanged.
     */
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Two claims are proven on all three engines: the accessibility gate says "cross-browser"
    // (contrast/focus genuinely differ across Blink/WebKit/Gecko), and the route/state assurance
    // contract says high-traffic routes hydrate clean everywhere (hydration errors differ by
    // engine timing). The remaining specs assert engine-independent product behaviour, and
    // running them 3x would triple the suite for no added signal.
    {
      name: "webkit-a11y",
      use: { ...devices["Desktop Safari"] },
      testMatch: /accessibility\.spec\.ts|route-assurance\.spec\.ts|p185-color-mix\.spec\.ts|p185-motion-roles\.spec\.ts|p202-journey-matrix\.spec\.ts|p214-scene-matrix\.spec\.ts|p230-leg-reachability\.spec\.ts|p234-player-responsive\.spec\.ts/,
    },
    {
      name: "firefox-a11y",
      use: { ...devices["Desktop Firefox"] },
      /* The player joins the cross-engine set because its failures were engine-shaped: a stacking
         context that let the footer paint over its controls, and a fixed frame whose fit depends on
         flex rounding. Neither is visible from source, and neither is Chromium-only. */
      testMatch: /accessibility\.spec\.ts|route-assurance\.spec\.ts|p185-color-mix\.spec\.ts|p185-motion-roles\.spec\.ts|p202-journey-matrix\.spec\.ts|p214-scene-matrix\.spec\.ts|p230-leg-reachability\.spec\.ts|p234-player-responsive\.spec\.ts/,
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
