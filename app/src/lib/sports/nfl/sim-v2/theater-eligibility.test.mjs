/**
 * NFL Simulation Theater availability (row E, PD 2026-11-11): eligibility@1 on the sim-v2 personnel and the Theater.
 *   INELIGIBLE never simulated (Achane, INC-2026-11-08-01, from the committed publish-time slices) · UNKNOWN never
 *   simulated either (main's fail-closed rule) and, if ever present, labelled and never featured · questionable (R6)
 *   simulated at the usual share and never featured · R5 QB-blind ⇒ the scenario banner · receipts carry the
 *   stamp-free eligibility snapshot id · deterministic.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/sim-v2/theater-eligibility.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileParams, prepareTeamPlayers } from "./engine.mjs";
import { calibrate, runBatch } from "./simulate.mjs";
import { buildNflSimulationReceipt, playersFromRoleShares, validateSimulationReceipt } from "./receipt.mjs";
import { eligibilitySnapshot, playerAvailability, teamEligibilityRecords } from "./personnel-eligibility.mjs";
import { shareExclusions } from "../participation-eligibility.mjs";
import { recoverFromHistory } from "../../injuries/carry-forward.mjs";
import { AVAILABILITY_LABEL, availabilityLabel, featuredTdScorers, theaterFeaturable } from "../../../simulation-theater/run-box-availability.mjs";
import { R5_BANNER_REASON, r5TheaterBanner } from "../../../simulation-theater/r5-banner.mjs";

globalThis.React = React; // the component uses the automatic JSX runtime under Next; tsx compiles classic
const { default: RunPlayerBox } = await import("../../../../components/simulation-theater/RunPlayerBox.tsx");

const APP = process.cwd();
const FX = JSON.parse(fs.readFileSync(path.join(APP, "src/lib/availability/__fixtures__/incidents-2026-11.json"), "utf8"));
const A = FX.achane;
const ACHANE = "nfl-athlete-4429160";
const id = (n) => `nfl-athlete-${n}`;
const fam = (rows) => ({ players: rows.map(([pid, share]) => ({ playerId: id(pid), share })) });
// MIA's role shares as they stood: Achane holds carries and targets
const MIA = {
  passAttempts: fam([[4242512, 1]]),
  rushAttempts: fam([[4429160, 0.5], [4682745, 0.3], [4711533, 0.2]]),
  targets: fam([[4429160, 0.15], [4569603, 0.4], [4367209, 0.25], [4869961, 0.2]]),
};
const history = recoverFromHistory({ nowIso: A.injuriesAtPublish.generatedAt, captures: [A.lastCaptureListingHim, A.injuriesAtPublish], roster: A.rosterAtPublish });
const ctxWithHistory = { asOf: A.publishedAt, injuries: { generatedAt: A.injuriesAtPublish.generatedAt, entries: history.entries }, roster: A.rosterAtPublish, teamIdByAbbr: { MIA: "15" } };
const ctxCaptureOnly = { asOf: A.publishedAt, injuries: A.injuriesAtPublish, roster: A.rosterAtPublish, teamIdByAbbr: { MIA: "15" } };

const compiled = compileParams(JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/nfl/sim-v2/drive-params-2015-2025.json"), "utf8")));
const OPP = { players: [
  { playerId: "o-qb", name: "QB", position: "QB", passShare: 1, targetShare: 0, carryShare: 0.1, catchRate: null, ypr: null, ypc: 4.5 },
  { playerId: "o-rb", name: "RB", position: "RB", passShare: 0, targetShare: 0.15, carryShare: 0.7, catchRate: 0.75, ypr: 7, ypc: 4.2 },
  { playerId: "o-wr", name: "WR", position: "WR", passShare: 0, targetShare: 0.6, carryShare: 0, catchRate: 0.64, ypr: 12, ypc: null },
] };

function receiptFor(ctx) {
  const excluded = shareExclusions(MIA, "MIA", ctx);
  const home = playersFromRoleShares(MIA, excluded);
  const prep = [prepareTeamPlayers(home), prepareTeamPlayers(OPP)];
  const records = teamEligibilityRecords(MIA, "MIA", ctx);
  const eligibility = eligibilitySnapshot({ MIA: records });
  const anchors = { home: 21, away: 20, source: "test", modelVersion: { forecastModel: "t" } };
  const calibration = calibrate({ compiled, anchors, baseSeed: "e1e1e1e1", runs: 300 });
  const batch = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed: "e1e1e1e1", runs: 600 });
  const R = buildNflSimulationReceipt({ event: { eventId: "401873040", kickoffUtc: "2026-11-08T18:00Z", home: { abbr: "MIA" }, away: { abbr: "OPP" } }, compiled, paramsRef: { file: "x" }, anchors, calibration, prep, batch, baseSeed: "e1e1e1e1", inputHash: "0", generatedAt: A.publishedAt, inputs: { eligibilitySnapshotId: eligibility.snapshotId }, eligibility, playerAvailability: playerAvailability(records, excluded) });
  return { R, excluded, records, prep, batch };
}

test("Achane (IR carried off the feed): eligibility@1 resolves him INELIGIBLE and he is ABSENT from the simulated personnel", () => {
  const { R, excluded, records, prep } = receiptFor(ctxWithHistory);
  assert.equal(records.get(ACHANE).state, "INELIGIBLE");
  assert.deepEqual(records.get(ACHANE).reasons, ["LONG_TERM_DESIGNATION"]);
  assert.ok(excluded.has(ACHANE));
  assert.ok(!prep[0].slots.some((s) => s.playerId === ACHANE), "no engine slot");
  assert.ok(!R.playerStatDistributions.some((p) => p.playerId === ACHANE), "no receipt row");
  assert.ok(!(ACHANE in R.playerAvailability), "an excluded player is not in the simulated availability");
  assert.ok(prep[0].slots.some((s) => s.playerId === id(4682745)), "his carries go to the available backs");
  assert.deepEqual(validateSimulationReceipt(R), []);
  assert.equal(R.validation.failedRuns, 0, "conservation holds on every run without him");
});

test("UNKNOWN (the capture alone, R2/R3) is also kept out of the personnel — main's fail-closed rule — and would be labelled, never featured", () => {
  const { R, excluded, records } = receiptFor(ctxCaptureOnly);
  assert.equal(records.get(ACHANE).state, "UNKNOWN");
  assert.ok(excluded.has(ACHANE), "shareExclusions removes every non-ELIGIBLE player");
  assert.ok(!R.playerStatDistributions.some((p) => p.playerId === ACHANE));
  assert.equal(R.eligibilitySnapshot.unknown, 1);
  const map = { [ACHANE]: { state: "UNKNOWN", reasons: ["SOURCES_DISAGREE"], featurable: false } };
  assert.equal(availabilityLabel(map, ACHANE), AVAILABILITY_LABEL.UNKNOWN);
  assert.equal(theaterFeaturable(map, ACHANE), false);
});

test("receipts carry the eligibility snapshot id: stamp-free, changes with a state, recorded in inputs; deterministic", () => {
  const a = receiptFor(ctxWithHistory).R;
  assert.match(a.eligibilitySnapshot.snapshotId, /^eligibility@1:[0-9a-f]{16}$/);
  assert.equal(a.inputSnapshotIds.eligibilitySnapshotId, a.eligibilitySnapshot.snapshotId);
  assert.deepEqual([a.eligibilitySnapshot.players, a.eligibilitySnapshot.ineligible], [7, 1]);
  assert.equal(JSON.stringify(receiptFor(ctxWithHistory).R), JSON.stringify(a), "same inputs ⇒ byte-identical receipt");
  // the same states with re-captured sources (new fetch stamps) ⇒ the same id
  const restamped = teamEligibilityRecords(MIA, "MIA", { ...ctxWithHistory, asOf: "2026-11-08T16:55:00Z" });
  assert.equal(eligibilitySnapshot({ MIA: restamped }).snapshotId, a.eligibilitySnapshot.snapshotId);
  assert.notEqual(receiptFor(ctxCaptureOnly).R.eligibilitySnapshot.snapshotId, a.eligibilitySnapshot.snapshotId, "Achane UNKNOWN instead of INELIGIBLE ⇒ another id");
});

test("questionable (R6): simulated at the usual share, labelled, never in the featured touchdown line", () => {
  const q = id(4682745);
  const map = { [q]: { state: "ELIGIBLE", flags: ["QUESTIONABLE"], featurable: false }, [id(4711533)]: { state: "ELIGIBLE", featurable: true } };
  const scorers = [{ id: q, name: "Jaylen Wright", tds: 2 }, { id: id(4711533), name: "Ollie Gordon II", tds: 1 }, { id: "DEF_ST", name: "Defense / special teams", tds: 1 }];
  assert.deepEqual(featuredTdScorers(scorers, map), { featured: [scorers[1], scorers[2]], notFeatured: 2 });
  assert.equal(availabilityLabel(map, q), AVAILABILITY_LABEL.NOT_FEATURABLE);
  assert.deepEqual(featuredTdScorers(scorers, null).featured, scorers, "a receipt without the map keeps its display");
  // the share is untouched: a questionable player is ELIGIBLE, so shareExclusions keeps him
  assert.ok(!shareExclusions(MIA, "MIA", ctxWithHistory).has(q));
});

test("render: the run box labels flagged rows and the touchdown line names only featurable scorers", () => {
  const row = (pid, name, extra) => ({ id: pid, name, position: "RB", ...extra });
  const side = (abbr, rushing, td) => ({ abbr, passing: [], rushing, receiving: [], tdScorers: td, turnovers: [], team: { points: 14, cmp: 0, passAtt: 0, passYds: 0, sacks: 0, sackYds: 0, netPassYds: 0, rushAtt: 20, rushYds: 90, turnovers: 0, int: 0, fumLost: 0, fgMade: 0, fgAtt: 0, xpMade: 2, xpAtt: 2, twoMade: 0, twoAtt: 0, defTd: 0, safeties: 0 } });
  const box = { version: "nfl-run-player-box@1", title: "t", runIndex: 7, final: { home: 14, away: 0, overtime: false },
    home: side("MIA", [row("u1", "Unverified Back", { rushAtt: 10, rushYds: 40, rushTd: 1, fumLost: 0 }), row("e1", "Cleared Back", { rushAtt: 10, rushYds: 50, rushTd: 1, fumLost: 0 })], [{ id: "u1", name: "Unverified Back", tds: 1 }, { id: "e1", name: "Cleared Back", tds: 1 }]),
    away: side("OPP", [], []) };
  const availability = { u1: { state: "UNKNOWN", featurable: false }, e1: { state: "ELIGIBLE", featurable: true } };
  const html = renderToStaticMarkup(React.createElement(RunPlayerBox, { box, runIndex: 7, availability }));
  assert.match(html, /Unverified Back · RB<span class="strb-avail"> · availability not verified<\/span>/);
  assert.match(html, /data-strb-player="u1" data-strb-availability="flagged"/);
  assert.match(html, /<b>Touchdowns<\/b> · Cleared Back · 1 by players not featured/);
  assert.doesNotMatch(html.split("<b>Touchdowns</b>")[1].split("</p>")[0], /Unverified Back/);
  const legacy = renderToStaticMarkup(React.createElement(RunPlayerBox, { box, runIndex: 7 }));
  assert.match(legacy, /<b>Touchdowns<\/b> · Unverified Back, Cleared Back/);
});

test("R5: a QB-blind official forecast puts the scenario banner and its reason on the Theater; others carry none", () => {
  for (const g of FX.qbBlind) assert.deepEqual(r5TheaterBanner({ teamInputs: g.teamInputs }), { code: "R5_QB_BLIND", title: "Scenario only", reason: R5_BANNER_REASON }, g.matchup);
  assert.equal(r5TheaterBanner({ teamInputs: { state: "NO_STARTING_QB_ABSENCE" } }), null);
  assert.equal(r5TheaterBanner(null), null, "no team-input record: no banner (unknown is a different rule)");
  const src = fs.readFileSync(path.join(APP, "src/components/simulation-theater/PublicTheaterSection.tsx"), "utf8");
  assert.match(src, /nflOfficialOfRecord\(path\.join\(REPO_ROOT, "app", "public"\), eventId\)/, "the official forecast of record, never rebuilt");
  assert.match(src, /data-stp-r5=\{r5\.code\}/);
});
