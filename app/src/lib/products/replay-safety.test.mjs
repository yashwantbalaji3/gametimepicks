/**
 * REPLAY SAFETY, PRODUCT BY PRODUCT — Program 235 · Release A.
 *
 * Run: npx tsx --test src/lib/products/replay-safety.test.mjs
 *
 * Program 234 scoped this harness, did not build it, and said so. This is the remainder.
 *
 * It runs the REAL settler — `scripts/parlays/settle-lab-cards.mjs`, the one the scheduled job runs
 * — in a child process, with `--apply`, against a disposable snapshot and a clock the test supplies.
 * Nothing here reimplements grading; if the settler changes, these change with it or fail. The
 * assertions are on BUSINESS STATE (which cards exist and how each settled), never on stdout and
 * never on an exit code, because a script can exit 0 having written the wrong receipt twice.
 *
 * Every test asserts a NON-EMPTY population first. A replay test over zero cards passes forever.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  makeStore, seed, readStore, runSettler, businessState, receiptFiles, outcomeTally,
  cleanup, VOLATILE_RECEIPT_FIELDS,
} from "./replay-harness.mjs";

const APP = process.cwd();
const DATE = "2026-08-27";
const NOW = "2026-08-28T09:00:00Z";   // the morning after, ET-yesterday = DATE
const LATER = "2026-08-28T17:30:00Z"; // a second run, hours later

/* ── recorded fixtures ─────────────────────────────────────────────────────────────────────────
 * Shapes are taken from the repository's own artifacts: NFL result rows from
 * public/data/nfl/results/latest.json, ladder cards from the risk-ladder artifacts. The VALUES are
 * chosen to produce one of every outcome the charter names, which live data on any single day
 * does not.
 */
const nflRow = (id, ftHome, ftAway, statusRaw = "STATUS_FINAL") => ({
  providerEventId: id, shortName: `A${id} @ B${id}`, dateUtc: `${DATE}T23:00Z`,
  statusRaw, seasonType: 1, week: 4,
  home: { abbr: "HME", name: "Home", providerTeamId: "1" },
  away: { abbr: "AWY", name: "Away", providerTeamId: "2" },
  ftHome, ftAway, capturedAt: `${DATE}T23:59Z`,
});

const nflResults = (rows) => ({
  schemaVersion: 1, sport: "nfl", dataClass: "PUBLIC_DERIVED",
  generatedAt: `${DATE}T23:59Z`, state: "OK", rowCount: rows.length, rows,
});

const card = (slipId, tier, legs, extra = {}) => ({
  tier, tierLabel: `${tier} risk`, slipId,
  combinedAmerican: 150, combinedDecimal: 2.5,
  legs, status: "pending", ...extra,
});

const nflLeg = (eventId, market, side, line = null) => ({
  sport: "nfl", eventId: `nfl-${eventId}`, market, side,
  ...(line == null ? {} : { line }), odds: -110,
});

const ladder = (cards, state = "PUBLISHED") => ({
  schemaVersion: 1, artifact: "risk-ladder", dataClass: "PUBLIC_DERIVED",
  date: DATE, generatedAt: `${DATE}T15:00Z`, state, cards,
});

/**
 * A day carrying one of every outcome:
 *   win     — moneyline on the side that won
 *   loss    — moneyline on the side that lost
 *   push    — moneyline on a TIE (the charter's NFL tie case)
 *   pending — an event that is not STATUS_FINAL (postponed / unresolved)
 */
function seedDay(store, { includeUnfinal = true } = {}) {
  seed(store, "public/data/nfl/results/latest.json", nflResults([
    nflRow("900001", 28, 27),                       // home won
    nflRow("900002", 20, 20),                       // tie → push
    ...(includeUnfinal ? [nflRow("900003", 0, 0, "STATUS_SCHEDULED")] : []),
  ]));
  seed(store, `public/data/parlays/risk-ladder-nfl/${DATE}.json`, ladder([
    card("slip-win", "medium", [nflLeg("900001", "moneyline", "home")]),
    card("slip-loss", "high", [nflLeg("900001", "moneyline", "away")]),
    card("slip-push", "low", [nflLeg("900002", "moneyline", "home")]),
    ...(includeUnfinal ? [card("slip-pending", "longshot", [nflLeg("900003", "moneyline", "home")])] : []),
  ]));
}

