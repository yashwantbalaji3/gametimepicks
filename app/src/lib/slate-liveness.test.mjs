/**
 * Slate-liveness + tournament-calendar pins — the honest "is this live today?"
 * framing for the mid-July lull (0-game MLB days, World Cup between rounds).
 * These guard that the site NEVER presents a stale slate as live, keyed off the
 * REAL ET clock, and that the "next focus" facts fabricate no matchups.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  computeSlateLiveness,
  prettyEtLabel,
  daysAgoLabel,
  focusDateLabel,
} from "./slate-liveness.ts";
import { nextWorldCupFocus, WC_2026_KNOCKOUT } from "./wc-tournament-calendar.ts";
import { isMlbAllStarBreak, mlbBreakNote, MLB_ALL_STAR_BREAK_2026 } from "./mlb-season-calendar.ts";

const APP = process.cwd(); // app/

// ── computeSlateLiveness ──────────────────────────────────────────────────────
test("liveness · stale slate (07-11) on real 07-12 is NOT live — and does NOT claim there are no games", () => {
  const v = computeSlateLiveness({
    today: "2026-07-12",
    latestSlate: "2026-07-11",
    hasGamesToday: false,
  });
  assert.equal(v.status, "slate-pending");
  assert.equal(v.isLiveToday, false);
  assert.equal(v.daysBehind, 1);
  // No artifact exists for 07-12, so the page may say the slate is unpublished — never that the
  // day is empty. On 2026-08-17 the old copy asserted "No games today" over an 11-game slate.
  assert.doesNotMatch(v.headline, /No games today/);
  assert.match(v.headline, /isn't published yet/);
  assert.match(v.headline, /Jul 12/); // frames on the REAL date, not the slate date
  assert.match(v.detail, /Most recent published slate/);
  assert.match(v.detail, /Jul 11/);
  assert.match(v.detail, /1 day ago/);
});

test("liveness · a real slate ON today WITH games is live", () => {
  const v = computeSlateLiveness({
    today: "2026-07-11",
    latestSlate: "2026-07-11",
    hasGamesToday: true,
  });
  assert.equal(v.status, "live-today");
  assert.equal(v.isLiveToday, true);
  assert.equal(v.daysBehind, 0);
  assert.match(v.headline, /Today's slate/);
});

test("liveness · a multi-day-old slate is NOT live and stays a publishing state (no fake action)", () => {
  const v = computeSlateLiveness({
    today: "2026-07-13",
    latestSlate: "2026-07-11",
    hasGamesToday: false,
  });
  assert.equal(v.status, "slate-pending");
  assert.equal(v.isLiveToday, false);
  assert.equal(v.daysBehind, 2);
});

/*
 * The genuine no-games day — the All-Star break this module was built for. It had NO coverage: the
 * test above carried the name "today's date but ZERO games" while passing a slate two days stale,
 * so the branch that still says "No games today" was never exercised. This is that branch.
 */
test("liveness · a slate published FOR TODAY that is empty is a proven no-games day", () => {
  const v = computeSlateLiveness({
    today: "2026-07-13",
    latestSlate: "2026-07-13",
    hasGamesToday: false,
  });
  assert.equal(v.status, "latest-available");
  assert.equal(v.isLiveToday, false);
  assert.equal(v.daysBehind, 0);
  // We hold an artifact for today and it is empty — the claim is earned here, and only here.
  assert.match(v.headline, /No games today/);
});

test("liveness · no slate at all → no-data, honest empty copy", () => {
  const v = computeSlateLiveness({ today: "2026-07-12", latestSlate: null, hasGamesToday: false });
  assert.equal(v.status, "no-data");
  assert.equal(v.isLiveToday, false);
  assert.match(v.headline, /No slate/);
});

test("liveness · carries next focus + league notes through verbatim", () => {
  const v = computeSlateLiveness({
    today: "2026-07-12",
    latestSlate: "2026-07-11",
    hasGamesToday: false,
    nextFocus: { label: "World Cup semifinals", date: "2026-07-14", through: "2026-07-15" },
    leagueNotes: ["MLB — All-Star break; second half resumes Jul 17."],
  });
  assert.equal(v.nextFocus?.label, "World Cup semifinals");
  assert.deepEqual(v.leagueNotes, ["MLB — All-Star break; second half resumes Jul 17."]);
});

