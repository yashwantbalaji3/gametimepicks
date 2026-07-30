/**
 * PER-ROW LINEAGE — the sidecar must never claim more than it can source.
 *
 * The settled ledger records `id`, `date`, `gamePk`, `marketKey`, `outcome` and nothing about where
 * any of it came from. This sidecar adds that, and the entire risk of adding it is that the easiest
 * way to make every row look well-documented is to fill the missing fields in from what is known
 * afterwards. A row whose `eventStart` was read off a box score passes every leakage check ever
 * written, which is why the guard is asserted here by MUTATION rather than by inspection: the file is
 * rewritten on disk to perform the backfill, the guard is observed rejecting it, the guard's own check
 * is then removed to observe the backfill sailing through, and the source is restored byte-for-byte.
 *
 * The join is asserted the same way. Sprint 041 collapsed two halves of a doubleheader onto one
 * `gamePk`; Sprint 043 made refusing a name-only match a hard rule. The name-join mutant here uses two
 * real-shaped players who share a display name, and the required outcome is that the row loses its
 * provenance — never that it silently acquires someone else's.
 *
 * Run: npx tsx --test src/lib/research/row-lineage.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  LINEAGE_GATE_VERSION,
  PREGAME_JOIN_METHOD,
  ROW_SCHEMA_VERSION,
  buildEventIdentityIndex,
  buildPregameObservationIndex,
  deriveRowLineage,
  pregameJoinKey,
  resolveRowIdentity,
  summarizeCoverage,
  validateRowLineage,
} from "./row-lineage.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = process.cwd();

// ── fixtures, shaped like the real 2026-07-25 KC @ DET board ───────────────────

const GAMES = [
  {
    gamePk: 824244,
    gameDate: "2026-07-25T17:10:00Z",
    homeTeamName: "Detroit Tigers",
    homeTeamAbbr: "DET",
    homeTeamId: 116,
    awayTeamName: "Kansas City Royals",
    awayTeamAbbr: "KC",
    awayTeamId: 118,
    status: "Final",
  },
];

const BOARD_ROW = {
  id: "abc-Michael_Wacha-pitcher_strikeouts-5.5",
  gamePk: 824244,
  gameId: "abc",
  marketKey: "pitcher_strikeouts",
  marketLabel: "Strikeouts",
  line: 5.5,
  lean: "Over",
  playerId: 608379,
  playerName: "Michael Wacha",
  commenceTime: "2026-07-25T17:11:00Z",
  modelProbOver: 0.4741,
  modelProbUnder: 0.5259,
  impliedOver: 0.4202,
  impliedUnder: 0.6429,
  homeTeamAbbr: "DET",
  awayTeamAbbr: "KC",
  capturedAt: null,
  eventStart: null,
};

const LEDGER_ROW = {
  id: BOARD_ROW.id,
  date: "2026-07-25",
  outcome: "Loss",
  gamePk: 824244,
  marketKey: "pitcher_strikeouts",
  line: 5.5,
  lean: "Over",
};

const OBSERVATION = {
  capturedAt: "2026-07-25T12:02:10.065Z",
  availableAt: "2026-07-25T12:02:10.065Z",
  eventStart: "2026-07-25T17:10:00Z",
  sourceRef: "data/internal/mlb/pregame-archive/settlement-joins/2026-07-25/824244.json",
  sourceKind: "mlb-pregame-settlement-join",
  joinMethod: PREGAME_JOIN_METHOD,
  snapshotRef: "824244-91839eb0",
  noVigProbability: 0.4216,
};

const SETTLEMENT = {
  outcome: "Loss",
  sourceRef: "https://statsapi.mlb.com/api/v1.1/game/824244/feed/live",
  sourceType: "mlb-statsapi-boxscore",
  gradedAgainstId: 824244,
  finalizedAt: "2026-07-25T20:06:57.116Z",
};

const identityIndex = () => buildEventIdentityIndex(GAMES, "2026-07-25T09:00:00Z");

const derive = (over = {}) =>
  deriveRowLineage({
    ledger: LEDGER_ROW,
    board: BOARD_ROW,
    identity: resolveRowIdentity(identityIndex(), BOARD_ROW),
    pregame: null,
    settlement: SETTLEMENT,
    quarantine: null,
    registryStatus: "RECALIBRATE",
    calibrationVersion: "platt-1",
    lineageEvaluated: false,
    ...over,
  });

// ── completeness + schema ──────────────────────────────────────────────────────

test("a proven row carries the whole chain and passes the guard", () => {
  const env = derive({ pregame: OBSERVATION, lineageEvaluated: true, lineageViolations: [] });

  assert.equal(env.rowSchemaVersion, ROW_SCHEMA_VERSION);
  assert.equal(env.coverageState, "PROVEN_SIDECAR");
  assert.equal(env.eventId, "mlb:detroit-tigers-v-kansas-city-royals:20260725t1710");
  assert.deepEqual(
    env.providerRefs.map((r) => `${r.provider}:${r.id}`).sort(),
    ["odds-api:abc", "statsapi:824244"],
  );
  assert.equal(env.pregame.capturedAt, OBSERVATION.capturedAt);
  assert.equal(env.pregame.eventStart, OBSERVATION.eventStart);
  assert.equal(env.pregame.sourceKind, "mlb-pregame-settlement-join");
  assert.equal(env.pregameEligibility.verdict, "ELIGIBLE");
  assert.equal(env.pregameEligibility.researchEligible, true);
  assert.equal(env.settlement.sourceType, "mlb-statsapi-boxscore");
  assert.equal(env.settlement.gradedAgainstId, "824244");
  assert.equal(env.lineage.verdict, "PASS");
  assert.equal(env.lineage.gateVersion, LINEAGE_GATE_VERSION);
  assert.equal(env.model.calibrationVersion, "platt-1");
  assert.equal(env.market.registryStatus, "RECALIBRATE");
  assert.equal(env.rowLevelClaimAllowed, true);
  assert.equal(env.countsTowardRates, true);
  assert.deepEqual(validateRowLineage(env), []);
});

test("every envelope declares the schema version, and a reader refuses another one", () => {
  const env = derive({ pregame: OBSERVATION });
  assert.equal(env.rowSchemaVersion, "research-row-lineage-1");
  const stale = { ...env, rowSchemaVersion: "research-row-lineage-0" };
  assert.ok(validateRowLineage(stale).some((v) => v.code === "MISSING_SCHEMA_VERSION"));
});

test("no pregame artifact means LEGACY_UNSTAMPED with an empty pregame block", () => {
  const env = derive();
  assert.equal(env.coverageState, "LEGACY_UNSTAMPED");
  assert.equal(env.pregame.capturedAt, null);
  assert.equal(env.pregame.eventStart, null);
  assert.equal(env.pregame.sourceRef, null);
  assert.equal(env.pregameEligibility.verdict, "UNKNOWN");
  assert.equal(env.rowLevelClaimAllowed, false, "an unstamped row may never carry a row-level claim");
  assert.equal(env.countsTowardRates, true, "it may still sit in an aggregate whose denominator is stated");
  assert.deepEqual(validateRowLineage(env), []);
});

test("the board's own generatedAt is not treated as a capture time", () => {
  // The failure this pins: substituting a build timestamp for an observation makes the whole legacy
  // corpus look research-eligible in one line of code.
  const env = derive({ board: { ...BOARD_ROW, capturedAt: null, eventStart: null } });
  assert.equal(env.coverageState, "LEGACY_UNSTAMPED");
  assert.equal(env.pregame.capturedAt, null);
});

test("a board row that carries its own stamps is PROVEN_STAMPED", () => {
  const env = derive({
    board: { ...BOARD_ROW, capturedAt: "2026-07-25T12:00:00Z", eventStart: "2026-07-25T17:10:00Z" },
  });
  assert.equal(env.coverageState, "PROVEN_STAMPED");
  assert.equal(env.pregame.sourceKind, "board-inline-capture");
  assert.deepEqual(validateRowLineage(env), []);
});

test("a capture at or after first pitch is proven but not eligible", () => {
  const env = derive({
    pregame: { ...OBSERVATION, capturedAt: "2026-07-25T23:55:34.501Z", availableAt: null },
  });
  assert.equal(env.coverageState, "PROVEN_SIDECAR");
  assert.equal(env.pregameEligibility.verdict, "POST_EVENT_CAPTURE");
  assert.equal(env.pregameEligibility.researchEligible, false);
});

test("a withheld row never counts and never carries a claim", () => {
  const env = derive({
    pregame: OBSERVATION,
    quarantine: { scope: "row", reason: "captured at/after first pitch", sourceRef: "q.json" },
  });
  assert.equal(env.coverageState, "QUARANTINED");
  assert.equal(env.countsTowardRates, false);
  assert.equal(env.rowLevelClaimAllowed, false);
  assert.deepEqual(validateRowLineage(env), []);
  // Forcing it to count is exactly what the guard exists to stop.
  assert.ok(
    validateRowLineage({ ...env, countsTowardRates: true }).some((v) => v.code === "WITHHELD_ROW_COUNTED"),
  );
});

test("a refused identity is CONFLICTED, presents no eventId, and counts nowhere", () => {
  const env = derive({ identity: { eventId: null, providerRefs: [], method: "m", refusedReason: "collision" } });
  assert.equal(env.coverageState, "CONFLICTED");
  assert.equal(env.eventId, null);
  assert.equal(env.countsTowardRates, false);
  assert.ok(validateRowLineage({ ...env, eventId: "mlb:x" }).some((v) => v.code === "REFUSED_IDENTITY_CARRIES_EVENT_ID"));
});

test("a lineage-gate refusal is CONFLICTED even when everything else is present", () => {
  const env = derive({
    pregame: OBSERVATION,
    lineageEvaluated: true,
    lineageViolations: ["WRONG_EVENT_MAPPING: gamePk 824489 is claimed by 2 distinct events"],
  });
  assert.equal(env.lineage.verdict, "REFUSED");
  assert.equal(env.coverageState, "CONFLICTED");
  assert.equal(env.countsTowardRates, false);
});

test("a ledger row with no board row is UNAVAILABLE, not silently dropped", () => {
  const env = derive({ board: null, identity: null });
  assert.equal(env.coverageState, "UNAVAILABLE");
  assert.equal(env.countsTowardRates, false);
});

test("coverage summary reports every state, including the empty ones", () => {
  const s = summarizeCoverage([derive(), derive({ pregame: OBSERVATION })]);
  assert.equal(s.total, 2);
  assert.deepEqual(Object.keys(s.byState).sort(), [
    "CONFLICTED", "LEGACY_UNSTAMPED", "PROVEN_SIDECAR", "PROVEN_STAMPED", "QUARANTINED", "UNAVAILABLE",
  ]);
  assert.equal(s.byState.PROVEN_STAMPED, 0);
  assert.equal(s.rowLevelClaimable, 1);
});

// ── the unsafe-backfill guard, asserted directly ───────────────────────────────

test("an envelope carrying timing with no pregame source is rejected", () => {
  const env = derive();
  const backfilled = {
    ...env,
    pregame: { ...env.pregame, eventStart: SETTLEMENT.finalizedAt },
  };
  const codes = validateRowLineage(backfilled).map((v) => v.code);
  assert.ok(codes.includes("PREGAME_TIMING_WITHOUT_SOURCE"));
  assert.ok(codes.includes("UNSTAMPED_ROW_CARRIES_TIMING"));
});

test("an envelope citing its settlement source as its pregame source is rejected", () => {
  const env = derive({ pregame: { ...OBSERVATION, sourceRef: SETTLEMENT.sourceRef } });
  assert.ok(validateRowLineage(env).some((v) => v.code === "PREGAME_SOURCE_IS_SETTLEMENT"));
});

test("a pregame observation attached by anything but the ID join is rejected", () => {
  const env = derive({ pregame: { ...OBSERVATION, joinMethod: "matched on player name" } });
  // It never reaches PROVEN in the first place, so the timing is dropped rather than published.
  assert.equal(env.coverageState, "LEGACY_UNSTAMPED");
  assert.equal(env.pregame.capturedAt, null);
  // And an envelope hand-assembled that way is refused outright.
  const forced = { ...env, pregame: { ...OBSERVATION, joinMethod: "matched on player name" } };
  assert.ok(validateRowLineage(forced).some((v) => v.code === "NON_ID_JOIN"));
});

// ── identity + join refusal ────────────────────────────────────────────────────

test("a doubleheader gamePk claimed by two events resolves to null, not to one of them", () => {
  // The real 2026-07-28 CIN @ CLE shape: one gamePk, two scheduled starts.
  const index = buildEventIdentityIndex(
    [
      { gamePk: 824489, gameDate: "2026-07-28T17:41:00Z", homeTeamName: "Cleveland Guardians", awayTeamName: "Cincinnati Reds" },
      { gamePk: 824489, gameDate: "2026-07-28T23:10:00Z", homeTeamName: "Cleveland Guardians", awayTeamName: "Cincinnati Reds" },
    ],
    "2026-07-28T09:00:00Z",
  );
  assert.equal(index.resolve(824489), null);
  assert.deepEqual(index.collidedGamePks, ["824489"]);

  const res = resolveRowIdentity(index, { ...BOARD_ROW, gamePk: 824489 });
  assert.equal(res.eventId, null);
  assert.match(res.refusedReason, /claimed by more than one event/);
});

test("a join key requires a player ID and refuses a display name", () => {
  assert.equal(
    pregameJoinKey({ gamePk: 824244, marketKey: "batter_hits", playerId: 1, line: 0.5, side: "Over" }),
    "824244|batter_hits|1|0.5|over",
  );
  assert.equal(
    pregameJoinKey({ gamePk: 824244, marketKey: "batter_hits", playerId: null, playerName: "Luis Garcia", line: 0.5, side: "Over" }),
    null,
    "no ID means no join — a name is not an identifier",
  );
});

/** Two real-shaped players who share a display name in the same game, market and line. */
const SAME_NAME = [
  [
    { gamePk: 824244, marketKey: "batter_hits", playerId: 677649, playerName: "Luis Garcia", line: 0.5, side: "Over" },
    { ...OBSERVATION, capturedAt: "2026-07-25T12:00:00.000Z", noVigProbability: 0.61 },
  ],
  [
    { gamePk: 824244, marketKey: "batter_hits", playerId: 472610, playerName: "Luis Garcia", line: 0.5, side: "Over" },
    { ...OBSERVATION, capturedAt: "2026-07-25T12:00:05.000Z", noVigProbability: 0.44 },
  ],
];

