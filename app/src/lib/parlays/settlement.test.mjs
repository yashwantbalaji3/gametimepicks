/**
 * Parlay Lab card settlement — the reduced-win payout fix, forward-only. Run from app/:
 *   npx tsx --test src/lib/parlays/settlement.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  cardResult, fullCardDecimal, payoutFor, settleCard, receiptCard, recordedReturn,
  payoutPolicyForRun, receiptPayoutPolicy, PAYOUT_POLICY, LEGACY_PAYOUT_POLICY, decimalFromAmerican,
} from "./settlement.mjs";
import { classifyReceiptChange, RECEIPT_CHANGE } from "./receipt-completion.mjs";

const APP = process.cwd();
const DATA = path.join(APP, "public", "data", "parlays");
const LADDER_DIRS = { mlb: "risk-ladder", ufc: "risk-ladder-ufc", epl: "risk-ladder-epl", nfl: "risk-ladder-nfl" };
const r6 = (x) => Number(x.toFixed(6));

/* ── the formula ─────────────────────────────────────────────────────────────────────────────────────────────── */

test("08-18 receipt: a win with a void leg pays the winning leg only (1.505051), not the full card (2.451623)", () => {
  const s = settleCard([{ result: "win", odds: -198 }, { result: "void", odds: -159 }]);
  assert.equal(s.result, "win");
  assert.equal(s.combinedDecimal, 2.451623, "the full published price is unchanged");
  assert.equal(s.payoutDecimal, 1.505051);
  assert.equal(s.payoutDecimal, r6(decimalFromAmerican(-198)));
});

test("void and push legs drop out (decimal 1.0); every remaining win multiplies in", () => {
  assert.equal(payoutFor("win", ["win", "push", "win"], [150, -110, 120]), r6(2.5 * 2.2));
  assert.equal(payoutFor("win", ["void", "win", "win", "void"], [-109, -176, 132, 400]), r6(decimalFromAmerican(-176) * 2.32));
  assert.equal(payoutFor("win", ["win", "win"], [-110, 120]), fullCardDecimal([-110, 120]), "no void ⇒ payout = full price");
});

test("any loss ⇒ the card loses ⇒ payout 0, even with voids and pending legs alongside", () => {
  for (const legs of [["loss", "win"], ["loss", "void"], ["win", "loss", "pending"], ["void", "void", "loss"]]) {
    assert.equal(cardResult(legs), "loss", legs.join("/"));
    assert.equal(payoutFor(cardResult(legs), legs, legs.map(() => 120)), 0, legs.join("/"));
  }
});

test("every leg void or push ⇒ the card is void / push and the stake is returned (1)", () => {
  assert.equal(cardResult(["push", "push"]), "push");
  assert.equal(cardResult(["void", "push"]), "void");
  assert.equal(cardResult(["void", "void"]), "void");
  for (const legs of [["push", "push"], ["void", "push"], ["void"]]) assert.equal(settleCard(legs.map((r) => ({ result: r, odds: 200 }))).payoutDecimal, 1);
});

test("negative: a pending card has no payout yet; an unpriced winning leg has no honest payout", () => {
  assert.equal(cardResult(["win", "pending"]), "pending");
  assert.equal(payoutFor("pending", ["win", "pending"], [-110, -110]), null);
  assert.equal(payoutFor("win", ["win", "win"], [-110, null]), null, "never a guess");
  assert.equal(payoutFor("win", ["win", "void"], [-110, null]), r6(decimalFromAmerican(-110)), "an unpriced VOID leg is irrelevant");
  assert.equal(cardResult([]), "pending", "no legs is never a settled card");
  assert.notEqual(payoutFor("win", ["win", "void"], [-198, -159]), 2.451623, "the defect is not reproduced");
});

/** The settler's result rule exactly as it stood before this change (settle-lab-cards.mjs ≤ 89f3ca2978). */
function legacyResult(results) {
  const decisive = results.filter((r) => r !== "push" && r !== "void");
  return results.includes("pending") && !results.includes("loss") ? "pending"
    : decisive.includes("loss") ? "loss"
    : decisive.length && decisive.every((r) => r === "win") ? "win"
    : results.length && results.every((r) => r === "push") ? "push"
    : results.length && results.every((r) => r === "push" || r === "void") ? "void"
    : "pending";
}

test("cardResult is the settler's former rule verbatim — exhaustive over every 0–4 leg combination", () => {
  const outcomes = ["win", "loss", "push", "void", "pending"];
  let n = 0;
  const walk = (prefix) => {
    assert.equal(cardResult(prefix), legacyResult(prefix), prefix.join("/") || "(none)");
    n += 1;
    if (prefix.length < 4) for (const o of outcomes) walk([...prefix, o]);
  };
  walk([]);
  assert.equal(n, 1 + 5 + 25 + 125 + 625);
});

