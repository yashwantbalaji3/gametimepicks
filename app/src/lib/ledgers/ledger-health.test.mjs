/**
 * Five ledgers, kept separate and made to add up — including against the live tree.
 *
 * The separation is the honesty. The all-model-picks record is the whole published board, warts
 * included; the suggested-card and signature-product records are curated selections out of it.
 * Blending them flatters whichever one you fold into the other, so these cases assert the boundary
 * rather than trusting that nobody will cross it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  reconcileAllPicks,
  reconcileCards,
  reconcileBankBuilder,
  reconcileMoonshot,
  buildLedgerHealth,
} from "./ledger-health.mjs";

const DATA = path.join(process.cwd(), "public", "data");
const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

const picks = (rows) => ({ artifact: "graded-picks", moneyClass: "NON_MONEY", picks: rows });
const stream = (id, o = {}) => ({ id, live: true, settledDays: 1, record: { wins: 0, losses: 0, pushes: 0, staked: 0 }, ...o });

/* ── ALL MODEL PICKS ──────────────────────────────────────────────────────────────────────────── */

test("a pick awaiting its result is PENDING, never a miss", () => {
  // The difference matters: counting ungraded picks as misses would understate the board on every
  // day that has games still to play, which is every day before midnight.
  const r = reconcileAllPicks({ mlb: picks([{ hit: true }, { hit: false }, { hit: null }, {}]) });
  assert.deepEqual(
    { graded: r.graded, hit: r.hit, miss: r.miss, pending: r.pending },
    { graded: 2, hit: 1, miss: 1, pending: 2 },
  );
});

test("SEPARATION · a money field on a board pick is a contradiction, not a bonus column", () => {
  const r = reconcileAllPicks({ mlb: picks([{ hit: true, returned: 3.4 }]) });
  assert.match(r.contradictions.join(" "), /money field\(s\) returned/);
  assert.match(r.contradictions.join(" "), /must not enter the board record/);
});

test("SEPARATION · the board record may not declare itself a money artifact", () => {
  const r = reconcileAllPicks({ mlb: { ...picks([{ hit: true }]), moneyClass: "PAPER_ONLY" } });
  assert.match(r.contradictions.join(" "), /moneyClass is PAPER_ONLY/);
});

test("a missing ledger is reported, never silently treated as an empty one", () => {
  const r = reconcileAllPicks({ mlb: null, nfl: { picks: "not an array" } });
  assert.equal(r.contradictions.length, 2);
  assert.match(r.contradictions.join(" "), /a missing ledger is not an empty one/);
});

/* ── SUGGESTED AND MIXED CARDS ────────────────────────────────────────────────────────────────── */

test("staked must equal the settled card count — one unit per card", () => {
  const bad = reconcileCards({ streams: [stream("mlb", { record: { wins: 2, losses: 17, pushes: 0, staked: 12 } })] });
  assert.match(bad.contradictions.join(" "), /staked 12 but 19 settled/);
  const good = reconcileCards({ streams: [stream("mlb", { record: { wins: 2, losses: 17, pushes: 0, staked: 19 }, settledDays: 8 })] });
  assert.deepEqual(good.contradictions, []);
});

test("tier records must partition the stream record, not merely resemble it", () => {
  const r = reconcileCards({
    streams: [stream("mlb", {
      record: { wins: 2, losses: 17, pushes: 0, staked: 19 }, settledDays: 8,
      byTier: { low: { wins: 0, losses: 1, pushes: 0 }, medium: { wins: 2, losses: 4, pushes: 0 } },
    })],
  });
  assert.match(r.contradictions.join(" "), /tiers sum to 7 settled but the stream says 19/);
});

test("settled cards across zero settled days is a contradiction", () => {
  const r = reconcileCards({ streams: [stream("ufc", { record: { wins: 0, losses: 2, pushes: 0, staked: 2 }, settledDays: 0 })] });
  assert.match(r.contradictions.join(" "), /across zero settled days/);
});

test("the mixed-sport stream is reported as its own ledger, not folded into the per-sport ones", () => {
  // A cross-sport card has a different compatibility rule; folding it in lets one record hide
  // inside another's totals.
  const r = reconcileCards({ streams: [stream("mlb"), stream("multi"), stream("epl")] });
  assert.deepEqual(r.suggested.map((s) => s.id), ["mlb", "epl"]);
  assert.equal(r.mixed.id, "multi");
});