test("two players sharing a name are kept apart by ID", () => {
  const index = buildPregameObservationIndex(SAME_NAME);
  assert.equal(index.lookup(SAME_NAME[0][0]).capturedAt, "2026-07-25T12:00:00.000Z");
  assert.equal(index.lookup(SAME_NAME[1][0]).capturedAt, "2026-07-25T12:00:05.000Z");
  assert.deepEqual(index.ambiguousKeys, []);
});

test("an ambiguous key resolves to null rather than to whichever was written last", () => {
  const index = buildPregameObservationIndex([
    SAME_NAME[0],
    [SAME_NAME[0][0], { ...OBSERVATION, capturedAt: "2026-07-25T13:00:00.000Z" }],
  ]);
  assert.equal(index.lookup(SAME_NAME[0][0]), null);
  assert.equal(index.ambiguousKeys.length, 1);
});

// ── the shipped artifacts ──────────────────────────────────────────────────────

const ARTIFACTS = path.join(APP, "public/data/research/row-lineage");

test("the exported index exists and is internally consistent", () => {
  const p = path.join(ARTIFACTS, "index.json");
  assert.ok(fs.existsSync(p), "run: npx tsx scripts/build-research-row-lineage.mjs --write");
  const index = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(index.rowSchemaVersion, ROW_SCHEMA_VERSION);
  assert.ok(index.dates.length > 0);

  for (const d of index.dates) {
    const states = Object.values(d.byState).reduce((a, b) => a + b, 0);
    assert.equal(states, d.total, `${d.date}: state counts must account for every generated row`);
    assert.ok(d.countable <= d.total);
    assert.ok(d.rowLevelClaimable <= d.countable);
    if (!d.rowLevel) {
      assert.equal(
        d.byState.PROVEN_SIDECAR + d.byState.PROVEN_STAMPED,
        0,
        `${d.date} publishes no row-level file, so it must claim no proven rows`,
      );
    }
  }
});

