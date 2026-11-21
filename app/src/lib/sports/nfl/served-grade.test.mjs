/**
 * NFL grade rule (served-grade.mjs, served-grade-io.mjs) — founder 2026-11-09, CANON-01 Option B.
 * Synthetic fixtures for the rule; the committed weeks only to prove history is untouched.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/served-grade.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATUS, servedForecastOfRecord } from "../../publication-evidence/served-revision.mjs";
import {
  BASIS, DECISION, HOLD_REASON, NFL_SERVED_GRADE_FROM, RECORD_CLOCK, buildFreezeRecord, decideGradedRevision, freezeSpan, gradedAgainstRecord, gradingReceiptFor,
  inFreezeSpan, nflForecastContentHash, servedWithNearCutoffResolved,
} from "./served-grade.mjs";
import { gradedAgainstFor, readFreezeRecord, writeOnce } from "./served-grade-io.mjs";

const KICK = "2026-11-16T18:00Z";
const KICK_S = "2026-11-16T18:00:00Z";
const fc = (gen, pHome, state = "NO_STARTING_QB_ABSENCE") => ({
  providerEventId: "501", canonicalEventId: "nfl:501", matchup: "AAA @ BBB", kickoffUtc: KICK, generatedAt: gen,
  home: { abbr: "BBB" }, away: { abbr: "AAA" }, seasonType: 2, week: 11,
  model: { id: "nfl-forecast", version: "3", inputHash: `in-${gen}` }, teamInputs: { state },
  forecastSummary: { winProbability: { home: pHome, away: 1 - pHome }, projectedScore: { home: 24, away: 21 }, total: { median: 45, p10: 30, p90: 60 }, margin: { median: 3, p10: -10, p90: 16 } },
});
const A = fc("2026-11-15T20:00:00Z", 0.6); // the revision frozen at 21:30Z the day before
const B = fc("2026-11-16T17:58:30Z", 0.61); // generated 90 s before kickoff; its build was READY after kickoff (the week-7 case)
const C = fc("2026-11-16T15:00:00Z", 0.55); // a late replacement served before kickoff (a starter ruled out)
const Cblind = fc("2026-11-16T15:00:00Z", 0.55, "BLIND_TO_STARTING_QB_ABSENCE");
const OLD = fc("2026-11-15T12:00:00Z", 0.58); // older than the freeze
const H = nflForecastContentHash;
const cand = (f, recorded = true) => ({ id: recorded ? `receipts/${f.generatedAt}.json` : `union@${f.generatedAt}`, generatedAt: f.generatedAt, contentHash: H(f), recorded, forecast: f });
const span = freezeSpan("2026-11-15");
const freezeOf = (f) => buildFreezeRecord({ record: { basis: "LIVE", forecast: f, snapshot: { snapshotId: `snap-${f.generatedAt}` } }, startingQbs: [{ team: "BBB", playerId: "nfl-athlete-2", eligibility: { state: "ELIGIBLE" } }, { team: "AAA", playerId: "nfl-athlete-1", eligibility: { state: "ELIGIBLE" } }], span });

/** served-revision inputs: builds by sha serve the given forecast; READY times in order. */
function served(builds, { candidates = [A, B, C, OLD].map((f) => cand(f)), window = { from: "2026-11-10T00:00:00Z", to: "2026-11-17T00:00:00Z" } } = {}) {
  const deployments = builds.map(([sha, readyAt], i) => ({ id: `d${i}`, sha, readyAt, state: "READY" }));
  const by = new Map(builds.map(([sha, , f]) => [sha, f]));
  const args = { start: { scheduledStarts: [KICK_S] }, deployments, evidenceWindow: window, servedAt: (sha) => ({ ok: true, game: by.get(sha) ?? null }), candidates, hashOf: H, recordClock: RECORD_CLOCK };
  return { args, result: servedWithNearCutoffResolved(args) };
}
const decide = (s, freeze, candidates = [A, B, C, OLD].map((f) => cand(f))) => decideGradedRevision({ eventId: "501", kickoffUtc: KICK, freeze, served: s, candidates });

test("freeze span: a day's freeze is taken before 21:30Z and covers kickoffs in [21:30Z, next day 21:30Z)", () => {
  assert.deepEqual(span, { frozenBefore: "2026-11-15T21:30:00Z", from: "2026-11-15T21:30:00Z", to: "2026-11-16T21:30:00Z" });
  assert.ok(inFreezeSpan(KICK, span) && inFreezeSpan("2026-11-15T21:30Z", span));
  assert.ok(!inFreezeSpan("2026-11-16T21:30Z", span) && !inFreezeSpan("2026-11-15T21:25Z", span));
});

