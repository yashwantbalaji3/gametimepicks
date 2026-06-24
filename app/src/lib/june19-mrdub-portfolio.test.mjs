import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));
const src = (p) => fs.readFileSync(p, "utf8");
const portfolio = read("portfolio.json");
const ledger = read("ledger.json");
const daily = read("daily-summary.json");

test("portfolio math after June 19 settlement + cross-slate resume: bankroll, HWM, drawdown, ROI, record", () => {
  // June 19 settled: Lane A WON (Step 2 → riding $601.56), prior Lane B LOST, Moonshot LOST (separate).
  // June 22: Lane B Step 1 restart settled WON ($0 realized — rolled).
  // June 23: Lane A Step 3 settled WON ($0 realized — rolled). Both lanes awaiting the next card.
  assert.equal(portfolio.currentBankroll, 10176.17); // a won step rolls; nothing realized
  assert.equal(portfolio.highWaterMark, 10376.17);
  assert.equal(portfolio.drawdown, 200);
  assert.ok(Math.abs(portfolio.drawdownPct - 0.0193) < 0.001, "drawdown ≈ 1.93% of HWM");
  // Both lanes settled WON → both seeds released; no open exposure.
  assert.equal(portfolio.openExposure, 0);
  assert.equal(portfolio.roiMultiple, 100.76);
  assert.deepEqual(portfolio.record, { wins: 12, losses: 2, voids: 0, pending: 0 });
  // Reconciliation: realized paperProfit still === settledProfit (rolled wins add no realized P/L).
  const sum = Math.round(ledger.events.reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100;
  assert.equal(sum, portfolio.settledProfit, "no double-counting — settled profit reconciles");
});

test("bankroll health after both lanes settled WON: no open exposure", () => {
  assert.equal(portfolio.bankrollHealth.label, "No open exposure");
  assert.equal(portfolio.bankrollHealth.score, 100, "nothing at risk — both lanes awaiting next card");
  assert.ok(portfolio.bankrollHealth.reasons.length >= 1);
  assert.ok(!/\bsafe\b/i.test(JSON.stringify(portfolio.bankrollHealth)), "never calls anything safe");
});

test("exposure breakdown is $0 after both lanes settled WON; both lanes awaiting; completed crown present", () => {
  const e = portfolio.exposure;
  const sportSum = (e.bySport ?? []).reduce((s, x) => s + x.amount, 0);
  assert.equal(Math.round(sportSum * 100) / 100, portfolio.openExposure, "bySport sums to open exposure ($0)");
  const laneSum = (e.byLane ?? []).reduce((s, x) => s + x.amount, 0);
  assert.equal(Math.round(laneSum * 100) / 100, portfolio.openExposure, "byLane sums to open exposure ($0)");
  // Both lanes settled WON → no active card; each lane awaits the next qualified card.
  assert.equal((portfolio.awaitingCards ?? []).length, 2);
  assert.equal((portfolio.activeCards ?? []).length, 0);
  assert.ok((portfolio.completedCards ?? []).some((c) => c.name === "Road to $10K" && c.final === 10376.17));
});

test("daily summary: June 18 shows Lane A WON + Lane B LOST with exact legs, P/L reconciles", () => {
  const d = daily.days.find((x) => x.date === "2026-06-18");
  assert.ok(d, "June 18 day present");
  assert.ok(d.events.length, "day embeds its exact events");
  const flat = JSON.stringify(d.events);
  assert.ok(/Mexico/.test(flat) && /Soto/.test(flat), "Lane A legs present");
  assert.ok(/Switzerland/.test(flat) && /Goldschmidt/.test(flat), "Lane B legs present");
  assert.ok(d.events.some((e) => e.type === "lane_step_won" && e.laneId === "lane-a"), "Lane A step won");
  assert.ok(d.events.some((e) => e.type === "lane_stopped" && e.laneId === "lane-b" && e.paperProfit === -100), "Lane B lost -$100");
  // P/L reconciles + last-day closing equals current bankroll.
  const sum = Math.round(d.events.reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100;
  assert.equal(sum, d.pl, "day P/L equals the sum of its events");
  assert.equal(daily.days[daily.days.length - 1].closing, portfolio.currentBankroll, "closing reconciles to bankroll");
  // Each event carries a self-explanatory accounting note.
  assert.ok(d.events.every((e) => typeof e.accountingNote === "string" && e.accountingNote.length), "events carry an accounting note");
});

test("Mr. Dub page: hero (scientist badge + CTAs) → dual ladder → active/awaiting → daily → exposure → full ledger", () => {
  const p = src("src/app/mr-dub/page.tsx");
  assert.match(p, /Paper Portfolio Scientist/, "character badge");
  assert.match(p, /MrDubAvatar/, "scientist graphic");
  assert.match(p, /Mr\. Dub tracks every paper card/, "microcopy");
  assert.match(p, /DualLadderBoard/, "reuses the visual ladder board");
  assert.match(p, /Stopped-lane history/, "transparent stopped-lane drawer");
  assert.match(p, /Bankroll health/, "bankroll health section");
  assert.match(p, /Active and awaiting cards/, "active/awaiting section");
  // CTAs to Bank Builder / Results / Picks / Build.
  for (const href of ["/bank-builder", "/results", "/picks", "/build"]) assert.ok(p.includes(`"${href}"`), `CTA ${href}`);
  // Section order: hero → today → dual ladder → active/awaiting → daily → exposure → full ledger.
  const order = ["Paper Portfolio Scientist", "Latest day", "Mr. Dub's two lanes", "Active and awaiting", "Bankroll timeline", "Exposure and bankroll health", "Every paper event"].map((s) => p.indexOf(s));
  assert.ok(order.every((i, idx) => idx === 0 || i > order[idx - 1]), "sections in the required order");
});

test("integrations: Results links to Mr. Dub; Today/homepage renders the Mr. Dub card", () => {
  const results = src("src/components/bank-builder-results.tsx");
  assert.match(results, /\/mr-dub/, "Results BB section links to Mr. Dub");
  assert.match(results, /View in Mr\. Dub ledger/, "explicit Mr. Dub ledger link");
  const card = src("src/components/mr-dub/mr-dub-today-card.tsx");
  assert.match(card, /currentBankroll/, "card shows current bankroll");
  assert.match(card, /\/mr-dub/, "card CTA to Mr. Dub");
  const today = src("src/app/today/page.tsx");
  assert.match(today, /<MrDubTodayCard \/>/, "Today/homepage renders the Mr. Dub card");
});
