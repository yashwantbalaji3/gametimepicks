/**
 * P214 · Release E — IDENTITY FAILURE FIXTURES. Every remote logo/portrait request is ABORTED and
 * the page must degrade to the resolvers' fallback chain: names stay visible, no native
 * broken-image icon (a visible <img> whose load failed) survives, layout keeps its rows.
 */
import { test, expect } from "@playwright/test";

const PAGES = ["/simulate/", "/", "/ufc/"];

for (const route of PAGES) {
  test(`identity fallbacks hold on ${route} when every remote image fails`, async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) =>
      /image|img|logo|headshot|\.svg|\.png|\.jpg/i.test(r.request().url()) ? r.abort() : r.continue(),
    );
    await page.goto(route);
    await page.waitForLoadState("networkidle").catch(() => {});
    // Poll rather than a fixed wait: onError handlers fire after hydration, which is slower on a
    // cold serve — a genuinely broken image stays broken past the window; a slow handler clears.
    const probe = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("img")].filter((img) => {
          const remote = /^https?:\/\//.test(img.currentSrc || img.src) && !(img.currentSrc || img.src).includes("localhost");
          if (!remote) return false;
          const failed = img.complete && img.naturalWidth === 0;
          const r = img.getBoundingClientRect();
          const visible = r.width > 1 && r.height > 1 && getComputedStyle(img).visibility !== "hidden" && getComputedStyle(img).display !== "none";
          return failed && visible;
        }).map((img) => `${img.src.slice(0, 90)} · class=${img.className || "—"} · alt=${img.alt || "—"}`),
      );
    await expect
      .poll(probe, { timeout: 10_000, message: "a failed remote image must be replaced by its fallback, never left as a broken icon" })
      .toEqual([]);
    // The page's content survives: at least one heading still renders.
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });
}
