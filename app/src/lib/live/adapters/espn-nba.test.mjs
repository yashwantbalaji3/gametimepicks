/**
 * NBA LIVE ADAPTER TESTS — deterministic: every input is a committed fixture (REAL recorded ESPN payloads
 * or SYNTHETIC edits of them, see fixtures/nba-fixtures.provenance.json) or a literal authored here.
 * Nothing opens a socket.
 *
 * The adapter is INTERNAL: the last block proves it is not reachable from any public surface and that
 * the gateway still refuses NBA.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  NBA_LIFECYCLE,
  mapNbaStatus,
  contractStateOf,
  periodOf,
  normalizeNbaEvent,
  normalizeNbaScoreboard,
  normalizeNbaSummaryGame,
  summaryEventId,
  toLiveEnvelope,
  normalizeNbaBoxscore,
  countMissingStats,
  boxscoreDecreases,
  applyCanonicalFinality,
  advanceNbaGuard,
  emptyGuard,
  SCORE_CORRECTION_CONFIRM_POLLS,
  assessProviderHealth,
  nbaFreshness,
  nbaPollingPlan,
  SUMMARY_INTERVAL_MS,
  SETTLEMENT_CHECK_MS,
  buildNbaProgressRows,
  displayLiveValue,
  FROZEN_PROJECTION_LABEL,
  NBA_PROGRESS_STATS,
} from "./espn-nba.mjs";
import { LIVE_STATES, LIVE_SCHEMA_VERSION } from "../contract.mjs";
import { FRESH_MAX_MS, DELAYED_MAX_MS, IMMINENT_WINDOW_MS } from "../freshness.mjs";
import { derivePresentationState } from "../lifecycle.mjs";
import { partition, renderedStrings } from "../testing/source-scan.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const FIX = path.join(here, "..", "fixtures");
const APP = path.join(here, "..", "..", "..", "..");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), "utf8"));
const FINALS_RECORD = () => JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/results/finals-2026-27.json"), "utf8"));
const T0 = "2026-10-21T00:00:00.000Z";
const at = (sec) => new Date(Date.parse(T0) + sec * 1000).toISOString();
const sb = (name, fetchedAt = T0) => normalizeNbaScoreboard(fixture(name), fetchedAt)[0];

/* ───────────────────────────── real payloads ───────────────────────────── */

test("NBA 1 · REAL opening-night scoreboard: three PREGAME games, no score, no period, no clock", () => {
  const games = normalizeNbaScoreboard(fixture("nba-scoreboard-opening-pre.json"), T0);
  assert.deepEqual(games.map((g) => g.eventId), ["401909088", "401909089", "401909090"]);
  assert.deepEqual(games.map((g) => `${g.away.abbr}@${g.home.abbr}`), ["BOS@DET", "PHI@NY", "OKC@SA"]);
  for (const g of games) {
    assert.equal(g.lifecycle, "PREGAME");
    assert.equal(g.state, "PRE");
    assert.equal(g.sport, "NBA");
    assert.equal(g.providerEventId, g.eventId, "ESPN's event id IS the repo's NBA providerEventId");
    assert.equal(g.home.score, null, "a pregame score is null, never 0");
    assert.equal(g.away.score, null);
    assert.equal(g.home.linescores, null);
    assert.equal(g.period, null, "ESPN's period 0 is no period");
    assert.equal(g.clock, null, "ESPN's displayClock '0.0' before tip is not a clock");
    assert.equal(g.sourceUpdatedAt, null, "ESPN publishes no update stamp — never invented");
  }
  assert.equal(games[0].startTime, "2026-10-20T19:00Z");
});

test("NBA 2 · REAL pregame summary: id matches, no box yet, game PREGAME", () => {
  const s = fixture("nba-summary-opening-pre.json");
  assert.equal(summaryEventId(s), "401909088");
  assert.deepEqual(normalizeNbaBoxscore(s), { ok: true, available: false, players: [] });
  const g = normalizeNbaSummaryGame(s, T0);
  assert.equal(g.lifecycle, "PREGAME");
  assert.equal(g.home.score, null);
});

