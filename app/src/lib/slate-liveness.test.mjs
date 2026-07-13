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
test("liveness · stale slate (07-11) on real 07-12 is NOT live — honest no-games headline", () => {
  const v = computeSlateLiveness({
    today: "2026-07-12",
    latestSlate: "2026-07-11",
    hasGamesToday: false,
  });
  assert.equal(v.status, "latest-available");
  assert.equal(v.isLiveToday, false);
  assert.equal(v.daysBehind, 1);
  assert.match(v.headline, /No games today/);
  assert.match(v.headline, /Jul 12/); // frames on the REAL date, not the slate date
  assert.match(v.detail, /Most recent slate/);
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

test("liveness · today's date but ZERO games is still NOT live (no fake action)", () => {
  const v = computeSlateLiveness({
    today: "2026-07-13",
    latestSlate: "2026-07-11",
    hasGamesToday: false,
  });
  assert.equal(v.status, "latest-available");
  assert.equal(v.isLiveToday, false);
  assert.equal(v.daysBehind, 2);
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
test("wiring · all six formerly-stale routes mount SlateLivenessBanner", () => {
  const routes = [
    "src/app/page.tsx",
    "src/app/today/page.tsx",
    "src/app/mlb/page.tsx",
    "src/app/picks/page.tsx",
    "src/app/moonshot/page.tsx",
    "src/app/world-cup/page.tsx",
  ];
  for (const rel of routes) {
    const src = fs.readFileSync(path.join(APP, rel), "utf8");
    assert.match(src, /import SlateLivenessBanner from "@\/components\/slate-liveness-banner"/, `${rel} imports the banner`);
    assert.match(src, /<SlateLivenessBanner/, `${rel} renders the banner`);
  }
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
  assert.match(mlbPage, /date < currentEtDate\(\) \? "MLB Simulation Center · latest slate"/, "/mlb eyebrow flips to 'latest slate' (Simulation Center framing) when the board is behind today");
});

test("safe-fix · /sports gates 'live' on the slate date == today (no stale 'Live today')", () => {
  const src = fs.readFileSync(path.join(APP, "src/app/sports/page.tsx"), "utf8");
  // MLB/WC/NBA/UFC liveness must require the slate date to equal the real ET date, not merely content presence.
  assert.match(src, /mlbDate === today/, "MLB 'live' requires the board date to be today");
  assert.match(src, /=== today/, "sports liveness is date-gated");
  assert.match(src, /best === today/, "NBA 'live' requires the board date to be today");
  assert.match(src, /eventDate === today/, "UFC 'live' requires the event date to be today");
  // Honest header when nothing is live.
  assert.match(src, /no live slate today/, "header says 'no live slate today' when 0 are live");
});
