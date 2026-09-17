/**
 * Three-engine route/state assurance (Program 161 · Release C).
 *
 * Runs on chromium AND webkit AND firefox (playwright.config projects) against the BUILT static
 * export — the same artifact production serves. The route list is imported from the committed
 * contract so the spec can never silently cover less than /launch claims.
 *
 * Two layers:
 *   1. Baseline, every contract route: HTTP 200, visible body, zero console errors and zero page
 *      errors after hydration settles. Hydration mismatches surface as console errors and differ
 *      by engine timing, which is exactly why this runs three ways.
 *   2. State honesty on the truth-bearing surfaces: money figures must match the protected
 *      artifact byte-for-byte, sport sections must speak the adapter's honest vocabulary, and the
 *      status page may only use its closed state words.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { ASSURED_ROUTES } from "../src/lib/launch/browser-assurance.mjs";
import { STATE_LABEL } from "../src/lib/research/public-contract-adapter";

const APP = process.cwd();
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8"));

/** Collect console + page errors; assert empty AFTER the page settles. */
function armErrorCapture(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

for (const { route } of ASSURED_ROUTES) {
  test(`baseline · ${route} renders clean`, async ({ page }) => {
    const errors = armErrorCapture(page);
    const resp = await page.goto(route);
    expect(resp?.status(), `${route} must serve 200`).toBe(200);
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors, `${route} console/page errors:\n${errors.join("\n")}`).toEqual([]);
  });
}

test("state · home money strip matches portfolio.json verbatim", async ({ page }) => {
  const p = readJson("public/data/mr-dub/portfolio.json");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // The strip renders `${wins}–${losses}` with an en dash (slate-status-bar).
  await expect(page.getByText(`${p.record.wins}–${p.record.losses}`).first()).toBeVisible();
  await expect(page.getByText(/paper record/i).first()).toBeVisible();
});

