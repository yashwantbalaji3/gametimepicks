/**
 * FLAGSHIP model reconciliation — the derived flagship view must reconcile EXACTLY to the canonical money
 * and record. These tests pin the hard contract from the mission: never fabricate history; the timeline's
 * running cumulative ends on the official 17–12; every bankroll figure equals portfolio.json.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildTimeline, buildCharts, buildJourney, buildWagerLog, buildFlagship } from "./flagship.ts";

const root = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, "mr-dub", rel), "utf8"));
const portfolio = read("portfolio.json");
const daily = read("daily-summary.json");
const banked = read("banked-ladders.json");
const approved = read("bank-builder-approved.json");

test("timeline running cumulative record ends EXACTLY on the canonical official record (17–12)", () => {
  const { timeline } = buildTimeline(daily.days, portfolio);
  const newest = timeline[0]; // reversed → newest first
  assert.equal(newest.cumWins, portfolio.record.wins, `cumulative wins must equal canonical ${portfolio.record.wins}`);
  assert.equal(newest.cumLosses, portfolio.record.losses, `cumulative losses must equal canonical ${portfolio.record.losses}`);
});

test("timeline reconciles to the canonical bankroll journey (start → current, monotonic chain)", () => {
  const { timeline } = buildTimeline(daily.days, portfolio);
  const chron = [...timeline].reverse();
  assert.equal(chron[0].opening, portfolio.startingBankroll, "first opening == starting bankroll");
  assert.equal(chron[chron.length - 1].closing, portfolio.currentBankroll, "last closing == current bankroll");
  // Continuous chain: each opening equals the prior closing.
  for (let i = 1; i < chron.length; i++) {
    assert.equal(chron[i].opening, chron[i - 1].closing, `chain continuous at ${chron[i].date}`);
  }
});

test("KPIs mirror the canonical portfolio exactly (no recomputed money)", () => {
  const { kpis } = buildTimeline(daily.days, portfolio);
  assert.deepEqual(kpis.record, { wins: portfolio.record.wins, losses: portfolio.record.losses });
  assert.equal(kpis.bankroll, portfolio.currentBankroll);
  assert.equal(kpis.peak, portfolio.highWaterMark);
  assert.equal(kpis.profit, portfolio.settledProfit);
  assert.equal(kpis.drawdown, portfolio.drawdown);
  assert.equal(kpis.roiMultiple, portfolio.roiMultiple);
  // Largest winning / losing day are real dated days.
  assert.ok(kpis.largestWinDay && kpis.largestWinDay.pl > 0, "a largest winning day exists");
  assert.ok(kpis.largestLossDay && kpis.largestLossDay.pl < 0, "a largest losing day exists");
});

test("no fabricated day P/L — every timeline pl comes straight from a settled daily-summary day", () => {
  const { timeline } = buildTimeline(daily.days, portfolio);
  const byDate = new Map(daily.days.map((d) => [d.date, d]));
  for (const t of timeline) {
    assert.ok(byDate.has(t.date), `timeline day ${t.date} exists in daily-summary`);
    assert.equal(t.pl, Math.round(byDate.get(t.date).pl * 100) / 100, `pl for ${t.date} is unchanged`);
  }
});

test("Bank Builder journey = 2 completed 5–0 crown ladders + today's approved active lanes", () => {
  const j = buildJourney(banked, approved, approved.date);
  assert.equal(j.crownTotal, banked.crownTotal);
  assert.equal(j.ladders.length, 2, "two completed ladders");
  for (const l of j.ladders) {
    assert.equal(l.steps.length, 5, `${l.label} has 5 rungs`);
    assert.equal(l.result, "5–0");
    assert.equal(l.final, l.steps[l.steps.length - 1].after, "final == last rung after");
  }
  // Active lanes come from the operator-approved card (date-gated); Lane A must be the approved pair.
  assert.ok(j.activeLanes.length >= 1, "active lanes present for the approved date");
  const a = j.activeLanes.find((x) => x.lane === "A");
  assert.ok(a && a.legs.length >= 2, "Lane A has its approved legs");
});

test("charts: product performance carries canonical Bank Builder profit; heatmap has one cell per settled day", () => {
  const { timeline } = buildTimeline(daily.days, portfolio);
  const master = { products: [{ productId: "bank-builder", label: "Bank Builder", record: { wins: 17, losses: 12 }, profit: 19165.4, canonical: true }] };
  const charts = buildCharts(timeline, master);
  const bb = charts.productPerformance.find((p) => p.productId === "bank-builder");
  assert.ok(bb && bb.canonical && bb.profit === 19165.4, "BB canonical profit surfaced");
  assert.equal(charts.heatmap.length, timeline.length, "one heatmap cell per timeline day");
  assert.equal(charts.bankroll[charts.bankroll.length - 1].closing, portfolio.currentBankroll, "bankroll series ends at current");
});

test("wager log is non-empty, newest-first, and every Bank Builder row is flagged canonical", () => {
  const master = { products: [{ productId: "moonshot", label: "Moonshot", history: [{ date: "2026-07-02", outcome: "lost", stake: 25, payout: 0 }] }] };
  const rows = buildWagerLog(daily.days, master);
  assert.ok(rows.length > 0, "wagers present");
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].date >= rows[i].date, "newest first");
  assert.ok(rows.every((r) => r.productId !== "bank-builder" || r.canonical), "BB rows canonical");
  assert.ok(rows.some((r) => r.productId === "moonshot"), "side-lane wagers merged in");
});

test("buildFlagship orchestrator returns a fully-reconciled model (money == canonical)", () => {
  const f = buildFlagship(root, "2026-07-03T12:00:00Z", "2026-07-03");
  assert.equal(f.kpis.bankroll, portfolio.currentBankroll);
  assert.deepEqual(f.kpis.record, { wins: portfolio.record.wins, losses: portfolio.record.losses });
  assert.equal(f.timeline[0].cumWins, portfolio.record.wins);
  assert.equal(f.timeline[0].cumLosses, portfolio.record.losses);
  assert.ok(f.todayStatus.settlementStatus.length > 0, "settlement status present");
  assert.ok(Array.isArray(f.todayStatus.products), "today product exposure present");
});
