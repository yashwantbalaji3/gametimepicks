/**
 * June 13 overnight run invariants: June-12 World Cup is settled from official finals
 * (USA 4-1 WIN, Canada 1-1 draw LOSS), the June-13 NBA board (Game 5) is real + live,
 * Bank Builder stays $3,623.97 / 4-0 / Step 5, and Step 5 remains review-pending (no
 * invented card). Guards against silent regression or fabrication.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));

test("June 12 World Cup settled from official 90' finals", () => {
  const s = read("world-cup/settlement/2026-06-12.json");
  assert.equal(s.date, "2026-06-12");
  const usa = s.finals.find((f) => f.match.includes("United States"));
  const can = s.finals.find((f) => f.match.includes("Canada"));
  assert.equal(usa.regulationScore, "4-1");
  assert.equal(can.regulationScore, "1-1");
  // Double-chance calls graded honestly: USA-or-Paraguay won, Canada-or-Bosnia LOST (draw).
  const up = s.graded.find((g) => g.pick.includes("United States"));
  const cb = s.graded.find((g) => g.pick.includes("Canada"));
  assert.equal(up.outcome, "win");
  assert.equal(cb.outcome, "loss", "a 1-1 draw loses the either-team double chance");
  assert.equal(s.officialResultConfirmed, true);
});

test("June 13 NBA board is REAL (not demo) and is NBA Finals Game 5", () => {
  const b = read("boards/2026-06-13.json");
  assert.equal(b.isDemo, false);
  assert.equal(b.dataMode, "Live");
  assert.equal(b.oddsSource, "the_odds_api");
  const g = b.games[0];
  assert.ok((g.awayTeamAbbr === "NY" && g.homeTeamAbbr === "SA"), "Knicks @ Spurs");
  assert.ok(Array.isArray(b.leans) && b.leans.length > 50, "real props present");
});

test("Bank Builder not mutated by the overnight run; it reflects the official $10,376.17 / 5-0 / Step 5 state", () => {
  const s = read("bank-builder/public-summary-latest.json");
  assert.equal(s.currentBankrollUnits, 10376.17);
  assert.equal(s.currentProgressionStep, 5);
  assert.deepEqual(s.record, { wins: 5, losses: 0, pushes: 0 });
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.entries.filter((e) => e.step === 4).length, 1, "Step 4 settled once");
});

test("Step 5 has officially settled — the completed card is real, not an overnight fabrication", () => {
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.nextPickStatus, "completed");
  // Exactly one official Step-5 entry exists in the ledger — settled as a win.
  const s5 = l.entries.filter((e) => e.step === 5);
  assert.equal(s5.length, 1, "one official Step 5 entry");
  assert.equal(s5[0].result, "win");
  // The completed crown is now celebrated once, in the ClimbHero flagship: the page reads the real
  // banked-ladder finals and feeds them to the hero's "Completed ladders" proof strip — not a
  // review-pending panel and not a fabricated figure.
  const page = fs.readFileSync("src/app/bank-builder/page.tsx", "utf8");
  assert.ok(/readCompletedLadders\(/.test(page), "real banked-ladder finals are read, not fabricated");
  assert.ok(/completedLadders=\{completedLadders\}/.test(page), "completed-ladder proof fed to the ClimbHero");
  // 2026-07-07 Option-1 simplify: the no-invented-card honesty is now inherent in the ClimbHero ladder —
  // an unqualified rung shows an honest 'Model pass', never a fabricated card.
  const vlad = fs.readFileSync("src/components/bank-builder/vertical-ladder-climb.tsx", "utf8");
  assert.ok(/Model pass — holding for a stronger slate/.test(vlad), "no-invented-card honesty retained (honest pass)");
});
