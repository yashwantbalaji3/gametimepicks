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
  // crown − $1400 realized dual-lane losses. Moonshot unchanged.
  assert.equal(portfolio.crownBankroll, 20465.4, "crown = Σ two banked $100→$10k ladder finals (immutable, append-only)");
  assert.equal(portfolio.currentBankroll, 19065.4, "active bankroll = crown − $1400 dual-lane losses");
  assert.equal(portfolio.highWaterMark, 20465.4);
  assert.equal(portfolio.drawdown, 1400, "drawdown — $1400 of stopped-lane seeds (14 lost seeds incl. the July-5 both-lane losses)");
  assert.ok(Math.abs(portfolio.drawdownPct - 0.0684) < 0.001, "drawdown ≈ 6.8% of HWM");
  // All prior cycles fully settled; the settled lanes have no open exposure (awaiting a fresh slate).
  assert.equal(portfolio.openExposure, 0);
  assert.equal(portfolio.roiMultiple, 189.65);
  // Settlement chain: both lanes lost July-5, then Lane A WON its July-6 cycle-8 Step-1 AND its July-7 Step-2
  // (both rolled unrealized) → record advances to 19-14-0-0 while the bankroll stays $19,065.40 (a won step never moves it).
  assert.deepEqual(portfolio.record, { wins: 19, losses: 14, voids: 0, pending: 0 });
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
  // Post July-6 settlement: Lane A WON its cycle-8 Step-1 → ADVANCED, so it surfaces exactly one
  // awaiting-next-card entry (awaiting its Step-2 card) in the canonical portfolio; Lane B is still stopped
  // (no entry). No card is placed yet, so activeCards stays 0.
  const awaiting = portfolio.awaitingCards ?? [];
  assert.equal(awaiting.length, 1, "Lane A advanced → one awaiting-next-card entry (Lane B stopped → none)");
  assert.equal(awaiting[0].laneId, "lane-a", "the awaiting entry is Lane A (advanced, awaiting its next qualified card)");
  assert.equal((portfolio.activeCards ?? []).length, 0);
  // The banked crown is surfaced as a completed card at the cumulative total ($20,465.40).
  assert.ok((portfolio.completedCards ?? []).some((c) => c.name === "Road to $10K" && c.final === 20465.4));
});

test("daily summary: the 2nd ladder climbs day-by-day (Σ +$10,089.23) to the crown, then the dual-lane drawdown realizes; P/L reconciles", () => {
  // COMPLETE JOURNEY: the 2nd ladder is shown as its real day-by-day climb (June 18→24), summing to the
  // banked final $10,089.23 — not a single lump. The crown ($20,465.40) is the high-water peak on June-24.
  const ladder2Days = daily.days.filter((x) => ["2026-06-18", "2026-06-19", "2026-06-21", "2026-06-23", "2026-06-24"].includes(x.date));
  const ladder2Climb = Math.round(ladder2Days.flatMap((d) => d.events).filter((e) => e.type === "ladder_step_won" && e.laneId === "lane-a").reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100;
  assert.equal(ladder2Climb, 10089.23, "Lane A 2nd ladder climbs to the banked final $10,089.23 across its step-days");
  const banked = daily.days.find((x) => x.date === "2026-06-24");
  assert.equal(banked.closing, 20465.4, "June-24 closing = cumulative crown $20,465.40 (the high-water peak)");
  assert.ok(banked.events.some((e) => e.type === "ladder_step_won"), "June-24 carries the final banked step");
  // June-25: Lane A Step-1 WON (rolled, $0) + Lane B Step-1 LOST (−$100) + the dual-lane phase drawdown (−$300)
  // realized just after the crown peak → total −$400, closing back to the canonical bankroll.
  const june25 = daily.days.find((x) => x.date === "2026-06-25");
  assert.ok(june25, "June-25 day present");
  assert.ok(june25.events.some((e) => e.type === "lane_stopped" && e.paperProfit === -100), "June-25 Lane B stop realizes −$100");
  assert.ok(june25.events.some((e) => e.type === "dual_lane_losses" && e.paperProfit === -300), "dual-lane drawdown realizes −$300 after the crown peak");
  assert.equal(june25.closing, 20065.4, "June-25 closing = canonical bankroll $20,065.40");
  // P/L reconciles for each tracked day + last-day closing equals current bankroll.
  for (const d of [banked, june25]) {
    const sum = Math.round(d.events.reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100;
    assert.equal(sum, d.pl, `day ${d.date} P/L equals the sum of its events`);
  }
  assert.equal(daily.days[daily.days.length - 1].closing, portfolio.currentBankroll, "closing reconciles to bankroll");
  // Each event carries a self-explanatory note (accounting trail).
  for (const d of [banked, june25]) assert.ok(d.events.every((e) => (typeof e.accountingNote === "string" && e.accountingNote.length) || (typeof e.notes === "string" && e.notes.length)), "events carry an explanatory note");
});

test("Mr. Dub flagship: hero (scientist badge) → dashboard → today → journey → analytics → timeline → attribution → wider-platform appendix", () => {
  const p = src("src/app/mr-dub/page.tsx");
  assert.match(p, /Paper Portfolio Scientist/, "character badge");
  assert.match(p, /MrDubAvatar/, "scientist graphic");
  assert.match(p, /every official result, every bankroll move/, "flagship microcopy");
  // Premium derived flagship components (all fed by buildFlagship — no hand-authored money).
  assert.match(p, /buildFlagship/, "derives everything from the canonical flagship model");
  assert.match(p, /<ExecutiveDashboard/, "executive KPI dashboard");
  assert.match(p, /<TodayStatusStrip/, "today's status strip");
  assert.match(p, /BankBuilderJourneySection/, "visual $100→$19.5K Bank Builder journey");
  assert.match(p, /<InteractiveTimeline/, "expandable day-by-day timeline");
  assert.match(p, /<ProductAttribution/, "product attribution");
  // Wider-platform appendix preserves today's four-product plan + the separate Moonshot side lane.
  assert.match(p, /DailyPortfolioSection/, "today's four-product plan");
  assert.match(p, /MoonshotLaneTracker/, "Moonshot side lane");
  // CTAs.
  for (const href of ["/bank-builder", "/results", "/picks", "/world-cup"]) assert.ok(p.includes(`"${href}"`), `CTA ${href}`);
  // Section order: hero → dashboard → today → journey → analytics → timeline → attribution → appendix.
  const order = ["Paper Portfolio Scientist", "<ExecutiveDashboard", "<TodayStatusStrip", "The $100 → $19.5K journey", "How the bankroll moved", "Day-by-day timeline", "Every wager, by product", "The wider platform"].map((s) => p.indexOf(s));
  assert.ok(order.every((i, idx) => i >= 0 && (idx === 0 || i > order[idx - 1])), "sections in the flagship order");
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
