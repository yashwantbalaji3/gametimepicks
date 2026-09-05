/**
 * THE PLAYER AT EVERY WIDTH, ON EVERY ENGINE — Program 234 · Release J.
 *
 * The frame is fixed by design, which makes it exactly the thing that breaks when the viewport is
 * not the one it was built at. These run the same journey at the charter's widths and — for the
 * assertions that are genuinely engine-sensitive — on WebKit and Firefox too, where a stacking
 * context, a `color-mix` fallback or a flex rounding difference will show up and Chromium will not.
 */
import { test, expect, type Page } from "@playwright/test";

const WIDTHS = [360, 390, 768, 1024, 1440, 1920] as const;

async function openPlayer(page: Page): Promise<boolean> {
  await page.goto("/simulate/");
  const link = page.locator('a[href^="/games/mlb/"]').first();
  if (!(await link.count())) return false;
  await page.goto((await link.getAttribute("href"))!.split("?")[0]);
  const cta = page.getByRole("button", { name: /Generate Simulation/i });
  if (!(await cta.count())) return false;
  await cta.click();
  await page.getByRole("dialog").waitFor();
  return true;
}

test.describe("P234 · the player across widths", () => {
  for (const width of WIDTHS) {
    test(`fits and stays operable at ${width}px`, async ({ page }) => {
      /* Heights matter as much as widths — a short laptop is where a fixed frame overflows. */
      await page.setViewportSize({ width, height: width < 768 ? 780 : 820 });
      test.skip(!(await openPlayer(page)), "no MLB game on the built board");

      const d = page.getByRole("dialog");
      const box = (await d.boundingBox())!;
      expect(box.width, `the frame is wider than ${width}px`).toBeLessThanOrEqual(width + 1);
      expect(box.height).toBeLessThanOrEqual(820 + 1);

      /* THE PAGE ITSELF must not scroll sideways while the dialog is open. */
      const overflowsX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflowsX, "the page scrolls horizontally").toBe(false);

      /* Every control is reachable and hit-testable at this width. */
      for (const name of [/^(Play|Pause|Resume)$/, /Next chapter/, /Full report/]) {
        const control = d.getByRole("button", { name }).or(d.getByRole("link", { name }));
        if (!(await control.count())) continue;
        await expect(control.first()).toBeVisible();
      }

      /* And a chapter still fits without an internal scrollbar at this size. */
      await d.getByRole("button", { name: "Next chapter" }).click();
      const clipped = await d.evaluate((el) => {
        const bad = [...el.querySelectorAll("*")].find(
          (n) => n.scrollHeight > n.clientHeight + 2 && getComputedStyle(n).overflowY !== "visible",
        );
        return bad ? (bad as HTMLElement).className : null;
      });
      expect(clipped, `content clipped at ${width}px (${clipped})`).toBeNull();
    });
  }

  test("the frame paints over the page rather than under it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    test.skip(!(await openPlayer(page)), "no MLB game on the built board");
    /* The defect this pins: the frame sat inside the report's stacking context and the site footer
       painted over its controls. Engine-sensitive, and invisible to any assertion about the DOM. */
    const box = (await page.getByRole("dialog").boundingBox())!;
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('[role="dialog"]') !== null || el.closest("[data-capture-frame]") !== null : false;
    }, { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height - 12) });
    expect(hit, "something else is painted over the bottom of the frame").toBe(true);
  });

  test("Escape restores the page's scroll on every engine", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    test.skip(!(await openPlayer(page)), "no MLB game on the built board");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflow, "background scroll was left locked after close").not.toBe("hidden");
  });
});