test("every published envelope passes the guard and is genuinely proven", () => {
  const files = fs.readdirSync(ARTIFACTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  assert.ok(files.length > 0);
  let proven = 0;
  for (const f of files) {
    const artifact = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, f), "utf8"));
    assert.equal(artifact.rowSchemaVersion, ROW_SCHEMA_VERSION);
    for (const row of artifact.rows) {
      assert.deepEqual(validateRowLineage(row), [], `${f} ${row.rowId}`);
      assert.equal(row.rowLevelClaimAllowed, true, "the public file publishes only claimable rows");
      assert.ok(row.pregame.capturedAt && row.pregame.eventStart, "a published row must have both stamps");
      assert.ok(row.pregame.sourceRef, "a published row must name the artifact its timing came from");
      assert.notEqual(row.pregame.sourceRef, row.settlement.sourceRef);
      proven += 1;
    }
  }
  assert.ok(proven > 0, "at least one date must have provable row-level lineage");
});

test("a quarantined slate publishes no countable row", () => {
  const index = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, "index.json"), "utf8"));
  const quarantined = index.dates.filter((d) => d.byState.QUARANTINED > 0);
  assert.ok(quarantined.length > 0, "the record must still contain the slates that were refused");
  for (const d of quarantined) {
    assert.equal(
      d.countable,
      d.total - d.byState.QUARANTINED - d.byState.CONFLICTED - d.byState.UNAVAILABLE,
      `${d.date}: withheld rows must be outside the countable population`,
    );
  }
  const fully = index.dates.find((d) => d.byState.QUARANTINED === d.total && d.total > 0);
  if (fully) assert.equal(fully.countable, 0, `${fully.date} is entirely withheld and must count nothing`);
});