test("NBA 3 · REAL completed game: FINAL_PROVISIONAL with real scores and linescores, no clock", () => {
  const g = sb("nba-scoreboard-final.json");
  assert.equal(g.eventId, "401898719");
  assert.equal(g.lifecycle, "FINAL_PROVISIONAL", "ESPN STATUS_FINAL is provisional — never canonical by itself");
  assert.equal(g.state, "FINAL");
  assert.equal(g.home.abbr, "LAL");
  assert.equal(g.home.score, 106);
  assert.equal(g.away.score, 121);
  assert.deepEqual(g.home.linescores, [22, 33, 28, 23]);
  assert.deepEqual(g.away.linescores, [36, 26, 26, 33]);
  assert.deepEqual(g.period, { number: 4, label: "Q4", isOvertime: false, overtimeNumber: null });
  assert.equal(g.clock, null, "the real final carries displayClock '12:00' — on a final that reads as a running clock");
  assert.deepEqual(g.discrepancies, [], "real linescores sum to the real score");
  // The summary header agrees on everything it states (it carries no period on a final).
  const s = normalizeNbaSummaryGame(fixture("nba-summary-final.json"), T0);
  assert.equal(s.lifecycle, g.lifecycle);
  assert.deepEqual([s.home.score, s.away.score], [106, 121]);
  assert.deepEqual(s.away.linescores, g.away.linescores);
});

/* ───────────────────────────── status mapping ───────────────────────────── */

test("NBA 4 · status mapping by NAME first; the provider can NEVER produce FINAL_CANONICAL", () => {
  const st = (name, state, completed) => mapNbaStatus({ type: { name, state, completed } });
  assert.equal(st("STATUS_SCHEDULED", "pre"), "PREGAME");
  assert.equal(st("STATUS_IN_PROGRESS", "in"), "LIVE");
  assert.equal(st("STATUS_HALFTIME", "in"), "HALFTIME");
  assert.equal(st("STATUS_END_PERIOD", "in"), "END_OF_PERIOD");
  assert.equal(st("STATUS_FINAL", "post", true), "FINAL_PROVISIONAL");
  assert.equal(st("STATUS_POSTPONED", "pre"), "POSTPONED", "a postponed game is coarse 'pre' — never a normal pregame");
  assert.equal(st("STATUS_CANCELED", "post"), "CANCELLED", "a cancelled game is coarse 'post' — never a final");
  assert.equal(st("STATUS_DELAYED", "in"), "DELAYED");
  assert.equal(st("STATUS_SUSPENDED", "in"), "DELAYED");
  assert.equal(st("STATUS_WHATEVER", "post", false), "UNKNOWN", "a post state that never completed is not a final");
  assert.equal(st("STATUS_MADE_UP", "sideways"), "UNKNOWN");
  assert.equal(mapNbaStatus(undefined), "UNKNOWN");
  const names = ["STATUS_FINAL", "STATUS_FINAL_OT", "STATUS_FINAL_CANONICAL", "FINAL_CANONICAL", "STATUS_IN_PROGRESS", "", undefined];
  for (const name of names) for (const state of ["pre", "in", "post", undefined]) for (const completed of [true, false, undefined]) {
    assert.notEqual(st(name, state, completed), "FINAL_CANONICAL", `${name}/${state}/${completed} self-promoted`);
  }
});

test("NBA 5 · every lifecycle projects into the shared contract's LIVE_STATES", () => {
  for (const l of NBA_LIFECYCLE) assert.ok(LIVE_STATES.includes(contractStateOf(l)), l);
  assert.equal(contractStateOf("HALFTIME"), "LIVE", "a break is still an in-play game for freshness and polling");
  assert.equal(contractStateOf("END_OF_PERIOD"), "LIVE");
  assert.equal(contractStateOf("FINAL_CANONICAL"), "FINAL");
  assert.equal(contractStateOf("nonsense"), "UNKNOWN");
});

test("NBA 6 · period labels: Q1–Q4, OT, 2OT; 0/absent is no period", () => {
  assert.equal(periodOf(1).label, "Q1");
  assert.equal(periodOf(4).label, "Q4");
  assert.deepEqual(periodOf(5), { number: 5, label: "OT", isOvertime: true, overtimeNumber: 1 });
  assert.deepEqual(periodOf(6), { number: 6, label: "2OT", isOvertime: true, overtimeNumber: 2 });
  assert.equal(periodOf(0), null);
  assert.equal(periodOf(undefined), null);
  assert.equal(periodOf("x"), null);
});

/* ───────────────────────────── synthetic in-play payloads ───────────────────────────── */