/* ── the receipt shape and the forward-only guard ────────────────────────────────────────────────────────────── */

const base = { sport: "mlb", sports: ["mlb"], tier: "medium", slipId: "s1", results: ["win", "void"], legOdds: [-198, -159] };

test("legacy receipt cards keep the historical shape exactly; new receipts add payoutDecimal after combinedDecimal", () => {
  const legacy = receiptCard({ ...base, policy: LEGACY_PAYOUT_POLICY });
  assert.deepEqual(Object.keys(legacy), ["sport", "sports", "tier", "slipId", "result", "combinedDecimal", "legs"]);
  assert.equal(legacy.combinedDecimal, 2.451623);
  const fixed = receiptCard({ ...base, policy: PAYOUT_POLICY });
  assert.deepEqual(Object.keys(fixed), ["sport", "sports", "tier", "slipId", "result", "combinedDecimal", "payoutDecimal", "legs"]);
  assert.equal(fixed.payoutDecimal, 1.505051);
  assert.equal(recordedReturn(legacy), 2.451623, "the ledger reads a legacy receipt exactly as published");
  assert.equal(recordedReturn(fixed), 1.505051);
});

test("a receipt keeps the policy it was first written under; only a brand-new receipt gets the fix", () => {
  assert.equal(payoutPolicyForRun(null), PAYOUT_POLICY);
  assert.equal(payoutPolicyForRun({ cards: [] }), LEGACY_PAYOUT_POLICY, "an existing receipt without the stamp stays legacy");
  assert.equal(payoutPolicyForRun({ payoutPolicy: PAYOUT_POLICY, cards: [] }), PAYOUT_POLICY);
  assert.equal(receiptPayoutPolicy({ payoutPolicy: "something-else" }), LEGACY_PAYOUT_POLICY, "unknown ⇒ legacy, never upgraded");
});

test("the classifier: a payout completes with its card, never appears on a legacy receipt, never changes once decided", () => {
  const pending = { ...receiptCard({ ...base, results: ["win", "pending"], policy: PAYOUT_POLICY }) };
  const done = receiptCard({ ...base, policy: PAYOUT_POLICY });
  assert.equal(pending.payoutDecimal, null);
  const c = classifyReceiptChange([pending], [done]);
  assert.equal(c.state, RECEIPT_CHANGE.COMPLETION_ONLY, c.reasons.join("; "));

  const legacy = receiptCard({ ...base, policy: LEGACY_PAYOUT_POLICY });
  const restated = receiptCard({ ...base, policy: PAYOUT_POLICY });
  const r = classifyReceiptChange([legacy], [restated]);
  assert.equal(r.state, RECEIPT_CHANGE.REWRITE);
  assert.match(r.reasons.join(" "), /gained a recorded payout/);

  const moved = classifyReceiptChange([done], [{ ...done, payoutDecimal: 2.451623 }]);
  assert.equal(moved.state, RECEIPT_CHANGE.REWRITE);
  assert.match(moved.reasons.join(" "), /payout on card s1 was recorded 1\.505051/);

  assert.equal(classifyReceiptChange([done], [{ ...done }]).state, RECEIPT_CHANGE.NO_CHANGE);
});

/* ── HISTORY PIN: every published receipt, rebuilt by this code, is byte-identical ───────────────────────────── */

function readReceipts() {
  const dir = path.join(DATA, "lab-settled");
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map((f) => ({ file: path.join(dir, f), date: f.slice(0, 10), raw: fs.readFileSync(path.join(dir, f), "utf8") }));
}

/** The published ladder cards for a date across every sport, legs defaulted to their ladder's sport (as the settler does). */
function ladderCards(date) {
  const by = new Map();
  for (const [sport, dir] of Object.entries(LADDER_DIRS)) {
    let doc = null;
    try { doc = JSON.parse(fs.readFileSync(path.join(DATA, dir, `${date}.json`), "utf8")); } catch { continue; }
    for (const c of doc?.cards ?? []) by.set(c.slipId, (c.legs ?? []).map((l) => ({ ...l, sport: l.sport ?? sport })));
  }
  return by;
}

function rebuild(rec, policy) {
  const doc = JSON.parse(rec.raw);
  const ladder = ladderCards(rec.date);
  const cards = doc.cards.map((c) => {
    const legs = ladder.get(c.slipId);
    assert.ok(legs, `${rec.date} ${c.slipId}: the published ladder card exists`);
    assert.equal(legs.length, c.legs.length, `${rec.date} ${c.slipId}: same leg count`);
    const sports = [...new Set(legs.map((l) => l.sport ?? "mlb"))].sort();
    return receiptCard({ sport: sports.length === 1 ? sports[0] : "multi", sports, tier: c.tier, slipId: c.slipId, results: c.legs, legOdds: legs.map((l) => l.odds), policy });
  });
  return { doc, cards };
}