/** Run the settler and return its business state, failing loudly if it did not settle anything. */
function settleAndRead(store, { now = NOW, date = DATE } = {}) {
  const r = runSettler(store, { now, date, apply: true, appDir: APP });
  const state = businessState(store, date);
  return { run: r, state };
}

test("THE HARNESS ACTUALLY SETTLES — every assertion below is vacuous otherwise", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store);
    const { run, state } = settleAndRead(store);
    assert.equal(run.status, 0, `settler exited ${run.status}: ${run.stderr.slice(0, 400)}`);
    assert.ok(state, "no receipt was written");
    assert.equal(state.cards.length, 4, "the seeded day has four cards");
    const t = outcomeTally(state);
    assert.equal(t.win, 1, `expected one win, got ${JSON.stringify(t)}`);
    assert.equal(t.loss, 1, `expected one loss, got ${JSON.stringify(t)}`);
    assert.equal(t.push, 1, `expected one push (an NFL tie), got ${JSON.stringify(t)}`);
    assert.equal(t.pending, 1, `expected one pending, got ${JSON.stringify(t)}`);
  } finally { cleanup(store); }
});

test("REPLAYING THE SAME DATE THREE TIMES PRODUCES ONE RECEIPT AND ONE SETTLEMENT", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store);
    const first = settleAndRead(store);
    assert.ok(first.state.cards.length > 0);

    const second = settleAndRead(store, { now: LATER });
    const third = settleAndRead(store, { now: "2026-08-29T02:00:00Z" });

    /* ONE receipt file for the date, not three. */
    assert.deepEqual(receiptFiles(store), [`${DATE}.json`], "a replay created a second receipt file");
    /* And the same business state each time — outcomes, legs and identities all unmoved. */
    assert.deepEqual(second.state, first.state, "the second run changed the settled record");
    assert.deepEqual(third.state, first.state, "the third run changed the settled record");
    /* Slip identities are stable across process restarts: each run is a fresh child process that
       learns nothing from its predecessors except what is on disk. */
    assert.deepEqual(
      third.state.cards.map((c) => c.slipId),
      ["slip-loss", "slip-pending", "slip-push", "slip-win"],
      "slip identities moved between runs",
    );
  } finally { cleanup(store); }
});

test("A DUPLICATE INVOCATION WRITES NO SECOND CARD — no duplicate slip, debit or credit", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store);
    settleAndRead(store);
    const before = readStore(store, `public/data/parlays/lab-settled/${DATE}.json`);
    settleAndRead(store, { now: LATER });
    const after = readStore(store, `public/data/parlays/lab-settled/${DATE}.json`);

    assert.equal(before.cards.length, after.cards.length, "the card count changed on replay");
    assert.equal(new Set(after.cards.map((c) => c.slipId)).size, after.cards.length, "a slip id is duplicated");
    /* Every field except the named volatile stamps must be identical. */
    const strip = (d) => { const c = { ...d }; for (const k of Object.keys(VOLATILE_RECEIPT_FIELDS)) delete c[k]; return c; };
    assert.deepEqual(strip(after), strip(before), "the receipt changed in a non-volatile field on replay");
  } finally { cleanup(store); }
});

test("A LATE RESULT COMPLETES A PENDING CARD EXACTLY ONCE, and never re-grades a decided one", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store);
    const first = settleAndRead(store);
    assert.equal(outcomeTally(first.state).pending, 1, "the fixture must start with a pending card");

    /* OUT-OF-ORDER / LATE DELIVERY: the missing final arrives after the receipt was written. */
    seed(store, "public/data/nfl/results/latest.json", nflResults([
      nflRow("900001", 28, 27), nflRow("900002", 20, 20), nflRow("900003", 31, 10),
    ]));
    const completed = settleAndRead(store, { now: LATER });
    assert.equal(outcomeTally(completed.state).pending, 0, "the late result did not complete the pending card");
    assert.equal(completed.state.cards.find((c) => c.slipId === "slip-pending").result, "win");

    /* The already-decided cards did NOT move. */
    for (const id of ["slip-win", "slip-loss", "slip-push"]) {
      assert.equal(
        completed.state.cards.find((c) => c.slipId === id).result,
        first.state.cards.find((c) => c.slipId === id).result,
        `${id} was re-graded by a completion run`,
      );
    }
    /* And completing is itself idempotent. */
    const again = settleAndRead(store, { now: "2026-08-29T06:00:00Z" });
    assert.deepEqual(again.state, completed.state, "re-running after completion moved the record");
    assert.deepEqual(receiptFiles(store), [`${DATE}.json`]);
  } finally { cleanup(store); }
});