test("NBA 7 · SYNTHETIC in-play states: end of Q1, halftime, Q3 live, OT live, OT final", () => {
  const q1 = sb("nba-scoreboard-endq1-synthetic.json");
  assert.equal(q1.lifecycle, "END_OF_PERIOD");
  assert.equal(q1.state, "LIVE");
  assert.equal(q1.period.label, "Q1");
  assert.equal(q1.clock, null, "a break shows no running clock");
  assert.deepEqual([q1.home.score, q1.away.score], [22, 36]);

  const ht = sb("nba-scoreboard-halftime-synthetic.json");
  assert.equal(ht.lifecycle, "HALFTIME");
  assert.equal(ht.clock, null);
  assert.deepEqual([ht.home.score, ht.away.score], [55, 62]);

  const q3 = sb("nba-scoreboard-live-q3-synthetic.json");
  assert.equal(q3.lifecycle, "LIVE");
  assert.equal(q3.clock, "5:42");
  assert.equal(q3.period.label, "Q3");
  assert.deepEqual(q3.home.linescores, [22, 33, 15]);

  const ot = sb("nba-scoreboard-live-ot-synthetic.json");
  assert.equal(ot.lifecycle, "LIVE");
  assert.deepEqual(ot.period, { number: 5, label: "OT", isOvertime: true, overtimeNumber: 1 });
  assert.equal(ot.clock, "2:31");
  assert.equal(ot.home.linescores.length, 5);

  const otf = sb("nba-scoreboard-final-ot-synthetic.json");
  assert.equal(otf.lifecycle, "FINAL_PROVISIONAL");
  assert.equal(otf.period.label, "OT");
  assert.deepEqual([otf.home.score, otf.away.score], [115, 117]);
  assert.equal(otf.stateDetail, "Final/OT");
});

test("NBA 8 · a linescore that does not sum to the score is surfaced (INFO), not hidden or held", () => {
  const raw = fixture("nba-scoreboard-live-q3-synthetic.json");
  raw.events[0].competitions[0].competitors.find((c) => c.homeAway === "home").score = "72";
  const g = normalizeNbaEvent(raw.events[0], T0);
  assert.equal(g.home.score, 72);
  assert.deepEqual(g.discrepancies, [{ kind: "INFO", code: "LINESCORE_SUM_MISMATCH", side: "home", score: 72, linescoreSum: 70 }]);
});

test("NBA 9 · malformed payloads yield nothing, never a fabricated game", () => {
  for (const bad of [null, {}, { events: null }, "nope"]) assert.deepEqual(normalizeNbaScoreboard(bad, T0), []);
  assert.deepEqual(normalizeNbaScoreboard({ events: [{ status: {} }] }, T0), [], "no id → refused");
  assert.equal(normalizeNbaSummaryGame({}, T0), null);
});

/* ───────────────────────────── canonical finality ───────────────────────────── */

test("NBA 10 · FINAL_CANONICAL only when the REAL finals record holds a matching FINAL", () => {
  const record = FINALS_RECORD();
  const g = sb("nba-scoreboard-final.json");
  const before = JSON.stringify(g);
  const c = applyCanonicalFinality(g, record);
  assert.equal(c.lifecycle, "FINAL_CANONICAL");
  assert.equal(c.state, "FINAL");
  assert.deepEqual(c.canonical, { state: "FINAL", ftHome: 106, ftAway: 121, source: "nba-finals-record", recordedAt: "2026-10-17T06:07:00Z" });
  assert.equal(JSON.stringify(g), before, "the input game is not mutated");

  // No record / an event the record does not hold → PENDING, stays provisional.
  for (const r of [null, { finals: [] }]) {
    const p = applyCanonicalFinality(g, r);
    assert.equal(p.lifecycle, "FINAL_PROVISIONAL");
    assert.deepEqual(p.canonical, { state: "PENDING" });
  }
});

test("NBA 11 · the record's FINAL_UNDER_REVIEW, a score mismatch, or a team mismatch never promotes", () => {
  const record = FINALS_RECORD();
  const g = sb("nba-scoreboard-final.json");
  const review = { ...record, conflicts: [...record.conflicts, { providerEventId: "401898719", recorded: {}, observed: {} }] };
  const r = applyCanonicalFinality(g, review);
  assert.equal(r.lifecycle, "FINAL_PROVISIONAL");
  assert.equal(r.discrepancies.at(-1).code, "CANONICAL_UNDER_REVIEW");

  const ot = sb("nba-scoreboard-final-ot-synthetic.json"); // same event id, 115-117 vs recorded 106-121
  const m = applyCanonicalFinality(ot, record);
  assert.equal(m.lifecycle, "FINAL_PROVISIONAL");
  assert.equal(m.discrepancies.at(-1).code, "CANONICAL_SCORE_MISMATCH");
  assert.deepEqual(m.discrepancies.at(-1).record, { home: 106, away: 121, homeTeamId: "13", awayTeamId: "7" });

  const swapped = { ...g, home: g.away, away: g.home };
  const sw = applyCanonicalFinality({ ...swapped, home: { ...swapped.home, score: 106 }, away: { ...swapped.away, score: 121 } }, record);
  assert.equal(sw.lifecycle, "FINAL_PROVISIONAL");
  assert.equal(sw.discrepancies.at(-1).code, "CANONICAL_TEAM_MISMATCH");
});