/* ── SIGNATURE PRODUCTS ───────────────────────────────────────────────────────────────────────── */

test("BANK BUILDER · a slip settled twice is caught by its own id", () => {
  const r = reconcileBankBuilder({ entries: [{ slipId: "a", result: "win" }, { slipId: "a", result: "loss" }] });
  assert.match(r.contradictions.join(" "), /duplicate slipId a — one slip settled twice/);
});

test("BANK BUILDER · an entry with no id cannot be reconciled and says so", () => {
  const r = reconcileBankBuilder({ entries: [{ date: "2026-08-26", result: "win" }] });
  assert.match(r.contradictions.join(" "), /no slipId/);
});

test("BANK BUILDER · an unrecognised result is surfaced rather than bucketed as a loss", () => {
  const r = reconcileBankBuilder({ entries: [{ slipId: "a", result: "abandoned" }] });
  assert.match(r.contradictions.join(" "), /outside win\/loss\/push\/void\/pending/);
});

test("MOONSHOT · another product's card in this ledger is a contradiction", () => {
  const r = reconcileMoonshot({ results: [{ productId: "bank-builder", outcome: "lost" }] });
  assert.match(r.contradictions.join(" "), /another product's card in this ledger/);
});

/* ── THE WHOLE SET ────────────────────────────────────────────────────────────────────────────── */

test("state is WORST-OF — one contradiction anywhere means the set does not reconcile", () => {
  /*
   * Not a proportion. "Four of five healthy" is the shape of report that lets a real defect sit
   * unread, which is the same reasoning as the publication SLO's platform roll-up.
   */
  const healthy = buildLedgerHealth({
    gradedBySport: { mlb: picks([{ hit: true }]) },
    labLedger: { streams: [stream("mlb", { record: { wins: 1, losses: 0, pushes: 0, staked: 1 } })] },
    bankBuilderLedger: { entries: [{ slipId: "a", result: "win" }] },
    moonshotLedger: { results: [{ productId: "moonshot", outcome: "lost" }] },
  });
  assert.equal(healthy.state, "RECONCILED", healthy.contradictions.join(" · "));

  const sick = buildLedgerHealth({
    gradedBySport: { mlb: picks([{ hit: true, roi: -1 }]) },
    labLedger: { streams: [stream("mlb", { record: { wins: 1, losses: 0, pushes: 0, staked: 1 } })] },
    bankBuilderLedger: { entries: [{ slipId: "a", result: "win" }] },
    moonshotLedger: { results: [{ outcome: "lost" }] },
  });
  assert.equal(sick.state, "CONTRADICTED");
});

test("no combined settled figure is produced across the five products", () => {
  /*
   * Deliberate absence. Five products with five different stakes and five different rules have no
   * meaningful common total, and inventing one is exactly how a blended record starts.
   */
  const h = buildLedgerHealth({
    gradedBySport: { mlb: picks([{ hit: true }]) },
    labLedger: { streams: [stream("mlb")] },
    bankBuilderLedger: { entries: [] },
    moonshotLedger: { results: [] },
  });
  const flat = JSON.stringify(h);
  assert.ok(!/"combinedSettled"|"totalSettled"|"allProducts"/.test(flat), "no cross-product total may exist");
});

/* ── AGAINST THE LIVE TREE ────────────────────────────────────────────────────────────────────── */

test("LIVE · the five committed ledgers reconcile and stay separate", () => {
  const gradedBySport = {};
  for (const sport of ["mlb", "nfl", "ufc", "epl"]) {
    const a = read(`${sport}/graded-picks.json`);
    if (a) gradedBySport[sport] = a;
  }
  const labLedger = read("parlays/lab-ledger.json");
  const bankBuilderLedger = read("bank-builder/ledger-latest.json");
  const moonshotLedger = read("product-ledger/moonshot.json");
  if (!Object.keys(gradedBySport).length || !labLedger || !bankBuilderLedger || !moonshotLedger) return;

  const h = buildLedgerHealth({ gradedBySport, labLedger, bankBuilderLedger, moonshotLedger });
  assert.deepEqual(h.contradictions, [], h.contradictions.join("\n  "));
  assert.equal(h.state, "RECONCILED");
});