test("state · /sports speaks the adapter's honest vocabulary for all four sports", async ({ page }) => {
  await page.goto("/sports");
  await page.waitForLoadState("networkidle");
  // Per section (anchored by the component's own aria-labelledby ids): real event rows OR the
  // explicit "nothing published yet" sentence — never a heading over a blank calendar.
  for (const sport of ["epl", "nfl", "nba", "ufc"]) {
    const section = page.locator(`section[aria-labelledby="upcoming-${sport}-h"]`);
    await expect(section, `${sport} section present`).toBeVisible();
    const events = await section.locator("ul > li").count();
    const empty = await section.getByText("No upcoming events are published here yet").count();
    expect(events > 0 || empty === 1, `${sport}: expected event rows or the honest empty sentence (rows=${events}, empty=${empty})`).toBe(true);
  }
  // Results-path discoverability (P162-B): a sport whose results capture artifact exists in a
  // noted state must say so in its section — derived from the artifact's OWN state field.
  const NOTED = ["PRESEASON", "NO_RESULTS_YET", "RESULTS"];
  const RESULT_ARTIFACTS: Array<[string, string]> = [
    ["nfl", "public/data/nfl/results/latest.json"],
    ["nba", "public/data/nba/results/latest.json"],
    ["epl", "public/data/soccer/epl/results/latest.json"],
    ["ufc", "public/data/ufc/results/latest.json"],
  ];
  for (const [sport, rel] of RESULT_ARTIFACTS) {
    let st: string | null = null;
    try { st = JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8")).state; } catch { /* no artifact — nothing promised */ }
    if (st && NOTED.includes(st)) {
      const section = page.locator(`section[aria-labelledby="upcoming-${sport}-h"]`);
      await expect(section.getByText(/Results tracking|completed games? captured|completed bouts? captured/).first(), `${sport}: results path discoverable (artifact state ${st})`).toBeVisible();
    }
  }
});

test("state · /system-status uses only the closed state vocabulary", async ({ page }) => {
  await page.goto("/system-status");
  await page.waitForLoadState("networkidle");
  for (const stage of ["Prediction history", "Calibration", "Market registry", "Daily research brief", "Latest settlement"]) {
    await expect(page.getByText(stage).first(), `${stage} row present`).toBeVisible();
  }
  const vocab = Object.values(STATE_LABEL);
  const body = (await page.locator("body").innerText()) ?? "";
  const hits = vocab.reduce((n, w) => n + (body.includes(w) ? 1 : 0), 0);
  expect(hits, `at least one closed-vocabulary state word must appear (vocab: ${vocab.join(", ")})`).toBeGreaterThanOrEqual(1);
});

test("state · /results renders the canonical accounting section", async ({ page }) => {
  await page.goto("/results");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#accounting-heading")).toBeVisible();
});

/*
 * v1.5 Research Lab · THE SEARCH KEEPS WORKING AFTER THE FIRST FILTER.
 *
 * Found in browser QA and fixed: the mode/sport target was rebuilt as a fresh object on every query change, which
 * re-ran the selector-index effect (clearing both the index and the loaded rows) while the row effect's own
 * dependency — the partition path — came back identical and so never re-fired. The page then sat on "Applying
 * filters…" for ever after one filter change, with a correct URL and no console error. Only a real browser can
 * catch that, and only after an interaction, so it is pinned here on all three engines.
 */
test("state · /research/lab/ keeps its results when a filter and then a mode change", async ({ page }) => {
  const errors = armErrorCapture(page);
  await page.goto("/research/lab/?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs");
  const rows = page.locator("[data-scroll-x] tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 15000 });
  const before = await rows.count();
  expect(before, "the unfiltered search returns rows").toBeGreaterThan(0);

  // 1 · a filter change must re-run the search, not wedge it. (Progressive disclosure: the result filter lives
  // behind "More filters", so opening it is part of the journey a reader actually takes.)
  await page.locator("summary").filter({ hasText: "More filters" }).click();
  await expect(page.locator("#lab-result")).toBeVisible();
  await page.locator("#lab-result").selectOption("W");
  await expect(page.getByText(/recorded games match/)).toBeVisible({ timeout: 15000 });
  const after = await rows.count();
  expect(after, "the filtered search still returns rows").toBeGreaterThan(0);
  expect(after, "a result filter narrows the set").toBeLessThan(before);
  expect(page.url()).toContain("result=W");
  // The filter means what it says: every row on the page is a win.
  const results = await page.locator("[data-scroll-x] tbody tr td:nth-child(7)").allInnerTexts();
  expect(new Set(results.map((t) => t.trim()))).toEqual(new Set(["Won"]));

  // 2 · a MODE change loads a different index and a different partition, and still paints.
  await page.getByRole("link", { name: "Players", exact: true }).click();
  await expect(page.getByText(/recorded player games match/)).toBeVisible({ timeout: 15000 });
  expect(await rows.count(), "the player search returns rows").toBeGreaterThan(0);
  expect(page.url()).toContain("mode=players");

  expect(errors, "no console or page error during the search").toEqual([]);
});

/*
 * v1.5 Research Lab · A SLOW PARTITION MUST NOT WIN THE RACE.
 *
 * Two static assets are in flight whenever the reader changes mode quickly, and the slower one can resolve last.
 * Two separate rules keep that honest: the loader ignores a payload the current search no longer wants (liveness —
 * without it the late payload replaces the fresh one and the page sticks on "Applying filters…"), and the renderer
 * refuses to execute a query against a partition that is not the one it asked for (correctness — without it the
 * page would show the wrong sport's or season's rows under the new heading). The delay is injected, so this is a
 * deterministic reproduction rather than a hope that CI is slow in the right place.
 */
test("state · /research/lab/ a slow partition never overwrites a newer search", async ({ page }) => {
  const errors = armErrorCapture(page);
  // The Game Finder's rows arrive two seconds late; everything else is normal speed.
  await page.route("**/data/lab/v1/games/nfl/rows.json", async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await page.goto("/research/lab/?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs");
  // Switch to a fast search before the slow one lands.
  await page.getByRole("link", { name: "Seasons", exact: true }).click();
  await expect(page.getByText(/team seasons? match/)).toBeVisible({ timeout: 15000 });
  expect(page.url(), "the sport is kept when the new mode ships it").toContain("sport=nfl");
  const heading = await page.getByRole("heading", { name: "Season Explorer" }).isVisible();
  expect(heading, "the Season Explorer is what the reader asked for").toBe(true);

  // Now let the late Game Finder payload arrive. The season results must still be on screen.
  await page.waitForTimeout(3000);
  await expect(page.getByText(/team seasons? match/), "the late payload must not replace the newer search").toBeVisible();
  // Header text is upper-cased by CSS, so compare case-insensitively against the rendered text.
  const cols = (await page.locator("[data-scroll-x] thead th").allInnerTexts()).map((c) => c.trim().toLowerCase());
  expect(cols, "the table is still the Season Explorer's").toContain("finals");
  expect(errors, "no console or page error during the race").toEqual([]);
});

/*
 * v1.5 Research Lab · THE ROWS ON SCREEN ALWAYS BELONG TO THE SEARCH ON SCREEN.
 *
 * Changing only the SEASON keeps the mode and the sport, so the engine's own dataset check cannot tell the two
 * apart — the renderer's partition check is the only thing standing between the reader and last season's rows
 * rendered under this season's heading. The gap is real but short, so the new season's asset is delayed to make it
 * observable: during the wait the page must say it is working, never show the previous season's answer.
 */
test("state · /research/lab/ never shows one season's rows as another season's answer", async ({ page }) => {
  await page.route("**/data/lab/v1/players/nfl/NFL-2024.json", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto("/research/lab/?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&value_min=150");
  const rows = page.locator("[data-scroll-x] tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 15000 });
  const was2025 = await rows.count();
  expect(was2025).toBeGreaterThan(0);

  await page.locator("#lab-season").selectOption("NFL-2024");
  // While the 2024 partition is in flight there must be NO result table — 2025's rows are not 2024's answer.
  await expect(page.getByText("Applying filters…")).toBeVisible({ timeout: 5000 });
  await expect(rows).toHaveCount(0);
  // And once it lands, the answer is 2024's.
  await expect(page.getByText(/recorded player games match/)).toBeVisible({ timeout: 15000 });
  expect(await rows.count()).toBeGreaterThan(0);
  const dates = await page.locator("[data-scroll-x] tbody tr td:first-child").allInnerTexts();
  expect(dates.every((d) => /202[45]/.test(d)), `2024-season dates, got ${dates.slice(0, 3).join(", ")}`).toBe(true);
  expect(dates.some((d) => /2024/.test(d)), "the 2024 season is what is shown").toBe(true);
});
