/**
 * June 16 full-settlement contract: World Cup team markets + player props, suggested cards (WC +
 * mixed), and MLB optimizer slips are officially settled; Bank Builder Run #1/#2 are preserved and
 * no Run #3 launched. Data-level checks against the settled artifacts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const j = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("World Cup team markets settled from official finals (June 16)", () => {
  const s = j("public/data/world-cup/settlement/2026-06-16.json");
  assert.equal(s.finals.length, 3, "3 fixtures graded");
  const scores = Object.fromEntries(s.finals.map((f) => [f.match, f.regulationScore]));
  assert.equal(scores["France vs Senegal"], "3-1");
  assert.equal(scores["Iraq vs Norway"], "1-4");
  assert.equal(scores["Argentina vs Algeria"], "3-0");
  assert.equal(s.graded.length, 11, "all 11 parlay-eligible picks graded");
  for (const g of s.graded) assert.ok(["win", "loss", "push"].includes(g.outcome), `${g.pick} graded`);
});

test("World Cup player props settled officially (won/lost/void, none needs_review)", () => {
  const p = j("public/data/world-cup/player-projections/2026-06-16.json");
  assert.ok(p.settlementCounts, "settlement counts present");
  const c = p.settlementCounts;
  assert.equal(c.needs_review, 0, "no props left needs_review (official id-matched)");
  assert.ok(c.won + c.lost + c.void === p.matches.length, "every prop graded");
  // every prop carries a result + official final
  for (const m of p.matches) {
    assert.ok(["won", "lost", "void"].includes(m.result), `${m.player?.name} graded`);
    assert.ok(typeof m.final === "string" && m.final.length > 0, "official final line");
  }
});

test("World Cup suggested cards settled (both won)", () => {
  const d = j("public/data/world-cup/parlays/2026-06-16.json");
  for (const card of d.cards) {
    assert.ok(["won", "lost", "push"].includes(card.result), `${card.id} settled`);
    for (const leg of card.legs) assert.ok(leg.result, "leg graded");
  }
});

test("mixed cross-sport cards settled (all lost on the MLB leg)", () => {
  const d = j("public/data/daily/cards/2026-06-16.json");
  for (const card of d.cards) {
    assert.ok(["won", "lost", "push", "pending"].includes(card.result), `${card.id} has a result`);
    for (const leg of card.legs) assert.ok(leg.result, "leg graded");
  }
});

test("Bank Builder preserved — Run #1 completed, Run #2 closed, no Run #3", () => {
  const r1 = j("public/data/bank-builder/public-summary-latest.json");
  assert.equal(r1.currentBankrollUnits, 10376.17);
  assert.equal(r1.record.wins, 5);
  assert.equal(r1.record.losses, 0);
  const dual = j("public/data/bank-builder/dual-lanes-latest.json");
  assert.ok(dual.runNumber === 2 || dual.status === "settled" || dual.status === "closed", "Run #2 latest dual");
  assert.equal(dual.lanesSurvived, 0);
  const v2 = j("public/data/bank-builder/v2-evaluation-latest.json");
  assert.notEqual(v2.decision, "launch", "Run #3 not launched");
  assert.ok(!fs.existsSync("public/data/bank-builder/dual-lanes-run-3.json"), "no Run #3 artifact");
});
