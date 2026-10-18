import { defineConfig, devices } from "@playwright/test";

/**
 * Simulation Theater V2 · LOCAL, opt-in browser verification of the dev route (iteration 2).
 *
 * The dev route exists only in an export built with GTP_DEV_ROUTES=1, so it is NOT part of the default suite
 * (e2e/simulation-theater.spec.ts skips there). No webServer: serve the dev export yourself, on 4181 by default:
 *
 *   cd app && GTP_DEV_ROUTES=1 npm run build && (cd .. && git checkout -- data/ app/public/data/)
 *   node scripts/serve-export.mjs 4181 out &
 *   GTP_THEATER_E2E=1 npx playwright test -c playwright.theater.config.ts
 *
 * GTP_THEATER_BASE overrides the base URL.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /simulation-theater\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: process.env.GTP_THEATER_BASE ?? "http://localhost:4181", trace: "off", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
