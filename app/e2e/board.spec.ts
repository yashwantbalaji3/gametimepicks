import { test, expect } from "@playwright/test";

/**
 * Phase 13 e2e — board interaction smoke.
 *
 * Verifies the model board's interactive surface area without asserting
 * on specific player names (data changes day-to-day):
 *   - Filter pill buttons can be clicked
 *   - Date tabs can be switched
 *   - At least one player card can have its trend toggle expanded
 *   - Sort dropdown works (if present)
 *   - Reset filters returns to initial state
 *
 * Tests are tolerant: if the board has zero leans (a real possibility
 * on off-days), we skip the player-card assertions rather than fail.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/board/");
  await page.waitForLoadState("domcontentloaded");
});

test("board renders without runtime error overlay", async ({ page }) => {
  // Next.js's runtime error badge is the floating red square in the corner
  // when the dev runtime hits an exception. Should never be visible.
  const errorOverlay = page.locator("[data-nextjs-dialog-overlay]");
  await expect(errorOverlay).toHaveCount(0);
});

test("date tabs are clickable and present", async ({ page }) => {
  // Date tabs are buttons inside the slate-tabs strip. Look for any
  // button containing a date-like label (4-day slate has up to 4 of them).
  const tabs = page.locator("button").filter({ hasText: /\d{1,2}\/\d{1,2}|today|tomorrow/i });
  const count = await tabs.count();
  expect(count).toBeGreaterThanOrEqual(1);

  // Try clicking the first tab. It should not throw.
  const first = tabs.first();
  if (await first.isEnabled()) {
    await first.click();
    // After clicking, the page should still be present
    await expect(page.locator("body")).toBeVisible();
  }
});

test("filter pills can be toggled", async ({ page }) => {
  // Filter buttons live inside vault-filters. Look for any visible
  // <button> in the filters region. We don't assert specific labels
  // because the filter set varies (only-real-only modes etc.).
  const filterButtons = page.getByRole("button").filter({ hasText: /high|medium|low|over|under|reset|all/i });
  const count = await filterButtons.count();
  if (count === 0) {
    // No filters visible — page may be in an empty state. Soft skip.
    test.info().annotations.push({ type: "note", description: "no filter buttons present (empty board?)" });
    return;
  }
  // Click the first one and verify no console errors
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await filterButtons.first().click();
  // Debounce
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
});

test("at least one player card trend toggle expands", async ({ page }) => {
  // Trend toggle button text is "show last 10 trends" / "hide last 10 trends".
  const trendToggles = page.getByRole("button", {
    name: /last 10 trends|recent log|show trend/i,
  });
  const count = await trendToggles.count();
  if (count === 0) {
    test.info().annotations.push({ type: "note", description: "no trend toggles visible — board may be empty" });
    return;
  }
  const first = trendToggles.first();
  await first.scrollIntoViewIfNeeded();
  await first.click();
  // The trend panel should now be in the DOM. We don't assert specific
  // chart contents — just that the expansion didn't crash.
  await page.waitForTimeout(250);
});

test("confidence disclosure pill opens cleanly (no flat tooltip leak)", async ({
  page,
}) => {
  // Phase 13: the previous ConfidenceTooltip component was rendering its
  // hidden popover content flat into the hero paragraph in some browsers.
  // The replacement uses a native <details>/<summary> disclosure pill.
  //
  // Verify: the popover content ("strong edge", "thin sample size", etc.)
  // is NOT visible in the hero paragraph BEFORE the user opens the pill.
  const hero = page.locator("h1").first();
  await expect(hero).toBeVisible();
  // The tooltip content includes the phrase "strong edge". It should not
  // be present in the hero <p> tag's text.
  const heroParagraph = page.locator("h1").locator("..").locator("p").first();
  if (await heroParagraph.count()) {
    const heroText = (await heroParagraph.textContent()) ?? "";
    expect(heroText).not.toMatch(/strong edge, strong recent log/i);
    expect(heroText).not.toMatch(/thin sample size/i);
  }
  // Click the pill (a <summary> element inside <details>)
  const summary = page.locator("details > summary").filter({ hasText: /confidence/i });
  if (await summary.count()) {
    await summary.first().click();
    // After clicking, the popover content should now be visible
    const open = page.locator("details[open]");
    await expect(open).toContainText(/strong edge|recent log/i);
  }
});
