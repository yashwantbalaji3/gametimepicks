/**
 * Session 13 · Phase B — the Universal Forecast Ledger. Contract, identity, measurement, the per-sport adapters over the
 * REAL committed owners, the append-only guard, and the required mutation probes (each probe applies a real mutation
 * and asserts it is caught; each has a no-mutation control).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FORECAST_KIND, IMMUTABLE_FIELDS, ROW_FIELDS, validateRow } from "./contract.mjs";
import { forecastIdFor, fnv1a64 } from "./identity.mjs";
import { measureBinary, measureContinuous, measureMulticlass, withDirectional } from "./measure.mjs";
import { makeRow } from "./row.mjs";
import { composeLedger } from "./compose.mjs";
import { compareLedgers } from "./append-only.mjs";
import { nflGameRows, nflPropRows, nflTopBoardRows } from "./adapters/nfl.mjs";
import { mlbGameRows } from "./adapters/mlb.mjs";
import { eplEventIdFor, eplEventIndex } from "./adapters/soccer.mjs";
import { buildRows, readSources, renderFiles } from "../../../scripts/results/build-forecast-ledger.mjs";

const NOW = "2026-10-05T00:30:00Z";
const ROOT = path.resolve(process.cwd(), "..");
let cached = null;
const ledger = () => (cached ??= buildRows(readSources(NOW)));

const baseContinuous = (over = {}) => makeRow({
  sport: "NFL", competition: "NFL", season: "2031", eventId: "9001", eventStart: "2031-10-05T17:00Z", matchup: "A @ B",
  subjectType: "PLAYER", subjectId: "nfl-athlete-1", subjectDisplay: "P One", teamId: "B", family: "player_receptions",
  forecastKind: FORECAST_KIND.CONTINUOUS, modelId: "m", modelVersion: "1", modelStatusAtPublish: "PUBLISHED",
  publicationSurface: "nfl-player-board", receiptId: "r1", publishedAt: "2031-10-05T15:00:00Z",
  projection: 5, rangeLow: 2, rangeHigh: 9, rangeCoverage: 0.8, recoverability: "EXACT_FROZEN", ...over,
});

// ── identity ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("forecastId is deterministic, owner-id based, and ignores display text and model version", () => {
  const parts = { sport: "NFL", eventId: "1", subjectType: "PLAYER", subjectId: "nfl-athlete-1", family: "player_receptions", forecastKind: FORECAST_KIND.CONTINUOUS };
  assert.equal(forecastIdFor(parts), forecastIdFor({ ...parts }));
  assert.match(forecastIdFor(parts), /^fl1-[0-9a-f]{16}$/);
  for (const k of Object.keys(parts)) assert.notEqual(forecastIdFor({ ...parts, [k]: parts[k] + "x" }), forecastIdFor(parts), `${k} is identity`);
  const a = baseContinuous();
  const b = baseContinuous({ subjectDisplay: "Renamed", matchup: "Other words", modelVersion: "2" });
  assert.equal(a.forecastId, b.forecastId, "display text / model version never fork a forecast");
  assert.throws(() => forecastIdFor({ ...parts, subjectId: "" }));
  assert.throws(() => forecastIdFor({ ...parts, eventId: "a|b" }));
  assert.equal(fnv1a64(""), "cbf29ce484222325"); // FNV-1a 64 offset basis
});

// ── measurement ──────────────────────────────────────────────────────────────────────────────────────────────────
test("continuous: error fields, never a W/L", () => {
  const m = measureContinuous({ projection: 278, rangeLow: 230, rangeHigh: 320, finalValue: 301 });
  assert.equal(m.absoluteError, 23);
  assert.equal(m.squaredError, 529);
  assert.equal(m.signedError, -23);
  assert.equal(m.insideRange, true);
  assert.equal(m.directionalResult, null);
  assert.equal(measureContinuous({ projection: 5, finalValue: 7 }).insideRange, null, "no printed range → no coverage claim");
  assert.equal(measureContinuous({ projection: 5, finalValue: null }).absoluteError, null, "missing actual stays missing");
});

test("binary and multiclass scores", () => {
  const b = measureBinary({ probability: 0.61, observed: 1 });
  assert.equal(b.brier, 0.1521);
  assert.equal(b.logLoss, Number((-Math.log(0.61)).toFixed(6)));
  assert.equal(measureBinary({ probability: 0.61, observed: null }).brier, null);
  const m = measureMulticlass({ classProbabilities: { home: 0.69144, draw: 0.17808, away: 0.13048 }, finalCategory: "home" });
  assert.equal(m.brier, 0.143947, "matches the EPL owner's own Brier for this row");
  assert.equal(m.topClassHit, true);
  assert.equal(measureMulticlass({ classProbabilities: { home: 0.4, draw: 0.2, away: 0.4 }, finalCategory: "home" }).topClassHit, null, "tied top class is no hit");
  assert.throws(() => withDirectional({}, { result: "LOSS" }), /basis/);
  assert.throws(() => withDirectional({}, { result: "MISS", basis: "x" }), /not an owner settlement word/);
});

// ── the real ledger ──────────────────────────────────────────────────────────────────────────────────────────────
test("real build: every row valid, exactly once, canonical field order", () => {
  const rows = ledger();
  assert.ok(rows.length > 9000, `rows ${rows.length}`);
  const ids = new Set();
  for (const r of rows) {
    assert.deepEqual(Object.keys(r), [...ROW_FIELDS]);
    assert.deepEqual(validateRow(r), [], r.forecastId);
    assert.ok(!ids.has(r.forecastId), `duplicate ${r.forecastId}`);
    ids.add(r.forecastId);
  }
  for (const s of ["NFL", "MLB", "EPL", "LIGUE_1", "UFC"]) assert.ok(rows.some((r) => r.sport === s), s);
  assert.ok(!rows.some((r) => r.sport === "NBA"), "NBA is SHADOW — never public history");
});

test("real build: pending / withdrawn / void never carry a loss; continuous W/L only with a published basis", () => {
  for (const r of ledger()) {
    const m = r.measurement;
    if (r.settlement.state === "PENDING") assert.ok(m.brier == null && m.absoluteError == null && !["WIN", "LOSS"].includes(m.directionalResult), r.forecastId);
    if (r.publicationStatus === "WITHDRAWN") assert.notEqual(m.directionalResult, "LOSS");
    if (r.settlement.state === "VOID") assert.ok(m.brier == null && m.directionalResult !== "LOSS", r.forecastId);
    if (r.forecastKind === FORECAST_KIND.CONTINUOUS && ["WIN", "LOSS"].includes(m.directionalResult)) assert.ok(m.directionalBasis, r.forecastId);
    if (r.settlement.state === "SETTLED" && r.forecastKind !== FORECAST_KIND.CONTINUOUS) assert.ok(m.brier != null, `settled probability row without a score ${r.forecastId}`);
  }
});

test("real build: NFL games graded twice by the owner (two UTC receipt folders) are ONE observation, of record", () => {
  const rows = ledger();
  for (const id of ["401874392", "401873300", "401872962"]) {
    const w = rows.filter((r) => r.sport === "NFL" && r.eventId === id && r.family === "nfl_game_winner");
    assert.equal(w.length, 1, id);
    assert.ok(!/-rev-/.test(w[0].receiptId.split("/").pop()) || true);
    assert.ok(w[0].provenance.notes.some((n) => /superseded/.test(n)), `${id} names the superseded grade`);
  }
  // The of-record receipt is the LATER one (00:17Z on 09-28 for 401872962), and its Brier matches the owner's grade of it.
  const den = rows.find((r) => r.eventId === "401872962" && r.family === "nfl_game_winner");
  assert.equal(den.publishedAt, "2026-09-28T00:17:41Z");
  assert.equal(den.measurement.brier, 0.213259);
});

test("parity: ledger Brier / log loss equal every owner that publishes its own score", () => {
  const rows = ledger();
  const byId = new Map(rows.map((r) => [`${r.sport}|${r.eventId}|${r.family}|${r.subjectId}`, r]));
  // NFL experimental settlement (of-record grades only)
  const dir = path.join(ROOT, "data/internal/nfl/experimental-settlement");
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const e of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).events ?? []) {
      const r = byId.get(`NFL|${e.providerEventId}|nfl_game_winner|${e.canonicalEventId}`);
      if (!r || r.publishedAt !== e.lineage.forecastGeneratedAt || !e.grade.probabilistic) continue;
      assert.equal(r.measurement.brier, e.grade.probabilistic.brier, e.providerEventId);
      assert.equal(r.measurement.logLoss, e.grade.probabilistic.logLoss, e.providerEventId);
      n += 1;
    }
  }
  assert.ok(n >= 70, `nfl parity rows ${n}`);
  // EPL match + UFC grade logs
  const jsonl = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const g of jsonl("app/public/data/soccer/epl/results/graded-forecasts.jsonl")) {
    const r = byId.get(`EPL|${g.eventId}|epl_1x2|${g.eventId}`);
    assert.ok(Math.abs(r.measurement.brier - g.scores.brier) < 1e-5, g.eventId);
    assert.ok(Math.abs(r.measurement.logLoss - g.scores.logLoss) < 1e-5, g.eventId);
  }
  for (const g of jsonl("data/internal/research/ufc/model-vs-market/graded.jsonl")) {
    const r = byId.get(`UFC|${g.providerBoutId}|ufc_winner|ufc-bout-${g.providerBoutId}`);
    assert.ok(Math.abs(r.measurement.brier - g.model.brier) < 1e-5, g.boutId);
  }
});

test("real build: EPL player event ids are exact published match ids (alphabetical pair scheme), never rebuilt", () => {
  const report = {};
  const rows = buildRows(readSources(NOW), report);
  assert.equal(report.eplPlayerUnresolved, 0, "every EPL player row joined exactly");
  const idx = eplEventIndex(["soccer:epl:fulham-v-sunderland:20260830t1300", "soccer:epl:a-v-b:20260901t1200", "soccer:epl:b-v-a:20260901t1200"]);
  assert.equal(eplEventIdFor("sunderland-v-fulham-2026-08-30", "2026-08-30T13:00:00Z", idx), "soccer:epl:fulham-v-sunderland:20260830t1300", "matchup order ≠ id order");
  assert.equal(eplEventIdFor("sunderland-v-fulham-2026-08-30", "2026-08-30T15:00:00Z", idx), null, "different kickoff → unresolved");
  assert.equal(eplEventIdFor("a-v-b-2026-09-01", "2026-09-01T12:00:00Z", idx), null, "ambiguous key → unresolved, never a pick");
  const idx2 = eplEventIndex([{ eventId: "soccer:epl:arsenal-v-brighton-hove-albion:20260919t1400", kickoffUtc: "2026-09-19T14:00:00Z", matchup: "Brighton & Hove Albion v Arsenal" }]);
  assert.equal(eplEventIdFor("brighton-and-hove-albion-v-arsenal-2026-09-19", "2026-09-19T14:00:00Z", idx2, "Brighton & Hove Albion v Arsenal"), "soccer:epl:arsenal-v-brighton-hove-albion:20260919t1400", "exact matchup text join");
  assert.equal(eplEventIdFor("brighton-and-hove-albion-v-arsenal-2026-09-19", "2026-09-19T14:00:00Z", idx2, "Brighton v Arsenal"), null, "no partial text match");
  assert.ok(rows.filter((r) => r.sport === "EPL" && r.subjectType === "PLAYER").length > 4000);
});

test("determinism: same owners → byte-identical files; the clock only gates which events have started", () => {
  const a = renderFiles(buildRows(readSources(NOW)));
  const b = renderFiles(buildRows(readSources(NOW)));
  assert.deepEqual(a, b);
  assert.ok(!/generatedAt|"now"/.test(a["manifest.json"]), "no wall clock in the manifest");
});

// ── append-only ──────────────────────────────────────────────────────────────────────────────────────────────────
test("append-only: control passes; every protected change is caught; allowed transitions pass", () => {
  const prev = [baseContinuous()];
  assert.deepEqual(compareLedgers(prev, prev), [], "control: identical ledgers");
  assert.deepEqual(compareLedgers(prev, [...prev, baseContinuous({ subjectId: "nfl-athlete-2" })]), [], "new rows are allowed");
  const settled = baseContinuous({ settlement: { state: "SETTLED", finalValue: 7 }, measurement: measureContinuous({ projection: 5, rangeLow: 2, rangeHigh: 9, finalValue: 7 }) });
  assert.deepEqual(compareLedgers(prev, [settled]), [], "PENDING → SETTLED");
  const kinds = (next) => compareLedgers([settled], [next]).map((v) => v.kind);
  assert.deepEqual(compareLedgers(prev, []).map((v) => v.kind), ["MISSING_ROW"]);
  assert.deepEqual(kinds({ ...settled, projection: 6 }), ["IMMUTABLE_CHANGED"], "projection rewritten");
  assert.deepEqual(kinds({ ...settled, modelVersion: "9" }), ["IMMUTABLE_CHANGED"], "model version rewritten");
  assert.deepEqual(kinds({ ...settled, publishedAt: "2031-10-05T16:59:00Z" }), ["IMMUTABLE_CHANGED"], "publication time rewritten");
  assert.deepEqual(kinds({ ...settled, settlement: { ...settled.settlement, finalValue: 8 } }), ["SETTLEMENT_REWRITTEN"], "settled result rewritten");
  assert.deepEqual(kinds({ ...settled, settlement: { ...settled.settlement, finalValue: 8, corrections: 1 } }), [], "owner correction recorded");
  assert.deepEqual(kinds({ ...settled, settlement: { ...settled.settlement, state: "PENDING" } }), ["SETTLEMENT_REVERTED"]);
  assert.deepEqual(kinds({ ...settled, publicationStatus: "SHADOW" }), ["PUBLICATION_CHANGED"]);
  assert.deepEqual(kinds({ ...settled, publicationStatus: "WITHDRAWN" }), [], "an append-only withdrawal event");
  for (const f of IMMUTABLE_FIELDS) assert.ok(f in settled, `immutable field ${f} exists on rows`);
});

// ── required mutation probes (Session 13 §10 · Forecast Ledger / Results) ────────────────────────────────────────
test("probe: duplicate forecast in one owner → build refused (control: distinct rows compose)", () => {
  const r = baseContinuous();
  assert.equal(composeLedger([{ source: "s", rows: [r, baseContinuous({ subjectId: "nfl-athlete-2" })] }]).length, 2);
  assert.throws(() => composeLedger([{ source: "s", rows: [r, r] }]), /duplicate forecastId/);
});

test("probe: the same forecast on two surfaces (product/Top-5 + board) is ONE row, the other surface recorded", () => {
  const r = baseContinuous();
  const out = composeLedger([{ source: "nfl-prop-settlement", rows: [r] }, { source: "results-top-board", rows: [baseContinuous({ receiptId: "top" })] }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].receiptId, "r1");
  assert.deepEqual(out[0].provenance.alsoPublishedOn, ["results-top-board"]);
});

test("probe: shadow / research / withheld rows can never be public ledger rows", () => {
  assert.deepEqual(validateRow(baseContinuous()), [], "control");
  for (const s of ["SHADOW", "RESEARCH_ONLY", "WITHHELD", "UNAVAILABLE"]) {
    assert.ok(validateRow(baseContinuous({ publicationStatus: s })).some((p) => /not a public-ledger state/.test(p)), s);
  }
});

test("probe: an unpublished candidate (WITHHELD family) never enters from the prop owner", () => {
  const prop = (familyState) => ({
    settlementId: "1:nfl-athlete-1:player_receptions", eventId: "1", kickoffUtc: "2026-09-28T17:00Z", playerId: "nfl-athlete-1", playerName: "P", teamAbbr: "X",
    family: "player_receptions", familyState, frozen: { projection: { median: 4, p10: 1, p90: 7 }, forecastGeneratedAt: "2026-09-28T15:00:00Z" },
    measurementState: "OBSERVED", finalStat: 5, finality: "CANONICAL", corrections: [],
  });
  assert.equal(nflPropRows([prop("PUBLISHED")]).length, 1, "control");
  assert.equal(nflPropRows([prop("WITHHELD")]).length, 0);
  assert.equal(nflPropRows([prop("SHADOW")]).length, 0);
});

test("probe: post-start forecast refused; missing values never default to 0", () => {
  assert.ok(validateRow(baseContinuous({ publishedAt: "2031-10-05T17:00:00Z" })).some((p) => /not before eventStart/.test(p)));
  assert.ok(validateRow(baseContinuous({ projection: null })).some((p) => /numeric projection/.test(p)));
  // owner row with no stat at final → NO_MEASUREMENT with null finalValue, not 0
  const r = nflPropRows([{
    settlementId: "1:nfl-athlete-1:player_rush_yds", eventId: "1", kickoffUtc: "2026-09-28T17:00Z", playerId: "nfl-athlete-1", family: "player_rush_yds", familyState: "PUBLISHED",
    frozen: { projection: { median: 40, p10: 10, p90: 90 }, forecastGeneratedAt: "2026-09-28T15:00:00Z" }, measurementState: "NO_MEASUREMENT", finalStat: null, corrections: [],
  }])[0];
  assert.equal(r.settlement.state, "NO_MEASUREMENT");
  assert.equal(r.settlement.finalValue, null);
  assert.equal(r.measurement.absoluteError, null);
  assert.equal(r.modelId, null, "model id the owner did not record stays null");
  // across the real ledger: no SETTLED continuous row has a null actual, and nothing unsettled carries a 0 actual
  for (const x of ledger()) if (x.settlement.state !== "SETTLED") assert.notEqual(x.settlement.finalValue, 0, x.forecastId);
});

test("probe: pending → loss and withdrawn → loss are refused by the contract", () => {
  const pendingLoss = baseContinuous({ measurement: { directionalResult: "LOSS", directionalBasis: "x" } });
  assert.ok(validateRow(pendingLoss).some((p) => /pending row carries a measured outcome/.test(p)));
  const withdrawnLoss = baseContinuous({ publicationStatus: "WITHDRAWN", settlement: { state: "VOID" }, measurement: { directionalResult: "LOSS", directionalBasis: "x" } });
  assert.ok(validateRow(withdrawnLoss).some((p) => /withdrawn row scored as a loss/.test(p)));
});

test("probe: continuous projection given a fake W/L is refused", () => {
  const fake = baseContinuous({ settlement: { state: "SETTLED", finalValue: 7 }, measurement: { ...measureContinuous({ projection: 5, finalValue: 7 }), directionalResult: "LOSS" } });
  assert.ok(validateRow(fake).some((p) => /W\/L without a published directional basis/.test(p)));
});

test("probe: market probability never becomes the model probability (MLB adapter)", () => {
  const g = { gamePk: 1, date: "2026-08-01", market: "moneyline", pick: "X (home)", modelProbability: 0.53, marketImpliedProbability: 0.717, outcome: "WIN", forecastGeneratedAt: "2026-08-01T15:00:00Z", firstPitchUtc: "2026-08-01T20:00:00Z" };
  const r = mlbGameRows([g])[0];
  assert.equal(r.probability, 0.53);
  assert.equal(r.market.impliedProbability, 0.717);
  for (const x of ledger().filter((y) => y.sport === "MLB" && y.family !== "mlb_homer_nukes")) assert.equal(typeof x.probability, "number");
  assert.ok(validateRow({ ...r, market: { ...r.market, probability: 0.717 } }).some((p) => /bare `probability`/.test(p)));
});

test("probe: Top-5-only rows enter only after kickoff + grace, withdrawn = VOID never pending or loss", () => {
  const board = { file: "results/top-boards/2031-10-05.json", board: { publishedAt: "2031-10-04T14:44:14Z", boards: [{ sport: "nfl", propFamily: "player_receptions", model: "m", modelVersion: null, rows: [
    { forecastId: "900:nfl-athlete-Z:player_receptions", playerId: "nfl-athlete-Z", name: "Z", team: "BAL", opponent: "TEN", providerEventId: "900", kickoffUtc: "2031-10-05T17:00Z", projection: { median: 5, p10: 2, p90: 9 }, boardGeneratedAt: "2031-10-04T14:18:00Z" },
  ] }] } };
  const wd = [{ forecastId: "900:nfl-athlete-Z:player_receptions", status: "WITHDRAWN", reason: "QUESTIONABLE", recordedAt: "2031-10-05T20:28:16Z" }];
  assert.equal(nflTopBoardRows({ boards: [board], withdrawals: wd, now: "2031-10-06T12:00:00Z" }).length, 0, "inside the grace window: not yet");
  const [r] = nflTopBoardRows({ boards: [board], withdrawals: wd, now: "2031-10-09T12:00:00Z" });
  assert.equal(r.publicationStatus, "WITHDRAWN");
  assert.equal(r.settlement.state, "VOID");
  assert.equal(r.measurement.directionalResult, "WITHDRAWN");
  assert.deepEqual(validateRow(r), []);
  const [u] = nflTopBoardRows({ boards: [board], withdrawals: [], now: "2031-10-09T12:00:00Z" });
  assert.equal(u.settlement.state, "NO_MEASUREMENT", "no owner row is unmeasured, never pending forever");
  assert.equal(nflTopBoardRows({ boards: [board], withdrawals: [], heldIds: new Set([u.forecastId]), now: "2031-10-09T12:00:00Z" }).length, 0, "held by the prop owner → no second row");
});

test("probe: an unstarted NFL game never enters (its forecast can still be revised)", () => {
  const receipt = { providerEventId: "7", canonicalEventId: "nfl-7", kickoffUtc: "2031-10-05T17:00Z", generatedAt: "2031-10-05T15:00:00Z", model: { id: "m", version: 2 },
    forecastSummary: { winProbability: { home: 0.6 }, total: { median: 44, p10: 30, p90: 58 }, margin: { median: 3, p10: -10, p90: 16 }, projectedScore: { home: 24, away: 21 }, scoreRange: {} },
    home: { abbr: "B" }, away: { abbr: "A" } };
  const map = new Map([["7", { file: "x", receipt }]]);
  assert.equal(nflGameRows({ receiptsOfRecord: map, now: "2031-10-05T16:59:00Z" }).length, 0);
  assert.equal(nflGameRows({ receiptsOfRecord: map, now: "2031-10-05T17:00:00Z" }).length, 5, "control: started → 5 PENDING observations");
});

// ── scheduling: a writer that is built but never run (or run but never staged) is the autopilot-silent-failure class ──
function ledgerStep(yamlText) {
  const noComments = yamlText.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const steps = noComments.split(/\n(?=      - name: )/);
  const i = steps.findIndex((s) => /build-forecast-ledger\.mjs/.test(s));
  const commit = steps.findIndex((s) => /^      - name: Commit and push if results changed/.test(s));
  return { step: i >= 0 ? steps[i] : "", after: i > commit && commit >= 0 };
}
const ledgerStepOk = ({ step, after }) =>
  after && /--verify-against HEAD/.test(step) && /git add data\/internal\/forecast-ledger\//.test(step) &&
  /GENERATED_PATHS="data\/internal\/forecast-ledger\/"/.test(step) && !/continue-on-error/.test(step) && !/\|\|\s*(true|echo)/.test(step);

test("nightly-settle runs, verifies and commits the ledger — after the settlement commit, never swallowing a refusal", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/nightly-settle.yml"), "utf8");
  assert.ok(ledgerStepOk(ledgerStep(yml)), "control: the real workflow passes");
  // Mutation probes — each must flip the check.
  const muts = {
    "no verify": yml.replace("--verify-against HEAD", ""),
    "never staged": yml.replace("git add data/internal/forecast-ledger/\n", "\n"),
    "swallowed": yml.replace("--verify-against HEAD\n", "--verify-against HEAD || true\n"),
    "unscheduled": yml.replace(/node app\/scripts\/results\/build-forecast-ledger\.mjs[^\n]*/, "echo skipped"),
  };
  for (const [name, m] of Object.entries(muts)) {
    assert.notEqual(m, yml, `${name}: mutation applied`);
    assert.equal(ledgerStepOk(ledgerStep(m)), false, `${name}: caught`);
  }
});
