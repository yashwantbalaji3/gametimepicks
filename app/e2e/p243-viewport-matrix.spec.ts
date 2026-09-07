/**
 * P243 · Release F — the charter's browser/viewport matrix (§9).
 *
 * Six CSS viewports × the three configured engines (chromium / firefox-a11y / webkit-a11y) = the
 * 18 combinations, over the five primaries + four sport hubs. Per combination: the page paints,
 * the body never scrolls horizontally, the primary nav (or thumb bar) is present and unclipped,
 * and the last bar label is fully inside the viewport.
 */
import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { w: 360, h: 800 }, { w: 390, h: 844 }, { w: 430, h: 932 },
  { w: 768, h: 1024 }, { w: 1366, h: 768 }, { w: 1440, h: 900 },
] as const;

const ROUTES = ["/", "/sports/", "/simulate/", "/build/", "/results/", "/mlb/", "/nfl/", "/epl/", "/ufc/"] as const;

for (const { w, h } of VIEWPORTS) {
  test(`matrix ${w}x${h} · nine routes paint clean with no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const route of ROUTES) {
      await page.goto(route);
      /* No horizontal document overflow — the WCAG 1.4.10 reflow failure class. */
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} @ ${w}px overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
      /* A primary navigation surface is reachable at this width. */
      const mobileBar = page.locator('nav[aria-label="Mobile bottom navigation"]');
      const navSurface = page
        .locator('nav[aria-label="Primary (desktop)"]:visible, nav[aria-label="Primary (rail)"]:visible, nav[aria-label="Mobile bottom navigation"]:visible')
        .first();
      await expect(navSurface, `${route} @ ${w}px renders no primary nav surface`).toBeVisible();
      /* The thumb bar's last item stays inside the viewport when the bar is the surface. */
      if (await mobileBar.isVisible().catch(() => false)) {
        const last = mobileBar.locator("a").last();
        const box = await last.boundingBox();
        expect(box, `${route} @ ${w}px: last bar item unmeasurable`).toBeTruthy();
        expect(box!.x + box!.width, `${route} @ ${w}px: last bar item clipped`).toBeLessThanOrEqual(w + 1);
      }
    }
  });
}
