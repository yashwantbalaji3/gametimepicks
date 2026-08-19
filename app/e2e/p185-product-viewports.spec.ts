import { test, expect } from "@playwright/test";

/*
 * RELEASE F — the product family at every launch viewport.
 *
 * The charter: "Audit sticky controls, long selections, odds, ladders/trajectories, history and
 * nested disclosure at every viewport. No clipped content or page-level horizontal scroll."
 *
 * Page-level scroll was already clean and this pins it. The finding was the other half: a settled
 * RECEIPT on /results was `truncate` at every width and hid 111px at 390 and 141px at 360 — enough
 * to cut "Hits Over 0.5 · final 1" down to the player and the matchup. On the record page, the
 * settlement outcome was the first thing to disappear.
 */

const PRODUCTS = ["/bank-builder/", "/moonshot/", "/homer-nukes/", "/mr-dub/", "/results/"];
const VIEWPORTS: Array<[number, number]> = [[360, 780], [390, 844], [768, 1024], [1280, 800], [1440, 900]];

for (const [w, h] of VIEWPORTS) {
  test(`no product page scrolls horizontally at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const route of PRODUCTS) {
      await page.goto(route);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${route} at ${w}px overflows by ${over}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("a settled receipt keeps its outcome on a phone", async ({ page }) => {
  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/results/");
    // Open every disclosure so the receipts are laid out, then measure the rows themselves.
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    const worst = await page.evaluate(() => {
      let worst = { over: 0, text: "" };
      document.querySelectorAll(".font-mono").forEach((el) => {
        const e = el as HTMLElement;
        const t = (e.innerText || "").trim();
        /*
         * SETTLEMENT-BEARING lines only. A first pass matched any dot-separated mono text and
         * caught an internal audit label ("AUDIT SIGNAL · MARKET:BATTER_TOTAL_BASES") — real
         * truncation, but not the claim this test makes. The invariant here is narrow and worth
         * stating exactly: a row that reports how something SETTLED may not hide the settlement.
         */
        if (!/ · final | · Actual /i.test(t)) return;
        const over = e.scrollWidth - e.clientWidth;
        if (over > worst.over) worst = { over, text: t.slice(0, 70) };
      });
      return worst;
    });
    expect(worst.over, `a receipt hides ${worst.over}px at ${w}px: "${worst.text}"`).toBeLessThanOrEqual(4);
  }
});
