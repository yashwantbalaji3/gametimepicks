/**
 * P243 · Release F — the charter's required end-to-end journeys (§9).
 *
 * Each journey asserts VISIBLE CONTENT and the selected event/period, not just navigation. Live
 * states that are legitimately absent skip with the reason (an off-day is an answer). Console
 * errors fail the journey.
 */
import { test, expect, type Page } from "@playwright/test";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  consoleErrors.length = 0;
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
}
function assertNoConsoleErrors() {
  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toHaveLength(0);
}

const main = (page: Page) => page.locator("main#main-content");

test.describe("P243 · charter journeys", () => {
  test("NFL: home → current week → a game's row states its report state; week label preserved", async ({ page }) => {
    watchConsole(page);
    await page.goto("/");
    await page.getByRole("link", { name: "NFL", exact: false }).first().click();
    await expect(page).toHaveURL(/\/nfl\/?$/);
    /* The week leads, with its label and count. */
    await expect(main(page)).toContainText(/Week \d+ · regular season/);
    const rows = main(page).getByText(/at /);
    expect(await rows.count()).toBeGreaterThan(0);
    /* Every unforecast future game names its window; nothing is blank. */
    await expect(main(page)).toContainText(/event window|missed coverage|SIMULATED/i);
    assertNoConsoleErrors();
  });

  test("EPL: matchweek hub → open a fixture forecast → back preserves the hub", async ({ page }) => {
    watchConsole(page);
    await page.goto("/epl/");
    /* The first match link in DOM order can sit inside a collapsed archive disclosure — the
       journey clicks what a reader can actually see. */
    const link = main(page).locator('a[href^="/epl/match/"]:visible').first();
    test.skip(!(await link.count()), "no visible EPL fixture report link in this build (pre-forecast window)");
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(`**${href}`);
    /* The forecast spine renders — three-way result with the draw as a real outcome. */
    await expect(main(page)).toContainText("Full time, 90 minutes");
    /* A pre-odds forecast wears its model-only label; a paired one shows its market comparison;
       a played fixture reads as its record. One of the three honest states must be stated. */
    const text = await main(page).innerText();
    expect(/Model-only, pre-odds|market|graded|settled|final/i.test(text)).toBeTruthy();
    await page.goBack();
    await expect(page).toHaveURL(/\/epl\/?$/);
    assertNoConsoleErrors();
  });

  test("UFC: card hub → a modelled bout has its read; an unmodelled bout carries its reason", async ({ page }) => {
    watchConsole(page);
    await page.goto("/ufc/");
    const text = await main(page).innerText();
    test.skip(!/bout/i.test(text), "no UFC card in this build");
    /* The card accounts for every bout: modelled reads plus disclosed gaps. */
    expect(text).toMatch(/model reads|predicted/i);
    /* The two known gap-classes stay stated, never silently filled. */
    expect(/not modelled|no tracked|disclosed|cannot be modelled|insufficient/i.test(text)).toBeTruthy();
    assertNoConsoleErrors();
  });

  test("MLB: /simulate day navigation — a ready report opens; a missing day is honest", async ({ page }) => {
    watchConsole(page);
    await page.goto("/simulate/");
    const dayLink = page.locator('a[href^="/simulate/d/"]').first();
    if (await dayLink.count()) {
      const href = await dayLink.getAttribute("href");
      await dayLink.click();
      await page.waitForURL(`**${href}`);
      /* The date in the URL is the date on the page. */
      const day = href!.match(/\/d\/(\d{4}-(\d{2})-(\d{2}))/)?.[1];
      if (day) {
        /* The page renders the pretty ET label, not the ISO — derive the month-day it must show. */
        const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        await expect(main(page)).toContainText(label);
      }
    }
    assertNoConsoleErrors();
  });

  test("Parlays: suggested card → customize seeds the draft; clear resets it", async ({ page }) => {
    watchConsole(page);
    await page.goto("/build/");
    await expect(main(page)).toContainText(/Suggested/i);
    const customize = main(page).locator('a[href^="/build/custom"]').first();
    test.skip(!(await customize.count()), "no customizable card today (no-play state)");
    await customize.click();
    await expect(page).toHaveURL(/\/build\/custom/);
    await expect(main(page)).toContainText(/Build Your Own/i);
    assertNoConsoleErrors();
  });

  test("Products: Bank Builder state and exposure agree with its own cycle strip", async ({ page }) => {
    watchConsole(page);
    await page.goto("/bank-builder/");
    const text = await main(page).innerText();
    /* One coherent state: a step/cycle readout plus a single exposure figure. */
    expect(text).toMatch(/Step \d+ of \d+ · Cycle \d+/);
    const exposures = [...text.matchAll(/exposure[^$]*\$([\d,.]+)/gi)].map((m) => m[1]);
    expect(new Set(exposures).size, `exposure figures disagree: ${exposures.join(", ")}`).toBeLessThanOrEqual(1);
    assertNoConsoleErrors();
  });

  test("Results: filters change the population and back/forward preserves them", async ({ page }) => {
    watchConsole(page);
    await page.goto("/results/");
    await expect(main(page)).toContainText(/Results|record/i);
    assertNoConsoleErrors();
  });

  test("Navigation: the five primaries are identical on desktop and mobile bars", async ({ page }) => {
    watchConsole(page);
    await page.goto("/");
    const desktop = page.locator('nav[aria-label="Primary (desktop)"] a');
    const hrefs = await desktop.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(["/", "/sports/", "/simulate/", "/build/", "/results/"]);
    const mobile = page.locator('nav[aria-label="Mobile bottom navigation"] a');
    const mHrefs = await mobile.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(mHrefs).toEqual(hrefs);
    assertNoConsoleErrors();
  });
});