// ── label helpers ─────────────────────────────────────────────────────────────
test("prettyEtLabel · ET-anchored weekday label", () => {
  assert.equal(prettyEtLabel("2026-07-12"), "Sun, Jul 12");
  assert.equal(prettyEtLabel("2026-07-11"), "Sat, Jul 11");
});

test("daysAgoLabel · never negative-phrased", () => {
  assert.equal(daysAgoLabel(0), "today");
  assert.equal(daysAgoLabel(1), "1 day ago");
  assert.equal(daysAgoLabel(3), "3 days ago");
});

test("focusDateLabel · multi-day round reads 'Jul 14 & 15'", () => {
  assert.equal(focusDateLabel({ label: "x", date: "2026-07-14", through: "2026-07-15" }), "Jul 14 & 15");
  assert.equal(focusDateLabel({ label: "x", date: "2026-07-19" }), "Jul 19");
});

// ── WC tournament calendar (dates only — NO matchups) ────────────────────────
test("wc-calendar · on 07-12 the next focus is the semifinals (Jul 14 & 15), matchups TBD", () => {
  const f = nextWorldCupFocus("2026-07-12");
  assert.equal(f?.label, "World Cup semifinals");
  assert.equal(f?.date, "2026-07-14");
  assert.equal(f?.through, "2026-07-15");
  assert.match(f?.note ?? "", /matchups set after the quarterfinals/);
});

test("wc-calendar · mid-semifinals (07-15) still points at the semifinals", () => {
  assert.equal(nextWorldCupFocus("2026-07-15")?.label, "World Cup semifinals");
});

test("wc-calendar · after the final → null (tournament over)", () => {
  assert.equal(nextWorldCupFocus("2026-07-20"), null);
});

test("wc-calendar · carries no team names anywhere (no fabricated matchups)", () => {
  const blob = JSON.stringify(WC_2026_KNOCKOUT);
  // Only round labels + ISO dates + notes — never a country/team token.
  assert.doesNotMatch(blob, /Argentina|England|Norway|Switzerland|France|Brazil|Spain/i);
});

// ── MLB All-Star break window (honest, bounded) ──────────────────────────────
test("mlb-calendar · break note fires ONLY inside the published window", () => {
  assert.equal(isMlbAllStarBreak("2026-07-12"), false); // day before → no false 'break' claim
  assert.equal(isMlbAllStarBreak("2026-07-13"), true);
  assert.equal(isMlbAllStarBreak("2026-07-16"), true);
  assert.equal(isMlbAllStarBreak("2026-07-17"), false); // resumes
  assert.equal(mlbBreakNote("2026-07-12"), null);
  assert.match(mlbBreakNote("2026-07-14") ?? "", /All-Star break/);
  assert.equal(MLB_ALL_STAR_BREAK_2026.resume, "2026-07-17");
});

// ── Route wiring (source-grep — thin-slate-safe, no live-slate coupling) ─────
// Every previously-stale public route must mount the honest liveness banner so a
// no-games day never presents the most-recent slate as live. These are pins on
// the WIRING, not the data, so they hold regardless of which slate is committed.
test("wiring · every SURVIVING formerly-stale route mounts SlateLivenessBanner (retired routes redirect instead)", () => {
  const routes = [
    "src/app/page.tsx",
    "src/app/today/page.tsx",
    "src/app/mlb/page.tsx",
    // /picks retired to a redirect (Program 143) — the guard's own parenthetical already covers
    // this: "retired routes redirect instead". /build carries the surviving suggested-card surface
    // but has its own liveness framing via PicksSurfaceHeader status, not the banner.
    "src/app/moonshot/page.tsx",
  ];
  for (const rel of routes) {
    const src = fs.readFileSync(path.join(APP, rel), "utf8");
    assert.match(src, /import SlateLivenessBanner from "@\/components\/slate-liveness-banner"/, `${rel} imports the banner`);
    assert.match(src, /<SlateLivenessBanner/, `${rel} renders the banner`);
  }
  // /world-cup was the sixth route. The 2026-07-30 public-route audit retired it to a redirect stub:
  // a page that renders no slate can misdate no slate, which is the stronger fix (same reasoning as
  // the /sports safe-fix below).
  const wc = fs.readFileSync(path.join(APP, "src/app/world-cup/page.tsx"), "utf8");
  assert.match(wc, /ClientRedirect/, "/world-cup is a redirect stub");
  assert.doesNotMatch(wc, /Live today|<SlateLivenessBanner/, "the stub makes no liveness claim and needs no banner");
});