test("HISTORY PIN · every published receipt rebuilt under its own policy is byte-identical, and the settler would leave it untouched", () => {
  const recs = readReceipts();
  assert.ok(recs.length >= 44, `expected the published receipts (found ${recs.length})`);
  let fullShape = 0, cardsChecked = 0;
  for (const rec of recs) {
    const { doc, cards } = rebuild(rec, payoutPolicyForRun(JSON.parse(rec.raw)));
    if (receiptPayoutPolicy(doc) !== LEGACY_PAYOUT_POLICY) continue;   // receipts written after the fix pin themselves
    /* The earliest receipts were written by an older settler that did not yet record `sports`; every value this
       code computes must still match what they recorded, field for field, in their own key order. */
    const projected = cards.map((c, i) => {
      const recorded = doc.cards[i];
      for (const k of Object.keys(c)) assert.ok(k in recorded || k === "sports", `${rec.date} ${c.slipId}: legacy policy emits no new field (${k})`);
      return Object.fromEntries(Object.keys(recorded).map((k) => [k, c[k]]));
    });
    cardsChecked += projected.length;
    assert.equal(JSON.stringify({ ...doc, cards: projected }, null, 1) + "\n", rec.raw, `${rec.date}: byte-identical`);
    assert.equal(classifyReceiptChange(doc.cards, projected).state, RECEIPT_CHANGE.NO_CHANGE, `${rec.date}: NO_CHANGE`);
    if (doc.cards.every((c) => "sports" in c)) {
      fullShape += 1;
      assert.equal(JSON.stringify({ ...doc, cards }, null, 1) + "\n", rec.raw, `${rec.date}: byte-identical in the current shape`);
    }
  }
  assert.ok(cardsChecked >= 141, `every published card checked (${cardsChecked})`);
  assert.ok(fullShape >= 1, "at least one receipt is in the current shape and is reproduced in full");
});

test("HISTORY PIN · forcing the corrected payout onto a published receipt is refused as a REWRITE", () => {
  const rec = readReceipts().find((r) => r.date === "2026-08-18");
  const { doc, cards } = rebuild(rec, PAYOUT_POLICY);
  const change = classifyReceiptChange(doc.cards, cards);
  assert.equal(change.state, RECEIPT_CHANGE.REWRITE);
  assert.ok(change.reasons.every((r) => /gained a recorded payout/.test(r)), change.reasons.join("; "));
});

/** The restatement input (docs/PARLAY_LAB_V2.md): winning legacy cards whose recorded return differs from the formula. */
function historicalDiscrepancies() {
  const out = [];
  for (const rec of readReceipts()) {
    const doc = JSON.parse(rec.raw);
    if (receiptPayoutPolicy(doc) !== LEGACY_PAYOUT_POLICY) continue;
    const ladder = ladderCards(rec.date);
    for (const c of doc.cards) {
      if (c.result !== "win") continue;   // a loss returns 0 and a push/void is not credited under either reading
      const legs = ladder.get(c.slipId) ?? [];
      const correct = payoutFor(c.result, c.legs, legs.map((l) => l.odds));
      if (correct !== c.combinedDecimal) out.push({ date: rec.date, slipId: c.slipId, sport: c.sport, tier: c.tier, legs: c.legs.join("/"), recorded: c.combinedDecimal, correct });
    }
  }
  return out;
}

test("RESTATEMENT INPUT · the seven known overstated reduced wins, with both numbers (published receipts are append-only, so these never move)", () => {
  const got = new Map(historicalDiscrepancies().map((d) => [d.slipId, d]));
  const KNOWN = [
    ["slip_2026-08-18_conservative_9cbc273e3512", 2.451623, 1.505051],
    ["slip_2026-08-22_conservative_f12f43ed4ecf", 2.659305, 1.487805],
    ["opt_2026-08-27_public_medium_mlb_e97372044e32", 4.218463, 2.544469],
    ["slip_2026-08-30_conservative_1984dceacedd", 2.268959, 1.434783],
    ["slip_2026-09-05_balanced_e0d9e48237f7", 6.975963, 3.638182],
    ["opt_2026-09-15_public_medium_mlb_2fc5e3e84ea2", 5.909021, 3.2473],
    ["opt_2026-09-18_public_longshot_mlb_dad8e4264517", 11.593121, 5.520534],
  ];
  for (const [id, recorded, correct] of KNOWN) {
    const d = got.get(id);
    assert.ok(d, `${id} is listed`);
    assert.equal(d.recorded, recorded, id);
    assert.equal(d.correct, correct, id);
  }
  for (const d of got.values()) assert.match(d.legs, /void|push/, `${d.slipId}: only a reduced win can differ`);
});