test("NBA 12 · a record final while the provider still says LIVE is surfaced, never resolved", () => {
  const q3 = sb("nba-scoreboard-live-q3-synthetic.json");
  const c = applyCanonicalFinality(q3, FINALS_RECORD());
  assert.equal(c.lifecycle, "LIVE");
  assert.equal(c.discrepancies.at(-1).code, "CANONICAL_FINAL_WHILE_PROVIDER_NOT_FINAL");
});

/* ───────────────────────────── per-player box ───────────────────────────── */

test("NBA 13 · REAL final box: 44 rows, DNP reason kept with every stat null, a real 0 stays 0", () => {
  const box = normalizeNbaBoxscore(fixture("nba-summary-final.json"));
  assert.equal(box.ok, true);
  assert.equal(box.players.length, 44);
  const by = (n) => box.players.find((p) => p.name === n);
  const gordon = by("Aaron Gordon");
  assert.equal(gordon.didNotPlay, true);
  assert.equal(gordon.dnpReason, "COACH'S DECISION");
  assert.equal(gordon.appeared, false);
  for (const v of Object.values(gordon.stats)) assert.equal(v, null, "a DNP has null stats, never 0");
  const tyus = by("Tyus Jones");
  assert.equal(tyus.stats.pts, 0, "17 real minutes and 0 points is a real zero");
  assert.equal(tyus.stats.minutes, 17);
  assert.equal(tyus.dnpReason, null, "ESPN stamps COACH'S DECISION on players who played — not a DNP reason");
  const jokic = by("Nikola Jokic");
  assert.deepEqual(jokic.stats, { pts: 17, reb: jokic.stats.reb, ast: jokic.stats.ast, threePm: jokic.stats.threePm, threePa: jokic.stats.threePa, minutes: 31 });
  assert.ok(Object.values(jokic.stats).every((v) => Number.isInteger(v)));
  assert.equal(jokic.side, "away");
  assert.equal(jokic.teamAbbr, "DEN");
  assert.equal(by("Luka Doncic").side, "home");
  const m = countMissingStats(box);
  assert.equal(m.didNotPlay, 19);
  assert.equal(m.appeared, 25);
  assert.equal(m.notYetAppeared, 0);
  assert.deepEqual(Object.values(m.nullOnAppeared), [0, 0, 0, 0, 0, 0]);
});

test("NBA 14 · SYNTHETIC live box: not-yet-appeared, MIN '--' zero-fill and a blank cell are all null", () => {
  const box = normalizeNbaBoxscore(fixture("nba-summary-live-q3-synthetic.json"));
  const by = (n) => box.players.find((p) => p.name === n);
  for (const n of ["Cam Whitmore", "Bryce Hopkins", "Chris Manon", "Rafael Castro"]) {
    const p = by(n);
    assert.equal(p.didNotPlay, false);
    assert.equal(p.appeared, false, `${n} has not appeared`);
    assert.ok(Object.values(p.stats).every((v) => v === null), `${n}: null, never 0`);
  }
  const hardy = by("Jaden Hardy");
  assert.equal(hardy.appeared, false, "MIN '--' is no participation evidence; the zero-filled cells are not observations");
  assert.ok(Object.values(hardy.stats).every((v) => v === null));
  const jokic = by("Nikola Jokic");
  assert.equal(jokic.appeared, true);
  assert.equal(jokic.stats.threePm, null);
  assert.equal(jokic.stats.threePa, null);
  assert.equal(jokic.stats.pts, 17);
  const m = countMissingStats(box);
  assert.equal(m.notYetAppeared, 5);
  assert.equal(m.nullOnAppeared.threePm, 1);
  assert.equal(m.nullOnAppeared.pts, 0);
  const g = normalizeNbaSummaryGame(fixture("nba-summary-live-q3-synthetic.json"), T0);
  assert.equal(g.lifecycle, "LIVE");
  assert.equal(g.clock, "5:42");
  assert.deepEqual([g.home.score, g.away.score], [70, 76]);
});

test("NBA 15 · a moved box-score column fails CLOSED — no stats rather than wrong stats", () => {
  const box = normalizeNbaBoxscore(fixture("nba-summary-labels-moved-synthetic.json"));
  assert.equal(box.ok, false);
  assert.equal(box.reason, "LABEL_ORDER_CHANGED");
  assert.deepEqual(box.players, []);
});

