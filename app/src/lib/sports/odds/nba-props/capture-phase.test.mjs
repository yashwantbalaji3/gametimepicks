/* Early snapshot (founder 2026-10-29): a second, receipt-authorized capture per game that never blocks the pregame one. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { capturedOddsEventIds, runNbaPropCapture } from "./capture.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const receipt = fs.readFileSync(path.join(ROOT, "docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-10-29.md"), "utf8");
const ledger = { requests: [
  { fingerprint: "nba|evA|player_points|draftkings", status: 200 },
  { fingerprint: "nba-early|evB|player_points|draftkings", status: 200 },
  { fingerprint: "nba-early|evC|player_points|draftkings", status: 429 },
] };

test("each phase has its own once-per-game slot", () => {
  assert.deepEqual([...capturedOddsEventIds(ledger)], ["evA"], "pregame sees only pregame captures");
  assert.deepEqual([...capturedOddsEventIds(ledger, { phase: "early" })], ["evB"], "early sees only early captures; a failed call does not count");
});

test("an early snapshot refuses unless the receipt names it, and an unknown phase refuses", async () => {
  const base = { now: "2026-10-29T20:30:00Z", receiptText: receipt.replace(/^Early snapshot:.*$/m, ""), markets: ["player_points"], apply: false };
  const r = await runNbaPropCapture({ ...base, phase: "early" });
  assert.equal(r.state, "REFUSED");
  assert.match(r.reasons.join(" "), /does not authorize an early snapshot/);
  const u = await runNbaPropCapture({ ...base, phase: "midday" });
  assert.equal(u.state, "REFUSED");
  const ok = await runNbaPropCapture({ ...base, receiptText: `${base.receiptText}\nEarly snapshot: test\n`, phase: "early" });
  assert.notEqual(ok.state, "REFUSED", "with the term present the early phase plans normally");
});
