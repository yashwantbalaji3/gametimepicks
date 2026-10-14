/**
 * UX RELEASE 2A — "state and truth labels" (UX System V2 audit, founder-approved 2026-10-14).
 *
 * Each test names the audit finding it holds. Behaviour is tested where the owner is a function; where the
 * defect was a hard-coded sentence on a page, the page's source is pinned so the sentence cannot return.
 * The P0 findings have their own files: lab-capability-gate (GTP-08), frozen-at (GTP-23),
 * featured-truth (GTP-02/10), day-view (GTP-11), format-timestamp-et (NEW-1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { logLossVerdict, watchHeadline } from "../command-center/model-status.ts";
import { PUBLIC_STATE_MEANING } from "../command-center/contract.ts";
import { plainLaneReason, readableReason } from "../../components/home/suggested-parlays-preview.tsx";
import { isAnomalyLean } from "../mlb/lean-anomaly.ts";
import { buildSimulateDay } from "../simulate/day-view.ts";

const src = (p) => fs.readFileSync(p, "utf8");

test("GTP-22: a log-loss verdict names the measure, both numbers, n and the interval", () => {
  const watch = { id: "x", sport: "mlb", state: "WATCH", n: 814, baseline: "coin flip (log loss 0.6931)", judgement: { meanDiff: 0.0063, lo95: -0.0056, hi95: 0.0192 } };
  const t = logLossVerdict(watch, "a coin flip");
  assert.match(t, /log loss \(lower is better\) over 814 graded: 0\.699 for this call against 0\.693 for a coin flip/);
  assert.match(t, /95% interval −0\.006 to \+0\.019/);
  assert.match(t, /cannot yet be told apart from a coin flip/);
  const worse = logLossVerdict({ ...watch, judgement: { meanDiff: 0.035, lo95: 0.018, hi95: 0.053 } }, "a coin flip");
  assert.match(worse, /whole interval is above zero: worse than a coin flip/);
  const better = logLossVerdict({ ...watch, judgement: { meanDiff: -0.03, lo95: -0.046, hi95: -0.016 } }, "a coin flip");
  assert.match(better, /whole interval is below zero: better than a coin flip on this measure/);
  // No interval → no verdict sentence (the caller falls back to its older wording; nothing is claimed).
  assert.equal(logLossVerdict({ ...watch, judgement: { meanDiff: 0.01 } }, "a coin flip"), null);
  assert.equal(logLossVerdict({ ...watch, baseline: "8 in 10 inside the range" }, "x"), null);
});

test("GTP-22: the PAUSED meaning fits a preregistered-bar fallback too, and WATCH headlines say 'not yet distinguishable'", () => {
  assert.match(PUBLIC_STATE_MEANING.PAUSED, /preregistered bars/);
  assert.match(PUBLIC_STATE_MEANING.PAUSED, /handed back to the previous rule/);
  const ms = src("src/lib/command-center/model-status.ts");
  assert.doesNotMatch(ms, /"Watch · behind a coin flip"|"Watch · behind even odds"|"Watch · slightly behind"/);
});

test("GTP-27: closed lanes speak in sentences; codes and UTC instants stay in the details", () => {
  assert.equal(plainLaneReason("lane evaluation of record refused (CAPABILITY_GATED) at 2026-10-13T18:03:34Z; the next run…"), "this sport isn't cleared to publish model cards yet");
  assert.equal(plainLaneReason("no price capture for 2026-10-13 yet — …; only 0 priced games — the ladder needs 4"), "not enough current sportsbook prices to build a card today");
  assert.equal(plainLaneReason("a cross-sport card needs two live sports; only Premier League is cleared"), "a mixed-sport card needs two sports open today");
  for (const r of ["x (NOT_ELIGIBLE) y", "anything else"]) assert.doesNotMatch(plainLaneReason(r), /[A-Z]{3,}_[A-Z]{3,}/);
  assert.match(readableReason("refused at 2026-10-13T18:03:34Z;"), /refused at Oct 13, 2:03 PM ET;/);
  assert.doesNotMatch(src("src/components/methodology-card.tsx"), />\s*MODEL_LEARNING_ROADMAP_2026-05-28\.md\s*</);
  assert.match(src("src/components/ufc/event-results-recap.tsx"), /Source details/);
});

test("GTP-14: an R5 anomaly is its own label and is never counted as a gap-size tier", () => {
  assert.equal(isAnomalyLean({ riskFlags: ["r5_model_anomaly"] }), true);
  assert.equal(isAnomalyLean({ riskFlags: [] }), false);
  const row = src("src/components/mlb/mlb-lean-row.tsx");
  assert.match(row, /Anomaly · gap too large to trust/);
  assert.doesNotMatch(row, />\s*R5( anomaly)?\s*</, "the internal rule code is not shown");
  assert.match(src("src/components/mlb/mlb-board-body.tsx"), /l\.confidence === t && !isAnomalyLean\(l\)/);
});

test("GTP-34: no 'Generate Simulation' CTA, no strength word as confidence, 'first pitch' on MLB", () => {
  for (const p of ["src/components/home/featured-simulations.tsx", "src/components/games/simulate-lobby.tsx", "src/components/today/simulation-leans.tsx"]) {
    assert.doesNotMatch(src(p), /Generate Simulation →/, p);
  }
  const card = src("src/components/command-center/prediction-card.tsx");
  assert.doesNotMatch(card, /Simulation strength: \$\{/);
  assert.match(card, /% of simulated games · unvalidated/);
  assert.doesNotMatch(src("src/components/game/mlb-full-game-report.tsx"), /s\.replace\(" SIMULATION", ""\)/);
  assert.doesNotMatch(src("src/components/mlb/mlb-game-section.tsx"), />\s*tipoff\s*</);
});

test("GTP-06 / GTP-05 / GTP-07: dated snapshot, MLB-only record label, ET days", () => {
  const markets = src("src/app/markets/page.tsx");
  assert.doesNotMatch(markets, /Prices shown for MLB today\./);
  assert.match(markets, /from the \{formatDate\(data\.date\)\} capture/);
  assert.match(src("src/app/results/page.tsx"), /"Suggested cards · MLB"/);
  const fam = src("src/app/results/forecasts/[sport]/[family]/page.tsx");
  assert.doesNotMatch(fam, /String\(r\.eventStart \?\? r\.publishedAt \?\? ""\)\.slice\(0, 10\)/);
  assert.doesNotMatch(fam, /\.slice\(0, 16\)\.replace\("T", " "\)\}Z/);
  assert.match(src("src/app/results/forecasts/page.tsx"), /etDayLabel\(iso\)/);
});

test("GTP-26: the legacy Moonshot store reads Archived with its date; graded cards drop projections and pending legs", () => {
  const t = src("src/components/moonshot/moonshot-lane-tracker.tsx");
  assert.match(t, /<StatusPill status="archived" dot \/>/);
  assert.match(t, /Legacy lane/);
  assert.match(t, /projectedReturn=\{graded \? undefined : r\.card\.projectedReturn\}/);
  assert.match(t, /cardGraded && r === "pending" \? "graded" : r/);
});

test("GTP-04: Bank Builder's input state comes from the generator's pool, and one-game legs say they cannot make a card", () => {
  const bb = src("src/app/bank-builder/page.tsx");
  assert.match(bb, /inputsDate: bbPoolHasToday \? currentEtDate\(\) : bbInputsDate/);
  assert.match(src("src/components/products/eligible-universe.tsx"), /a card needs legs from 2\+ games/);
});

test("GTP-24 / GTP-33 / GTP-03 / NEW-2: counts and states match their owners", () => {
  assert.match(src("src/components/mlb/mlb-simulations-section.tsx"), /set\.confirmedOrderCount/);
  const home = src("src/app/page.tsx");
  assert.doesNotMatch(home, /with activity on today's slate/);
  assert.match(home, /active this week/);
  const notes = src("src/components/mlb/mlb-flagship-sections.tsx").match(/const GATE_NOTE(?:_PAST)? = "[^"]*";/g) ?? [];
  assert.equal(notes.length, 2);
  for (const n of notes) assert.doesNotMatch(n, /waiting on the sportsbooks|fills in automatically/);
  assert.match(src("src/components/live/live-hub.tsx"), /const inProgress = life\.state === "LIVE" \|\| life\.state === "DELAYED";/);
  assert.match(src("src/components/live/nfl-live-hub.tsx"), /state === "LIVE" \|\| state === "DELAYED" \? periodLine\(envelope\) : null/);
});

test("GTP-09: UFC schedule rows are named cards, never anonymous 'UFC event' rows, and promise no forecast", () => {
  for (const d of ["2026-10-24", "2026-10-31", "2026-11-07"]) {
    const ufc = buildSimulateDay(d, { today: "2026-10-13" }).sections.find((s) => s.sport === "ufc");
    for (const e of ufc.events) {
      assert.notEqual(e.matchup, "UFC event");
      if (e.state === "SCHEDULE_ONLY") assert.doesNotMatch(e.stateReason ?? "", /published closer to fight night/);
    }
  }
});

/* ── Independent-review fixes (2026-10-14, before merge) ─────────────────────────────────────────── */

