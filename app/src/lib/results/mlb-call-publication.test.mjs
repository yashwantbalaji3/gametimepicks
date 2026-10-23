/**
 * F05 (independent audit 2026-10-23) — an MLB game call's publication status at first pitch. Pins the rule on
 * fixtures, proves the committed history is the one git derives, and reconciles the split with the graded ledger and
 * the Forecast Record's ledger rows: every graded call lands in exactly one status, none is dropped or regraded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { mlbCallPublication, servedEvidence, publicationTally, MLB_CALL_PUBLICATION_HISTORY, MLB_CALL_FAMILY } from "./mlb-call-publication.mjs";

const H = {
  surfaceLive: { commit: "s", at: "2031-07-01T12:00:00Z" },
  gateLive: { mlb_total: { commit: "g", at: "2031-07-10T12:00:00Z" }, mlb_moneyline: { commit: "g", at: "2031-07-10T12:00:00Z" },
    mlb_run_line: { commit: "g", at: "2031-07-10T12:00:00Z" }, mlb_run_line_posted: { commit: "p", at: "2031-07-10T12:00:00Z" } },
  observations: [
    { at: "2031-07-09T10:00:00Z", commit: "a", generatedAt: "2031-07-09T10:00:00Z", breached: ["mlb_total"] },
    { at: "2031-07-11T10:00:00Z", commit: "b", generatedAt: "2031-07-11T10:00:00Z", breached: ["mlb_total", "mlb_moneyline", "mlb_run_line"] },
    { at: "2031-07-12T10:00:00Z", commit: "c", generatedAt: "2031-07-12T10:00:00Z", breached: ["mlb_total"] },
    { at: "2031-07-20T10:00:00Z", commit: "d", generatedAt: "2031-07-20T10:00:00Z", breached: ["mlb_total"] },
  ],
  recordedThrough: { commit: "d", at: "2031-07-20T10:00:00Z", generatedAt: "2031-07-20T10:00:00Z" },
};
const row = (market, firstPitchUtc, o = {}) => ({ gamePk: 1, date: firstPitchUtc.slice(0, 10), market, firstPitchUtc, ...o });
const st = (r, ctx = {}) => mlbCallPublication(r, { history: H, ...ctx });

test("🔴 a call is PAUSED only when every build that could be live at first pitch had it paused", () => {
  assert.deepEqual(st(row("total", "2031-07-12T23:00:00Z")), { status: "PAUSED", reason: "PAUSED_BY_LIVE_RECORD_GATE" });
  assert.equal(st(row("moneyline", "2031-07-13T23:00:00Z")).status, "PUBLIC", "the winner pause ended 07-12 10:00, a day and more before");
  assert.equal(st(row("run_line", "2031-07-14T23:00:00Z")).status, "PUBLIC");
  assert.deepEqual(st(row("moneyline", "2031-07-12T20:00:00Z")), { status: "UNKNOWN", reason: "PAUSE_CHANGED" },
    "the pause ended inside the 24 h before first pitch: the live build could have had either — never guessed");
});

test("🔴 the gate pauses nothing before its code shipped, or on a scorecard over 72 h old", () => {
  assert.equal(st(row("total", "2031-07-09T20:00:00Z")).status, "PUBLIC", "BREACHED, but the gate code reached main 07-10 12:00");
  assert.equal(st(row("total", "2031-07-10T20:00:00Z")).status, "UNKNOWN", "the gate shipped inside the window");
  assert.equal(st(row("total", "2031-07-17T23:00:00Z")).status, "PUBLIC", "07-12 scorecard is stale by 07-15 10:00: the gate pauses nothing");
  assert.equal(st(row("total", "2031-07-15T20:00:00Z")).status, "UNKNOWN", "it went stale inside the window");
});

test("🔴 the deployment evidence decides when it names the served build; a never-public game is NOT_SERVED", () => {
  const evidence = servedEvidence({
    verifiedNeverPublic: [{ gamePk: 9, date: "2031-07-13" }],
    games: [{ gamePk: 1, date: "2031-07-12", status: "SERVED", deployment: { readyAt: "2031-07-12T15:00:00Z" } }],
  });
  assert.equal(st(row("moneyline", "2031-07-12T20:00:00Z"), { evidence }).status, "PUBLIC", "the build READY at 15:00 read the 10:00 scorecard");
  assert.deepEqual(st(row("total", "2031-07-13T20:00:00Z", { gamePk: 9 }), { evidence }), { status: "NOT_SERVED", reason: "NEVER_PUBLIC_BEFORE_START" });
});

test("🔴 the posted run line inherits the v1 run line's pause; unknown inputs are UNKNOWN, never a guess", () => {
  const evidence = servedEvidence({ games: [{ gamePk: 1, date: "2031-07-11", status: "SERVED", deployment: { readyAt: "2031-07-11T18:00:00Z" } }] });
  assert.equal(st(row("run_line_posted", "2031-07-11T23:00:00Z"), { evidence }).status, "PAUSED", "BREACHED v1 run line pauses the posted line");
  assert.equal(st(row("run_line", "2031-07-11T23:00:00Z"), { evidence }).status, "PAUSED");
  assert.equal(st(row("total", "2031-07-01T20:00:00Z")).reason, "BEFORE_CALL_SURFACE");
  assert.equal(st(row("total", "2031-07-12T20:00:00Z", { firstPitchUtc: null, date: "2031-07-12" })).reason, "NO_TIMESTAMPS");
  assert.equal(st(row("first_five", "2031-07-12T20:00:00Z")).reason, "UNKNOWN_MARKET");
});

test("🔴 after the committed history, only a current scorecard that vouches nothing changed decides", () => {
  const r = row("total", "2031-07-25T23:00:00Z");
  const card = (o) => ({ generatedAt: "2031-07-25T10:00:00Z", families: [{ id: "mlb_total", state: "BREACHED" }, { id: "mlb_moneyline", state: "WATCH" }], changes: [], ...o });
  assert.equal(st(r).status, "UNKNOWN", "no scorecard");
  assert.equal(st(r, { scorecard: card() }).status, "PAUSED");
  assert.equal(st(row("moneyline", "2031-07-25T23:00:00Z"), { scorecard: card() }).status, "PUBLIC");
  assert.equal(st(r, { scorecard: card({ changes: [{ id: "mlb_total", from: "BREACHED", to: "WATCH", at: "2031-07-22T10:00:00Z" }, { id: "mlb_total", from: "WATCH", to: "BREACHED", at: "2031-07-23T10:00:00Z" }] }) }).status,
    "UNKNOWN", "a recorded flip and back is still a change");
  assert.equal(st(r, { scorecard: card({ families: [{ id: "mlb_total", state: "WATCH" }] }) }).status, "UNKNOWN", "a state that differs from the history");
  assert.equal(st(row("total", "2031-08-20T23:00:00Z"), { scorecard: card({ generatedAt: "2031-08-20T10:00:00Z" }) }).status,
    "UNKNOWN", "its 14-day change window no longer reaches the history's end");
});

/* ── The committed history is git's ──────────────────────────────────────────────────────────── */