test("freeze record: forecast id / version / content hash / snapshot id, eligibility@1 (R5 + starting QBs), deterministic", () => {
  const r = freezeOf(A);
  assert.deepEqual(r.forecast, { basis: "LIVE", generatedAt: A.generatedAt, modelId: "nfl-forecast", modelVersion: "3", inputHash: A.model.inputHash, contentHash: H(A), snapshotId: `snap-${A.generatedAt}` });
  assert.equal(r.frozenBefore, "2026-11-15T21:30:00Z");
  assert.deepEqual(r.eligibility.r5, { teamInputsState: "NO_STARTING_QB_ABSENCE", publishable: true, reasons: [], contractVersion: "eligibility@1" });
  assert.deepEqual(r.eligibility.startingQbs.map((q) => q.team), ["AAA", "BBB"], "sorted, so the bytes do not depend on board order");
  assert.equal(JSON.stringify(freezeOf(A)), JSON.stringify(r));
  assert.doesNotMatch(JSON.stringify(r), /"(now|capturedAt|writtenAt)"/, "no clock of the run");
  assert.equal(freezeOf(fc(A.generatedAt, 0.6, "BLIND_TO_STARTING_QB_ABSENCE")).eligibility.r5.publishable, false);
});

test("write-once: a new record is written; identical bytes are UNCHANGED; different bytes are a CONFLICT and the file stands", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grade-rule-"));
  const p = path.join(dir, "data/internal/nfl/grade-freeze/2026-11-15/501.json");
  assert.equal(writeOnce(p, freezeOf(A)), "WROTE");
  const bytes = fs.readFileSync(p, "utf8");
  assert.equal(writeOnce(p, freezeOf(A)), "UNCHANGED");
  assert.equal(writeOnce(p, freezeOf(C)), "CONFLICT");
  assert.equal(fs.readFileSync(p, "utf8"), bytes, "the existing record is never rewritten");
  // a later day's record never replaces the earliest
  writeOnce(path.join(dir, "data/internal/nfl/grade-freeze/2026-11-16/501.json"), freezeOf(C));
  assert.equal(readFreezeRecord(dir, "501").forecast.generatedAt, A.generatedAt);
});

test("served = frozen ⇒ GRADE FROZEN_REVISION_SERVED, with the deployment proof", () => {
  const { result } = served([["s1", "2026-11-15T20:30:00Z", A], ["s2", "2026-11-16T17:00:00Z", A]]);
  const d = decide(result, freezeOf(A));
  assert.equal(d.decision, DECISION.GRADE);
  assert.equal(d.basis, BASIS.FROZEN_REVISION_SERVED);
  assert.deepEqual(d.revision, { generatedAt: A.generatedAt, contentHash: H(A), receipt: `receipts/${A.generatedAt}.json` });
  assert.equal(d.servedProof.deployment.sha, "s2");
  assert.equal(d.servedProof.publishedAt, "2026-11-15T20:30:00Z", "first READY build that served those bytes");
});

test("401873023 / week-7 style: the newest GENERATED revision was never served ⇒ the served (frozen) one is graded, not the newest", () => {
  // B was generated 90 s before kickoff but its build became READY 20 minutes after kickoff
  const { result } = served([["s1", "2026-11-15T20:30:00Z", A], ["s2", "2026-11-16T18:20:00Z", B]]);
  assert.equal(result.status, STATUS.SERVED);
  assert.equal(result.forecastOfRecord.generatedAt, A.generatedAt);
  const d = decide(result, freezeOf(A));
  assert.equal(d.basis, BASIS.FROZEN_REVISION_SERVED);
  const legacy = [A, B].filter((x) => Date.parse(x.generatedAt) < Date.parse(KICK_S)).sort((x, y) => y.generatedAt.localeCompare(x.generatedAt))[0];
  assert.equal(legacy.generatedAt, B.generatedAt, "the legacy rule (newest generated before kickoff) would have graded B");
  assert.equal(gradingReceiptFor({ kickoffUtc: KICK, legacyReceipt: legacy, receipts: [A, B], decision: d }).receipt.generatedAt, A.generatedAt, "the served rule grades A");
});