test("review #1: a WATCH headline agrees with its own interval (stale scorecard ⇒ BREACHED shown as WATCH)", () => {
  assert.equal(watchHeadline({ state: "BREACHED", judgement: { lo95: 0.018, hi95: 0.053 } }, "a coin flip"), "Watch · clearly behind a coin flip, not paused");
  assert.equal(watchHeadline({ state: "WATCH", judgement: { lo95: -0.006, hi95: 0.019 } }, "a coin flip"), "Watch · not yet distinguishable from a coin flip");
  assert.equal(watchHeadline({ state: "WATCH", judgement: { lo95: 0.002, hi95: 0.02 } }, "even odds"), "Watch · clearly behind even odds, not paused");
});

test("review #2: the cross-sport lane is never described as short of prices; a bare NOT_ELIGIBLE claims nothing specific", () => {
  assert.equal(plainLaneReason("lane evaluation of record refused (NOT_ELIGIBLE) at 2026-10-13T00:56:17Z", "multi"), "a mixed-sport card needs two sports open today");
  assert.equal(plainLaneReason("lane evaluation of record refused (NOT_ELIGIBLE) at 2026-10-13T00:56:17Z", "nfl"), "not eligible today");
  assert.match(src("src/lib/home/suggested-parlays.mjs"), /fullReason: row\.laneReason/);
});

test("review #4: a leg under a graded card reads 'Card decided', never 'Settled' or 'Pending'", () => {
  assert.match(src("src/components/tickets/status-pill.tsx"), /card_decided: \{ label: "Card decided"/);
  assert.match(src("src/components/tickets/leg-row.tsx"), /r === "graded" \? "card_decided"/);
  assert.match(src("src/components/tickets/settlement-badge.tsx"), /result === "graded" \? "card_decided"/);
});
