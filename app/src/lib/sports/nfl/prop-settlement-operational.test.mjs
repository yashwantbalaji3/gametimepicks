/**
 * Session 9 · B — NFL prop settlement made OPERATIONAL: the scheduled post-final sweep, the ledger's CI
 * provenance, and PROVEN derived from canonical ledger evidence instead of "a workflow mentions the settler".
 *
 * Replays ESPN's own summary for DET @ BUF (401872932, 2026-09-18) — the repository's real fixture — through
 * the SAME producer path the sweep runs (buildLiveRows → settle → foldEventIntoLedger). Mutation probes land
 * on a correctly settled row / input and must be caught.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  POST_FINAL_LOOKBACK_MS, POST_FINAL_MIN_AGE_MS, buildLiveRows, promoteFinality, selectPostFinalTargets, settle, shouldPollEvent,
} from "./live-prop-state.mjs";
import { buildLedger, foldEventIntoLedger } from "./prop-settlement-ledger.mjs";
import { SUPPORT, deriveSettlementSupport, provesSettlement, schedulesPostFinalSettlement } from "./prop-settlement-support.mjs";

const APP = process.cwd();
const SUMMARY = JSON.parse(fs.readFileSync(path.join(APP, "src/lib/sports/nfl/__fixtures__/espn-nfl-summary-401872932.json"), "utf8"));
const WF = (f) => fs.readFileSync(path.join(APP, "..", ".github/workflows", f), "utf8");
const clone = (x) => JSON.parse(JSON.stringify(x));
const KICK = "2026-09-18T00:15Z";
const H = 3600_000;
const at = (hoursAfterKick) => new Date(Date.parse("2026-09-18T00:15:00Z") + hoursAfterKick * H).toISOString();

/** A pregame board for the fixture game: Goff passing (priced), St. Brown receiving + ATD (priced), Gibbs ATD. */
const BOARD = {
  artifact: "nfl-player-board", providerEventId: "401872932", kickoffUtc: KICK, matchup: "DET @ BUF",
  generatedAt: "2026-09-17T22:00:00Z",
  families: { player_pass_yds: { state: "ESTIMATE" }, player_reception_yds: { state: "PUBLISHED" }, player_receptions: { state: "PUBLISHED" }, anytime_td: { state: "PUBLISHED" } },
  players: [
    { playerId: "nfl-athlete-3046779", name: "Jared Goff", team: "DET", participation: "ACTIVE_PROJECTED",
      markets: { player_pass_yds: { median: 262, p10: 190, p90: 330, market: { line: 254.5, overOdds: -112, underOdds: -108, sportsbook: "draftkings", capturedAt: "2026-09-17T21:00:00Z" } } } },
    { playerId: "nfl-athlete-4374302", name: "Amon-Ra St. Brown", team: "DET", participation: "ACTIVE_PROJECTED",
      markets: {
        player_reception_yds: { median: 88, p10: 40, p90: 140, market: { line: 84.5, overOdds: -115, underOdds: -105, sportsbook: "draftkings", capturedAt: "2026-09-17T21:00:00Z" } },
        player_receptions: { median: 7.2, p10: 4, p90: 10, market: { line: 6.5, overOdds: -140, underOdds: 110, sportsbook: "draftkings", capturedAt: "2026-09-17T21:00:00Z" } },
        anytime_td: { probability: 0.48, market: { yesOdds: 110, sportsbook: "draftkings", capturedAt: "2026-09-17T21:00:00Z" } },
      } },
    { playerId: "nfl-athlete-4429795", name: "Jahmyr Gibbs", team: "DET", participation: "ACTIVE_PROJECTED",
      markets: { anytime_td: { probability: 0.55, market: { yesOdds: -150, sportsbook: "draftkings", capturedAt: "2026-09-17T21:00:00Z" } } } },
    { playerId: "nfl-athlete-99999999", name: "Never Played", team: "DET", participation: "AVAILABLE_ROLE_UNCERTAIN",
      markets: { anytime_td: { probability: 0.05, market: { yesOdds: 2500, sportsbook: "draftkings", capturedAt: "2026-09-17T21:00:00Z" } } } },
  ],
};
const run = ({ board = BOARD, summary = SUMMARY, prior = null, now = at(14) } = {}) =>
  buildLiveRows({ providerEventId: "401872932", kickoffUtc: KICK, board, summary, prior, observedAt: now });
