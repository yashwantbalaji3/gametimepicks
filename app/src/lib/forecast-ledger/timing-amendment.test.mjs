/**
 * forecast-ledger@1 AMENDMENT 2 · TIMING (founder decision 2, 2026-10-10). One general rule, no special cases:
 * scheduled start, verified actual start, generation, freeze and verified public publication are five different
 * instants. Existing rows carry no timing and are unchanged byte for byte.
 *
 * Run: npx tsx --test src/lib/forecast-ledger/timing-amendment.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_AMENDMENTS, OPTIONAL_IMMUTABLE_FIELDS, OPTIONAL_ROW_FIELDS, TIMING_SCHEMA, ofRecordBeforeStart, validateRow, validateTiming } from "./contract.mjs";
import { makeRow } from "./row.mjs";
import { compareLedgers } from "./append-only.mjs";

const base = (over = {}) => makeRow({
  sport: "MLB", competition: "MLB", season: "2026", eventId: "824424", eventStart: "2026-09-04T18:10:00Z", matchup: "A @ B",
  subjectType: "GAME", subjectId: "mlb-824424", subjectDisplay: "A @ B", family: "mlb_moneyline", forecastKind: "BINARY_PROBABILITY",
  publicationSurface: "mlb-game-prediction", receiptId: "git:abc", publishedAt: "2026-09-04T18:00:00Z",
  probability: 0.55, probabilityType: "MODEL", direction: "B (home)", categoryPrediction: "B (home)",
  settlement: { state: "SETTLED", finalValue: 1, finalCategory: "WIN" }, measurement: { type: "PROBABILITY_SCORE", brier: 0.2, logLoss: 0.6, observed: 1, directionalResult: "WIN", directionalBasis: "PUBLISHED_PICK" },
  recoverability: "OWNER_GRADED_LOG", ...over,
});
// 2026-09-04 game 824424 — the real evidence (#1046): a rain delay. Scheduled 18:10Z; first pitch recorded
// 19:15:11.585Z (interval from 19:15:01.585Z); the served revision was generated 18:31:58Z and first served by a READY
// deployment at 18:40:02.616Z; the deployment serving at the start was READY 19:09:21.846Z.
const TIMING_824424 = {
  schema: TIMING_SCHEMA,
  scheduledStart: "2026-09-04T18:10:00Z",
  actualStart: { from: "2026-09-04T19:15:01.585Z", to: "2026-09-04T19:15:11.585Z", basis: "PITCH_EVENT", source: "MLB StatsAPI playByPlay" },
  generatedAt: "2026-09-04T18:31:58.000Z",
  frozenAt: null,
  servedAt: "2026-09-04T18:40:02.616Z",
  publicationEvidence: { kind: "PRODUCTION_DEPLOYMENT_READY", deploymentId: "dpl_4GHLhmRnhk5mhA8QBpbvfF5pUZsN", commitSha: "84322714e12caa82b8dd78699001262562aed36d", readyAt: "2026-09-04T19:09:21.846Z", servedHash: "db1b46354ec1b2f35a273e7bcbf6f3e7c387766c742400733d1994b5bb0beb22", source: "Vercel API capture (#1042)" },
};

test("existing rows are untouched: no timing field, byte-identical serialisation, the original rule", () => {
  const r = base();
  assert.equal("timing" in r, false);
  assert.deepEqual(validateRow(r), []);
  assert.deepEqual(validateRow(base({ publishedAt: "2026-09-04T18:31:58Z" })), ["publishedAt is not before eventStart"]);
  assert.ok(OPTIONAL_ROW_FIELDS.includes("timing") && OPTIONAL_IMMUTABLE_FIELDS.includes("timing"));
  assert.equal(CONTRACT_AMENDMENTS.find((a) => a.id === "forecast-ledger@1/amendment-2").date, "2026-10-10");
});

test("824424, as a general case: generated after the SCHEDULED start, served before the VERIFIED actual start → of record", () => {
  const r = base({ publishedAt: "2026-09-04T18:31:58.000Z", timing: TIMING_824424 });
  assert.equal(r.eventStart, "2026-09-04T18:10:00Z", "identity's start unchanged");
  assert.equal(ofRecordBeforeStart(r), true);
  assert.deepEqual(validateRow(r), []);
  // The same row WITHOUT verified timing is refused by the original rule: nothing is exempted.
  assert.deepEqual(validateRow(base({ publishedAt: "2026-09-04T18:31:58.000Z" })), ["publishedAt is not before eventStart"]);
});

test("the actual-start rule is strict: served or generated at/after the earliest instant of the actual start refuses", () => {
  const served = base({ publishedAt: "2026-09-04T18:31:58Z", timing: { ...TIMING_824424, servedAt: "2026-09-04T19:15:01.585Z" } });
  assert.deepEqual(validateRow(served), ["not generated and served before the verified actual start"]);
  const gen = base({ publishedAt: "2026-09-04T19:16:00Z", timing: { ...TIMING_824424, generatedAt: "2026-09-04T19:16:00Z" } });
  assert.deepEqual(validateRow(gen), ["not generated and served before the verified actual start"]);
});

test("unverified timing never relaxes the rule: no served time, or a served time with no evidence", () => {
  const noServed = base({ publishedAt: "2026-09-04T18:31:58Z", timing: { ...TIMING_824424, servedAt: null, publicationEvidence: null } });
  assert.deepEqual(validateRow(noServed), ["publishedAt is not before eventStart"], "falls back to the scheduled-start rule");
  const noEvidence = base({ publishedAt: "2026-09-04T17:00:00Z", timing: { ...TIMING_824424, publicationEvidence: null } });
  assert.ok(validateRow(noEvidence).includes("timing.servedAt without publication evidence"));
  // A served time with no evidence does not unlock the actual-start rule either.
  const late = base({ publishedAt: "2026-09-04T18:31:58Z", timing: { ...TIMING_824424, publicationEvidence: null } });
  assert.ok(validateRow(late).includes("publishedAt is not before eventStart"));
});

test("timing is validated: schema, intervals, and scheduledStart must equal eventStart", () => {
  assert.ok(validateTiming({ ...TIMING_824424, schema: "x" }, base()).includes("timing.schema"));
  assert.ok(validateTiming({ ...TIMING_824424, actualStart: { from: "2026-09-04T19:16:00Z", to: "2026-09-04T19:15:00Z", basis: "PITCH_EVENT" } }, base()).includes("timing.actualStart interval"));
  assert.ok(validateTiming({ ...TIMING_824424, scheduledStart: "2026-09-04T18:15:00Z" }, base()).includes("timing.scheduledStart differs from eventStart"));
});

test("append-only: timing can be added to an existing row only by a restatement that lists it, exactly", () => {
  const prev = base();
  const next = base({ timing: TIMING_824424 });
  assert.ok(compareLedgers([prev], [next]).some((v) => v.kind === "IMMUTABLE_CHANGED" && /timing/.test(v.detail)));
  const listed = new Map([[prev.forecastId, { restatementId: "t", fields: { timing: { before: undefined, after: TIMING_824424 } } }]]);
  assert.deepEqual(compareLedgers([prev], [next], { restatements: listed }), []);
  // Once present it is immutable.
  const changed = base({ timing: { ...TIMING_824424, servedAt: "2026-09-04T18:50:00Z" } });
  assert.ok(compareLedgers([next], [changed]).some((v) => v.kind === "IMMUTABLE_CHANGED"));
});
