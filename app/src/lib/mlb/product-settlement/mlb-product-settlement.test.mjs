/**
 * MLB PRODUCT-SETTLEMENT LEDGER — money-safety + honesty invariants (2026-07-09).
 *
 * Pins: the separate MLB product-settlement ledger never touches the official money record; a non-final
 * slate is all-pending (nothing graded early, no pending→loss); a final date grades to win/loss/push/
 * unavailable with no "pending" left; the settlement module + script contain no money-write path; and
 * money md5 is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const repo = path.join(app, "..");
const LEDGER_DIR = path.join(repo, "data/internal/mlb/product-settlement");

function ledger(date) {
  const p = path.join(LEDGER_DIR, `${date}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

test("1 · ledger is a SEPARATE preview — not the official money record", () => {
  if (!fs.existsSync(LEDGER_DIR)) return;
  for (const f of fs.readdirSync(LEDGER_DIR).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(LEDGER_DIR, f), "utf8"));
    assert.equal(j.public, false);
    assert.equal(j.officialMoneyRecordAffected, false);
    assert.equal(j.recordType, "mlb-product-settlement-preview");
    assert.deepEqual(j.cards, [], "no product cards — legs only, no activation");
    // No exposure/stake/bankroll leaks into a settlement preview.
    assert.doesNotMatch(JSON.stringify(j), /"(exposure|stake|bankroll|placed)"\s*:/);
  }
});

test("2 · a non-final slate is all-pending — nothing graded early, no pending→loss", () => {
  const j = ledger("2026-07-09");
  if (!j) return;
  assert.equal(j.mode, "preview-pending");
  assert.equal(j.counts.win, 0);
  assert.equal(j.counts.loss, 0);
  for (const l of j.legs) assert.equal(l.status, "pending", "every leg pending on a non-final slate");
});

test("3 · a final date grades to real outcomes with no leftover 'pending'", () => {
  const j = ledger("2026-07-08");
  if (!j) return;
  assert.equal(j.mode, "final-graded");
  assert.equal(j.counts.pending, 0, "a final date leaves nothing pending");
  assert.ok(j.counts.win > 0 && j.counts.loss > 0, "real decisive grading");
  for (const l of j.legs) assert.ok(["win", "loss", "push", "unavailable"].includes(l.status), `valid final status ${l.status}`);
  // Cross-check a sample against the committed settled ledger (independent grade must agree).
  const settled = fs.readFileSync(path.join(app, "public/data/mlb/results/settled_leans.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.date === "2026-07-08");
  const byId = new Map(settled.map((r) => [r.id, r]));
  let checked = 0;
  for (const l of j.legs.slice(0, 200)) {
    const r = byId.get(l.legId);
    if (!r) continue;
    const expected = r.outcome === "Win" ? "win" : r.outcome === "Loss" ? "loss" : r.outcome === "Push" ? "push" : "unavailable";
    assert.equal(l.status, expected, `leg ${l.legId} grade agrees with the pipeline`);
    checked++;
  }
  assert.ok(checked > 50, `cross-checked ${checked} graded legs`);
});

test("4 · the settlement module + script contain no money-write path", () => {
  const mod = fs.readFileSync(path.join(app, "src/lib/mlb/product-settlement/mlb-markets.ts"), "utf8");
  assert.doesNotMatch(mod, /portfolio|mr-dub|bankroll|writeFileSync|readFileSync|fetch\(/, "pure rules — no io/money");
  const script = fs.readFileSync(path.join(app, "scripts/build-mlb-product-settlement.mjs"), "utf8");
  // Narrow to actual fs operations (comments/notes may DOCUMENT that it avoids money paths). No
  // read/write/path targets a money artifact; writes go only to the product-settlement dir.
  assert.doesNotMatch(script, /(readFileSync|writeFileSync|path\.join)\([^)]*(mr-dub|portfolio\.json|bankroll|daily-portfolio)/, "no fs op on a money artifact");
  assert.match(script, /OUT_DIR = .*product-settlement/, "writes only to the product-settlement dir");
});

test("5 · money md5 unchanged — settlement is fully money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