test("late replacement: valid only when served before kickoff, recorded, and eligible (R5); otherwise HOLD", () => {
  const builds = [["s1", "2026-11-15T20:30:00Z", A], ["s3", "2026-11-16T15:10:00Z", C]];
  const ok = decide(served(builds).result, freezeOf(A));
  assert.equal(ok.decision, DECISION.GRADE);
  assert.equal(ok.basis, BASIS.LATE_REPLACEMENT);
  assert.equal(ok.revision.generatedAt, C.generatedAt);
  assert.equal(ok.replacement.eligibility.publishable, true);
  // not recorded: the served replacement exists only in a build's public union
  const unrecorded = [A, B, OLD].map((f) => cand(f)).concat([cand(C, false)]);
  const h1 = decide(served(builds, { candidates: unrecorded }).result, freezeOf(A), unrecorded);
  assert.deepEqual([h1.decision, h1.reason], [DECISION.HOLD, HOLD_REASON.REPLACEMENT_NOT_RECORDED]);
  // ineligible: the replacement's team model is blind to a starting-QB absence
  const blind = [A, B, OLD].map((f) => cand(f)).concat([cand(Cblind)]);
  const h2 = decide(served([["s1", "2026-11-15T20:30:00Z", A], ["s3", "2026-11-16T15:10:00Z", Cblind]], { candidates: blind }).result, freezeOf(A), blind);
  assert.deepEqual([h2.decision, h2.reason], [DECISION.HOLD, HOLD_REASON.REPLACEMENT_INELIGIBLE]);
  // generated before kickoff but published after it: not a replacement at all (the frozen revision was served)
  assert.equal(decide(served([["s1", "2026-11-15T20:30:00Z", A], ["s3", "2026-11-16T18:30:00Z", C]]).result, freezeOf(A)).basis, BASIS.FROZEN_REVISION_SERVED);
});

test("HOLD paths: no freeze, an older revision served, an evidence gap, an unresolved near-kickoff ambiguity", () => {
  const good = served([["s1", "2026-11-15T20:30:00Z", A]]).result;
  assert.deepEqual([decide(good, null).decision, decide(good, null).reason], [DECISION.HOLD, HOLD_REASON.NO_FREEZE_RECORD]);
  const old = decide(served([["s0", "2026-11-15T13:00:00Z", OLD]]).result, freezeOf(A));
  assert.deepEqual([old.decision, old.reason], [DECISION.HOLD, HOLD_REASON.FROZEN_REVISION_NOT_SERVED]);
  const gap = decide(served([["s1", "2026-11-15T20:30:00Z", A]], { window: { from: "2026-11-10T00:00:00Z", to: "2026-11-16T12:00:00Z" } }).result, freezeOf(A));
  assert.deepEqual([gap.decision, gap.reason], [DECISION.HOLD, HOLD_REASON.NOT_VERIFIED_SERVED]);
  assert.match(gap.detail, /^EVIDENCE_GAP/);
  // a build recorded READY 2 min after kickoff (inside the record's 7-min lateness) that served DIFFERENT bytes: ambiguous
  const amb = served([["s1", "2026-11-15T20:30:00Z", A], ["s2", "2026-11-16T18:02:00Z", C]]).result;
  assert.equal(amb.status, STATUS.AMBIGUOUS_NEAR_CUTOFF);
  assert.equal(decide(amb, freezeOf(A)).reason, HOLD_REASON.NOT_VERIFIED_SERVED);
  assert.equal(decide(amb, freezeOf(A)).servedProof?.deployment?.sha ?? null, "s2", "the ambiguous deployment is named in the hold");
});

test("near-kickoff ambiguity is resolved only when every build that could have been serving served the same bytes", () => {
  const raw = served([["s1", "2026-11-15T20:30:00Z", A], ["s2", "2026-11-16T18:02:00Z", A]]);
  assert.equal(servedForecastOfRecord(raw.args).status, STATUS.AMBIGUOUS_NEAR_CUTOFF, "the evidence rule alone is ambiguous");
  assert.equal(raw.result.status, STATUS.SERVED);
  assert.deepEqual(raw.result.nearCutoffResolved.deployments.map((d) => d.sha), ["s2"]);
  const d = decide(raw.result, freezeOf(A));
  assert.equal(d.basis, BASIS.FROZEN_REVISION_SERVED);
  assert.ok(d.servedProof.nearCutoffResolved);
});

test("forward only: kickoffs before NFL_SERVED_GRADE_FROM keep the legacy rule; the reconciliation grades the decided receipt or holds", () => {
  const before = "2026-11-09T18:00Z";
  assert.ok(Date.parse(before) < Date.parse(NFL_SERVED_GRADE_FROM));
  assert.equal(decideGradedRevision({ eventId: "1", kickoffUtc: before, freeze: null, served: null, candidates: [] }).decision, DECISION.LEGACY);
  assert.deepEqual(gradingReceiptFor({ kickoffUtc: before, legacyReceipt: B, receipts: [A, B], decision: null }), { receipt: B, rule: DECISION.LEGACY });
  assert.equal(gradingReceiptFor({ kickoffUtc: KICK, legacyReceipt: B, receipts: [A, B], decision: null }).hold.reason, "NO_DECISION");
  const hold = decide(served([["s0", "2026-11-15T13:00:00Z", OLD]]).result, freezeOf(A));
  assert.equal(gradingReceiptFor({ kickoffUtc: KICK, legacyReceipt: B, receipts: [A, B], decision: hold }).hold.reason, HOLD_REASON.FROZEN_REVISION_NOT_SERVED);
  const g = decide(served([["s1", "2026-11-15T20:30:00Z", A]]).result, freezeOf(A));
  assert.equal(gradingReceiptFor({ kickoffUtc: KICK, legacyReceipt: B, receipts: [B], decision: g }).hold.reason, HOLD_REASON.NO_RECORDED_RECEIPT, "a decided revision with no receipt is not graded");
});

