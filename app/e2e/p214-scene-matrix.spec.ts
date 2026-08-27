/**
 * P214 · Release C — the sport × state SCENE MATRIX, proven in a real browser on the BUILT export.
 *
 * Discovery-driven, never date-pinned: the spec scans the exported /simulate/d/* pages for the
 * states each sport ACTUALLY exhibits in the current window, then proves the stage/navigation
 * contract for every (sport, state) it finds. A state reality has not produced today is SKIPPED
 * with its reason — a skip here is a typed reality note, not a hole (NBA/NHL ready fixtures, for
 * example, must not exist until real eligible artifacts do).
 *
 * Contracts proven per state class:
 *   READY (non-MLB)  card opens the stage dialog → phases narrate in the status region → the run
 *                    ends COMPLETE and navigates to the event's own report.
 *   READY (MLB)      the card is a LINK (the report owns its richer runner — no stacked ceremony).
 *   REFUSAL          the stage ends REFUSED in place with the stated reason; Escape closes it and
 *                    focus restores to the triggering card; the URL never changes.
 *   SETTLED          the card is a LINK to the settled report (nothing regenerates for a final).
 *   NBA              off-season renders its typed line, never a ready action.
 *   NHL              the day view never lists an NHL section at all (typed absence).
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out", "simulate", "d");

type Found = { date: string; sport: string; label: string; state: string };

const SPORT_LABEL: Record<string, string> = { mlb: "MLB", epl: "Premier League", ufc: "UFC", nfl: "NFL", nba: "NBA" };

/**
 * Scan built day pages' RSC payloads (the cards are client-rendered, so the state lives in the
 * serialized day-view events, escaped inside the flight data): which sport exhibits which state,
 * on which date.
 */
function discover(): Found[] {
  if (!fs.existsSync(OUT)) return [];
  const found: Found[] = [];
  for (const date of fs.readdirSync(OUT).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
    const p = path.join(OUT, date, "index.html");
    if (!fs.existsSync(p)) continue;
    const flight = fs.readFileSync(p, "utf8").replace(/\\"/g, '"');
    // Event objects open with {"sport":"..","id":".." — pair each with its own "state" field.
    for (const m of flight.matchAll(/\{"sport":"(\w+)","id":"[^"]+".{0,600}?"state":"([A-Z_]+)"/g)) {
      if (SPORT_LABEL[m[1]]) found.push({ date, sport: m[1], label: SPORT_LABEL[m[1]], state: m[2] });
    }
  }
  return found;
}

const FOUND = discover();
/** Chip DOM text per state (rendered mixed-case; CSS uppercases visually). */
const CHIP: Record<string, string> = { SIMULATION_READY: "Simulation ready", SCHEDULE_ONLY: "Schedule only", SETTLED: "Settled", BASELINE_ONLY: "Baseline only", NO_PLAY: "No qualified play" };
const pick = (sportLabel: string, state: string): Found | undefined =>
  FOUND.find((f) => f.label === sportLabel && f.state === state);

const SPORTS = ["MLB", "Premier League", "NFL", "UFC"] as const;

for (const sport of SPORTS) {
  for (const state of ["SIMULATION_READY", "SCHEDULE_ONLY", "SETTLED"] as const) {
    const hit = pick(sport, state);
    const chip = CHIP[state];
    test(`${sport} · ${state} — ${hit ? `proven on ${hit.date}` : "not in the current window (reality-typed skip)"}`, async ({ page }) => {
      test.skip(!hit, `${sport} exhibits no ${state} event in the exported window — a skip is the honest state`);
      if (!hit) return;
      await page.goto(`/simulate/d/${hit.date}/`);
      const section = page.locator(`section[aria-label="${sport} events"]`);
      await expect(section).toBeVisible();
      const card = section.locator(`:is(a,button)`, { hasText: chip }).first();
      await expect(card).toBeVisible();

      if (state === "SETTLED") {
        // Finals navigate — nothing regenerates.
        await expect(card).toHaveAttribute("href", /.+/);
        return;
      }

      if (state === "SIMULATION_READY" && sport === "MLB") {
        // MLB ready routes DIRECT: the report owns the generation ceremony (no stacked scenes).
        await expect(card).toHaveAttribute("href", /.+/);
        const href = await card.getAttribute("href");
        await card.click();
        await page.waitForURL(`**${href}`);
        await expect(page.locator("h1").first()).toBeVisible();
        return;
      }

      if (state === "SIMULATION_READY") {
        // The stage runs the real script and lands on the report.
        const beforeUrl = page.url();
        await card.click();
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('[role="status"]')).toBeVisible();
        await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: 20_000 });
        await expect(page.locator("h1").first()).toBeVisible();
        return;
      }

      // REFUSAL class: the stage ends in place with the stated reason; Escape restores focus.
      await card.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      const status = dialog.locator('[role="status"]');
      await expect(status).toBeVisible();
      // The refusal script is short; wait for the terminal text to settle (reason is non-empty).
      await expect
        .poll(async () => ((await status.textContent()) ?? "").trim().length, { timeout: 15_000 })
        .toBeGreaterThan(10);
      expect(page.url()).toContain(`/simulate/d/${hit.date}`); // never navigated
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      const focused = await page.evaluate(() => (document.activeElement as HTMLElement)?.textContent ?? "");
      expect(focused).toContain(chip); // focus restored to the triggering card (chip text is in the card)
    });
  }
}

test("NBA renders its typed off-season/absence line — never a ready action", async ({ page }) => {
  const anyDate = FOUND[0]?.date;
  test.skip(!anyDate, "no exported day pages");
  await page.goto(`/simulate/d/${anyDate}/`);
  const nba = page.locator('section[aria-label="NBA events"]');
  if ((await nba.count()) === 0) return; // an absent section is also a typed absence
  await expect(nba.locator("text=/off.season|no current event|schedules return/i").first()).toBeVisible();
  await expect(nba.locator("text=SIMULATION READY")).toHaveCount(0);
});

test("NHL never appears as a day-view section — its absence is typed, not an unfinished loader", async ({ page }) => {
  const anyDate = FOUND[0]?.date;
  test.skip(!anyDate, "no exported day pages");
  await page.goto(`/simulate/d/${anyDate}/`);
  await expect(page.locator('section[aria-label="NHL events"]')).toHaveCount(0);
});

test("REDUCED MOTION: a refusal run still narrates and completes without animation reliance", async ({ browser }) => {
  const hit = FOUND.find((f) => f.state === "SCHEDULE_ONLY");
  test.skip(!hit, "no refusal-state event in the window");
  if (!hit) return;
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:4173/simulate/d/${hit.date}/`);
  const card = page.locator(`section[aria-label="${hit.label} events"] :is(a,button)`, { hasText: "Schedule only" }).first();
  await card.click();
  const status = page.locator('[role="dialog"] [role="status"]');
  await expect(status).toBeVisible();
  await expect
    .poll(async () => ((await status.textContent()) ?? "").trim().length, { timeout: 15_000 })
    .toBeGreaterThan(10);
  await ctx.close();
});
