/**
 * Session 12 · append-only withdrawal for frozen Top-5 rows. The receipt is never rewritten; the log only grows;
 * only pre-kickoff evidence counts; publication is never settlement. Fixtures mirror the real 2026-10-04 case
 * (Zay Flowers, frozen while Questionable, still Questionable on the last pre-kickoff board).
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { appendWithdrawals, effectiveWithdrawal, observeRows, verifyAppendOnly, WITHDRAWAL } from "./top-board-withdrawals.mjs";

globalThis.React = React;
const REPO_APP = process.cwd();

const row = (rank, name, eventId, participation, extra = {}) => ({
  rank, forecastId: `${eventId}:nfl-athlete-${name}:player_receptions`, playerId: `nfl-athlete-${name}`, name, teamId: null, team: "BAL", opponent: "TEN",
  providerEventId: eventId, kickoffUtc: "2031-10-05T17:00Z", participation, line: 5.5, market: { line: 5.5 }, projection: { median: 5, p10: 2, p90: 9 }, ...extra,
});
const RECEIPT = {
  schemaVersion: 1, artifact: "results-top-boards", dataClass: "PUBLIC", date: "2031-10-05", publishedAt: "2031-10-04T14:44:14Z", firstKickoffUtc: "2031-10-05T17:00Z",
  boards: [{ sport: "nfl", propFamily: "player_receptions", label: "Receptions", metric: "median", model: "m", rows: [
    row(1, "Clear", "900", "AVAILABLE_ROLE_UNCERTAIN"),
    row(2, "Zay", "900", "QUESTIONABLE"),
    row(3, "Late", "901", "AVAILABLE_ROLE_UNCERTAIN", { kickoffUtc: "2031-10-05T20:25Z" }),
  ] }],
  ineligible: [],
};
const board = (eventId, generatedAt, players, coverage = null) => ({ artifact: "nfl-player-board", providerEventId: eventId, generatedAt, availability: { injuriesCapturedAt: generatedAt, injuries: "FRESH", rosters: "FRESH" }, players, ...(coverage ? { coverage } : {}) });
const P = (name, participation) => ({ playerId: `nfl-athlete-${name}`, name, participation });
const NOW = "2031-10-05T21:00:00Z";

test("🔴 the real case: a row frozen while Questionable is WITHDRAWN from the receipt's own pre-kickoff record", () => {
  const log = appendWithdrawals(null, RECEIPT, observeRows(RECEIPT, {}), NOW);
  assert.equal(log.events.length, 1);
  const e = log.events[0];
  assert.equal(e.name, "Zay");
  assert.equal(e.status, WITHDRAWAL.WITHDRAWN);
  assert.equal(e.reason, "QUESTIONABLE");
  assert.equal(e.source, "FROZEN_RECEIPT");
  assert.equal(e.observedAt, RECEIPT.publishedAt, "the evidence is the publication instant — pre-kickoff by construction");
  assert.equal(e.recordedAt, NOW, "recorded after the game is allowed and stated, never back-dated");
  assert.equal(effectiveWithdrawal(log, RECEIPT.boards[0].rows[0].forecastId), null, "a cleared row stays actionable");
});

test("🔴 a later pre-kickoff board can withdraw a cleared row; a read at or after kickoff is NEVER used (no hindsight)", () => {
  const boards = { 900: board("900", "2031-10-05T16:30:00Z", [P("Clear", "INACTIVE"), P("Zay", "QUESTIONABLE")]), 901: board("901", "2031-10-05T20:25:00Z", [P("Late", "INACTIVE")]) };
  const log = appendWithdrawals(null, RECEIPT, observeRows(RECEIPT, boards), NOW);
  const byName = Object.fromEntries(log.events.map((e) => [e.name, e]));
  assert.equal(byName.Clear.status, WITHDRAWAL.WITHDRAWN);
  assert.equal(byName.Clear.source, "PLAYER_BOARD");
  assert.equal(byName.Clear.observedAt, "2031-10-05T16:30:00Z");
  assert.equal(byName.Late, undefined, "a board stamped AT kickoff is not pre-kickoff evidence");
  assert.equal(log.events.filter((e) => e.name === "Zay").length, 1, "an unchanged state appends nothing");
});

test("a player excluded as unavailable (coverage) reads as withdrawn with the board's reason", () => {
  const boards = { 900: board("900", "2031-10-05T16:30:00Z", [], { players: [{ playerId: "nfl-athlete-Clear", name: "Clear", state: "EXCLUDED_UNAVAILABLE", reason: "designation: Out" }] }) };
  const e = appendWithdrawals(null, RECEIPT, observeRows(RECEIPT, boards), NOW).events.find((x) => x.name === "Clear");
  assert.equal(e.status, WITHDRAWAL.WITHDRAWN);
  assert.match(e.reason, /UNAVAILABLE \(designation: Out\)/);
});

test("REINSTATED when a later pre-kickoff read clears him; an OLDER read never overrules a newer one", () => {
  const first = appendWithdrawals(null, RECEIPT, observeRows(RECEIPT, {}), "2031-10-05T10:00:00Z");
  const cleared = { 900: board("900", "2031-10-05T15:00:00Z", [P("Zay", "AVAILABLE_ROLE_UNCERTAIN"), P("Clear", "AVAILABLE_ROLE_UNCERTAIN")]) };
  const second = appendWithdrawals(first, RECEIPT, observeRows(RECEIPT, cleared), NOW);
  const zay = second.events.filter((e) => e.name === "Zay");
  assert.deepEqual(zay.map((e) => e.status), [WITHDRAWAL.WITHDRAWN, WITHDRAWAL.REINSTATED]);
  assert.equal(effectiveWithdrawal(second, RECEIPT.boards[0].rows[1].forecastId), null);
  // A stale board (older than the last event) must not flip him back.
  const stale = { 900: board("900", "2031-10-05T12:00:00Z", [P("Zay", "QUESTIONABLE")]) };
  const third = appendWithdrawals(second, RECEIPT, observeRows(RECEIPT, stale), NOW);
  assert.equal(third.events.length, second.events.length);
});

test("🔴 idempotent and append-only: a second run adds nothing; edits, removals, reorders and hindsight are refused", () => {
  const log = appendWithdrawals(null, RECEIPT, observeRows(RECEIPT, {}), NOW);
  const again = appendWithdrawals(log, RECEIPT, observeRows(RECEIPT, {}), NOW);
  assert.deepEqual(again, log);
  assert.deepEqual(verifyAppendOnly(null, log), { ok: true, reason: null });
  const edited = structuredClone(log); edited.events[0].reason = "OUT";
  assert.equal(verifyAppendOnly(log, edited).ok, false);
  const removed = { ...log, events: [] };
  assert.match(verifyAppendOnly(log, removed).reason, /removed/);
  const two = appendWithdrawals(log, RECEIPT, observeRows(RECEIPT, { 900: board("900", "2031-10-05T16:30:00Z", [P("Clear", "INACTIVE")]) }), NOW);
  assert.equal(two.events.length, 2);
  assert.equal(verifyAppendOnly(log, { ...two, events: [...two.events].reverse() }).ok, false, "reordered");
  const hindsight = structuredClone(two); hindsight.events[1].observedAt = "2031-10-05T18:00:00Z";
  assert.match(verifyAppendOnly(log, hindsight).reason, /not before kickoff/);
  const moved = { ...two, receipt: { ...two.receipt, publishedAt: "2031-10-05T16:59:00Z" } };
  assert.match(verifyAppendOnly(log, moved).reason, /receipt reference changed/);
  assert.throws(() => appendWithdrawals({ ...log, date: "2031-10-06" }, RECEIPT, [], NOW), /does not belong/);
});

/* ─── the producer + the read side, end to end on a temp app directory ─────────────────────────────────── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-top-board-withdrawals-"));
const w = (rel, obj) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n"); return p; };
const receiptPath = w("public/data/results/top-boards/2031-10-05.json", RECEIPT);
w("public/data/nfl/player-board/900.json", board("900", "2031-10-05T15:02:50Z", [P("Clear", "AVAILABLE_ROLE_UNCERTAIN"), P("Zay", "QUESTIONABLE")]));
w("public/data/nfl/reconciliation/2-05.json", { games: [{ providerEventId: "900", kickoffUtc: "2031-10-05T17:00Z", state: "FINAL", players: [
  { name: "Clear", team: "BAL", prop: "player_receptions", actual: 6, outcome: "HIT" },
  { name: "Zay", team: "BAL", prop: "player_receptions", actual: 0, outcome: "VOID" },
] }] });
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const before = sha(receiptPath);
const SCRIPT = path.join(REPO_APP, "scripts/results/record-top-board-withdrawals.mjs");
const out1 = execFileSync("node", [SCRIPT, "--now", NOW], { cwd: tmp, encoding: "utf8" });
const logPath = path.join(tmp, "public/data/results/top-board-withdrawals/2031-10-05.json");
const log1 = fs.readFileSync(logPath, "utf8");
const out2 = execFileSync("node", [SCRIPT, "--now", "2031-10-05T22:00:00Z"], { cwd: tmp, encoding: "utf8" });

const { topBoardsFor } = await import("./top-boards.ts");
const { default: TopBoards } = await import("../../../components/results/top-boards.tsx");
process.chdir(tmp);
const day = topBoardsFor("2031-10-05");
const html = renderToStaticMarkup(React.createElement(TopBoards, { day, without: [], dayLabel: "Sunday, October 5, 2031" }));
process.chdir(REPO_APP);
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("🔴 producer: the frozen receipt's bytes are untouched; the log is written once and a rerun appends nothing", () => {
  assert.equal(sha(receiptPath), before, "the receipt is never opened for writing");
  assert.match(out1, /WITHDRAWN Zay · QUESTIONABLE · FROZEN_RECEIPT/);
  assert.match(out2, /no new withdrawal evidence/);
  assert.equal(fs.readFileSync(logPath, "utf8"), log1, "a rerun leaves the log byte-identical");
});

test("🔴 read side: withdrawn row is marked not actionable, its settlement word is UNCHANGED, the cleared row is untouched", () => {
  const [clear, zay] = day.boards[0].rows;
  assert.equal(clear.withdrawal, null);
  assert.deepEqual(clear.result, { state: "INSIDE", actual: 6 });
  assert.equal(zay.withdrawal.reason, "QUESTIONABLE");
  assert.equal(zay.withdrawal.recordedAfterKickoff, true);
  assert.deepEqual(zay.result, { state: "VOID", actual: 0 }, "publication ≠ settlement: void · did not play, exactly as the owner graded it");
  assert.deepEqual(day.boards[0].rows.map((r) => r.rank), [1, 2, 3], "never removed or re-ranked");
  assert.match(html, /Withdrawn/);
  assert.match(html, /Not actionable — listed Questionable before kickoff \(as recorded when this board was published, Sat, Oct 4, 10:44 AM ET\)\. Flag added after kickoff from that pre-kickoff evidence\. The board itself is unchanged\./);
  assert.match(html, /Void · did not play/);
  assert.equal((html.match(/data-withdrawn="true"/g) ?? []).length, 1);
});

test("a log that does not belong to this receipt is ignored by the reader", () => {
  const p = path.join(tmp, "public/data/results/top-board-withdrawals/2031-10-05.json");
  const saved = fs.readFileSync(p, "utf8");
  fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(saved), receipt: { path: "x", publishedAt: "2031-10-05T16:00:00Z" } }));
  process.chdir(tmp);
  try { assert.equal(topBoardsFor("2031-10-05").boards[0].rows[1].withdrawal, null); } finally { process.chdir(REPO_APP); fs.writeFileSync(p, saved); }
});

test("workflow: the log is committed only through the append-only verifier, separately from the write-once receipts", () => {
  // Comments stripped: the header names the verifier too, and a guard that matches its own documentation is vacuous.
  const wf = fs.readFileSync(path.join(REPO_APP, "../.github/workflows/results-top-boards.yml"), "utf8").replace(/^\s*#.*$/gm, "");
  assert.match(wf, /node scripts\/results\/record-top-board-withdrawals\.mjs --now/);
  assert.match(wf, /record-top-board-withdrawals\.mjs --verify-staged/);
  assert.match(wf, /git diff --cached --name-status -- app\/public\/data\/results\/top-boards\/ \| grep -v '\^A'/, "receipts stay add-only, judged on their own path");
  assert.doesNotMatch(wf, /secrets\./, "$0 — no secret");
});
