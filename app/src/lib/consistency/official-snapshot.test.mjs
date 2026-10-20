/**
 * Official forecast snapshot (gtp.contract.official-forecast-snapshot@1).
 * Run: npx tsx --test src/lib/consistency/official-snapshot.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EXCLUSION, OFFICIAL_SNAPSHOT_SCHEMA, PUBLICATION, SNAPSHOT_REFUSAL, SOURCE_ROLE, SnapshotRefusal,
  nbaOfficialSnapshot, nflOfficialSnapshot, playerOf,
} from "./official-snapshot.mjs";
import { KICKOFF, NBA_ID, NFL_ID, nbaArtifact, nflBoard, nflReceipt, receiptsOf } from "./__fixtures__/synthetic.mjs";

const refusal = (code) => (e) => e instanceof SnapshotRefusal && e.code === code;
const board = (o) => ({ path: `app/public/data/nfl/player-board/${NFL_ID}.json`, doc: nflBoard(o) });

test("NFL: the forecast of record is the latest receipt strictly before kickoff; a post-kickoff receipt never wins", () => {
  const early = nflReceipt({ generatedAt: "2026-11-01T12:00:00Z", pHome: 0.6 });
  const late = nflReceipt({ generatedAt: "2026-11-01T17:30:00Z", pHome: 0.6213 });
  const after = nflReceipt({ generatedAt: "2026-11-01T18:05:00Z", pHome: 0.9 });
  const s = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(early, late, after), playerBoard: board() });
  assert.equal(s.schema, OFFICIAL_SNAPSHOT_SCHEMA);
  assert.equal(s.game.pHome, 0.6213, "unrounded owner value, exactly");
  assert.equal(s.lockAt, new Date(Date.parse(KICKOFF)).toISOString());
  assert.equal(s.generatedAt, "2026-11-01T17:30:00.000Z");
  assert.equal(s.modelVersions.game, "nfl-regular-season-public-v1@v2");
  assert.equal(s.publication, PUBLICATION.PUBLIC, "NFL is EXPERIMENTAL_PUBLIC in the registry");
  assert.equal(s.capability.canEnterPredictionProducts, false);
});

test("NFL: fails closed with typed refusals", () => {
  const after = nflReceipt({ generatedAt: "2026-11-01T18:00:00Z" });
  assert.throws(() => nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(after), playerBoard: board() }), refusal(SNAPSHOT_REFUSAL.NO_PRE_LOCK_RECORD));
  assert.throws(() => nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: null }), refusal(SNAPSHOT_REFUSAL.NO_PLAYER_BOARD));
  assert.throws(() => nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: { doc: { ...nflBoard(), providerEventId: "1" } } }), refusal(SNAPSHOT_REFUSAL.BOARD_EVENT_MISMATCH));
  assert.throws(() => nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: board({ generatedAt: "2026-11-01T18:00:00Z" }) }), refusal(SNAPSHOT_REFUSAL.BOARD_AFTER_LOCK));
  assert.throws(() => nflOfficialSnapshot("", {}), refusal(SNAPSHOT_REFUSAL.NO_EVENT_ID));
});

test("names are never identity: a row with no id is excluded, a name never finds a player, equal names stay distinct", () => {
  const s = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: board() });
  assert.deepEqual(s.excluded, [{ playerId: null, reason: EXCLUSION.NO_PLAYER_ID }]);
  assert.equal(s.players.length, 2);
  assert.equal(playerOf(s, "Alex Same"), null);
  assert.equal(playerOf(s, "No Id Player"), null);
  assert.equal(playerOf(s, "nfl-athlete-100").team, "HOM");
  assert.equal(playerOf(s, "nfl-athlete-200").team, "AWY");
  for (const p of s.players) assert.match(p.playerId, /^nfl-athlete-\d+$/);
});

test("supporting simulations are attached with their own versions and never change an official number", () => {
  const receipts = receiptsOf(nflReceipt());
  const plain = nflOfficialSnapshot(NFL_ID, { receipts, playerBoard: board() });
  const worldModel = { path: "wm.json", doc: { model: { id: "nfl-world-model-v2", version: "2.2.0" }, run: { generatedAt: "2026-11-01T16:00:00Z", inputs: { forecastInputHash: "bbbbbbbbbbbbbbbb" } }, game: { winProbability: { home: 0.55 } } } };
  const simReceipt = { path: "sim.json", doc: { simulationEngine: "nfl-drive-sim-v2", simulationEngineVersion: "2.0.0-shadow", generatedAt: "2026-11-01T17:01:00Z", inputSnapshotIds: { forecastReceipt: receipts[0].file }, aggregate: { winProbability: { home: 0.5 } } } };
  const withSims = nflOfficialSnapshot(NFL_ID, { receipts, playerBoard: board(), worldModel, simReceipt });
  assert.deepEqual(withSims.game, plain.game);
  assert.deepEqual(withSims.players, plain.players);
  const wm = withSims.sources.find((x) => x.role === SOURCE_ROLE.SUPPORTING_SIMULATION);
  const sim = withSims.sources.find((x) => x.role === SOURCE_ROLE.SHADOW);
  assert.equal(wm.modelVersion, "nfl-world-model-v2@2.2.0");
  assert.equal(wm.alignedWithOfficial, false, "built from another input hash");
  assert.equal(sim.modelVersion, "nfl-drive-sim-v2@2.0.0-shadow");
  assert.equal(sim.alignedWithOfficial, true, "built from the record file");
  assert.notEqual(withSims.snapshotId, plain.snapshotId, "sources are part of the sealed content");
});

test("snapshotId is a deterministic content hash", () => {
  const a = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: board() });
  const b = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: board() });
  const c = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt({ pHome: 0.6201 })), playerBoard: board() });
  assert.equal(a.snapshotId, b.snapshotId);
  assert.notEqual(a.snapshotId, c.snapshotId);
  assert.match(a.snapshotId, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(a));
});

test("NFL distributions: quantile families keep exact points, anytime TD is bernoulli, family states carried", () => {
  const s = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: board() });
  const rec = playerOf(s, "nfl-athlete-100").families.player_receptions;
  assert.equal(rec.distribution.kind, "quantiles");
  assert.deepEqual(rec.distribution.points.map((p) => p.v), [1.6, 2.9, 4.2, 5.8, 7.4]);
  assert.equal(rec.expected, 4.4);
  assert.equal(rec.state, "PUBLISHED");
  assert.deepEqual(playerOf(s, "nfl-athlete-100").families.anytime_td.distribution, { kind: "bernoulli", p: 0.31 });
  assert.equal(playerOf(s, "nfl-athlete-200").families.player_pass_yds.state, "ESTIMATE");
  assert.equal(s.game.margin.distribution.kind, "normal");
  assert.equal(s.game.home.expected, (44.2 + 3.4) / 2);
});

test("NBA: always PRIVATE while the registry keeps NBA off live projections; keyed by providerAthleteId", () => {
  const s = nbaOfficialSnapshot(NBA_ID, nbaArtifact(), { path: "x.json" });
  assert.equal(s.publication, PUBLICATION.PRIVATE);
  assert.equal(s.capability.canShowLiveProjections, false);
  assert.deepEqual(s.players.map((p) => p.playerId), ["11", "22"]);
  assert.equal(playerOf(s, "Same Name"), null);
  assert.equal(s.game.pHome, 0.57);
  assert.equal(s.game.winner.pHome, 0.6, "the Elo head that publishes the side is kept apart, exactly");
  assert.equal(s.game.total.distribution.kind, "empirical");
  assert.equal(s.players[0].families.pts.conditioning, "CONDITIONAL_ON_PLAYING");
});

test("NBA: refuses a broken or missing receipt, and an unknown game", () => {
  assert.throws(() => nbaOfficialSnapshot(NBA_ID, nbaArtifact({ tamper: true })), refusal(SNAPSHOT_REFUSAL.RECEIPT_INTEGRITY));
  assert.throws(() => nbaOfficialSnapshot(NBA_ID, nbaArtifact({ noReceipt: true })), refusal(SNAPSHOT_REFUSAL.RECEIPT_INTEGRITY));
  assert.throws(() => nbaOfficialSnapshot("1", nbaArtifact()), refusal(SNAPSHOT_REFUSAL.GAME_NOT_IN_ARTIFACT));
  assert.throws(() => nbaOfficialSnapshot(NBA_ID, null), refusal(SNAPSHOT_REFUSAL.NO_ARTIFACT));
});
