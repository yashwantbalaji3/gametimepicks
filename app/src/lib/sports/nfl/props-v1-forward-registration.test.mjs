/**
 * N8 — props-v1 receiving yards REGISTERED forward test: counting rules. Small committed SYNTHETIC fixture
 * (__fixtures__/props-v1-forward-registration/weeks.json), never the live slate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lastPreKickoffRevision, servedModelOf, readPropsV1PromotionBars, readShareLevelForwardBars, stableJson } from "./props-v1-forward-receipt.mjs";
import {
  scheduleFromCaptures, regularSeasonWeeks, firstWeekAfter, classifyEvent, EVENT_CODE, EXCLUSION_REASON,
  buildWeekReceipt, appendWeekReceipt, summarize, weekFileName, pointsFromRows, registeredPipelineVersion, ROW_COLUMNS,
} from "./props-v1-forward-registration.mjs";
import {
  deriveNflFamilyGates, propsV1ForwardEvidence, FAMILY_BLOCKER, PROPS_V1_FORWARD_ELIGIBILITY_FLAG,
} from "../../products/engine-v2/family-gate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const FX = JSON.parse(fs.readFileSync(path.join(HERE, "__fixtures__/props-v1-forward-registration/weeks.json"), "utf8"));
const PROTOCOL_PATH = "data/internal/research/nfl/reports/player-props-v1-reception-yds-forward-protocol.json";
const PROTOCOL = JSON.parse(rd(PROTOCOL_PATH));
const PROTOCOL_REF = { path: PROTOCOL_PATH, sha256: "fixture" };
const REG = FX.registration;
const SERIES = PROTOCOL.series;
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Fixture event → classifyEvent input, through the SAME revision selector the grader uses. */
function facts(e) {
  const chosen = lastPreKickoffRevision(e.history, e.kickoffUtc, (commit) => e.history.find((h) => h.commit === commit).doc);
  const h = chosen ? e.history.find((x) => x.commit === chosen.commit) : null;
  const family = chosen?.doc.families?.player_reception_yds ?? null;
  const pipelineVersion = h?.pipelineVersion ?? SERIES.pipelineVersion;
  return {
    ...e,
    revision: chosen ? {
      commit: chosen.commit, committedAt: chosen.committedAt, generatedAt: chosen.doc.generatedAt, family, servedModel: servedModelOf(family),
      pipelineVersion, identityMismatches: h.identityMismatches ?? [], roleSharesSha256: h.roleSharesSha256, boardBuilderSha256: h.boardBuilderSha256,
    } : null,
    rows: (e.rows ?? []).map((r) => [...r, pipelineVersion]), // the grader stamps each row with the version that produced it
    servedRows: (e.rows ?? []).length || (chosen ? 1 : 0),
  };
}
const ctx = { asOf: FX.asOfReady, model: PROTOCOL.model, series: PROTOCOL.series };
const weekEvents = (w) => FX.weeks[w].events.map(facts);
const build = (w, { asOf = FX.asOfReady, events = weekEvents(w), firstWeek = 11 } = {}) => buildWeekReceipt({
  week: w, firstWeek, firstKickoffUtc: events[0].kickoffUtc, events, asOf, protocol: PROTOCOL, protocolRef: PROTOCOL_REF,
  registration: REG, builtFromCommit: "fixture-rev", inputs: { fixture: { path: "weeks.json", sha256: "fixture" } },
});
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "n8-reg-"));

test("N8 reg · a board revision committed (or generated) at/after kickoff is never the graded one", () => {
  const e1 = FX.weeks[11].events[0];
  const chosen = lastPreKickoffRevision(e1.history, e1.kickoffUtc, (c) => e1.history.find((h) => h.commit === c).doc);
  assert.equal(chosen.commit, "c-91101-pregame", "the newer post-kickoff revision must be skipped");
  const e2 = FX.weeks[11].events[1]; // newest committed AT kickoff, older committed before but generated after
  assert.equal(lastPreKickoffRevision(e2.history, e2.kickoffUtc, (c) => e2.history.find((h) => h.commit === c).doc), null);
  const r = build(11).receipt;
  const l = r.events.find((x) => x.eventId === "91102");
  assert.equal(l.code, EVENT_CODE.NO_PRE_KICKOFF_REVISION);
  assert.equal(l.reason, EXCLUSION_REASON.NO_PRE_KICKOFF_REVISION);
  assert.ok(!r.rows.some((row) => row[0] === "91102"));
  for (const ev of r.events.filter((x) => x.attribution)) {
    assert.equal(ev.attribution.committedBeforeKickoff, true);
    assert.equal(ev.attribution.generatedBeforeKickoff, true);
  }
  // defence in depth: a post-kickoff revision handed straight to the classifier is refused, never graded
  const bad = facts(FX.weeks[11].events[0]);
  bad.revision = { ...bad.revision, commit: "c-91101-postgame", committedAt: "2026-11-20T04:00:00Z" };
  assert.throws(() => classifyEvent(bad, ctx), /not before kickoff/);
});

