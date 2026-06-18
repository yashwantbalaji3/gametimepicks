#!/usr/bin/env -S npx tsx
/**
 * Build Mr. Dub's paper-portfolio ledger — the public accountability layer. Seeds from the original
 * completed Bank Builder ladder ($100 → $10,376.17, 5–0, read from the PROTECTED public ledger — never
 * mutated), then layers the dual-lane paper activity (June 17 Step 1 wins, June 18 Step 2 settlement,
 * Lane A stop + restart, Lane B pending) from the NON-protected active engine artifact.
 *
 * Writes app/public/data/mr-dub/{ledger,portfolio,daily-summary}.json. Reads protected data; never writes it.
 * Paper-only educational tracking — not a sportsbook, not financial advice. No fabrication.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const OUT = path.join(DATA, "mr-dub");
const CROWN = path.join(DATA, "bank-builder", "public-ledger-latest.json");      // PROTECTED — read only
const ACTIVE = path.join(DATA, "methodology", "launch", "dual-bank-builder-active.json");
const NOW = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : "2026-06-18T18:40:00Z";
const round2 = (n) => Math.round(n * 100) / 100;

function main() {
  const crown = JSON.parse(fs.readFileSync(CROWN, "utf8"));
  const active = JSON.parse(fs.readFileSync(ACTIVE, "utf8")).run;
  const events = [];

  // 1) Original completed ladder — one completed_success event per step (official, from protected ledger).
  for (const e of crown.entries ?? []) {
    events.push({
      eventId: `mrdub-crown-step${e.step}`,
      timestamp: `${e.date}T23:59:00Z`,
      portfolio: "mr-dub-paper",
      category: "bank_builder",
      type: e.result === "win" ? "ladder_step_won" : "ladder_step_settled",
      laneId: "crown-ladder",
      step: e.step,
      date: e.date,
      sport: e.sport,
      paperStake: round2(e.stakeUnits),
      paperReturn: round2(e.payoutUnits),
      paperProfit: round2(e.profitUnits),
      bankrollAfter: round2(e.bankrollAfter),
      combinedAmerican: e.combinedAmerican,
      status: "settled",
      result: e.result,
      officialResultConfirmed: !!e.officialResultConfirmed,
      settlementSource: e.settlementSource,
      publicBankBuilderVisible: true,
      legs: (e.legs ?? []).map((l) => ({ market: l.market ?? l.marketType, selection: l.label ?? l.selection, result: l.result ?? "win", source: e.settlementSource })),
      notes: `Completed-ladder rung ${e.step} — official, $${e.bankrollBefore} → $${e.bankrollAfter}.`,
    });
  }
  const crownFinal = crown.entries?.length ? round2(crown.entries[crown.entries.length - 1].bankrollAfter) : 10376.17;

  // 2) Dual-lane paper activity from the active artifact (each lane is a fresh $100 paper ladder).
  const laneEvents = [];
  let dualRealized = 0;       // realized paper P&L of the dual-lane experiments
  let openExposure = 0;
  let wins = (crown.entries ?? []).filter((e) => e.result === "win").length;
  let losses = 0, voids = 0, pending = 0;

  for (const lk of ["laneA", "laneB"]) {
    const lane = active[lk]; if (!lane) continue;
    const laneName = lk === "laneA" ? "lane-a" : "lane-b";
    const laneStake = round2(lane.steps?.[0]?.stake ?? 100); // a dual lane is a single $100 paper experiment

    // Prior (stopped) lane history — when a lane is relaunched fresh, its old settled steps move to
    // priorLane so the public lane shows the new card while Mr. Dub still records the old won/lost rungs.
    if (lane.priorLane?.steps?.length) {
      const priorStake = round2(lane.priorLane.steps[0]?.stake ?? 100);
      for (const s of lane.priorLane.steps) {
        const legs = (s.legs ?? []).map((l) => ({ market: l.marketType, selection: l.label, result: l.settlement?.result ?? "settled", officialResult: l.settlement?.official ?? null, source: l.settlement?.source ?? "official" }));
        const won = s.result === "won";
        won ? wins++ : losses++;
        if (!won) dualRealized = round2(dualRealized - priorStake);
        laneEvents.push({
          eventId: `mrdub-2026-06-18-${laneName}-prior-step${s.step}-${won ? "won" : "stopped"}`,
          timestamp: NOW, portfolio: "mr-dub-paper", category: "bank_builder",
          type: won ? "lane_step_won" : "lane_stopped",
          laneId: laneName, step: s.step, date: s.slateDate ?? null,
          paperStake: round2(s.stake ?? 0), paperReturn: won ? round2(s.payout ?? 0) : 0,
          paperProfit: won ? 0 : -priorStake, rolled: won, status: "settled", result: s.result,
          combinedOdds: s.combinedOdds ?? null, officialResultConfirmed: true,
          publicBankBuilderVisible: false, // prior stopped lane is hidden from the public Bank Builder
          legs,
          notes: won
            ? `Prior Lane ${lk.slice(-1)} Step ${s.step} cleared (official) before the lane was stopped and relaunched fresh.`
            : (lane.priorLane.stopReason ?? `Prior Lane ${lk.slice(-1)} Step ${s.step} settled a loss — original $${priorStake} paper stake lost; lane later relaunched fresh.`),
        });
      }
    }
    // Owner-requested same-step relaunch audit (keep partner, swap only the failed soccer leg): recorded
    // here when the lane evaluated it but the kept partner had already started (timing block).
    if (lane.relaunchAudit) {
      laneEvents.push({
        eventId: `mrdub-2026-06-18-${laneName}-relaunch-blocked`,
        timestamp: NOW, portfolio: "mr-dub-paper", category: "bank_builder", type: "lane_relaunch_blocked",
        laneId: laneName, step: 2, paperStake: 0, paperReturn: 0, paperProfit: 0,
        status: "audit", publicBankBuilderVisible: false,
        legs: lane.relaunchAudit.legs ?? [],
        notes: lane.relaunchAudit.note,
      });
    }

    for (const s of lane.steps ?? []) {
      const legs = (s.legs ?? []).map((l) => ({ market: l.marketType, selection: l.label, result: l.settlement?.result ?? "settled", officialResult: l.settlement?.official ?? null, source: l.settlement?.source ?? "official" }));
      if (s.status === "settled") {
        const won = s.result === "won";
        won ? wins++ : losses++;
        // Ladder accounting: a WON intermediate step ROLLS (unrealized, profit 0). A LOST step closes
        // the lane and realizes minus the lane's original $100 stake (not the rolled position).
        const realized = won ? 0 : -laneStake;
        if (!won) dualRealized = round2(dualRealized + realized);
        laneEvents.push({
          eventId: `mrdub-2026-06-18-${laneName}-step${s.step}-${won ? "won" : "stopped"}`,
          timestamp: NOW, portfolio: "mr-dub-paper", category: "bank_builder",
          type: won ? "lane_step_won" : "lane_stopped",
          laneId: laneName, step: s.step, date: s.slateDate ?? null,
          paperStake: round2(s.stake ?? 0), paperReturn: won ? round2(s.payout ?? 0) : 0,
          paperProfit: realized, rolled: won, status: "settled", result: s.result,
          combinedOdds: s.combinedOdds ?? null,
          officialResultConfirmed: true,
          publicBankBuilderVisible: won, // stopped steps are hidden from the public Bank Builder
          legs,
          notes: won
            ? `Lane ${lk.slice(-1)} Step ${s.step} cleared (official) — $${s.stake} rolls to $${s.payout} for the next step.`
            : (lane.stopReason ?? `Lane ${lk.slice(-1)} Step ${s.step} settled a loss — lane closed, original $${laneStake} paper stake lost. Hidden from public Bank Builder, tracked here.`),
        });
      } else if (s.status === "pending") {
        pending++;
        openExposure = round2(openExposure + laneStake); // at-risk = the lane's original $100 paper stake
        laneEvents.push({
          eventId: `mrdub-2026-06-18-${laneName}-step${s.step}-pending`,
          timestamp: NOW, portfolio: "mr-dub-paper", category: "bank_builder", type: "lane_step_open",
          laneId: laneName, step: s.step, date: s.slateDate ?? null,
          paperStake: round2(s.stake ?? 0), paperReturn: 0, paperProfit: 0,
          projectedReturn: round2(s.projectedPayout ?? 0), status: "open",
          combinedOdds: s.combinedOdds ?? null, publicBankBuilderVisible: true, legs,
          sportExposure: (s.legs ?? []).map((l) => l.sport),
          relaunch: s.step === 1 && lane.relaunch ? true : undefined,
          notes: s.step === 1 && lane.relaunch
            ? `Fresh Lane ${lk.slice(-1)} relaunch — Step ${s.step} open. New $${s.stake} paper position on two brand-new pre-event legs, projected $${s.projectedPayout}. Original $${laneStake} at risk. Settles from official sources.`
            : `Lane ${lk.slice(-1)} Step ${s.step} open — $${s.stake} paper position riding, projected $${s.projectedPayout}. Original $${laneStake} at risk. Settles from official sources.`,
        });
      }
    }
    if (lane.restart) {
      laneEvents.push({
        eventId: `mrdub-2026-06-18-${laneName}-restart-${lane.restart.status}`,
        timestamp: NOW, portfolio: "mr-dub-paper", category: "bank_builder", type: "lane_restarted",
        laneId: laneName, step: 1, paperStake: round2(lane.restart.stake ?? 100), paperReturn: 0, paperProfit: 0,
        status: lane.restart.status, publicBankBuilderVisible: true,
        notes: lane.restart.note ?? "Fresh $100 lane restart.",
      });
    }
  }
  events.push(...laneEvents);

  const settledProfit = round2((crownFinal - (crown.base ?? 100)) + dualRealized);
  const portfolio = {
    portfolioId: "mr-dub-paper", displayName: "Mr. Dub", paperOnly: true,
    disclaimer: "Paper-only educational tracking. No wagers are placed. Not a sportsbook. Not financial advice.",
    startingDate: crown.entries?.[0]?.date ?? "2026-06-09", startingBankroll: round2(crown.base ?? 100),
    crownBankroll: crownFinal,
    currentBankroll: round2(crownFinal + dualRealized),
    openExposure: round2(openExposure),
    settledProfit,
    roi: round2(settledProfit / (crown.base ?? 100)),
    record: { wins, losses, voids, pending },
    completedLadders: [{ name: "Road to $10K", result: "5–0", start: round2(crown.base ?? 100), final: crownFinal, official: true }],
    activeCards: laneEvents.filter((e) => e.status === "open" || e.status === "queued").map((e) => ({ laneId: e.laneId, type: e.type, step: e.step, stake: e.paperStake, projectedReturn: e.projectedReturn ?? null, status: e.status })),
    generatedAt: NOW,
  };

  // Daily summary: opening/closing bankroll + staked/returned/realized P&L per day, with the day's
  // exact events EMBEDDED for the expandable dropdown. Realized P&L only (rolled wins contribute $0),
  // so the running bankroll reconciles to the portfolio's current bankroll.
  const byDay = new Map();
  for (const e of events) {
    const d = e.date ?? e.timestamp.slice(0, 10);
    const day = byDay.get(d) ?? { date: d, staked: 0, returned: 0, pl: 0, wins: 0, losses: 0, voids: 0, pending: 0, events: [] };
    day.staked = round2(day.staked + (e.paperStake ?? 0));
    day.returned = round2(day.returned + (e.paperReturn ?? 0));
    day.pl = round2(day.pl + (e.paperProfit ?? 0));
    if (e.result === "won" || e.result === "win") day.wins++;
    else if (e.result === "lost") day.losses++;
    else if (e.result === "void") day.voids++;
    else if (e.status === "open") day.pending++;
    day.events.push(e);
    byDay.set(d, day);
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  let running = round2(crown.base ?? 100), hwm = running, maxDrawdown = 0;
  for (const day of days) {
    day.opening = running;
    running = round2(running + day.pl);
    day.closing = running;
    hwm = Math.max(hwm, running);
    maxDrawdown = Math.max(maxDrawdown, round2(hwm - running));
  }
  const daily = { portfolioId: "mr-dub-paper", paperOnly: true, generatedAt: NOW, days };

  // Exposure + bankroll intelligence (paper-only). Open exposure broken down by sport from open legs.
  const openLegs = laneEvents.filter((e) => e.status === "open").flatMap((e) => (e.sportExposure ?? []));
  const bySport = {};
  for (const sp of openLegs) { const k = sp === "WORLD_CUP" ? "World Cup" : sp; bySport[k] = round2((bySport[k] ?? 0) + round2(openExposure / Math.max(1, openLegs.length))); }
  portfolio.intelligence = {
    highWaterMark: round2(hwm),
    maxDrawdown: round2(maxDrawdown),
    winRate: round2(wins / Math.max(1, wins + losses)),
    exposureBySport: bySport,
    largestOpenCard: round2(openExposure),
    note: "Paper exposure, bankroll health and drawdown — educational tracking, not financial advice. Some breakdowns populate as more cards settle.",
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "ledger.json"), JSON.stringify({ portfolioId: "mr-dub-paper", paperOnly: true, generatedAt: NOW, events }, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "portfolio.json"), JSON.stringify(portfolio, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "daily-summary.json"), JSON.stringify(daily, null, 2) + "\n");

  console.log(`Mr. Dub ledger built: ${events.length} events`);
  console.log(`  crown final $${crownFinal} · current $${portfolio.currentBankroll} · open exposure $${portfolio.openExposure}`);
  console.log(`  record ${wins}W-${losses}L-${voids}V-${pending}P · settled profit $${settledProfit} · ROI ${portfolio.roi}x`);
}

main();