test("NBA 16 · a stat that went DOWN between polls is reported (INFO), not hidden", () => {
  const live = normalizeNbaBoxscore(fixture("nba-summary-final.json"));
  const later = JSON.parse(JSON.stringify(live));
  later.players.find((p) => p.name === "Nikola Jokic").stats.pts = 15;
  assert.deepEqual(boxscoreDecreases(live, later).map((d) => [d.name, d.stat, d.from, d.to]), [["Nikola Jokic", "pts", 17, 15]]);
  assert.deepEqual(boxscoreDecreases(live, live), []);
});

/* ───────────────────────────── monotonicity guard ───────────────────────────── */

function run(seq) {
  let guard = emptyGuard();
  const out = [];
  for (const obs of seq) {
    const r = advanceNbaGuard(guard, obs);
    guard = r.guard;
    out.push(r);
  }
  return out;
}

test("NBA 17 · LIVE → PREGAME is a PROVIDER_REGRESSION: last-known-good held VERBATIM", () => {
  const pre = sb("nba-scoreboard-regress-pregame-synthetic.json", at(0));
  const q3 = sb("nba-scoreboard-live-q3-synthetic.json", at(60));
  const back = sb("nba-scoreboard-regress-pregame-synthetic.json", at(120));
  const [, r2, r3] = run([pre, q3, back]);
  assert.equal(r2.held, false);
  assert.equal(r3.held, true);
  assert.equal(r3.presented, q3, "the same object — no clock advanced, no score touched");
  assert.equal(r3.presented.fetchedAt, at(60), "its own fetch time, so freshness ages honestly");
  assert.equal(r3.discrepancies[0].kind, "PROVIDER_REGRESSION");
  assert.equal(r3.discrepancies[0].code, "LIFECYCLE_BACKWARDS");
  assert.deepEqual([r3.discrepancies[0].from.lifecycle, r3.discrepancies[0].to.lifecycle], ["LIVE", "PREGAME"]);
});

test("NBA 18 · FINAL → LIVE is held, and stays held however long the provider insists", () => {
  const fin = sb("nba-scoreboard-final.json", at(0));
  const seq = [fin, ...Array.from({ length: 6 }, (_, i) => sb("nba-scoreboard-live-q3-synthetic.json", at(60 * (i + 1))))];
  const rs = run(seq);
  for (const r of rs.slice(1)) {
    assert.equal(r.held, true);
    assert.equal(r.presented, fin);
    assert.equal(r.discrepancies[0].code, "LIFECYCLE_BACKWARDS");
  }
});

test("NBA 19 · a score decrease is held and flagged; only a PERSISTENT one is accepted as a correction", () => {
  const q3 = sb("nba-scoreboard-live-q3-synthetic.json", at(0));
  const low = (s) => sb("nba-scoreboard-regress-score-synthetic.json", at(s));
  const rs = run([q3, low(60), low(120), low(180)]);
  assert.equal(rs[1].held, true);
  assert.equal(rs[1].presented, q3);
  assert.deepEqual(rs[1].discrepancies.map((d) => [d.kind, d.code, d.side, d.fromScore, d.toScore, d.from.lifecycle, d.to.lifecycle]), [["PROVIDER_REGRESSION", "SCORE_DECREASED", "home", 70, 68, "LIVE", "LIVE"]]);
  assert.equal(rs[2].held, true, `still held below ${SCORE_CORRECTION_CONFIRM_POLLS} consecutive polls`);
  assert.equal(rs[3].held, false);
  assert.equal(rs[3].presented.home.score, 68);
  assert.equal(rs[3].discrepancies[0].kind, "PROVIDER_REGRESSION", "accepted, but still flagged");
  assert.equal(rs[3].discrepancies[0].resolution, "ACCEPTED_AS_PROVIDER_CORRECTION");

  // A different lower value restarts the count; a recovery clears it.
  const rs2 = run([q3, low(60), q3, low(120)]);
  assert.equal(rs2[2].held, false);
  assert.equal(rs2[3].held, true);
});

test("NBA 20 · halftime → Q3 advances; Q3 → Q1 is PERIOD_BACKWARDS; a score that vanishes is held", () => {
  const ht = sb("nba-scoreboard-halftime-synthetic.json", at(0));
  const q3 = sb("nba-scoreboard-live-q3-synthetic.json", at(60));
  const q1 = sb("nba-scoreboard-endq1-synthetic.json", at(120));
  const rs = run([ht, q3, q1]);
  assert.equal(rs[1].held, false);
  assert.equal(rs[2].held, true);
  assert.deepEqual(rs[2].discrepancies.map((d) => d.code), ["PERIOD_BACKWARDS"]);

  const blank = { ...q3, fetchedAt: at(180), home: { ...q3.home, score: null } };
  const rb = run([q3, blank]);
  assert.equal(rb[1].held, true);
  assert.equal(rb[1].discrepancies[0].code, "SCORE_DISAPPEARED");
});