test("results hook: the graded-against record names the revision, the served proof and the outcome (or the hold)", () => {
  const g = decide(served([["s1", "2026-11-15T20:30:00Z", A]]).result, freezeOf(A));
  const rec = gradedAgainstRecord({ eventId: "501", decision: g, reconciliationGame: { state: "FINAL", final: { home: 27, away: 20 }, team: [{ prop: "winner", outcome: "HIT" }], published: { generatedAt: A.generatedAt } } });
  assert.deepEqual([rec.rule, rec.status, rec.basis, rec.revision.generatedAt, rec.servedProof.deployment.sha, rec.outcome.team[0].outcome], ["SERVED_RULE", "GRADED", BASIS.FROZEN_REVISION_SERVED, A.generatedAt, "s1", "HIT"]);
  assert.equal(gradedAgainstRecord({ eventId: "501", decision: g, reconciliationGame: null }).status, "AWAITING_FINAL");
  const hold = gradedAgainstRecord({ eventId: "501", decision: decide(served([["s1", "2026-11-15T20:30:00Z", A]]).result, null) });
  assert.deepEqual([hold.status, hold.hold.reason, hold.outcome], ["HOLD", HOLD_REASON.NO_FREEZE_RECORD, null]);
});

test("HISTORY UNTOUCHED: every committed graded game kicked off before the rule and keeps its graded revision (legacy rule)", () => {
  const ROOT = path.resolve(process.cwd(), "..");
  const dir = path.join(ROOT, "app/public/data/nfl/reconciliation");
  const receiptsRoot = path.join(ROOT, "data/internal/nfl/forecast-receipts");
  const all = new Map();
  for (const d of fs.readdirSync(receiptsRoot).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
    for (const f of fs.readdirSync(path.join(receiptsRoot, d)).filter((x) => x.endsWith(".json"))) {
      const r = JSON.parse(fs.readFileSync(path.join(receiptsRoot, d, f), "utf8"));
      if (r?.providerEventId && r.generatedAt && r.kickoffUtc && Date.parse(r.generatedAt) < Date.parse(r.kickoffUtc)) (all.get(String(r.providerEventId)) ?? all.set(String(r.providerEventId), []).get(String(r.providerEventId))).push(r);
    }
  }
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d-\d{2}\.json$/.test(x))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.ok(!("held" in doc), `${f}: no held list on a week graded before the rule`);
    for (const g of doc.games) {
      assert.ok(Date.parse(g.kickoffUtc.replace(/Z$/, ":00Z")) < Date.parse(NFL_SERVED_GRADE_FROM), `${g.providerEventId} kicked off before the rule`);
      const revs = all.get(String(g.providerEventId)) ?? [];
      const legacy = revs.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? null;
      const sel = gradingReceiptFor({ kickoffUtc: g.kickoffUtc, legacyReceipt: legacy, receipts: revs, decision: { decision: "HOLD", reason: "must be ignored" } });
      assert.equal(sel.rule, DECISION.LEGACY);
      assert.equal(sel.receipt.generatedAt, g.published.generatedAt, `${g.providerEventId}: same graded revision`);
      n += 1;
    }
  }
  assert.ok(n > 100, `${n} graded games checked`);
  const legacyRec = gradedAgainstFor(ROOT, "401873023");
  assert.deepEqual([legacyRec.rule, legacyRec.status, legacyRec.revision.generatedAt], [DECISION.LEGACY, "GRADED", "2026-10-29T16:04:09Z"]);
});

test("the scripts: the freeze refuses at or after 21:30Z; the decide dry run over history refuses --write", async () => {
  const { spawnSync } = await import("node:child_process");
  const tsx = (args) => spawnSync("npx", ["tsx", ...args], { cwd: process.cwd(), encoding: "utf8" });
  const late = tsx(["scripts/nfl/freeze-official-forecasts.mjs", "--now", "2026-11-15T21:30:00Z", "--write"]);
  assert.equal(late.status, 2, late.stderr);
  assert.match(late.stderr, /REFUSED: .* at or after the 2026-11-15T21:30:00Z freeze deadline/);
  const hist = tsx(["scripts/nfl/decide-served-grade.mjs", "--now", "2026-11-09T12:00:00Z", "--deployments", "x.json", "--from", "2026-10-01T00:00:00Z", "--write"]);
  assert.equal(hist.status, 2, hist.stderr);
  assert.match(hist.stderr, /REFUSED: --from is a dry run/);
});
