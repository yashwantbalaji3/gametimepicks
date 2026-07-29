/**
 * SPRINT 045 — the Python and TypeScript lineage contracts must agree.
 *
 * WHY THIS EXISTS
 * Settlement is Python; the surfaces are TypeScript. Sprint 045 mirrored the lineage contract into
 * `pipeline/mlb/settlement_lineage.py` rather than bridging at runtime, because a subprocess call
 * inside the ledger write path adds more failure modes than the check removes.
 *
 * A mirrored contract is only worth anything while the mirror holds. Two implementations that quietly
 * diverge are worse than one: each side passes its own tests, and the disagreement surfaces as a
 * settled result that one half of the codebase considers valid and the other does not — which is
 * indistinguishable from the Sprint 044 defect it exists to prevent.
 *
 * So this runs both implementations over the SAME fixtures and asserts they agree, including the real
 * 2026-07-22 PIT @ NYY collision. Sprint 043's historical audit was credible precisely because a Python
 * gate and a TypeScript test independently produced the same quarantine list; this makes that property
 * a standing guarantee rather than a happy coincidence.
 *
 * Run: npx tsx --test src/lib/identity/cross-language-agreement.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { deriveEventId } from "./event-identity.ts";
import { OFFICIAL_SETTLEMENT_SOURCES, validateSettlementLineage } from "./settlement-lineage.ts";

const REPO = path.resolve(process.cwd(), "..");

/** Run a snippet against the Python implementation and parse its JSON result. */
function python(snippet) {
  const out = execFileSync("python3", ["-c", snippet], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: REPO },
  });
  return JSON.parse(out);
}

// ── event id derivation ────────────────────────────────────────────────────────

const ID_CASES = [
  // The real doubleheader — the case the whole contract exists for.
  { sport: "mlb", league: "MLB", names: ["New York Yankees", "Pittsburgh Pirates"], start: "2026-07-22T17:05:00Z" },
  { sport: "mlb", league: "MLB", names: ["New York Yankees", "Pittsburgh Pirates"], start: "2026-07-22T23:05:00Z" },
  // Argument order must not matter.
  { sport: "mlb", league: "MLB", names: ["Pittsburgh Pirates", "New York Yankees"], start: "2026-07-22T17:05:00Z" },
  // League token collapsing when it slugs to the sport.
  { sport: "mlb", league: "mlb", names: ["Cincinnati Reds", "Cleveland Guardians"], start: "2026-07-28T17:40:00Z" },
  // No league at all.
  { sport: "ufc", league: null, names: ["Alex Pereira", "Jamahal Hill"], start: "2026-04-13T02:00:00Z" },
  // A league that differs from the sport.
  { sport: "soccer", league: "EPL", names: ["Arsenal", "Chelsea"], start: "2026-08-01T14:00:00Z" },
  // Accents and punctuation.
  { sport: "mlb", league: "MLB", names: ["Montréal Expos", "St. Louis Cardinals"], start: "2026-05-23T17:10:00Z" },
  // Unscheduled.
  { sport: "mlb", league: "MLB", names: ["A Team", "B Team"], start: null },
  // Sub-minute precision must be truncated identically on both sides.
  { sport: "mlb", league: "MLB", names: ["A Team", "B Team"], start: "2026-07-22T17:05:30.500Z" },
];

test("deriveEventId agrees across Python and TypeScript on every case", () => {
  const cases = JSON.stringify(ID_CASES);
  const pythonIds = python(
    `import json
from pipeline.mlb.settlement_lineage import derive_event_id
cases = json.loads(${JSON.stringify(cases)})
print(json.dumps([
    derive_event_id(sport=c["sport"], league=c["league"],
                    participant_names=c["names"], scheduled_start=c["start"])
    for c in cases
]))`,
  );

  const tsIds = ID_CASES.map((c) =>
    deriveEventId({
      sport: c.sport,
      league: c.league,
      participants: c.names.map((name) => ({ name })),
      scheduledStart: c.start,
    }),
  );

  assert.equal(pythonIds.length, ID_CASES.length);
  for (let i = 0; i < ID_CASES.length; i += 1) {
    assert.equal(
      tsIds[i],
      pythonIds[i],
      `case ${i} (${ID_CASES[i].names.join(" v ")} @ ${ID_CASES[i].start}) diverged:\n` +
        `  ts:     ${tsIds[i]}\n  python: ${pythonIds[i]}`,
    );
  }

  // Sanity: the fixtures must actually exercise the doubleheader distinction, or agreement is trivial.
  assert.notEqual(tsIds[0], tsIds[1], "the two halves must derive distinct ids");
  assert.equal(tsIds[0], tsIds[2], "argument order must not change the id");
});

// ── lineage validation ─────────────────────────────────────────────────────────

const GAME_1 = "2026-07-22T17:05:00Z";
const GAME_2 = "2026-07-22T23:05:00Z";
const EVENT_1 = "mlb:new-york-yankees-v-pittsburgh-pirates:20260722t1705";
const EVENT_2 = "mlb:new-york-yankees-v-pittsburgh-pirates:20260722t2305";