const artifactOf = (r, now = at(14), extra = {}) => ({
  providerEventId: "401872932", matchup: "DET @ BUF", kickoffUtc: KICK, phase: "FINAL",
  finality: r.finality, finalFirstObservedAt: r.finalFirstObservedAt, observedAt: now, rows: r.rows, ...extra,
});
const CI = { workflow: "nfl-event-window", runId: "123456" };
const rowOf = (rows, id) => rows.find((r) => r.settlementId === id || r.predictionId === id);

/* ---------------------------------------------------------------- the post-final sweep */

test("the sweep targets games that are OVER: ≥ 3.5 h after kickoff, ≤ 14 days, one per event, never a live game", () => {
  const k = Date.parse("2026-09-18T00:15:00Z");
  const boards = [BOARD, { ...BOARD, generatedAt: "2026-09-17T23:00:00Z" }, // a -rev of the same event
    { ...BOARD, providerEventId: "2", kickoffUtc: "2026-10-01T00:15Z" }, { ...BOARD, providerEventId: "3", kickoffUtc: "2026-08-20T00:15Z" }];
  const ids = (nowMs) => selectPostFinalTargets({ boards, nowMs }).targets.map((t) => t.providerEventId);
  assert.deepEqual(ids(k + 2 * H), [], "still playing: not a post-final target");
  assert.deepEqual(ids(k + POST_FINAL_MIN_AGE_MS), ["401872932"], "one target for the event and its -rev board");
  assert.ok(!ids(k + POST_FINAL_LOOKBACK_MS + H).includes("401872932"), "beyond the lookback");
  assert.ok(!ids(Date.parse("2026-10-01T05:00:00Z")).includes("3"), "a game six weeks old is never re-polled");
  assert.ok(ids(Date.parse("2026-10-01T05:00:00Z")).includes("2"), "a Thursday-night final the next morning");
});

test("a contested fixture (board vs schedule kickoff) is excluded from the sweep, not settled", () => {
  const r = selectPostFinalTargets({ boards: [BOARD], scheduleRows: [{ providerEventId: "401872932", dateUtc: "2026-09-18T17:00Z" }], nowMs: Date.parse(at(14)) });
  assert.deepEqual(r.targets, []);
  assert.equal(r.disagreements.length, 1);
});

test("first FINAL read settles PROVISIONAL; a read inside the window re-polls; after it, promotion is CANONICAL and fetch-free", () => {
  const first = run({ now: at(14) });
  assert.equal(first.finality, "PROVISIONAL");
  const art = artifactOf(first);
  assert.deepEqual([shouldPollEvent(art, at(15)).poll, shouldPollEvent(art, at(17.5)).poll], [true, false]);
  const promoted = promoteFinality(art, at(17.5));
  assert.equal(promoted.finality, "CANONICAL");
  assert.ok(promoted.rows.filter((r) => r.settlement).every((r) => r.settlement.finality === "CANONICAL"));
  assert.equal(promoteFinality(promoted, at(30)), null, "promotion happens once");
});

test("a frozen block is minted ONLY from evidence that predates kickoff — a post-kickoff board or price mints nothing", () => {
  const late = run({ board: { ...BOARD, generatedAt: "2026-09-18T01:00:00Z" } });
  assert.ok(late.rows.every((r) => r.frozen === null) && late.frozenRefusedNoPregameSnapshot > 0);
  const latePrice = clone(BOARD); latePrice.players[1].markets.anytime_td.market.capturedAt = "2026-09-18T00:20:00Z";
  const r = run({ board: latePrice });
  assert.equal(rowOf(r.rows, "401872932:nfl-athlete-4374302:anytime_td").frozen, null, "post-kickoff price: no frozen block");
  const led = foldEventIntoLedger([], artifactOf(r), at(14), CI);
  assert.equal(rowOf(led.rows, "401872932:nfl-athlete-4374302:anytime_td"), undefined, "and the ledger admits nothing for it");
});