test("NBA 21 · a canonical final is terminal; a failed read presents last-known-good", () => {
  const canon = applyCanonicalFinality(sb("nba-scoreboard-final.json", at(0)), FINALS_RECORD());
  const rs = run([canon, sb("nba-scoreboard-final.json", at(60)), sb("nba-scoreboard-live-q3-synthetic.json", at(120))]);
  assert.equal(rs[1].presented, canon, "a provisional re-read never demotes the record's final");
  assert.deepEqual(rs[1].discrepancies, []);
  assert.equal(rs[2].presented, canon);
  assert.equal(rs[2].discrepancies[0].code, "AFTER_CANONICAL_FINAL");

  const q3 = sb("nba-scoreboard-live-q3-synthetic.json", at(0));
  const rf = run([q3, null]);
  assert.equal(rf[1].presented, q3);
  assert.equal(rf[1].reason, "NO_OBSERVATION");
  assert.deepEqual(rf[1].discrepancies, [], "a failed read is a transport fact, not a provider regression");
  assert.equal(advanceNbaGuard(null, null).presented, null);
});

test("NBA 22 · forward progress is never flagged: pre → Q1 break → half → Q3 → OT → final → canonical", () => {
  const seq = [
    sb("nba-scoreboard-regress-pregame-synthetic.json", at(0)),
    sb("nba-scoreboard-endq1-synthetic.json", at(60)),
    sb("nba-scoreboard-halftime-synthetic.json", at(120)),
    sb("nba-scoreboard-live-q3-synthetic.json", at(180)),
    sb("nba-scoreboard-final.json", at(240)),
    applyCanonicalFinality(sb("nba-scoreboard-final.json", at(300)), FINALS_RECORD()),
  ];
  const rs = run(seq);
  assert.ok(rs.every((r) => !r.held && r.discrepancies.length === 0), JSON.stringify(rs.map((r) => r.discrepancies)));
  assert.equal(rs.at(-1).presented.lifecycle, "FINAL_CANONICAL");
});

/* ───────────────────────────── health · freshness · polling ───────────────────────────── */

test("NBA 23 · freshness reuses the shared bands on the reader's clock", () => {
  const q3 = sb("nba-scoreboard-live-q3-synthetic.json", T0);
  const now = Date.parse(T0);
  assert.equal(nbaFreshness(q3, now + FRESH_MAX_MS - 1).level, "FRESH");
  assert.equal(nbaFreshness(q3, now + FRESH_MAX_MS).level, "DELAYED");
  assert.equal(nbaFreshness(q3, now + DELAYED_MAX_MS).level, "STALE");
  assert.equal(nbaFreshness(sb("nba-scoreboard-halftime-synthetic.json", T0), now + DELAYED_MAX_MS).level, "STALE", "a halftime read ages too");
  assert.equal(nbaFreshness(sb("nba-scoreboard-final.json", T0), now + 10 * DELAYED_MAX_MS).level, "NOT_APPLICABLE");
  assert.equal(nbaFreshness({ ...q3, fetchedAt: "garbage" }, now).level, "STALE");
});

test("NBA 24 · polling plan: shared cadence while in play; provider stops at FINAL; all stops at FINAL_CANONICAL", () => {
  const pre = normalizeNbaScoreboard(fixture("nba-scoreboard-opening-pre.json"), T0)[0]; // tip 2026-10-20T19:00Z
  const tip = Date.parse(pre.startTime);
  assert.equal(nbaPollingPlan(pre, tip - IMMINENT_WINDOW_MS - 1).scoreboardMs, 300_000);
  assert.equal(nbaPollingPlan(pre, tip - 60_000).scoreboardMs, 60_000);
  assert.equal(nbaPollingPlan(pre, tip).summaryMs, null, "no 400 KB summary read before tip");
  const live = nbaPollingPlan(sb("nba-scoreboard-live-q3-synthetic.json"), 0);
  assert.equal(live.scoreboardMs, 30_000);
  assert.equal(live.summaryMs, SUMMARY_INTERVAL_MS);
  assert.equal(nbaPollingPlan(sb("nba-scoreboard-halftime-synthetic.json"), 0).summaryMs, SUMMARY_INTERVAL_MS);
  const prov = nbaPollingPlan(sb("nba-scoreboard-final.json"), 0);
  assert.deepEqual([prov.stop, prov.scoreboardMs, prov.summaryMs, prov.settlementCheckMs], [false, null, null, SETTLEMENT_CHECK_MS]);
  const canon = nbaPollingPlan(applyCanonicalFinality(sb("nba-scoreboard-final.json"), FINALS_RECORD()), 0);
  assert.deepEqual([canon.stop, canon.scoreboardMs, canon.summaryMs, canon.settlementCheckMs], [true, null, null, null]);
  assert.equal(nbaPollingPlan({ ...pre, lifecycle: "POSTPONED", state: "POSTPONED" }, 0).stop, true);
});

