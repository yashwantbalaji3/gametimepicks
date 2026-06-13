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

test("Bank Builder unchanged by the overnight run: $3,623.97 / 4-0 / Step 5", () => {
  const s = read("bank-builder/public-summary-latest.json");
  assert.equal(s.currentBankrollUnits, 3623.97);
  assert.equal(s.currentProgressionStep, 5);
  assert.deepEqual(s.record, { wins: 4, losses: 0, pushes: 0 });
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.entries.filter((e) => e.step === 4).length, 1, "Step 4 settled once");
});

test("Step 5 remains review-pending — no Step-5 card was invented", () => {
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.nextPickStatus, "pending");
  // No step-5 entry exists in the ledger (a settled/published Step 5 would appear here).
  assert.equal(l.entries.filter((e) => e.step === 5).length, 0, "no Step 5 entry");
  // The page shows the honest review-pending panel, not an invented card.
  const page = fs.readFileSync("src/app/bank-builder/page.tsx", "utf8");
  assert.ok(page.includes("Step 5 review pending"), "review-pending copy present");
  assert.ok(page.includes("no card is invented to fill the rung"), "no-invented-card honesty");
});