test("N8 reg · firstWeek is computed from the schedule, and a pre-registration week never counts", () => {
  const schedule = scheduleFromCaptures(FX.captures);
  assert.equal(schedule.get("91101").kickoffUtc, "2026-11-20T01:15Z", "the latest capture of an event wins");
  const weeks = regularSeasonWeeks(schedule, REG.committedAt);
  assert.deepEqual([...weeks.keys()], [10, 11, 12]);
  assert.ok(!weeks.get(11).events.some((e) => e.eventId === "92003"), "next season's week 11 is cut");
  assert.equal(firstWeekAfter(weeks, REG.committedAt), 11, "week 10 started before registration, even though one of its games kicks off after it");
  assert.equal(firstWeekAfter(weeks, "2026-11-20T01:15:00Z"), 12, "a week whose first kickoff equals registration is not after it");
  assert.ok(!Object.hasOwn(PROTOCOL, "firstWeek") && !Object.hasOwn(PROTOCOL.frozen ?? {}, "firstWeek"), "the protocol states the rule, never a literal week");
  const wk10 = [{ eventId: "91002", kickoffUtc: "2026-11-17T01:15Z", inSchedule: true, hasBoard: true, revision: null, final: true, sheetMissing: [], servedRows: 0 }];
  assert.throws(() => build(10, { events: wk10 }), /before the registered first week/);
  const w11 = build(11).receipt;
  const fake10 = { ...clone(w11), week: 10 };
  assert.throws(() => summarize({ protocol: PROTOCOL, protocolRef: PROTOCOL_REF, registration: REG, firstWeek: 11, firstWeekFirstKickoffUtc: "x", weekReceipts: [w11, fake10], pendingWeeks: [], retrospective: null }), /never counts/);
});

test("N8 reg · the denominator closes: every event of the week is GRADED or carries one exclusion code", () => {
  const r = build(11).receipt;
  const ids = FX.weeks[11].events.map((e) => e.eventId).sort();
  assert.deepEqual(r.events.map((e) => e.eventId).sort(), ids, "every event exactly once");
  const d = r.denominator;
  assert.equal(d.closes, true);
  assert.equal(d.scheduledEvents, 5);
  assert.equal(d.boardOnlyEvents, 1);
  assert.equal(d.graded, 2);
  assert.deepEqual(d.excluded, { NO_BOARD: 1, NO_PRE_KICKOFF_REVISION: 1, OTHER_PIPELINE_VERSION: 1, SHARE_LEVEL_SERVED: 1 });
  assert.equal(d.graded + Object.values(d.excluded).reduce((s, n) => s + n, 0), d.events);
  assert.deepEqual(d.rowStates, { SCORED: 3, VOID_ZERO_OPPORTUNITY: 0, VOID_NO_OFFENSE_SNAPS: 1, EXCLUDED_NO_SHEET: 0 });
  for (const e of r.events) assert.ok(e.code === EVENT_CODE.GRADED ? e.reason === null : typeof e.reason === "string" && e.reason.length > 0, `${e.eventId} needs a reason`);
  // a non-terminal event holds the whole week back — nothing partial is written
  const early = weekEvents(11).map((e) => (e.eventId === "91101" ? { ...e, final: false } : e));
  assert.deepEqual(build(11, { events: early }).pending, { PENDING_NOT_FINAL: 1 });
  assert.deepEqual(build(11, { asOf: FX.asOfPending }).pending, { PENDING_KICKOFF: 5 });
});