test("NBA 25 · provider health is transport-only: HEALTHY / DEGRADED / FAILING by consecutive failures", () => {
  assert.equal(assessProviderHealth([]).status, "NO_DATA");
  const ok = (s) => ({ at: at(s), ok: true });
  const ko = (s) => ({ at: at(s), ok: false });
  assert.equal(assessProviderHealth([ok(0), ok(60)]).status, "HEALTHY");
  const d = assessProviderHealth([ok(0), ko(60), ko(120)]);
  assert.deepEqual([d.status, d.consecutiveFailures, d.lastSuccessAt, d.failures], ["DEGRADED", 2, at(0), 2]);
  assert.equal(assessProviderHealth([ok(0), ko(60), ko(120), ko(180)]).status, "FAILING");
  assert.equal(assessProviderHealth([ko(0), ko(60), ko(120), ok(180)]).status, "HEALTHY", "recovers on the next good read");
});

test("NBA 26 · the shared lifecycle owner reads an NBA game with no NBA branch", () => {
  assert.equal(derivePresentationState({ envelope: sb("nba-scoreboard-final.json") }).state, "FINAL_PENDING_SETTLEMENT");
  assert.equal(derivePresentationState({ envelope: sb("nba-scoreboard-halftime-synthetic.json") }).state, "LIVE");
  const env = toLiveEnvelope(sb("nba-scoreboard-live-q3-synthetic.json"));
  assert.equal(env.schemaVersion, LIVE_SCHEMA_VERSION);
  assert.equal(env.state, "LIVE");
  assert.equal(env.sport, "NBA");
  assert.equal(env.period.clock, "5:42");
  assert.equal(env.competitors.home.score, 70);
  assert.equal(env.playerStats, null, "no NBA market key exists — the box is not forced into the market-keyed shape");
});

/* ───────────────────────────── progress vs frozen projection ───────────────────────────── */

test("NBA 27 · progress rows: live value beside the FROZEN projection; DNP renders '—', a real 0 renders '0'", () => {
  const frozen = fixture("nba-frozen-projection-401898719.json");
  const rows = buildNbaProgressRows({ box: normalizeNbaBoxscore(fixture("nba-summary-final.json")), frozen });
  assert.equal(rows.length, 6 * NBA_PROGRESS_STATS.length);
  for (const r of rows) {
    assert.equal(r.projection.label, FROZEN_PROJECTION_LABEL);
    assert.equal(r.projection.label, "pregame projection (frozen)");
    assert.equal(r.projection.frozenAt, "2026-10-16T13:55:48Z");
    assert.equal(r.marketLine, null);
    assert.ok(r.projection.p10 <= r.projection.p50 && r.projection.p50 <= r.projection.p90);
  }
  const row = (player, stat) => rows.find((r) => r.player === player && r.stat === stat);
  const gordon = row("Aaron Gordon", "pts");
  assert.equal(gordon.participation, "DNP");
  assert.equal(gordon.dnpReason, "COACH'S DECISION");
  assert.equal(gordon.liveValue, null);
  assert.equal(gordon.liveDisplay, "—", "absent is an em dash, never '0'");
  assert.equal(gordon.projection.p50, 15.99, "the frozen projection is still shown for a DNP");
  const tyus = row("Tyus Jones", "pts");
  assert.equal(tyus.liveValue, 0);
  assert.equal(tyus.liveDisplay, "0");
  const jokic = row("Nikola Jokic", "pts");
  assert.deepEqual([jokic.liveValue, jokic.liveMinutes, jokic.side], [17, 31, "away"]);
});

