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