test("N8 reg · engine / basis attribution: only props-v1 rows of the frozen engine are graded", () => {
  assert.equal(servedModelOf({ basis: "props-v1 evaluation: n=3575, all promotion bars pass" }), PROTOCOL.model.servedModelId);
  assert.equal(servedModelOf({ basis: "props-v1 evaluation", model: "nfl-player-share-level-v1" }), "nfl-player-share-level-v1");
  const r = build(11).receipt;
  const by = Object.fromEntries(r.events.map((e) => [e.eventId, e]));
  assert.equal(by["91103"].code, EVENT_CODE.SHARE_LEVEL_SERVED);
  assert.equal(by["91105"].code, EVENT_CODE.OTHER_PIPELINE_VERSION);
  assert.deepEqual(by["91105"].attribution.identityMismatches, ["app/src/lib/sports/nfl/player-props-v1.mjs"]);
  assert.equal(by["91105"].attribution.engine, null);
  const g = by["91101"].attribution;
  assert.deepEqual(g, {
    boardRevision: "c-91101-pregame", committedAt: "2026-11-19T20:00:00Z", boardGeneratedAt: "2026-11-19T19:59:00Z",
    familyState: "PUBLISHED", familyBasis: "props-v1 evaluation: n=3575, all promotion bars pass", servedModel: "props-v1",
    engine: "nfl-player-props-v1-opportunity-efficiency", pipelineVersion: SERIES.pipelineVersion, identityMismatches: [],
    roleSharesArtifactSha256: "fixture-role-shares-sha", boardBuilderSha256: "fixture-board-builder-sha", committedBeforeKickoff: true, generatedBeforeKickoff: true,
  });
  assert.equal(by["91199"].attribution.familyState, "ESTIMATE", "the state is recorded as served");
  const other = facts(FX.weeks[11].events[0]);
  other.revision = { ...other.revision, family: { state: "PUBLISHED", basis: "anytime-td-v1 calibration" }, servedModel: "anytime-td-v1" };
  assert.equal(classifyEvent(other, ctx), EVENT_CODE.NOT_PROPS_V1);
  assert.equal(r.engine.id, PROTOCOL.model.engineId);
});

