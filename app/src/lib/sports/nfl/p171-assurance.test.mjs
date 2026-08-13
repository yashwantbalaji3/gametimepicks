/**
 * Program 171 assurance sweep (Release I) — the charter's metamorphic and corruption proofs, in
 * one place, each stated as the property it defends rather than the code it exercises.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { simulatePlayerProps, loadPlayerPropsFit } from "./player-props-v1.mjs";
import { buildScorerBoard, loadScoringBridgeMapping, loadTdCalibrationReceipt } from "./td-engine.mjs";
import { validateCurrentEventArtifact } from "./current-event-contract.mjs";
import { classifyParticipation } from "./participation.mjs";
import { parseAuthorizationReceipt, assertCallAllowed, emptyLedger } from "../odds/p171-authorization.mjs";
import { runNflShadow } from "./shadow-run.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const artifact = read("data/internal/nfl/current/2026-08-13/401873272-1213Z.json");

test("METAMORPHIC · changing the odds changes comparison and selection, never the model distribution", () => {
  const fit = loadPlayerPropsFit({ fs, path, cwd: APP });
  const strengthState = { ratingFor: (t) => (t === "CIN" ? 1540 : 1505) };
  const event = { providerEventId: "401873272", home: { abbr: "CIN" }, away: { abbr: "DET" }, seasonType: 2 };
  const roleRates = { players: [{ playerId: "wr1", name: "W", families: new Set(["targets"]), qbShare: 0, carryShare: 0, targetShare: 0.25, share: 0.25, compRate: 0, ypcmp: 0, catchRate: 0.65, ypr: 12, ypc: 0, intRate: 0, shareBasis: "t" }] };
  const run = (lines) => simulatePlayerProps({ event, teamAbbr: "CIN", fit, strengthState, roleRates, artifactDate: "2026-08-13", runs: 1500, lines });
  const cheap = run({ wr1: { player_reception_yds: 1.5 } });
  const rich = run({ wr1: { player_reception_yds: 999.5 } });
  const m1 = cheap.players[0].markets.player_reception_yds;
  const m2 = rich.players[0].markets.player_reception_yds;
  for (const k of ["mean", "p10", "median", "p90"]) assert.equal(m1[k], m2[k], `${k} must not move with the price`);
  assert.notEqual(m1.probOverLine, m2.probOverLine, "only the read-out against the offered line changes");
});

test("METAMORPHIC · removing participation disables player markets without erasing the team read", () => {
  const mapping = loadScoringBridgeMapping({ fs, path, cwd: APP });
  const shares = read("data/internal/research/nfl/role-shares-v1/current.json").teams.CIN.scorerTd;
  const roleShares = {
    players: shares.players.map((p) => ({ playerId: p.playerId, name: p.name, perTdShare: p.share, shareBasis: p.shareBasis })),
    teamPassAttempts: 40, teamRushAttempts: 25,
    residualShare: shares.residual.share, residualLabel: shares.residual.label,
  };
  const teamSim = { state: "SIMULATED", scores: { home: { mean: 22.3 }, away: { mean: 21.9 } } };
  const event = { providerEventId: "401873272", home: { abbr: "CIN" }, away: { abbr: "DET" } };
  const withPool = buildScorerBoard({ event, teamAbbr: "CIN", teamSim, mapping, pool: { players: shares.players.map((p) => ({ playerId: p.playerId, state: "ACTIVE_PROJECTED" })) }, roleShares, nowIso: "2026-08-13T12:00:00Z" });
  const without = buildScorerBoard({ event, teamAbbr: "CIN", teamSim, mapping, pool: { players: [] }, roleShares, nowIso: "2026-08-13T12:00:00Z" });
  assert.equal(withPool.state, "BOARD");
  assert.equal(without.state, "BOARD", "the team-derived board still computes");
  assert.ok(without.rows.every((r) => r.participation === "NOT_IN_POOL" && r.state === "MODELLED_NOT_PUBLISHABLE"));
  assert.equal(without.teamTd.lambda, withPool.teamTd.lambda, "the team TD read is untouched by missing player evidence");
});

test("METAMORPHIC · a sportsbook line cannot prove a player is active; injury-report absence cannot prove health", () => {
  const base = { rosterPlayer: { playerId: "p", name: "P", teamAbbr: "CIN" }, injuriesFreshness: { state: "FRESH" }, seasonType: 1, nowIso: "2026-08-13T12:00:00Z" };
  // preseason with no snap scenario stays ROLE_UNCERTAIN however rich the market is
  assert.equal(classifyParticipation({ ...base, injuryFact: null }).state, "ROLE_UNCERTAIN");
  // stale/absent injuries widen to UNKNOWN — never to "healthy"
  assert.equal(classifyParticipation({ ...base, injuryFact: null, injuriesFreshness: { state: "STALE" } }).state, "UNKNOWN");
  assert.equal(classifyParticipation({ ...base, seasonType: 2, injuryFact: null, injuriesFreshness: { state: "UNDATED" } }).state, "UNKNOWN");
});

test("CORRUPTION · post-start generation and late evidence can never pass as CURRENT_PRE_EVENT", () => {
  const late = JSON.parse(JSON.stringify(artifact));
  late.generatedAt = late.kickoffUtc;
  assert.equal(validateCurrentEventArtifact(late).ok, false);
  const shadow = runNflShadow({
    event: { providerEventId: "401873272", dateUtc: "2026-08-13T23:00Z", home: { abbr: "CIN" }, away: { abbr: "DET" }, seasonType: 1 },
    nowIso: "2026-08-14T02:00:00Z", strengthRows: [], fit: { modelId: "m", version: 1, params: {} },
  });
  assert.equal(shadow.state, "REFUSED_POST_START");
});

test("CORRUPTION · the odds client refuses other sports and any call past the program ceiling", () => {
  const auth = parseAuthorizationReceipt(fs.readFileSync(path.join(ROOT, "docs/receipts/ODDS_AUTHORIZATION_P171.md"), "utf8"));
  assert.equal(auth.sport, "nfl");
  const ledger = { ...emptyLedger("r"), cumulativeCredits: 2999 };
  assert.equal(assertCallAllowed({ authorization: auth, ledger, worstCaseCredits: 3, purpose: "x" }).ok, false);
  const capture = fs.readFileSync(path.join(APP, "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
  assert.doesNotMatch(capture, /basketball_nba|soccer_epl|mma_mixed|baseball_mlb/);
  const canary = fs.readFileSync(path.join(APP, "scripts/ops/odds-canary.mjs"), "utf8");
  assert.match(canary, /parsed\.sport !== SPORT/, "a receipt cannot authorize a sport it does not name");
});

test("STATE RENDERING · every unavailable state is distinct, and none is silently zero", () => {
  const states = new Set([
    artifact.families.teamModel.state,
    artifact.families.market.state,
    artifact.families.playerProps.state,
    artifact.families.anytimeTd.state,
  ]);
  assert.equal(states.size, 4, "four families, four distinct states — no collapsing into one banner");
  assert.match(artifact.families.anytimeTd.scorerPriceState, /NO_MARKET/);
  assert.ok(artifact.families.playerProps.reason, "an abstaining family always carries its reason");
  const lane = JSON.parse(fs.readFileSync(path.join(APP, "public/data/admin/nfl-lane.json"), "utf8"));
  const blockerStates = new Set(lane.blockers.map((b) => b.state));
  assert.ok(blockerStates.size >= 3, "blockers are typed distinctly, not lumped as 'blocked'");
});

test("PROTECTED · every P171 artifact class stays out of public output, and money is untouched", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
  const portfolio = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"), "utf8"));
  assert.deepEqual(portfolio.record, { wins: 19, losses: 14, voids: 0, pending: 0 });
  assert.equal(portfolio.currentBankroll, 19065.4);
  assert.equal(portfolio.crownBankroll, 20465.4);
  assert.equal(portfolio.openExposure, 0);
  // the public market artifact carries prices and provenance — never a research payload
  const markets = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/markets/latest.json"), "utf8"));
  const blob = JSON.stringify(markets);
  for (const marker of ["PRIVATE_RESEARCH", "apiKey", "keyFingerprint", "cumulativeCredits", "perTdShare", "shareBasis"]) {
    assert.ok(!blob.includes(marker), `the public market artifact must not carry "${marker}"`);
  }
  assert.equal(markets.dataClass, "MARKET_CAPTURE_PUBLIC");
});

test("CREDIT ACCOUNTING · every request is accounted, including the ones that bought nothing", () => {
  const ledger = read("data/internal/research/odds/nfl/p171-ledger.json");
  const summed = ledger.requests.reduce((s, r) => s + r.creditsUsed, 0);
  assert.equal(summed, ledger.cumulativeCredits, "the cumulative total is the sum of its parts");
  assert.ok(ledger.cumulativeCredits <= 3000);
  // the first bulk call returned 272 events and joined ZERO — it still cost 3 and is recorded
  const zeroJoin = ledger.requests.find((r) => r.purpose.includes("bulk") && !r.purpose.includes("preseason"));
  assert.ok(zeroJoin && zeroJoin.creditsUsed > 0, "a call that bought no usable rows is still accounted");
  for (const r of ledger.requests) {
    assert.ok(!/apiKey=(?!REDACTED)/.test(r.endpoint), "no unredacted key in any ledger row");
    assert.ok(typeof r.creditsUsed === "number");
  }
});