// ── mutation proofs ────────────────────────────────────────────────────────────

/**
 * Mutate a shipped source file, run a probe in a CHILD PROCESS, restore, and prove byte-identity.
 *
 * The child process is not caution: tsx caches transpiled `.ts` by path, so an in-process re-import
 * returns the UNMUTATED module and the test passes without ever exercising the mutation.
 */
function mutating(file, find, replace, probeSource) {
  const target = path.join(HERE, file);
  const original = fs.readFileSync(target);
  const digest = crypto.createHash("sha256").update(original).digest("hex");
  const text = original.toString();
  assert.ok(text.includes(find), `mutation anchor not found in ${file} — the source changed shape`);

  const probePath = path.join(os.tmpdir(), `gtp-lineage-probe-${digest.slice(0, 8)}-${file}.mjs`);
  let out = "";
  try {
    fs.writeFileSync(target, text.replace(find, replace));
    fs.writeFileSync(probePath, probeSource(target));
    out = execFileSync("npx", ["tsx", probePath], { encoding: "utf8", cwd: APP }).trim();
  } finally {
    fs.writeFileSync(target, original);
    fs.rmSync(probePath, { force: true });
  }

  assert.equal(
    crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"),
    digest,
    `${file} was NOT restored byte-for-byte`,
  );
  return out;
}