/* ── END TO END: the real settler, on a disposable app root, offline (NFL lane — no network) ─────────────────── */

const SETTLER = path.join(APP, "scripts", "parlays", "settle-lab-cards.mjs");
const DATE = "2026-09-14";

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-settle-"));
  const w = (rel, obj) => { const p = path.join(root, "public", "data", rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj)); };
  w(`parlays/risk-ladder-nfl/${DATE}.json`, {
    sport: "nfl", date: DATE, state: "PUBLISHED",
    cards: [
      // home ML wins (24–17) + total 41 lands exactly on 41 ⇒ push ⇒ a REDUCED WIN
      { tier: "medium", slipId: "fx_reduced", legs: [
        { eventId: "nfl-9001", market: "moneyline", side: "home", odds: -150 },
        { eventId: "nfl-9002", market: "total_points", side: "over", line: 41, odds: -110 },
      ] },
      { tier: "high", slipId: "fx_loss", legs: [
        { eventId: "nfl-9001", market: "moneyline", side: "away", odds: 130 },
        { eventId: "nfl-9002", market: "total_points", side: "under", line: 44.5, odds: -105 },
      ] },
    ],
  });
  w("nfl/results/latest.json", { rows: [
    { providerEventId: "9001", statusRaw: "STATUS_FINAL", dateUtc: `${DATE}T17:00:00Z`, ftHome: 24, ftAway: 17 },
    { providerEventId: "9002", statusRaw: "STATUS_FINAL", dateUtc: `${DATE}T20:25:00Z`, ftHome: 21, ftAway: 20 },
  ] });
  return root;
}

const settle = (root) => spawnSync("npx", ["tsx", SETTLER, "--app-root", root, "--now", "2026-09-15T09:00:00Z", "--date", DATE, "--apply"], { cwd: APP, encoding: "utf8", timeout: 120_000 });
const receiptPath = (root) => path.join(root, "public", "data", "parlays", "lab-settled", `${DATE}.json`);

test("END TO END · a day settled for the first time is written under the fix: reduced win paid on its winning leg", () => {
  const root = sandbox();
  try {
    const run = settle(root);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const doc = JSON.parse(fs.readFileSync(receiptPath(root), "utf8"));
    assert.equal(doc.payoutPolicy, PAYOUT_POLICY);
    const red = doc.cards.find((c) => c.slipId === "fx_reduced");
    assert.deepEqual(red.legs, ["win", "push"]);
    assert.equal(red.result, "win");
    assert.equal(red.combinedDecimal, fullCardDecimal([-150, -110]));
    assert.equal(red.payoutDecimal, r6(decimalFromAmerican(-150)));
    const loss = doc.cards.find((c) => c.slipId === "fx_loss");
    assert.equal(loss.result, "loss");
    assert.equal(loss.payoutDecimal, 0);
    // An identical re-run is a no-op.
    const before = fs.readFileSync(receiptPath(root), "utf8");
    const again = settle(root);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /already recorded and identical/);
    assert.equal(fs.readFileSync(receiptPath(root), "utf8"), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("END TO END · a receipt written BEFORE the fix is left byte-identical by a re-run (no payoutDecimal appears)", () => {
  const root = sandbox();
  try {
    // Exactly what the pre-fix settler wrote for this day.
    const legacy = {
      schemaVersion: 1, artifact: "parlay-lab-settlement", dataClass: "PUBLIC_DERIVED", date: DATE, settledAt: "2026-09-15T05:00:00Z",
      source: "legacy source line", policyVersion: 2,
      cards: [
        { sport: "nfl", sports: ["nfl"], tier: "medium", slipId: "fx_reduced", result: "win", combinedDecimal: fullCardDecimal([-150, -110]), legs: ["win", "push"] },
        { sport: "nfl", sports: ["nfl"], tier: "high", slipId: "fx_loss", result: "loss", combinedDecimal: fullCardDecimal([130, -105]), legs: ["loss", "win"] },
      ],
    };
    fs.mkdirSync(path.dirname(receiptPath(root)), { recursive: true });
    const bytes = JSON.stringify(legacy, null, 1) + "\n";
    fs.writeFileSync(receiptPath(root), bytes);
    const run = settle(root);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /already recorded and identical — left untouched/);
    assert.equal(fs.readFileSync(receiptPath(root), "utf8"), bytes, "byte-identical");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
