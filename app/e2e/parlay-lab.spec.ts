import { test, expect } from "@playwright/test";

/**
 * Phase 13 e2e — Parlay Lab smoke.
 *
 * Verifies the paste-and-analyze flow:
 *   - Page loads with the educational disclaimer visible
 *   - Risk profile buttons are clickable (3 of them)
 *   - Pasting a malformed line shows "0 legs parsed" with a "check format" hint
 *   - Pasting an unknown player shows "player not on slate" verdict
 *   - Multiple pasted lines produce multiple parsed legs
 *   - Educational/not-betting-advice disclaimer is present
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/parlay-lab/");
  await page.waitForLoadState("domcontentloaded");
});

test("page loads and shows educational disclaimer", async ({ page }) => {
  await expect(page.locator("body")).toContainText(/educational/i);
  await expect(page.locator("body")).toContainText(/not betting advice/i);
});

test("risk profile buttons are present and clickable", async ({ page }) => {
  for (const profile of ["conservative", "balanced", "aggressive"]) {
    const btn = page.getByRole("button", { name: new RegExp(`^${profile}$`, "i") });
    await expect(btn.first()).toBeVisible();
    // The buttons toggle visual state but the page shouldn't crash on click
    await btn.first().click();
  }
});

test("paste textarea accepts input and shows parsed leg count", async ({
  page,
}) => {
  // Find the textarea by its placeholder text ("LeBron James Over 25.5 PTS -110")
  const textarea = page.locator("textarea").first();
  await expect(textarea).toBeVisible();

  // Type a single valid leg
  await textarea.fill("LeBron James Over 25.5 PTS -110");
  // Wait for the parser to update the count (it's reactive via useMemo)
  await page.waitForTimeout(150);
  await expect(page.locator("body")).toContainText(/1 leg parsed/i);
});

test("malformed paste shows 'check format' hint", async ({ page }) => {
  const textarea = page.locator("textarea").first();
  await textarea.fill("just some random text with no leg structure");
  await page.waitForTimeout(150);
  // 0 legs parsed + "check format" hint
  await expect(page.locator("body")).toContainText(/0 legs parsed/i);
  await expect(page.locator("body")).toContainText(/check format/i);
});

test("unknown player shows 'player not on slate' verdict", async ({ page }) => {
  const textarea = page.locator("textarea").first();
  // Use a name guaranteed not to be on any real NBA slate
  await textarea.fill("Definitely Not Real Player Over 99.5 PTS");
  await page.waitForTimeout(250);
  // We expect either "player not on slate" OR "no matching player".
  // The UI label is "player not on slate".
  await expect(page.locator("body")).toContainText(/player not on slate|no matching player/i);
});

test("multiple legs parse independently", async ({ page }) => {
  const textarea = page.locator("textarea").first();
  await textarea.fill(
    [
      "LeBron James Over 25.5 PTS -110",
      "Donovan Mitchell Under 5.5 AST -115",
      "Anthony Davis Over 9.5 REB +120",
    ].join("\n"),
  );
  await page.waitForTimeout(250);
  await expect(page.locator("body")).toContainText(/3 legs parsed/i);
});

test("educational footer with helpline link is visible", async ({ page }) => {
  // The Parlay Lab page has a footer reminder pointing to the National
  // Council on Problem Gambling helpline.
  await expect(page.locator("body")).toContainText(/national council on problem gambling/i);
  const helplineLink = page.locator("a[href*='ncpgambling.org']");
  await expect(helplineLink.first()).toBeVisible();
});
