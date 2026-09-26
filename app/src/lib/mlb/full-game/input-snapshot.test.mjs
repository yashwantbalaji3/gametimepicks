/**
 * MLB INPUT LINEAGE — can a published forecast say what it consumed?
 *
 * Run: npx tsx --test src/lib/mlb/full-game/input-snapshot.test.mjs
 *
 * THE DEFECT
 * A committed simulation says `awayLineupSource: "confirmed"` and `awayLineupCount: 9`. It never
 * says WHICH confirmed lineup, when it was captured, or who was in it — `players` is null by design
 * and the batting order is written down nowhere. gamePk 824706 read `confirmed / ready` at 20:37Z
 * and `prop-derived / unavailable` at 21:46Z on the same date, and nothing in either artifact told
 * the two inputs apart.
 *
 * THE CLAIM THESE PIN
 * For every date that HAS a snapshot, every published forecast on it points to a row that describes
 * that forecast — same gamePk, same artifactHash — and the row names the capture instant and the
 * exact batting order the simulation consumed.
 *
 * ⚠ AND THE HISTORICAL BOUNDARY IS STATED, NOT FABRICATED. Forecasts published before the first
 * snapshot consumed evidence nobody recorded, and some of it (2026-09-24's lineup captures, lost to
 * the three-day pregame-capture outage) no longer exists at all. Those are not reconstructible and
 * this file does not pretend otherwise: the guarantee is PROSPECTIVE.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { INPUT_SNAPSHOT_VERSION, foldSnapshot, snapshotRowFor, unreproducibleForecasts } from "./input-snapshot.mjs";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..");
const SIM_DIR = path.join(APP, "public/data/mlb/full-game-simulations");
const SNAP_DIR = path.join(ROOT, "data/internal/mlb/input-snapshots");
const GEN_SRC = fs.readFileSync(path.join(APP, "scripts/generate-mlb-full-game-simulations.mjs"), "utf8");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const input = (over = {}) => ({
  gamePk: 824706, date: "2026-09-25", slug: "chc-vs-bos-2026-09-25-824706",
  awayTeam: "CHC", homeTeam: "BOS", firstPitch: "2026-09-25T22:05:00Z",
  awayLineup: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ playerId: 600000 + i, name: `A${i}` })),
  homeLineup: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ playerId: 700000 + i, name: `H${i}` })),
  awayStarter: { playerId: 900, name: "A Starter", expStrikeouts: 5.5 },
  homeStarter: { playerId: 901, name: "H Starter", expStrikeouts: null },
  completeness: {
    level: "degraded", awayLineupSource: "confirmed", homeLineupSource: "confirmed",
    awayLineupCount: 9, homeLineupCount: 9, awayRatedCount: 8, homeRatedCount: 7,
    startedBeforeGeneration: false, missingFamilies: ["weather"],
  },
  ...over,
});
const game = (over = {}) => ({ gamePk: 824706, slug: "chc-vs-bos-2026-09-25-824706", artifactHash: "hash-A", ...over });
const confirmed = { away: { capturedAt: "2026-09-25T20:31:00Z", minutesToFirstPitch: 94 }, home: { capturedAt: "2026-09-25T20:31:00Z", minutesToFirstPitch: 94 } };

/* ── WHAT A ROW RECORDS ────────────────────────────────────────────────────────────────────────── */

test("a row names the capture instant, the exact order, the starters and the back-link", () => {
  const r = snapshotRowFor({ input: input(), game: game(), confirmed });

  assert.equal(r.gamePk, 824706);
  assert.equal(r.artifactHash, "hash-A", "the back-link to the forecast it describes");
  assert.equal(r.away.source, "confirmed");
  assert.equal(r.away.capturedAt, "2026-09-25T20:31:00Z", "WHICH confirmed lineup — the whole point");
  assert.equal(r.away.minutesToFirstPitch, 94);
  assert.deepEqual(r.away.batterIds, [600001, 600002, 600003, 600004, 600005, 600006, 600007, 600008, 600009]);
  assert.equal(r.away.ratedCount, 8);
  assert.equal(r.away.paddedSlots, 0);

  // A starter is identified, and whether the model actually had a projection for him.
  assert.deepEqual(r.awayStarter, { playerId: 900, name: "A Starter", hasStrikeoutProjection: true });
  assert.deepEqual(r.homeStarter, { playerId: 901, name: "H Starter", hasStrikeoutProjection: false });
});