const PROBE_INPUT = JSON.stringify({
  ledger: LEDGER_ROW,
  board: BOARD_ROW,
  identity: {
    eventId: "mlb:detroit-tigers-v-kansas-city-royals:20260725t1710",
    providerRefs: [{ provider: "statsapi", id: "824244", kind: "game" }],
    method: "test",
    refusedReason: null,
  },
  pregame: null,
  settlement: SETTLEMENT,
  quarantine: null,
  registryStatus: "RECALIBRATE",
  calibrationVersion: "platt-1",
  lineageEvaluated: false,
});

test("MUTATION — backfilling eventStart from settlement is caught by the guard", () => {
  const out = mutating(
    "row-lineage.ts",
    "      : EMPTY_PREGAME;",
    "      : { ...EMPTY_PREGAME, eventStart: settlement?.finalizedAt ?? null };",
    (t) => `import { deriveRowLineage, validateRowLineage } from ${JSON.stringify(t)};
const env = deriveRowLineage(${PROBE_INPUT});
const applied = env.pregame.eventStart == null ? "NO_BACKFILL" : "BACKFILLED";
const codes = validateRowLineage(env).map((v) => v.code);
const verdict = codes.includes("UNSTAMPED_ROW_CARRIES_TIMING") && codes.includes("PREGAME_TIMING_WITHOUT_SOURCE")
  ? "REJECTED" : "ACCEPTED";
console.log(applied + "|" + verdict);`,
  );
  // BACKFILLED proves the mutation actually took effect; REJECTED proves the guard bites on it.
  assert.equal(out, "BACKFILLED|REJECTED");

  // Unmutated, the same row has no timing at all to reject.
  const clean = derive();
  assert.equal(clean.pregame.eventStart, null);
  assert.deepEqual(validateRowLineage(clean), []);
});