test("NBA 28 · progress rows mid-game: a missing live stat is null/'—', not 0; a player absent from the box is NOT_IN_BOX", () => {
  const frozen = fixture("nba-frozen-projection-401898719.json");
  const extra = { ...frozen, players: { ...frozen.players, home: [...frozen.players.home, { providerAthleteId: "999999", name: "Not On The Box", pts: { p10: 1, p50: 2, p90: 3 } }] } };
  const rows = buildNbaProgressRows({ box: normalizeNbaBoxscore(fixture("nba-summary-live-q3-synthetic.json")), frozen: extra });
  const tp = rows.find((r) => r.player === "Nikola Jokic" && r.stat === "threePm");
  assert.equal(tp.participation, "APPEARED");
  assert.equal(tp.liveValue, null);
  assert.equal(tp.liveDisplay, "—");
  const ghost = rows.filter((r) => r.player === "Not On The Box");
  assert.equal(ghost.length, 1, "only the projected stats get rows");
  assert.deepEqual([ghost[0].participation, ghost[0].liveValue, ghost[0].liveDisplay], ["NOT_IN_BOX", null, "—"]);
  // Before tip: no box at all → every row null, every projection still present.
  const pre = buildNbaProgressRows({ box: { ok: true, available: false, players: [] }, frozen });
  assert.ok(pre.every((r) => r.liveValue === null && r.liveDisplay === "—" && r.participation === "NOT_IN_BOX"));
  // A failed (fail-closed) box is treated as no box, never as zeros.
  const closed = buildNbaProgressRows({ box: normalizeNbaBoxscore(fixture("nba-summary-labels-moved-synthetic.json")), frozen });
  assert.ok(closed.every((r) => r.liveValue === null));
  assert.equal(displayLiveValue(0), "0");
  assert.equal(displayLiveValue(undefined), "—");
  assert.equal(displayLiveValue(NaN), "—");
});

test("NBA 29 · progress rows carry no live probability, pace or verdict of any kind", () => {
  const rows = buildNbaProgressRows({ box: normalizeNbaBoxscore(fixture("nba-summary-live-q3-synthetic.json")), frozen: fixture("nba-frozen-projection-401898719.json") });
  const keys = new Set();
  const walk = (o) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { keys.add(k); walk(v); } };
  rows.forEach(walk);
  for (const k of keys) assert.equal(/prob|pace|chance|onTrack|projectedFinal|hit|edge|ev\b/i.test(k), false, `row key "${k}" implies inference`);
});

/* ───────────────────────────── provenance + internal-only ───────────────────────────── */

test("NBA 30 · every NBA fixture is accounted for: real ones SANITIZED/EXCERPT, synthetic ones marked synthetic", () => {
  const prov = fixture("nba-fixtures.provenance.json");
  const listed = new Map([...prov.real, ...prov.synthetic].map((e) => [e.file, e]));
  const onDisk = fs.readdirSync(FIX).filter((f) => f.startsWith("nba-") && f !== "nba-fixtures.provenance.json");
  assert.deepEqual([...listed.keys()].sort(), onDisk.sort());
  for (const f of onDisk) {
    const e = listed.get(f);
    const note = fixture(f)._note;
    if (e.synthetic) {
      assert.equal(f.endsWith("-synthetic.json"), true, f);
      assert.match(note, /^SYNTHETIC/, f);
      assert.ok(e.edits.length > 0 && e.derivedFrom, f);
    } else {
      assert.equal(e.synthetic, false);
      assert.match(note, /^(SANITIZED real|EXCERPT)/, f);
    }
  }
});

test("NBA 31 · the adapter is pure: no I/O, no URL, no banned live phrase", () => {
  const src = fs.readFileSync(path.join(here, "espn-nba.mjs"), "utf8");
  assert.ok(src.length > 4000);
  const { code, strings } = partition(src);
  assert.equal(/https?:\/\//.test(code + strings), false, "takes parsed payloads only");
  assert.equal(/\bfetch\s*\(|node:fs|node:http|process\.env|Date\.now\(/.test(code), false, "no I/O, no env, no wall clock");
  const copy = renderedStrings(src);
  for (const rx of [/\bon pace\b/i, /\bon track\b/i, /\blive win probability\b/i, /\bchance to hit\b/i, /\bsafe bet\b/i, /\bguaranteed\b/i]) {
    assert.equal(rx.test(copy), false, `renders ${rx}`);
  }
});

test("NBA 32 · NOT PUBLICLY ENABLED: no public surface imports the adapter and the gateway still refuses NBA", () => {
  const roots = ["src/app", "src/components", "api"].map((r) => path.join(APP, r));
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(tsx?|mjs|js)$/.test(e.name) && fs.readFileSync(f, "utf8").includes("espn-nba")) hits.push(path.relative(APP, f));
    }
  };
  roots.forEach(walk);
  assert.deepEqual(hits, []);
  const core = fs.readFileSync(path.join(APP, "api/_live-core.mjs"), "utf8");
  assert.match(core, /export const SUPPORTED_SPORTS = Object\.freeze\(\["nfl", "mlb"\]\);/);
});