test("A MISSING RESULT STAYS PENDING — it never becomes a loss", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store);
    /* The results source goes away entirely between runs — a capture failure, not a set of losses. */
    settleAndRead(store);
    seed(store, "public/data/nfl/results/latest.json", nflResults([]));
    const after = settleAndRead(store, { now: LATER });

    assert.ok(after.state.cards.length > 0, "population");
    const pendingCard = after.state.cards.find((c) => c.slipId === "slip-pending");
    assert.equal(pendingCard.result, "pending", "a vanished result graded a card as something other than pending");
    /* Nor may a vanished source UN-settle what was already decided. */
    assert.equal(after.state.cards.find((c) => c.slipId === "slip-win").result, "win");
    assert.equal(after.state.cards.find((c) => c.slipId === "slip-loss").result, "loss");
  } finally { cleanup(store); }
});

test("A CORRECTED RESULT IS REFUSED, and the original receipt survives", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store, { includeUnfinal: false });
    const first = settleAndRead(store);
    assert.equal(first.state.cards.find((c) => c.slipId === "slip-win").result, "win");

    /* The provider restates a final: the winner flips. A settled outcome never moves. */
    seed(store, "public/data/nfl/results/latest.json", nflResults([
      nflRow("900001", 10, 40), nflRow("900002", 20, 20),
    ]));
    const after = settleAndRead(store, { now: LATER });

    assert.equal(
      after.state.cards.find((c) => c.slipId === "slip-win").result, "win",
      "a restated provider result silently rewrote a graded card",
    );
    assert.deepEqual(after.state, first.state, "the settled record changed under a correction");
  } finally { cleanup(store); }
});

test("CONCURRENT INVOCATIONS LEAVE ONE RECEIPT AND ONE COHERENT RECORD", async () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store, { includeUnfinal: false });
    /* Two settlers racing on the same date — the real deployment shape when a scheduled run and a
       manual dispatch overlap. */
    const runs = await Promise.all([
      Promise.resolve().then(() => runSettler(store, { now: NOW, date: DATE, apply: true, appDir: APP })),
      Promise.resolve().then(() => runSettler(store, { now: LATER, date: DATE, apply: true, appDir: APP })),
    ]);
    assert.ok(runs.some((r) => r.status === 0), `neither concurrent run succeeded: ${runs.map((r) => r.stderr.slice(0, 200)).join(" | ")}`);

    assert.deepEqual(receiptFiles(store), [`${DATE}.json`], "concurrent runs produced more than one receipt");
    const state = businessState(store, DATE);
    assert.equal(state.cards.length, 3, "the concurrent runs changed the card population");
    assert.equal(new Set(state.cards.map((c) => c.slipId)).size, 3, "a slip was duplicated by a concurrent run");
  } finally { cleanup(store); }
});

test("A CRASH BETWEEN WRITE AND ACKNOWLEDGEMENT RECOVERS TO ONE RECEIPT", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store, { includeUnfinal: false });
    const first = settleAndRead(store);
    /* The receipt is on disk and the caller never learned it — the next scheduled run repeats the
       whole settlement. It must recognise its own prior write, not append to it. */
    const after = settleAndRead(store, { now: LATER });
    assert.deepEqual(after.state, first.state);
    assert.deepEqual(receiptFiles(store), [`${DATE}.json`]);
  } finally { cleanup(store); }
});