test("MUTATION — removing the unstamped-timing check lets the backfill through", () => {
  // Proves the previous test's rejection came from the guard rather than from something incidental.
  const out = mutating(
    "row-lineage.ts",
    '  if (env.coverageState === "LEGACY_UNSTAMPED" && hasTiming) {',
    '  if (false && env.coverageState === "LEGACY_UNSTAMPED" && hasTiming) {',
    (t) => `import { validateRowLineage } from ${JSON.stringify(t)};
const env = ${JSON.stringify({ ...derive(), pregame: { ...derive().pregame, eventStart: SETTLEMENT.finalizedAt, sourceKind: "mlb-pregame-settlement-join", sourceRef: "x", joinMethod: PREGAME_JOIN_METHOD } })};
console.log(validateRowLineage(env).some((v) => v.code === "UNSTAMPED_ROW_CARRIES_TIMING") ? "CAUGHT" : "MISSED");`,
  );
  assert.equal(out, "MISSED", "the mutation must defeat the guard, or the guard is not what catches this");
});

test("MUTATION — joining on player name loses the provenance instead of stealing another player's", () => {
  const out = mutating(
    "row-lineage.ts",
    "  return [String(subject.gamePk), subject.marketKey, String(subject.playerId), subject.line ?? \"\", side].join(\"|\");",
    "  return [String(subject.gamePk), subject.marketKey, String(subject.playerName), subject.line ?? \"\", side].join(\"|\");",
    (t) => `import { buildPregameObservationIndex } from ${JSON.stringify(t)};
const index = buildPregameObservationIndex(${JSON.stringify(SAME_NAME)});
const hit = index.lookup(${JSON.stringify(SAME_NAME[0][0])});
console.log(hit == null ? "NULL" : hit.capturedAt);`,
  );
  assert.equal(
    out,
    "NULL",
    "a name join must collapse the two players and be refused — it must never resolve to either one",
  );

  // Unmutated, each player keeps their own captured price.
  const index = buildPregameObservationIndex(SAME_NAME);
  assert.equal(index.lookup(SAME_NAME[0][0]).noVigProbability, 0.61);
  assert.equal(index.lookup(SAME_NAME[1][0]).noVigProbability, 0.44);
});