test("a padded slot is counted, and a prop-derived side records no capture instant", () => {
  const padded = input({
    awayLineup: [{ playerId: 600001 }, { playerId: null }, { playerId: null }],
    completeness: { ...input().completeness, awayLineupSource: "prop-derived", awayLineupCount: 1 },
  });
  const r = snapshotRowFor({ input: padded, game: game(), confirmed: { away: null, home: confirmed.home } });
  assert.equal(r.away.source, "prop-derived");
  assert.equal(r.away.capturedAt, null, "there is no confirmed capture to point at");
  assert.equal(r.away.paddedSlots, 2, "two replacement-level batters stood in");
  assert.deepEqual(r.away.batterIds, [600001, null, null], "and the padding is visible in the order");
});

/* ── THE REPRODUCIBILITY CLAIM ─────────────────────────────────────────────────────────────────── */

test("⚠ EVERY PUBLISHED FORECAST MUST POINT TO A ROW THAT DESCRIBES IT", () => {
  const artifact = { games: [game({ gamePk: 1, artifactHash: "h1" }), game({ gamePk: 2, artifactHash: "h2" })] };

  const good = { games: [{ gamePk: 1, artifactHash: "h1" }, { gamePk: 2, artifactHash: "h2" }] };
  assert.deepEqual(unreproducibleForecasts({ artifact, snapshot: good }), [], "matching hashes are reproducible");

  // §3's probe list, each with its own named failure.
  const missing = unreproducibleForecasts({ artifact, snapshot: { games: [{ gamePk: 1, artifactHash: "h1" }] } });
  assert.deepEqual(missing.map((x) => x.why), ["NO_SNAPSHOT"], "a forecast with no row cannot be reconstructed");

  const wrongEvent = unreproducibleForecasts({ artifact, snapshot: { games: [{ gamePk: 1, artifactHash: "h1" }, { gamePk: 99, artifactHash: "h2" }] } });
  assert.deepEqual(wrongEvent.map((x) => x.why), ["NO_SNAPSHOT"], "a row for a different event is not a row for this one");

  const staleRun = unreproducibleForecasts({ artifact, snapshot: { games: [{ gamePk: 1, artifactHash: "h1" }, { gamePk: 2, artifactHash: "OLD" }] } });
  assert.deepEqual(staleRun.map((x) => x.why), ["SNAPSHOT_DESCRIBES_A_DIFFERENT_RUN"], "a row describing another run is worse than none");

  const noBacklink = unreproducibleForecasts({ artifact, snapshot: { games: [{ gamePk: 1, artifactHash: "h1" }, { gamePk: 2 }] } });
  assert.deepEqual(noBacklink.map((x) => x.why), ["SNAPSHOT_HAS_NO_BACKLINK"], "a row that cannot prove which run it describes");
});

