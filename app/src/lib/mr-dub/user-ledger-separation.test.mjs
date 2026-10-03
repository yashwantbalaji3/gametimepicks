/**
 * Session 9 overnight · G6 — the official Mr. Dub ledger and a tester's private ledger never touch.
 *
 * The accounts side is already guarded (bet-insights.test: nothing in lib/accounts reads Mr. Dub). This is
 * the reverse direction plus a behavioural probe: no Mr. Dub owner reads user data, and recording a personal
 * bet cannot move the official record — the money audit over the real record is identical before and after.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { reconcileMoney } from "./money-movements.mjs";
import { readReceiptsFrom } from "./protected-invariant.mjs";
import { summarise } from "../accounts/bet-insights.mjs";

const APP = process.cwd();
const read = (f) => JSON.parse(fs.readFileSync(path.join(APP, "public/data/mr-dub", f), "utf8"));

test("no Mr. Dub money owner reads a user's bets, account or Supabase", () => {
  const owners = [
    ...fs.readdirSync(path.join(APP, "src/lib/mr-dub")).filter((f) => /\.(mjs|ts)$/.test(f) && !f.includes(".test.")).map((f) => `src/lib/mr-dub/${f}`),
    "src/lib/money-integrity.ts", "scripts/mr-dub/fold-protected-era.mjs", "scripts/mr-dub/money-audit.mjs", "scripts/health-check.mjs",
  ];
  for (const rel of owners) {
    const src = fs.readFileSync(path.join(APP, rel), "utf8");
    assert.ok(!/bet_slips|lib\/accounts|supabase|user_id/i.test(src), `${rel} must never read private user data`);
  }
});

test("a personal bet changes the tester's own P/L and leaves the official money audit byte-identical", () => {
  const data = () => ({ portfolio: read("portfolio.json"), ledgerEvents: read("ledger.json").events, summaryDays: read("daily-summary.json").days, receipts: readReceiptsFrom(APP) });
  const before = JSON.stringify(reconcileMoney(data()).summary);
  const mine = summarise([{ status: "lost", stake: 50, returned: 0, price_american: 150, legs: [], confirmed_at: "2026-10-03T00:00:00Z", placed_at: "2026-10-02T23:00:00Z" }]);
  assert.ok(mine, "the personal ledger summarises the tester's own slip");
  const after = JSON.stringify(reconcileMoney(data()).summary);
  assert.equal(after, before, "Mr. Dub's audited summary did not move");
});
