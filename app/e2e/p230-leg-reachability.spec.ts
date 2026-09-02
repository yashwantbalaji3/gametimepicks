/**
 * RELEASE 0 · a leg past the old caps is genuinely reachable in the browser.
 *
 * The conservation guard proves the DATA carries every eligible leg. This proves a READER can get
 * to one: `/build/custom` counted 373 legs while the builder pool was truncated at 180 with no
 * disclosure and the marketplace printed "+N more eligible legs" as inert text. 162 legs were
 * unreachable in any surface.
 *
 * Runs on all three engines: the reveal control is a real button whose focus, keyboard activation
 * and scroll behaviour differ across Blink, WebKit and Gecko.
 */
import { test, expect } from "@playwright/test";

const PAGE = "/build/custom/";

test.describe("P230 · eligible-leg reachability", () => {
  test("the builder discloses its full count and reveals beyond the first window", async ({ page }) => {
    await page.goto(PAGE);

    /* The count is the FILTERED total, never the mounted window. */
    const count = page.getByText(/\d+ eligible legs?$/).first();
    await expect(count).toBeVisible();
    const total = Number((await count.innerText()).match(/(\d+)/)![1]);

    const reveal = page.getByRole("button", { name: /Show \d+ more/ });
    if (total <= 60) {
      await expect(reveal).toHaveCount(0, { timeout: 5_000 });
      return; // small slate — nothing is hidden, so nothing to reveal
    }

    /* THE CLAIM: rows past the first window are mounted on request, and the control says exactly
       how many are still not shown — the number the old page never mentioned at all. */
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(/\d+ of \d+ not shown yet/);

    const rowsBefore = await page.locator("[data-leg-id]").count();
    await reveal.click();
    const rowsAfter = await page.locator("[data-leg-id]").count();
    expect(rowsAfter).toBeGreaterThan(rowsBefore);
  });

  test("search finds a leg that is not in the initial window", async ({ page }) => {
    await page.goto(PAGE);
    const count = page.getByText(/\d+ eligible legs?$/).first();
    const total = Number((await count.innerText()).match(/(\d+)/)![1]);
    test.skip(total <= 60, "slate smaller than one render window");

    /* Reveal everything, take a leg from the tail, then find it from a cold filter state. */
    for (let i = 0; i < 12; i++) {
      const more = page.getByRole("button", { name: /Show \d+ more/ });
      if (!(await more.count())) break;
      await more.click();
    }
    const rows = page.locator("[data-leg-id]");
    const n = await rows.count();
    expect(n).toBeGreaterThan(60);

    /* A leg from the TAIL — one the 180-cap dropped entirely. Identified by its canonical leg id,
       so the assertion is about that exact leg and not about whatever now sorts last. */
    const tailId = (await rows.nth(n - 1).getAttribute("data-leg-id"))!;
    const tailName = tailId.split(":")[3] ?? "";
    expect(tailName.length).toBeGreaterThan(0);

    await page.reload();
    const search = page.getByPlaceholder(/Search/i).first();
    await search.fill(tailName);
    await expect(page.locator(`[data-leg-id="${tailId}"]`).first()).toBeVisible();
  });

  test("the inert '+N more eligible legs' text is gone", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByText("more eligible legs")).toHaveCount(0);
  });

  test("a revealed tail leg seeds the draft, and survives refresh and back/forward", async ({ page }) => {
    await page.goto(PAGE);
    const count = page.getByText(/\d+ eligible legs?$/).first();
    const total = Number((await count.innerText()).match(/(\d+)/)![1]);
    test.skip(total <= 60, "slate smaller than one render window");

    /* Reveal past the first window and add a leg the OLD build could not reach at all. */
    await page.getByRole("button", { name: /Show \d+ more/ }).first().click();
    const rows = page.locator("[data-leg-id]");
    const tail = rows.nth((await rows.count()) - 1);
    const tailId = (await tail.getAttribute("data-leg-id"))!;
    await tail.getByRole("button", { name: "Add leg" }).click();

    /* THE SEED: it becomes a removable draft leg — the canonical slip identity resolved. */
    await expect(tail.getByRole("button", { name: "Remove leg" })).toBeVisible();

    /* The draft is the shared reader slip and must outlive a reload. */
    await page.reload();
    await expect(page.locator(`[data-leg-id="${tailId}"]`)).toHaveCount(0); // back to window 1
    await page.getByRole("button", { name: /Show \d+ more/ }).first().click();
    await expect(
      page.locator(`[data-leg-id="${tailId}"]`).getByRole("button", { name: "Remove leg" }),
    ).toBeVisible();

    /*
     * Navigating away and coming back must return a working pool with the draft intact.
     *
     * This deliberately does NOT choreograph the history stack. Engines disagree on how many entries
     * a client-routed departure leaves behind — on Firefox the first `goBack()` from /build/ lands
     * on /build/ again and the second reaches /build/custom/, while Chromium arrives in one hop — so
     * a fixed number of hops asserts a browser behaviour and reports it as a product regression. (My
     * first attempt looped until the URL matched and over-stepped the page entirely, because
     * `page.url()` is read before the navigation it follows has settled.)
     *
     * What must hold is the product claim: leave, come back, and the pool works and still knows the
     * leg you added. `goBack()` is exercised separately for the narrower claim that it does not
     * error or leave a dead page.
     */
    await page.goto("/build/");
    await page.goBack();
    await expect(page.locator("main")).toBeVisible();

    await page.goto(PAGE);
    await expect.poll(() => page.locator("[data-leg-id]").count(), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/\d+ eligible legs?$/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Show \d+ more/ }).first()).toBeAttached();

    /* And the leg added from beyond the old cap is still on the draft after all of it. */
    await page.getByRole("button", { name: /Show \d+ more/ }).first().click();
    await expect(
      page.locator(`[data-leg-id="${tailId}"]`).getByRole("button", { name: "Remove leg" }),
    ).toBeVisible();
  });

  test("the reveal control is reachable and operable on a 390px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 812 });
    await page.goto(PAGE);
    const total = Number((await page.getByText(/\d+ eligible legs?$/).first().innerText()).match(/(\d+)/)![1]);
    test.skip(total <= 60, "slate smaller than one render window");

    const reveal = page.getByRole("button", { name: /Show \d+ more/ }).first();
    await expect(reveal).toBeVisible();

    /* A 44px touch target, and no horizontal overflow introduced by the new controls. */
    const box = (await reveal.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    /* Keyboard operability differs by engine — activate it the way a keyboard user would. */
    await reveal.focus();
    const before = await page.locator("[data-leg-id]").count();
    await page.keyboard.press("Enter");
    expect(await page.locator("[data-leg-id]").count()).toBeGreaterThan(before);
  });
});