test("N8 reg · output is deterministic: delete → regenerate → byte-identical (week and summary)", () => {
  const dir = tmp();
  try {
    const write = () => {
      for (const w of [11, 12]) appendWeekReceipt({ fs, path, dir, week: w, season: 2026, receipt: build(w).receipt });
      const weekReceipts = fs.readdirSync(dir).filter((f) => /wk/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      fs.writeFileSync(path.join(dir, "summary.json"), stableJson(summarize({ protocol: PROTOCOL, protocolRef: PROTOCOL_REF, registration: REG, firstWeek: 11, firstWeekFirstKickoffUtc: "2026-11-20T01:15Z", weekReceipts, pendingWeeks: [], retrospective: null })));
      return Object.fromEntries(fs.readdirSync(dir).sort().map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
    };
    const first = write();
    assert.deepEqual(Object.keys(first), ["2026-wk11.json", "2026-wk12.json", "summary.json"]);
    for (const f of Object.keys(first)) fs.rmSync(path.join(dir, f));
    assert.deepEqual(write(), first);
    for (const text of Object.values(first)) assert.ok(!/"(generatedAt|gradedAt|now|asOf)"\s*:/.test(text), "no wall-clock field");
    const s = JSON.parse(first["summary.json"]);
    assert.equal(s.families.player_reception_yds.state, "ACCUMULATING");
    assert.equal(s.families.player_reception_yds.n, 4);
    assert.equal(s.families.player_reception_yds.needed, 300);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("N8 reg · appending week N+1 leaves week N's bytes unchanged, and a written week is never rewritten", () => {
  const dir = tmp();
  try {
    assert.equal(appendWeekReceipt({ fs, path, dir, week: 11, season: 2026, receipt: build(11).receipt }), "written");
    const wk11 = fs.readFileSync(path.join(dir, weekFileName(2026, 11)), "utf8");
    assert.equal(appendWeekReceipt({ fs, path, dir, week: 12, season: 2026, receipt: build(12).receipt }), "written");
    assert.equal(fs.readFileSync(path.join(dir, weekFileName(2026, 11)), "utf8"), wk11);
    const changed = { ...build(11).receipt, builtFromCommit: "a-later-commit" };
    assert.equal(appendWeekReceipt({ fs, path, dir, week: 11, season: 2026, receipt: changed }), "kept-existing");
    assert.equal(fs.readFileSync(path.join(dir, weekFileName(2026, 11)), "utf8"), wk11);
    assert.equal(appendWeekReceipt({ fs, path, dir, week: 11, season: 2026, receipt: build(11).receipt }), "unchanged");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("N8 reg · protocol bars are verbatim copies of their committed sources", () => {
  const v1 = readPropsV1PromotionBars({ evaluatorSource: rd("app/scripts/nfl/evaluate-nfl-player-props.mjs"), evaluationReceipt: JSON.parse(rd("data/internal/research/nfl/reports/player-props-v1-evaluation.json")) });
  for (const [k, v] of Object.entries(v1)) assert.deepEqual(PROTOCOL.bars.propsV1Promotion[k], v, k);
  assert.equal(PROTOCOL.bars.propsV1Promotion.minimumN, 300);
  const sl = readShareLevelForwardBars(JSON.parse(rd(PROTOCOL.bars.shareLevelLevel.source.path)));
  assert.deepEqual(PROTOCOL.bars.shareLevelLevel.levelBand, sl.levelBand);
  assert.match(PROTOCOL.pOver.reconstructed, /serves NO P\(over\)/);
});

test("N8 reg · eligibility: flag OFF changes nothing; ON shows the forward test's real state", () => {
  const receipts = [
    { identity: { sport: "nfl" }, legClass: "PLAYER", market: { family: "player_reception_yds" }, forecast: { modelVersion: "props-v1" }, context: {} },
    { identity: { sport: "nfl" }, legClass: "PLAYER", market: { family: "player_receptions" }, forecast: { modelVersion: "props-v1" }, context: {} },
  ];
  const familyState = new Map([["player_reception_yds", "PUBLISHED"], ["player_receptions", "PUBLISHED"]]);
  const summary = (state) => ({ artifact: "props-v1-reception-yds-forward-summary", families: { player_reception_yds: { state, n: 4, needed: 300, metrics: null } } });
  const gate = (propsV1Forward) => deriveNflFamilyGates({ receipts, forwardReceipt: null, familyState, propsV1Forward });
  const yds = (gs) => gs.find((g) => g.family === "player_reception_yds").blockers;
  const off = propsV1ForwardEvidence({ env: {}, read: () => summary("ACCUMULATING") });
  assert.equal(off, null, "default OFF");
  assert.equal(propsV1ForwardEvidence({ env: { [PROPS_V1_FORWARD_ELIGIBILITY_FLAG]: "true" }, read: () => summary("ACCUMULATING") }), null, "only exactly 1 turns it on");
  assert.deepEqual(gate(off), gate(null));
  assert.ok(yds(gate(off)).includes(FAMILY_BLOCKER.MODEL_FORWARD_UNREGISTERED));
  const on = (s) => propsV1ForwardEvidence({ env: { [PROPS_V1_FORWARD_ELIGIBILITY_FLAG]: "1" }, read: () => summary(s) });
  const acc = gate(on("ACCUMULATING"));
  assert.ok(yds(acc).includes(FAMILY_BLOCKER.MODEL_FORWARD_ACCUMULATING) && !yds(acc).includes(FAMILY_BLOCKER.MODEL_FORWARD_UNREGISTERED));
  assert.ok(yds(gate(on("FORWARD_BREACHED"))).includes(FAMILY_BLOCKER.MODEL_FORWARD_BREACHED));
  assert.deepEqual(acc.find((g) => g.family === "player_receptions"), gate(null).find((g) => g.family === "player_receptions"), "no other family moves");
});

test("N8 reg · a served-pipeline version change starts another series and is never pooled", () => {
  // the version is a function of every frozen file: change any one (e.g. a role-share parity fix) → a new version
  assert.equal(registeredPipelineVersion(PROTOCOL), SERIES.pipelineVersion);
  const fixed = clone(PROTOCOL);
  fixed.model.frozenFiles.find((f) => f.path === "app/scripts/nfl/build-nfl-role-shares.mjs").sha256 = "0".repeat(64);
  const v2 = registeredPipelineVersion(fixed);
  assert.notEqual(v2, SERIES.pipelineVersion);
  // an event served by another version is excluded from this series, rows and all
  const other = weekEvents(12).map((e) => ({ ...e, revision: { ...e.revision, pipelineVersion: v2 }, rows: e.rows.map((r) => [...r.slice(0, -1), v2]) }));
  const r12 = build(12, { events: other }).receipt;
  assert.equal(r12.events[0].code, EVENT_CODE.OTHER_PIPELINE_VERSION);
  assert.equal(r12.events[0].attribution.pipelineVersion, v2);
  assert.equal(r12.rows.length, 0);
  // every graded row records the version that produced it
  const r11 = build(11).receipt;
  const vi = ROW_COLUMNS.indexOf("pipelineVersion");
  assert.ok(r11.rows.length > 0 && r11.rows.every((row) => row[vi] === SERIES.pipelineVersion));
  // a row or a week of another version can never enter this series' numbers
  assert.throws(() => pointsFromRows([[...r11.rows[0].slice(0, -1), v2]], 11, SERIES.pipelineVersion), /never pooled/);
  const s2Week = { ...build(12).receipt, series: { id: "s2", pipelineVersion: v2 } };
  assert.throws(() => summarize({ protocol: PROTOCOL, protocolRef: PROTOCOL_REF, registration: REG, firstWeek: 11, firstWeekFirstKickoffUtc: "x", weekReceipts: [r11, s2Week], pendingWeeks: [], retrospective: null }), /never pooled/);
});
