import { defineConfig, devices } from "@playwright/test";

/**
 * Simulation Theater V2 · LOCAL, opt-in browser verification of the dev route and the integrated public route.
 *
 * Both need an opted-in server (GTP_DEV_ROUTES=1 for /dev/**, GTP_NFL_THEATER_PUBLIC=1 for the public section), so this
 * is NOT part of the default suite (e2e/simulation-theater.spec.ts skips there). No webServer: point it at a running
 * dev server or a served export, http://localhost:4182 by default (the sprint coordinator's dev server):
 *
 *   GTP_THEATER_E2E=1 npx playwright test -c playwright.theater.config.ts                         # dev route
 *   GTP_THEATER_E2E=1 GTP_THEATER_TARGET=public npx playwright test -c playwright.theater.config.ts  # integrated route
 *
 * GTP_THEATER_BASE_URL (or the older GTP_THEATER_BASE) overrides the base URL.
 */
export default defineConfig({
  testDir: "./e2e",
  // nba-theater.spec.ts (Lane A-NBA 2026-10-20): the NBA dev route's box score; skips on GTP_THEATER_TARGET=public
  testMatch: /(simulation|nba)-theater\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: process.env.GTP_THEATER_BASE_URL ?? process.env.GTP_THEATER_BASE ?? "http://localhost:4182", trace: "off", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
