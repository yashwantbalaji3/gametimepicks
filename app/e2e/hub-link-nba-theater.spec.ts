/**
 * NBA hub ⇄ Simulation Theater navigation is console-clean (release owner 2026-10-22). LOCAL / opt-in, like
 * possession-nba-theater.spec.ts: it needs a flag-ON build whose current slate has built Theater pages.
 *
 *   GTP_NBA_THEATER_PUBLIC=1 npm run build && node scripts/serve-export.mjs 4182 out
 *   GTP_THEATER_E2E=1 GTP_THEATER_TARGET=public npx playwright test -c playwright.theater.config.ts e2e/hub-link-nba-theater.spec.ts
 *   (GTP_THEATER_BASE_URL=https://… runs the same check against a deployment.)
 *
 * The defect: the card's Theater link was a plain <a>, so a click was a full page load that aborted the hub's in-flight
 * route prefetches, and Next logged "Failed to fetch RSC payload … Falling back to browser navigation" ~5× per click
 * (Production, 768px: 4/4 runs; /nfl → /nfl/game: 0/4). The links are next/link now (the CTA with prefetch={false}).
 */
import { test, expect, type Page } from "@playwright/test";

const ENABLED = process.env.GTP_THEATER_E2E === "1" && process.env.GTP_THEATER_TARGET === "public";
test.skip(!ENABLED, "set GTP_THEATER_E2E=1 GTP_THEATER_TARGET=public and serve a flag-ON build with built Theater pages (see header)");

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

for (const [w, h] of [[768, 1024], [390, 844]] as const) {
  for (const run of [1, 2, 3, 4]) {
    test(`${w}px run ${run}: /nba card → Theater → back to the hub, with no console error`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      // 300 ms of latency keeps the hub's viewport prefetches in flight at click time on a fast local server too
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: -1, uploadThroughput: -1 });
      const errors = collectErrors(page);
      await page.goto("/nba/", { waitUntil: "load" });
      const cta = page.locator("[data-nba-theater-link]").first();
      test.skip((await cta.count()) === 0, "no Theater page is built for this build's slate");
      await cta.scrollIntoViewIfNeeded();
      // click while the hub's viewport prefetches are still in flight — the moment the plain <a> broke
      await cta.click();
      await page.waitForURL(/\/nba\/simulation\/[^/]+\/$/);
      await page.waitForSelector("[data-nbp-theater][data-nbp-ready]");
      await expect(page.locator("#official-predictions h2")).toHaveText("GameTimePicks Official Predictions");
      await page.locator('nav[aria-label="This game"] a', { hasText: "NBA hub" }).click();
      await page.waitForURL(/\/nba\/$/);
      await page.waitForLoadState("networkidle");
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
}