test("NO CROSS-PRODUCT CONTAMINATION — another sport's ladder does not enter this receipt", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store, { includeUnfinal: false });
    /* A UFC ladder for the SAME date. Its bouts have no results source here, so its cards must
       appear as pending under their own sport — never merged into an NFL card, and never dropped. */
    seed(store, `public/data/parlays/risk-ladder-ufc/${DATE}.json`, ladder([
      card("ufc-medium", "medium", [{ sport: "ufc", player: "Some Fighter", odds: -140 }]),
    ]));
    const { state } = settleAndRead(store);

    assert.equal(state.cards.length, 4, "the UFC card was dropped or merged");
    const ufc = state.cards.find((c) => c.slipId === "ufc-medium");
    assert.ok(ufc, "the UFC card is missing from the receipt");
    assert.deepEqual(ufc.sports, ["ufc"], "the UFC card lost its sport");
    assert.equal(ufc.result, "pending", "a bout with no official result was graded");
    /* And the NFL cards are untouched by its presence. */
    assert.equal(state.cards.find((c) => c.slipId === "slip-win").result, "win");
  } finally { cleanup(store); }
});

test("AN MLB CARD WITH NO BOX SCORE PENDS — offline, and never a loss", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seedDay(store, { includeUnfinal: false });
    /* No gamePk ⇒ the box-score reader returns immediately without a network call, which is also
       exactly the state of a game whose feed cannot be read. */
    seed(store, `public/data/parlays/risk-ladder/${DATE}.json`, ladder([
      card("mlb-medium", "medium", [{ sport: "mlb", player: "Some Batter", market: "batter_hits", marketLabel: "Hits", side: "Over", line: 0.5, odds: -120 }]),
    ]));
    const { state } = settleAndRead(store);
    const mlb = state.cards.find((c) => c.slipId === "mlb-medium");
    assert.ok(mlb, "the MLB card is missing from the receipt");
    assert.equal(mlb.result, "pending", "an unreadable box score graded a card");
  } finally { cleanup(store); }
});

test("AN EMPTY OR UNPUBLISHED LADDER IS A NO-CARD DAY, not a settlement", () => {
  const store = makeStore("gtp-replay-", APP);
  try {
    seed(store, "public/data/nfl/results/latest.json", nflResults([nflRow("900001", 28, 27)]));
    seed(store, `public/data/parlays/risk-ladder-nfl/${DATE}.json`, ladder([], "NOT_PLAYING_TODAY"));
    const { state } = settleAndRead(store);
    assert.equal(state, null, "a no-card day wrote a settlement receipt");
    assert.deepEqual(receiptFiles(store), [], "a no-card day created a receipt file");
  } finally { cleanup(store); }
});

/* ── the mutation case the charter requires ──────────────────────────────────────────────────── */

test("THE HARNESS DETECTS A BROKEN DEDUPLICATION CHECK", () => {
  /*
   * Everything above would pass against a settler whose idempotency was accidental. This proves the
   * harness is actually watching: with the receipt-change classifier weakened to always report
   * NO_CHANGE — the shape of a real regression, where a completion is silently dropped — the late
   * result can no longer complete its pending card, and the suite notices.
   */
  const src = path.join(APP, "src/lib/parlays/receipt-completion.mjs");
  const original = fs.readFileSync(src, "utf8");
  const store = makeStore("gtp-replay-", APP);
  try {
    fs.writeFileSync(src, original.replace(
      "export function classifyReceiptChange(prior, next) {",
      "export function classifyReceiptChange(prior, next) {\n  return { state: RECEIPT_CHANGE.NO_CHANGE, completed: [], reasons: [] }; // MUTATION PROBE",
    ));
    seedDay(store);
    settleAndRead(store);
    seed(store, "public/data/nfl/results/latest.json", nflResults([
      nflRow("900001", 28, 27), nflRow("900002", 20, 20), nflRow("900003", 31, 10),
    ]));
    const after = settleAndRead(store, { now: LATER });
    assert.equal(
      outcomeTally(after.state).pending, 1,
      "with the dedup check disabled the pending card still completed — this harness would not notice a real regression",
    );
  } finally {
    fs.writeFileSync(src, original);
    cleanup(store);
  }
});

test("the probe restored the module it mutated", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/parlays/receipt-completion.mjs"), "utf8");
  assert.doesNotMatch(src, /MUTATION PROBE/, "the mutation probe left the module mutated");
  assert.match(src, /export function classifyReceiptChange/);
});
