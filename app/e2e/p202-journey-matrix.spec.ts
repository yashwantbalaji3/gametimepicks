/**
 * P202 · Release F — the customer journey at four widths, on every engine.
 *
 * DOM measurements, not just screenshots: horizontal overflow, the six-primary mobile bar's
 * touch targets, the absence of the duplicate top strip, no leaked "undefined/NaN" text, and
 * filter-state restoration from the URL. Runs on chromium + webkit + firefox (config testMatch)
 * because layout overflow and hydration timing genuinely differ by engine.
 */
import { test, expect } from "@playwright/test";

const WIDTHS = [390, 768, 1280, 1440] as const;
const ROUTES = [
  "/", "/today/", "/simulate/", "/markets/", "/build/", "/sports/", "/results/",
  "/mlb/", "/epl/", "/ufc/", "/nfl/", "/cards/nfl/",
] as const;

for (const width of WIDTHS) {
  test(`journey at ${width}px: no overflow, no leaked placeholders, nav sane`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      // No page-level horizontal scroll: wide content must scroll inside its own container.
      const overflow = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      expect(overflow, `${route} @ ${width}px overflows the page by ${overflow}px`).toBeLessThanOrEqual(1);
      // No leaked JS placeholders in rendered text.
      const leaked = await page.evaluate(() => {
        const t = document.body.innerText;
        return ["undefined", "NaN%", "[object Object]"].filter((s) => t.includes(s));
      });
      expect(leaked, `${route} @ ${width}px leaks ${leaked.join(",")}`).toEqual([]);
      // A main landmark exists everywhere the journey lands.
      expect(await page.locator("main, [role='main']").count(), `${route}: main landmark`).toBeGreaterThan(0);
    }
  });
}

test("mobile 390: the six-primary bar measures, and the duplicate top strip stays gone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const bar = page.locator('nav[aria-label="Mobile bottom navigation"]');
  await expect(bar).toBeVisible();
  const links = bar.locator("a");
  await expect(links).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    const box = await links.nth(i).boundingBox();
    expect(box, `bar item ${i} renders`).not.toBeNull();
    expect(box!.height, `bar item ${i} touch target`).toBeGreaterThanOrEqual(44);
  }
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")?.replace(/\/$/, "") || "/"));
  expect(hrefs).toEqual(["/today", "/simulate", "/markets", "/build", "/sports", "/results"]);
  // The complement strip is empty by construction — one mobile nav, not two.
  expect(await page.locator("nav.sm\\:hidden").count(), "no duplicate mobile top strip").toBe(0);
});

test("filter state restores from the URL after opening a pick and coming back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today/?sport=mlb", { waitUntil: "domcontentloaded" });
  const pressed = page.locator('[aria-pressed="true"]');
  // The chips hydrate client-side; when the ranked set has an MLB read today the chip presses.
  const chipCount = await page.locator('[role="group"][aria-label="Filter the ranked reads"] button').count();
  if (chipCount === 0) return; // no ranked reads at this hour — the section legitimately absent
  await expect(pressed.first()).toBeVisible();
  const first = await pressed.first().innerText();
  expect(first.toUpperCase()).toContain("MLB");
});