test("the real fixture settles every family against the frozen pregame market, by ESPN id", () => {
  const r = run();
  const s = (id) => rowOf(r.rows, id).settlement;
  assert.deepEqual([s("401872932:nfl-athlete-3046779:player_pass_yds").finalStat, s("401872932:nfl-athlete-3046779:player_pass_yds").lineResult], [327, "OVER"]);
  assert.equal(s("401872932:nfl-athlete-3046779:player_pass_yds").forecastResult, "NOT_PUBLISHED", "an ESTIMATE family is never graded as our forecast");
  assert.deepEqual([s("401872932:nfl-athlete-4374302:player_reception_yds").finalStat, s("401872932:nfl-athlete-4374302:player_reception_yds").lineResult, s("401872932:nfl-athlete-4374302:player_reception_yds").forecastResult], [142, "OVER", "WIN"]);
  assert.deepEqual([s("401872932:nfl-athlete-4374302:player_receptions").finalStat, s("401872932:nfl-athlete-4374302:player_receptions").lineResult], [9, "OVER"]);
  assert.deepEqual([s("401872932:nfl-athlete-4374302:anytime_td").lineResult, s("401872932:nfl-athlete-4429795:anytime_td").lineResult], ["YES", "YES"]);
  assert.equal(s("401872932:nfl-athlete-99999999:anytime_td").state, "NO_MEASUREMENT", "unmeasured is NOT 'no TD'");
});

test("the ledger records which run admitted a row — CI-admitted rows carry the run id, local folds carry null", () => {
  const r = run();
  const ci = buildLedger({ artifacts: [artifactOf(r)], nowIso: at(14), producedBy: CI });
  assert.ok(ci.rows.every((x) => x.admittedBy?.runId === "123456"));
  const local = buildLedger({ artifacts: [artifactOf(r)], nowIso: at(14) });
  assert.ok(local.rows.every((x) => x.admittedBy === null));
  const again = buildLedger({ prior: { rows: ci.rows }, artifacts: [artifactOf(r)], nowIso: at(20), producedBy: { workflow: "x", runId: "999" } });
  assert.ok(again.rows.every((x) => x.admittedBy.runId === "123456"), "admission provenance is written once and never moved");
});

/* ---------------------------------------------------------------- PROVEN, derived from evidence */

const canonicalLedger = (producedBy = CI) => {
  const r = run();
  const first = buildLedger({ artifacts: [artifactOf(r)], nowIso: at(14), producedBy });
  const promoted = promoteFinality(artifactOf(r), at(17.5));
  return buildLedger({ prior: { rows: first.rows }, artifacts: [promoted], nowIso: at(17.5), producedBy }).rows;
};

test("PROVEN needs a CANONICAL, OBSERVED, graded, frozen, CI-admitted row of that family — nothing less", () => {
  const rows = canonicalLedger();
  const d = deriveSettlementSupport({ ledgerRows: rows, workflowTexts: [WF("nfl-event-window.yml")] });
  assert.deepEqual(d.provenFamilies, ["anytime_td", "player_pass_yds", "player_reception_yds", "player_receptions"]);
  assert.equal(d.supportFor("player_rush_yds"), SUPPORT.SCHEDULED_UNPROVEN, "a family with no canonical row is not proven by its neighbours");
  assert.equal(deriveSettlementSupport({ ledgerRows: canonicalLedger(null), workflowTexts: [WF("nfl-event-window.yml")] }).provenFamilies.length, 0, "a local fold proves nothing");
  const provisional = buildLedger({ artifacts: [artifactOf(run())], nowIso: at(14), producedBy: CI }).rows;
  assert.equal(deriveSettlementSupport({ ledgerRows: provisional }).provenFamilies.length, 0, "PROVISIONAL is not proof");
});

test("SCHEDULED needs a scheduled workflow that runs the sweep AND the fold — a mention, a dispatch-only file or a disabled one is not", () => {
  assert.equal(schedulesPostFinalSettlement(WF("nfl-event-window.yml")), true);
  assert.equal(schedulesPostFinalSettlement(WF("nfl-live-props-free.yml")), false, "dispatch-only");
  assert.equal(schedulesPostFinalSettlement("on:\n  workflow_dispatch:\n# settle-nfl-live-props.mjs --write\n# capture-live-props.mjs --post-final\n"), false);
  assert.equal(deriveSettlementSupport({ ledgerRows: [], workflowTexts: [] }).supportFor("anytime_td"), SUPPORT.UNSUPPORTED);
});