test("⚠ A CARRIED-FORWARD FORECAST KEEPS ITS OWN ROW", () => {
  /*
   * The generator freezes a started game's pregame simulation byte-for-byte rather than
   * regenerating it, and still builds an input for that game on the same run. Filing the two
   * together would record a lineup the published forecast never consumed — precisely, confidently
   * wrong, which is worse than no record at all.
   *
   * Observed on 2026-09-25: two games carried a pregame forecast whose `startedBeforeGeneration` is
   * false, while a later run's input for them says true.
   */
  const original = { games: [{ gamePk: 1, artifactHash: "h1", away: { capturedAt: "T1" } }] };
  const sameRun = foldSnapshot({ prior: original, rows: [{ gamePk: 1, artifactHash: "h1", away: { capturedAt: "T1" } }] });
  assert.equal(sameRun.carried, 1, "an unchanged forecast keeps its row untouched");
  assert.equal(sameRun.rows ?? sameRun.games.length, 1);
  assert.equal(sameRun.games[0].away.capturedAt, "T1");

  // A genuinely rebuilt forecast replaces its row.
  const rebuilt = foldSnapshot({ prior: original, rows: [{ gamePk: 1, artifactHash: "h2", away: { capturedAt: "T2" } }] });
  assert.equal(rebuilt.updated, 1);
  assert.equal(rebuilt.games[0].away.capturedAt, "T2");

  // And the generator must not even offer a row for a carried game.
  assert.match(GEN_SRC, /carriedPks\.add\(g\.gamePk\)/, "the generator records which games were carried");
  assert.match(GEN_SRC, /if \(carriedPks\.has\(g\.gamePk\)\) continue;/, "and skips them when building rows");
});

test("rows are ordered deterministically, so two runs produce the same bytes", () => {
  const out = foldSnapshot({ prior: null, rows: [{ gamePk: 30, artifactHash: "c" }, { gamePk: 10, artifactHash: "a" }, { gamePk: 20, artifactHash: "b" }] });
  assert.deepEqual(out.games.map((g) => g.gamePk), [10, 20, 30]);
  assert.equal(out.added, 3);
});

/* ── AGAINST THE COMMITTED ARCHIVE ─────────────────────────────────────────────────────────────── */

test("every committed snapshot describes the forecast it sits beside", () => {
  /*
   * The prospective guarantee, checked against whatever has actually been written. A date with no
   * snapshot is the historical boundary and is skipped by design — see the header. A date WITH one
   * must be correct for every game on it.
   */
  if (!fs.existsSync(SNAP_DIR)) return;   // no snapshot written yet — the boundary, not a failure
  const dates = fs.readdirSync(SNAP_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  const violations = [];
  for (const f of dates) {
    const snapshot = read(path.join(SNAP_DIR, f));
    const artifact = read(path.join(SIM_DIR, f));
    if (!artifact) { violations.push(`${f}: a snapshot with no forecast beside it`); continue; }
    assert.equal(snapshot.schemaVersion, INPUT_SNAPSHOT_VERSION, `${f}: unexpected snapshot version`);
    for (const v of unreproducibleForecasts({ artifact, snapshot })) {
      violations.push(`${f}: gamePk ${v.gamePk} (${v.slug}) → ${v.why}`);
    }
  }
  assert.deepEqual(violations, [], `published forecasts that cannot be reconstructed:\n  ${violations.join("\n  ")}`);
});

test("⚠ THE SNAPSHOT IS WRITTEN BY THE RUN THAT SIMULATED, NOT RE-DERIVED LATER", () => {
  /*
   * Re-deriving it from the archive would answer "what would we use today". A capture landing after
   * the forecast was published would then make the record disagree with the artifact it claims to
   * describe — the exact failure it exists to prevent.
   */
  const hookIdx = GEN_SRC.indexOf("snapshotRowFor({ input");
  const simIdx = GEN_SRC.indexOf("const artifact = build(nowIso)");
  assert.ok(hookIdx > 0 && simIdx > 0, "both landmarks exist — otherwise this guard is vacuous");
  assert.ok(simIdx < hookIdx, "the rows are built from inputs this run simulated");
  assert.match(GEN_SRC, /lastInputs\.find\(\(i\) => i\.gamePk === g\.gamePk\)/, "from the inputs themselves");
  assert.match(GEN_SRC, /confirmedByGamePk\.get\(g\.gamePk\)/, "and the confirmed side it selected, for its capture instant");

  // It must change no published byte: the public artifact is written from `artifact`, untouched.
  assert.match(GEN_SRC, /data\/internal\/mlb\/input-snapshots/, "the snapshot is INTERNAL");
  assert.equal(/completeness[^\n]*capturedAt/.test(GEN_SRC), false, "provenance must not be bolted onto completeness — that would rewrite every artifactHash");
});