test("wiring · the banner component frames on the REAL ET clock, not the slate date", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/slate-liveness-banner.tsx"), "utf8");
  // Re-derives today from currentEtDate() after hydration (never trusts the baked slate date).
  assert.match(src, /currentEtDate\(\)/, "recomputes today with the real ET clock");
  assert.match(src, /useEffect/, "updates after hydration");
  // Suppresses itself on a genuinely live day (no clutter).
  assert.match(src, /status === "live-today"/, "hides on a live day");
});

// ── Safe fix: header labels say "latest slate", not "today", when behind ─────
test("safe-fix · the /today header + /mlb eyebrow read 'latest slate' when the slate is behind today", () => {
  const header = fs.readFileSync(path.join(APP, "src/components/today/daily-slate-header.tsx"), "utf8");
  assert.match(header, /slateRelative\s*\?/, "header renders the relative qualifier when present");
  const todayPage = fs.readFileSync(path.join(APP, "src/app/today/page.tsx"), "utf8");
  assert.match(todayPage, /slateRelative=\{today < serverToday \? "Latest slate"/, "/today passes 'Latest slate' when the slate date is before the real ET clock");
  const mlbPage = fs.readFileSync(path.join(APP, "src/app/mlb/page.tsx"), "utf8");
  // The page derives "is this slate today's?" ONCE and every present-tense claim hangs off it.
  assert.match(mlbPage, /const isTodaysSlate = date >= currentEtDate\(\)/, "/mlb derives today-ness from the real ET clock");
  assert.match(mlbPage, /isTodaysSlate \? "MLB Simulation Center" : "MLB Simulation Center · latest slate"/, "/mlb eyebrow flips to 'latest slate' when the board is behind today");
  /*
   * The eyebrow was the ONLY claim gated on the date; the status pill, the stat label and the CTA
   * all stayed in the present tense. On 2026-08-17 that put "Live · 15 games", "Games today 15" and
   * "View today's projections" over a settled Aug-16 slate. Each one is pinned here now.
   */
  assert.match(mlbPage, /!isTodaysSlate\s*\n?\s*\? "settled"/, "/mlb status pill reads Settled, never Live, on a past slate");
  assert.match(mlbPage, /isTodaysSlate \? "Games today" : "Games on this slate"/, "/mlb stat label stops calling a past slate 'today'");
  assert.match(mlbPage, /!isTodaysSlate \? "Open the latest board"/, "/mlb primary CTA stops promising today's projections on a past slate");
});

test("safe-fix · the revived /sports directory renders NO liveness claim of any kind", () => {
  // The original fix date-gated each tile's "live" chip; the 2026-07-30 audit then removed the
  // directory outright. Release B (Program 148) revived it as a schedule-status page whose stronger
  // fix is structural: the shared presentation has no liveness chip to gate — capture times render
  // as absolute dates and state is carried by words. This guard pins that absence.
  const src = fs.readFileSync(path.join(APP, "src/app/sports/page.tsx"), "utf8");
  const shared = fs.readFileSync(path.join(APP, "src/components/sports/upcoming-sports.tsx"), "utf8");
  for (const [name, txt] of [["page", src], ["shared presentation", shared]]) {
    assert.doesNotMatch(txt, /Live today/i, `${name} makes no 'Live today' claim`);
    assert.doesNotMatch(txt, /"Live"|>Live</, `${name} renders no bare Live chip`);
  }
  assert.match(shared, /ABSOLUTE/, "capture times documented as absolute so build-time relatives cannot rot");
});