test("the scheduled settle step is keyless, survives an earlier failure, and commits what it settles", () => {
  const wf = WF("nfl-event-window.yml");
  const step = wf.slice(wf.indexOf("- name: Settle yesterday's and today's current artifacts"), wf.indexOf("- name: Publish interval calibration"));
  assert.match(step, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(step, /capture-live-props\.mjs --now "\$NOW" --post-final/);
  assert.ok(step.indexOf("--post-final") < step.indexOf("settle-nfl-live-props.mjs"), "sweep before fold");
  assert.ok(!/secrets\.|ODDS_API_KEY/.test(step), "no key in the settlement step");
  const commit = wf.slice(wf.indexOf("- name: Commit settlement receipts"), wf.indexOf("- name: Notify on failure"));
  assert.match(commit, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(commit, /git add data\/internal\/nfl\/prop-settlement\//);
});

/* ---------------------------------------------------------------- mutation probes (B11 / §13) */

test("settlement mutation probes land and are caught", () => {
  const ok = run();
  const id = "401872932:nfl-athlete-4374302:player_reception_yds";
  const base = rowOf(ok.rows, id).settlement;
  const probes = {
    "wrong player (another athlete's stat)": () => settle({ summary: SUMMARY, espnId: "3046779", family: "player_reception_yds", frozenLine: 84.5, projection: 88, familyState: "PUBLISHED", settledAt: at(14) }),
    "wrong family (receptions read as yards)": () => settle({ summary: SUMMARY, espnId: "4374302", family: "player_receptions", frozenLine: 84.5, projection: 88, familyState: "PUBLISHED", settledAt: at(14) }),
    "wrong line (a later, moved line)": () => settle({ summary: SUMMARY, espnId: "4374302", family: "player_reception_yds", frozenLine: 150.5, projection: 88, familyState: "PUBLISHED", settledAt: at(14) }),
  };
  for (const [name, f] of Object.entries(probes)) {
    const m = f();
    assert.notDeepEqual([m.finalStat, m.lineResult], [base.finalStat, base.lineResult], `${name}: probe did not land`);
  }
  // wrong event: a different game's summary for the same player id is a different final fact
  const other = clone(SUMMARY);
  for (const g of other.boxscore.players) for (const st of g.statistics) for (const a of st.athletes ?? []) if (String(a.athlete?.id) === "4374302" && st.name === "receiving") a.stats[1] = "12";
  assert.notEqual(settle({ summary: other, espnId: "4374302", family: "player_reception_yds", frozenLine: 84.5, projection: 88, familyState: "PUBLISHED", settledAt: at(14) }).lineResult, base.lineResult);
  // missing final → loss / pending → loss: an unfinished game NEVER settles and never enters the ledger
  const live = clone(SUMMARY); live.header.competitions[0].status.type = { state: "in", completed: false };
  const pend = run({ summary: live });
  assert.ok(pend.rows.every((r) => r.settlement.state === "PENDING" && r.settlement.lineResult === null));
  assert.equal(foldEventIntoLedger([], artifactOf(pend, at(3), { phase: "IN_PROGRESS" }), at(3), CI).rows.length, 0);
  // ATD unmeasured → no TD
  const unmeasured = rowOf(foldEventIntoLedger([], artifactOf(ok), at(14), CI).rows, "401872932:nfl-athlete-99999999:anytime_td");
  assert.deepEqual([unmeasured.measurementState, unmeasured.lineResult], ["NO_MEASUREMENT", null]);
  assert.equal(provesSettlement({ ...unmeasured, finality: "CANONICAL" }), false, "an unmeasured row proves nothing");
  // duplicate settlement: a repeated FINAL read adds no row and moves nothing
  const once = foldEventIntoLedger([], artifactOf(ok), at(14), CI);
  const twice = foldEventIntoLedger(once.rows, artifactOf(ok), at(15), CI);
  assert.deepEqual([twice.added, twice.rows.length], [0, once.rows.length]);
  // receipt rewrite: a changed answer appends a correction; original, settledAt and frozen never move
  const changed = clone(artifactOf(ok)); rowOf(changed.rows, id).settlement.finalStat = 99; rowOf(changed.rows, id).settlement.lineResult = "OVER";
  rowOf(changed.rows, id).frozen.market.line = 120.5;
  const after = rowOf(foldEventIntoLedger(once.rows, changed, at(16), CI).rows, id);
  const before = rowOf(once.rows, id);
  assert.deepEqual([after.original, after.settledAt, after.frozen.market.line], [before.original, before.settledAt, 84.5]);
  assert.equal(after.corrections.length, 1);
});