const ROOT = path.resolve(process.cwd(), "..");
const gitOut = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };

test("🔴 the committed history equals the derivation from git, through its recorded end", async (t) => {
  if (gitOut("rev-parse", "--is-shallow-repository") !== "false") return t.skip("shallow clone: the history cannot be derived here");
  if (gitOut("config", "--get", "remote.origin.partialclonefilter")) return t.skip("blob-less clone: deriving would fetch ~60 historical blobs");
  const ref = gitOut("rev-parse", "--verify", "-q", `${MLB_CALL_PUBLICATION_HISTORY.recordedThrough.commit}^{commit}`);
  if (!ref) return t.skip("the recorded end commit is not in this clone");
  const { deriveMlbCallPublicationHistory } = await import("../../../scripts/results/derive-mlb-call-publication-history.mjs");
  const d = deriveMlbCallPublicationHistory({ ref: "HEAD", through: MLB_CALL_PUBLICATION_HISTORY.recordedThrough.commit });
  assert.deepEqual(d.surfaceLive, MLB_CALL_PUBLICATION_HISTORY.surfaceLive);
  assert.deepEqual(d.gateLive, MLB_CALL_PUBLICATION_HISTORY.gateLive);
  assert.deepEqual(d.observations, MLB_CALL_PUBLICATION_HISTORY.observations);
  assert.deepEqual(d.recordedThrough, MLB_CALL_PUBLICATION_HISTORY.recordedThrough);
});

/* ── Real data: one status per graded call, reconciled with the Forecast Record's ledger ───────────── */

const APP = process.cwd();
const readJsonl = (p) => fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const graded = readJsonl(path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl"));
const ctx = {
  scorecard: JSON.parse(fs.readFileSync(path.join(APP, "public/data/admin/model-health.json"), "utf8")),
  evidence: servedEvidence(JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/ops/forecast-of-record-shadow/classification.json"), "utf8"))),
};

test("🔴 every graded MLB call has exactly one status; the recorded history's split is pinned", () => {
  const all = publicationTally(graded, ctx);
  assert.equal(Object.values(all.byStatus).reduce((a, b) => a + b, 0), graded.length, "no row dropped, none counted twice");
  /* Calls through 2026-10-19 — inside the committed history and the append-only ledger, so this split cannot move. */
  const settled = publicationTally(graded.filter((r) => r.date <= "2026-10-19"), ctx);
  assert.deepEqual(settled.byStatus, { PUBLIC: 2172, PAUSED: 224, NOT_SERVED: 12, UNKNOWN: 50 });
  assert.deepEqual(settled.byReason, { BEFORE_CALL_SURFACE: 48, SHOWN_BEFORE_START: 2172, NEVER_PUBLIC_BEFORE_START: 12, PAUSED_BY_LIVE_RECORD_GATE: 224, PAUSE_CHANGED: 2 });
  const pausedTotals = graded.filter((r) => r.market === "total" && r.date >= "2026-09-15" && r.date <= "2026-10-19");
  assert.ok(pausedTotals.every((r) => ["PAUSED", "NOT_SERVED"].includes(mlbCallPublication(r, ctx).status)), "the total has been paused on the site since Sep 14");
});

test("🔴 the split reconciles with the Forecast Record ledger: the same calls, one row each", () => {
  const ledger = readJsonl(path.join(ROOT, "data/internal/forecast-ledger/v1/mlb.jsonl")).filter((r) => Object.values(MLB_CALL_FAMILY).includes(r.family));
  const key = (pk, family) => `${pk}|${family}`;
  const fromGraded = graded.map((r) => key(r.gamePk, MLB_CALL_FAMILY[r.market])).sort();
  const fromLedger = ledger.map((r) => key(Number(r.eventId), r.family)).sort();
  /* The ledger is rebuilt from the graded file on its own schedule; it can lag the newest grades, never lead them. */
  const g = new Set(fromGraded);
  assert.ok(fromLedger.every((k) => g.has(k)), "every Forecast Record call is a graded call");
  assert.equal(new Set(fromLedger).size, fromLedger.length, "one ledger row per call");
  const lag = fromGraded.filter((k) => !new Set(fromLedger).has(k));
  assert.ok(lag.length <= 60, `the Forecast Record lags the graded ledger by ${lag.length} calls`);
});
