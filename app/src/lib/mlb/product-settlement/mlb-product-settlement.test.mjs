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
import { settleMlbMoneyline, settleMlbRunLine, settleMlbTotal, settleMlbTeamTotal, settleMlbPitcherStrikeouts } from "./mlb-markets.ts";

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

test("2 · a game with no official result is never graded — no early grade, no fabricated loss", () => {
  // This used to pin 2026-07-09 as "the non-final slate". That date has since genuinely settled, so
  // the fixture rotted into a false failure — it was asserting a fact about live data rather than the
  // invariant. The invariant is at the rule level and cannot rot: no official result ⇒ pending, never
  // a loss. The postponed case is real: StatsAPI reports a postponed game as abstractGameState
  // "Final" with no scores, so `gameFinal` can be true while the result is absent.
  const noResult = [
    ["moneyline · not final", settleMlbMoneyline({ homeScore: null, awayScore: null, selectedTeam: "home", gameFinal: false })],
    ["moneyline · postponed (final flag, no score)", settleMlbMoneyline({ selectedTeam: "away", gameFinal: true })],
    ["run line · not final", settleMlbRunLine({ selectedTeam: "home", line: -1.5, gameFinal: false })],
    ["run line · postponed", settleMlbRunLine({ selectedTeam: "home", line: -1.5, gameFinal: true })],
    ["total · not final", settleMlbTotal({ side: "over", line: 8.5, gameFinal: false })],
    ["total · postponed", settleMlbTotal({ side: "over", line: 8.5, gameFinal: true })],
    ["team total · not final", settleMlbTeamTotal({ side: "under", line: 4.5, gameFinal: false })],
    ["pitcher Ks · not final", settleMlbPitcherStrikeouts({ side: "over", line: 5.5, gameFinal: false })],
  ];
  for (const [label, o] of noResult) {
    assert.equal(o.status, "pending", `${label}: must stay pending without an official result`);
  }

  // Structural half: no committed ledger may carry a decisive grade it could not have earned.
  if (!fs.existsSync(LEDGER_DIR)) return;
  for (const f of fs.readdirSync(LEDGER_DIR).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(LEDGER_DIR, f), "utf8"));
    if (j.mode === "preview-pending") {
      assert.equal(j.counts.win, 0, `${f}: a preview-pending ledger has no wins`);
      assert.equal(j.counts.loss, 0, `${f}: a preview-pending ledger has no losses`);
      for (const l of j.legs) assert.equal(l.status, "pending", `${f}: every leg pending on a non-final slate`);
    }
    // A loss always cites a concrete comparison; "not available" can only ever produce pending.
    for (const l of j.legs) {
      if (l.status === "loss") {
        assert.doesNotMatch(String(l.reason ?? ""), /not available|not final/i, `${f}: ${l.legId} was called a loss without a result`);
      }
    }
  }
});

test("3 · a final date grades to real outcomes with no leftover 'pending'", () => {
  const j = ledger("2026-07-08");
  if (!j) return;
  assert.equal(j.mode, "graded");
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

test("6 · team moneyline is graded from the official linescore (source statsapi), cross-checked", () => {
  const j = ledger("2026-07-08");
  const lsPath = path.join(app, "public/data/mlb/results/settled_leans.jsonl"); // ensure the ledger exists context
  if (!j) return;
  const lsFile = path.join(app, "..", "data/internal/mlb/linescores/2026-07-08.json");
  if (!fs.existsSync(lsFile)) return;
  const byPk = new Map(JSON.parse(fs.readFileSync(lsFile, "utf8")).games.map((g) => [g.gamePk, g]));
  const ml = j.legs.filter((l) => l.marketKey === "moneyline" && l.source === "statsapi");
  assert.ok(ml.length > 0, "team moneyline legs present");
  for (const l of ml) {
    assert.ok(["win", "loss"].includes(l.status), "final game moneyline is decisive");
    const g = byPk.get(l.gamePk);
    if (!g) continue;
    // The ledger grades the HOME moneyline; it wins iff home outscored away.
    const expected = g.homeRuns > g.awayRuns ? "win" : "loss";
    assert.equal(l.status, expected, `home ML ${l.gamePk} agrees with the official ${g.homeRuns}-${g.awayRuns}`);
  }
  void lsPath;
});

test("7 · founder-review previews never activate a card or exposure", () => {
  const dir = path.join(app, "..", "data/internal/product-previews");
  if (!fs.existsSync(dir)) return;
  for (const product of ["bank-builder", "moonshot"]) {
    const pdir = path.join(dir, product);
    if (!fs.existsSync(pdir)) continue;
    for (const f of fs.readdirSync(pdir).filter((x) => x.endsWith(".json"))) {
      const p = JSON.parse(fs.readFileSync(path.join(pdir, f), "utf8"));
      assert.ok(["founder_review", "watchlist", "no_play"].includes(p.status), `${product} status is review/watchlist/no_play`);
      assert.equal(p.active, false);
      assert.equal(p.exposure, 0);
      assert.equal(p.officialMoneyRecordAffected, false);
      assert.equal(p.requiresFounderApproval, true);
      assert.equal(p.public, false);
      // Only settlement-supported eligible legs may appear (real settlement source).
      for (const l of p.legs ?? []) assert.ok(["statsapi", "api-football"].includes(l.settlementSource), `${product} leg cites a real settlement source`);
    }
  }
});