/** Fixtures in the Python row shape; converted to the TS shape below. */
const LINEAGE_CASES = [
  {
    label: "clean",
    rows: [
      { id: "a", eventId: EVENT_1, providerEventId: "alias-1", gamePk: 823518, marketKey: "batter_hits", outcome: "Win", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStartTime: GAME_1 },
    ],
    expect: false,
  },
  {
    label: "the real 2026-07-22 collision",
    rows: [
      { id: "g1", eventId: EVENT_1, providerEventId: "823519", gamePk: 823518, marketKey: "batter_hits", outcome: "Win", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStartTime: GAME_1 },
      { id: "g2", eventId: EVENT_2, providerEventId: "823519", gamePk: 823519, marketKey: "batter_hits", outcome: "Loss", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStartTime: GAME_2 },
    ],
    expect: true,
  },
  {
    // The REAL 2026-07-22 shape: distinct eventIds, distinct provider ids, SAME gamePk. Every alias
    // check passes; only grading-source injectivity catches it.
    label: "same gamePk, two distinct events",
    rows: [
      { id: "g1", eventId: EVENT_1, providerEventId: "alias-1", gamePk: 823519, marketKey: "batter_hits", outcome: "Win", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStartTime: GAME_1 },
      { id: "g2", eventId: EVENT_2, providerEventId: "alias-2", gamePk: 823519, marketKey: "batter_hits", outcome: "Loss", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStartTime: GAME_2 },
    ],
    expect: true,
  },
  {
    label: "duplicate prediction",
    rows: [
      { id: "a", eventId: EVENT_1, providerEventId: "alias-1", gamePk: 823518, marketKey: "batter_hits", outcome: "Win", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStartTime: GAME_1 },
      { id: "a", eventId: EVENT_1, providerEventId: "alias-1", gamePk: 823518, marketKey: "batter_hits", outcome: "Loss", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStartTime: GAME_1 },
    ],
    expect: true,
  },
  {
    label: "settled before the event",
    rows: [
      { id: "a", eventId: EVENT_1, providerEventId: "alias-1", gamePk: 823518, marketKey: "batter_hits", outcome: "Win", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-22T12:00:00Z", eventStartTime: GAME_1 },
    ],
    expect: true,
  },
  {
    label: "untrusted source",
    rows: [
      { id: "a", eventId: EVENT_1, providerEventId: "alias-1", gamePk: 823518, marketKey: "batter_hits", outcome: "Win", settlementSource: "web-search-snippet", settledAt: "2026-07-23T04:00:00Z", eventStartTime: GAME_1 },
    ],
    expect: true,
  },
  {
    label: "missing lineage",
    rows: [{ id: "a", eventId: "", providerEventId: "", gamePk: null, marketKey: "", outcome: "", settlementSource: "", settledAt: "" }],
    expect: true,
  },
];

test("both implementations agree on which fixtures are publishable", () => {
  const pythonVerdicts = python(
    `import json
from pipeline.mlb.settlement_lineage import validate_settlement_lineage
cases = json.loads(${JSON.stringify(JSON.stringify(LINEAGE_CASES))})
print(json.dumps([len(validate_settlement_lineage(c["rows"])) > 0 for c in cases]))`,
  );

  const tsVerdicts = LINEAGE_CASES.map((c) => {
    const rows = c.rows.map((r) => ({
      predictionId: r.id,
      eventId: r.eventId,
      marketId: r.marketKey,
      outcome: r.outcome,
      settlementSource: r.settlementSource,
      settledAt: r.settledAt,
      eventStart: r.eventStartTime,
      joinedProviderId: r.providerEventId,
      gradedAgainstId: r.gamePk,
    }));
    return validateSettlementLineage(rows).length > 0;
  });

  for (let i = 0; i < LINEAGE_CASES.length; i += 1) {
    const { label, expect } = LINEAGE_CASES[i];
    assert.equal(tsVerdicts[i], expect, `TS verdict wrong for "${label}"`);
    assert.equal(pythonVerdicts[i], expect, `Python verdict wrong for "${label}"`);
    assert.equal(
      tsVerdicts[i],
      pythonVerdicts[i],
      `implementations diverged on "${label}": ts=${tsVerdicts[i]} python=${pythonVerdicts[i]}`,
    );
  }

  // The fixture set must contain both outcomes, or "they agree" is vacuous.
  assert.ok(tsVerdicts.includes(true) && tsVerdicts.includes(false), "fixtures must exercise both verdicts");
});

test("the official-source allowlists are identical", () => {
  const pythonSources = python(
    `import json
from pipeline.mlb.settlement_lineage import OFFICIAL_SETTLEMENT_SOURCES
print(json.dumps(sorted(OFFICIAL_SETTLEMENT_SOURCES)))`,
  );
  assert.deepEqual(
    [...OFFICIAL_SETTLEMENT_SOURCES].sort(),
    pythonSources,
    "an allowlist that drifts between languages means one side settles from a source the other forbids",
  );
});
