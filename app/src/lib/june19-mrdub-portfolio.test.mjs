import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));
const src = (p) => fs.readFileSync(p, "utf8");
const portfolio = read("portfolio.json");
const ledger = read("ledger.json");
const daily = read("daily-summary.json");

test("portfolio math after the 2nd ladder is BANKED: crown, bankroll, HWM, drawdown, ROI, record", () => {
  // Cumulative-crown banking: Lane A completed its $100→$10k ladder ($10,089.23, official) and was BANKED into
  // the crown. Crown = Σ two completed-ladder finals ($10,376.17 + $10,089.23 = $20,465.40). Active bankroll =
  // crown − $300 realized dual-lane losses. The live dual lanes are now a fresh cycle-2. Moonshot unchanged.
  assert.equal(portfolio.crownBankroll, 20465.4, "crown = Σ two banked $100→$10k ladder finals (immutable, append-only)");
  assert.equal(portfolio.currentBankroll, 20165.4, "active bankroll = crown − $300 dual-lane losses");
  assert.equal(portfolio.highWaterMark, 20465.4);
  assert.equal(portfolio.drawdown, 300, "drawdown unchanged — $300 of stopped-lane seeds");
  assert.ok(Math.abs(portfolio.drawdownPct - 0.0147) < 0.001, "drawdown ≈ 1.47% of HWM");
  // Both prior cycles fully settled; the fresh cycle-2 lanes have no settled exposure yet → no open exposure.
  assert.equal(portfolio.openExposure, 0);
  assert.equal(portfolio.roiMultiple, 200.65);
  // Banking is not a bet → the win/loss record is UNCHANGED at 13-3-0-0.
  assert.deepEqual(portfolio.record, { wins: 13, losses: 3, voids: 0, pending: 0 });
  // Reconciliation: realized paperProfit (banked ladder + dual-lane losses) === settledProfit (no double-counting).
  const sum = Math.round(ledger.events.reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100;
  assert.equal(sum, portfolio.settledProfit, "no double-counting — settled profit reconciles");
});

test("bankroll health after June 24 settlement (Lane A completed, Lane B lost): no open exposure", () => {
  assert.equal(portfolio.bankrollHealth.label, "No open exposure");
  assert.equal(portfolio.bankrollHealth.score, 100, "nothing at risk — no active cards");
  assert.ok(portfolio.bankrollHealth.reasons.length >= 1);
  assert.ok(!/\bsafe\b/i.test(JSON.stringify(portfolio.bankrollHealth)), "never calls anything safe");
});

test("exposure breakdown is $0 after the 2nd ladder is banked; banked crown present", () => {
  const e = portfolio.exposure;
  const sportSum = (e.bySport ?? []).reduce((s, x) => s + x.amount, 0);
  assert.equal(Math.round(sportSum * 100) / 100, portfolio.openExposure, "bySport sums to open exposure ($0)");
  const laneSum = (e.byLane ?? []).reduce((s, x) => s + x.amount, 0);
  assert.equal(Math.round(laneSum * 100) / 100, portfolio.openExposure, "byLane sums to open exposure ($0)");
  // The completed Lane A ladder is now BANKED (not pending) → no awaiting card; fresh cycle-2 has no active card yet.
  assert.equal((portfolio.awaitingCards ?? []).length, 0);
  assert.equal((portfolio.activeCards ?? []).length, 0);
  // The banked crown is surfaced as a completed card at the cumulative total ($20,465.40).
  assert.ok((portfolio.completedCards ?? []).some((c) => c.name === "Road to $10K" && c.final === 20465.4));
});

test("daily summary: the 2nd ladder is BANKED (+$10,089.23) then dual-lane losses realized (−$300), P/L reconciles", () => {
  // The rebuilt daily ledger records the banking of the 2nd ladder and the realized dual-lane losses.
  const banked = daily.days.find((x) => x.date === "2026-06-24");
  assert.ok(banked, "ladder-banked day present");
  assert.ok(banked.events.length, "day embeds its exact events");
  assert.ok(banked.events.some((e) => e.type === "ladder_banked" && e.paperProfit === 10089.23), "Lane A ladder banked +$10,089.23");
  assert.equal(banked.closing, 20465.4, "closing after banking = cumulative crown $20,465.40");
  const losses = daily.days.find((x) => x.date === "2026-06-25");
  assert.ok(losses, "dual-lane-losses day present");
  assert.ok(losses.events.some((e) => e.type === "dual_lane_losses" && e.paperProfit === -300), "dual-lane losses realize −$300");
  // P/L reconciles for each banking day + last-day closing equals current bankroll.
  for (const d of [banked, losses]) {
    const sum = Math.round(d.events.reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100;
    assert.equal(sum, d.pl, `day ${d.date} P/L equals the sum of its events`);
  }
  assert.equal(daily.days[daily.days.length - 1].closing, portfolio.currentBankroll, "closing reconciles to bankroll");
  // Each event carries a self-explanatory accounting note.
  for (const d of [banked, losses]) assert.ok(d.events.every((e) => typeof e.accountingNote === "string" && e.accountingNote.length), "events carry an accounting note");
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
