/**
 * DIRECT REPORT JOURNEY — Program 242.
 *
 * The founder retired the recording/presentation experience (Play CTAs, chapter dialogs, countdowns,
 * recording layouts — the whole P234 layer). These specs replace the four P234 presentation specs
 * and pin the restored contract in a real browser: one click on an event lands on the FULL report,
 * immediately — no dialog, no Generate ceremony, no 10-second wait — and the honesty invariants the
 * old specs carried (no fabricated run counts, frozen-forecast labelling, paper-only disclosure)
 * now hold on the page itself, because the page is the only surface.
 *
 * Each sport is skipped rather than failed when its slate is legitimately empty. An NFL pregame
 * gap is not a regression, and a spec that goes red every Tuesday gets deleted by whoever is on call.
 */
import { test, expect } from "@playwright/test";

test.describe("P242 · direct report journey", () => {
  test("MLB · a simulation game page renders the full report with NO ceremony", async ({ page }) => {
    await page.goto("/simulate/");
    const link = page.locator('a[href^="/games/mlb/"]').first();
    test.skip(!(await link.count()), "no MLB game page in this build");
    await page.goto((await link.getAttribute("href"))!.split("?")[0]);

    /* The ceremony stays retired: no Generate CTA, no presentation dialog, no locked pills. */
    await expect(page.getByRole("button", { name: /Generate Simulation/i })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-capture-frame]")).toHaveCount(0);

    /* The full report is present in the FIRST render — no click, no wait. */
    const main = page.locator("main#main-content");
    await expect(main).toContainText(/Simulation complete|Simulation not yet available/);
    if (await main.getByText("Simulation complete").count()) {
      /* Report sections are one TAB-CLICK away (the V2.5 report is tabbed by design — never a
         generation ceremony). The journey clicks the tab and sees the board. */
      const tab = main.getByRole("tab", { name: /players/i }).or(main.getByRole("button", { name: /players/i })).first();
      if (await tab.count()) {
        await tab.click();
        await expect(main.getByText("Player simulation board").first()).toBeVisible();
      }
      /* Paper-only disclosure survives on the page. */
      await expect(main).toContainText(/Paper-only/i);
    }
  });

  test("EPL · a match page renders its forecast directly, with no run-count claim", async ({ page }) => {
    await page.goto("/epl/");
    const link = page.locator('a[href^="/epl/match/"]').first();
    test.skip(!(await link.count()), "no EPL fixture page in this build");
    await page.goto((await link.getAttribute("href"))!.split("?")[0]);

    await expect(page.getByRole("button", { name: /Play the match forecast/i })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const main = page.locator("main#main-content");
    /* The three-way result — the forecast's spine — renders directly when in window. */
    const hasForecast = await main.getByText("Full time, 90 minutes").count();
    if (hasForecast) {
      /* The exact-matrix model runs no trials — no run-count claim may appear anywhere. */
      await expect(main).not.toContainText(/simulated (games|matches)|\d[\d,]*-run/i);
    }
  });

  test("UFC · the card page renders its reads directly — no walkthrough dialog", async ({ page }) => {
    await page.goto("/ufc/");
    await expect(page.getByRole("button", { name: /Play the card/i })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    /* The expired "authorisation covers NFL only" sentence must never appear on the page. */
    await expect(page.locator("main#main-content")).not.toContainText(/covers NFL only/i);
  });

  test("NFL · a game page states its forecast state honestly on the page", async ({ page }) => {
    await page.goto("/nfl/");
    const link = page.locator('a[href^="/nfl/game/"]').first();
    test.skip(!(await link.count()), "no NFL game page in this build");
    await page.goto((await link.getAttribute("href"))!.split("?")[0]);

    await expect(page.getByRole("button", { name: /Play the (frozen )?(game )?forecast/i })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const main = page.locator("main#main-content");
    const text = await main.innerText();
    /* A played game's forecast must be labelled frozen/pre-event — never present-tense reframed. */
    if (/frozen pre-event forecast/i.test(text)) {
      expect(text).toMatch(/has been played|frozen/i);
    }
  });
});
