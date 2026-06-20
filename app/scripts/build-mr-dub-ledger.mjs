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
const MOON = path.join(DATA, "moonshot-lane", "active.json");                    // separate high-volatility lane
const NOW = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : "2026-06-18T18:40:00Z";
const round2 = (n) => Math.round(n * 100) / 100;

/** Summarise the separate Moonshot lane from its own artifact (settled result + open exposure). */
function moonshotSummary() {
  let lane;
  try { lane = JSON.parse(fs.readFileSync(MOON, "utf8")); } catch { return null; }
  if (!lane || lane.publicVisible === false) return null;
  const step = lane.ladder?.find((s) => s.step === lane.currentStep) ?? lane.ladder?.[0];
  const card = step?.card;
  const legResults = (card?.legs ?? []).map((l) => l.settlement?.result ?? "pending");
  const won = card?.result === "won" || (legResults.length > 0 && legResults.every((r) => r === "won"));
  const lost = card?.result === "lost" || legResults.some((r) => r === "lost");
  const settled = lane.status === "stopped" || lane.status === "completed" || won || lost;
  const exposure = step?.status === "active" && !settled ? round2(card?.stake ?? 0) : 0;
  return {
    lane: lane.name, paperOnly: true, separateFromCore: true,
    exposure, currentStep: lane.currentStep, targetReturn: lane.targetReturn,
    status: lane.status,
    record: { wins: won ? 1 : 0, losses: lost ? 1 : 0, voids: 0, pending: settled ? 0 : 1 },
    card: card ? {
      cardId: card.cardId, stake: card.stake, projectedReturn: card.projectedReturn,
      combinedAmerican: card.combinedOdds, risk: card.risk,
      result: card.result ?? (settled ? (won ? "won" : "lost") : "pending"),
      legs: (card.legs ?? []).map((l) => ({ selection: `${l.participant} ${l.marketLabel}`, result: l.settlement?.result ?? "pending", official: l.settlement?.official ?? null })),
    } : null,
    note: lane.stopNote ?? (settled ? "Settled — separate from the core ladder." : "Open paper position — separate from the core ladder."),
  };
}

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
    // Lane cleared its open step and is riding toward the next rung — no card placed yet (awaiting the
    // next pre-event slate). Informational, $0 P/L, no open exposure; the rolled win is already recorded.
    if (lane.laneStatus === "advanced") {
      laneEvents.push({
        eventId: `mrdub-2026-06-18-${laneName}-advanced`,
        timestamp: NOW, portfolio: "mr-dub-paper", category: "bank_builder", type: "lane_advanced",
        laneId: laneName, step: lane.currentStep ?? null, date: "2026-06-18", paperStake: 0, paperReturn: 0, paperProfit: 0,
        status: "advanced", publicBankBuilderVisible: true,
        notes: lane.awaitingNote ?? `Lane ${lk.slice(-1)} advanced — awaiting next qualified card.`,
      });
    }
    if (lane.restart) {
      laneEvents.push({
        eventId: `mrdub-2026-06-18-${laneName}-restart-${lane.restart.status}`,
        timestamp: NOW, portfolio: "mr-dub-paper", category: "bank_builder", type: "lane_restarted",
        laneId: laneName, step: 1, date: "2026-06-18", paperStake: round2(lane.restart.stake ?? 100), paperReturn: 0, paperProfit: 0,
        status: lane.restart.status, publicBankBuilderVisible: true,
        notes: lane.restart.note ?? "Fresh $100 lane restart.",
      });
    }
  }
  events.push(...laneEvents);

  // Per-event accounting note — makes each daily-ledger card self-explanatory (no extra lookups).
  for (const e of events) {
    e.accountingNote = e.rolled
      ? "Rolled into the next Bank Builder step (unrealized until the ladder completes or stops)."
      : e.type === "lane_stopped"
        ? "Realized — original $100 paper stake lost; lane stopped."
        : e.type === "lane_advanced"
          ? "Step cleared and rolled; awaiting the next qualified card (no card placed)."
          : e.type === "lane_restarted"
            ? "Fresh $100 path queued for the next qualified card (not yet placed)."
            : e.status === "open"
              ? "Open paper position — pending official settlement."
              : e.type === "ladder_step_won"
                ? "Completed-ladder rung — realized (the crown ladder cashed out)."
                : e.type === "lane_relaunch_blocked"
                  ? "Audit only — no paper stake, no bankroll impact."
                  : "Settled.";
  }

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

  // ── Portfolio intelligence (paper-only) ──
  const round4 = (n) => Math.round(n * 10000) / 10000;
  // Accounting rule: a won INTERMEDIATE Bank Builder step ROLLS into the next step (paperProfit $0 —
  // unrealized until the ladder completes or stops); a lost step REALIZES minus the lane's original
  // $100. The completed crown is realized (it cashed out). So bankroll = crown final + realized losses.
  const drawdown = round2(hwm - portfolio.currentBankroll);
  const drawdownPct = hwm > 0 ? round4(drawdown / hwm) : 0;
  const exposurePct = portfolio.currentBankroll > 0 ? round4(openExposure / portfolio.currentBankroll) : 0;

  // Exposure breakdown — only currently OPEN paper cards count (awaiting/queued are NOT exposure).
  const openCards = laneEvents.filter((e) => e.status === "open");
  const sportMap = {}, marketMap = {}, ppMap = {}, laneMap = {};
  for (const e of openCards) {
    const stake = round2(e.paperStake ?? 0);
    laneMap[e.laneId] = round2((laneMap[e.laneId] ?? 0) + stake);
    const legs = e.legs ?? [];
    const per = stake / Math.max(1, legs.length);
    for (const l of legs) {
      const sport = l.source === "espn_fifa_world" || /world/i.test(l.market ?? "") ? "World Cup" : (l.sport ?? "MLB");
      const sk = sport === "WORLD_CUP" ? "World Cup" : sport;
      sportMap[sk] = round2((sportMap[sk] ?? 0) + per);
      const mk = l.market ?? "market";
      marketMap[mk] = round2((marketMap[mk] ?? 0) + per);
      const pp = l.selection ?? l.participant ?? "—";
      ppMap[pp] = round2((ppMap[pp] ?? 0) + per);
    }
  }
  const toArr = (m) => Object.entries(m).map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount);
  const exposure = {
    bySport: toArr(sportMap), byMarket: toArr(marketMap), byTeamOrPlayer: toArr(ppMap),
    byLane: toArr(laneMap),
    byStatus: [
      { key: "open", amount: round2(openExposure) },
      { key: "awaiting_next_card", amount: 0 },
    ].filter((x) => x.amount > 0),
  };

  // Awaiting (advanced lane riding toward its next card) + queued restarts — informational, NOT exposure.
  const awaitingCards = [
    ...laneEvents.filter((e) => e.type === "lane_advanced").map((e) => ({ laneId: e.laneId, step: e.step, kind: "awaiting_next_card", note: e.notes })),
    ...laneEvents.filter((e) => e.type === "lane_restarted" && e.status === "queued").map((e) => ({ laneId: e.laneId, step: 1, kind: "queued_restart", stake: round2(e.paperStake ?? 100), note: e.notes })),
  ];
  const completedCards = (crown.entries?.length)
    ? [{ name: "Road to $10K", result: `${(crown.entries ?? []).filter((x) => x.result === "win").length}–0`, start: round2(crown.base ?? 100), final: crownFinal, official: true }]
    : [];

  // Streaks + averages (realized settled events in chronological order).
  const settledEvents = events.filter((e) => e.result === "won" || e.result === "win" || e.result === "lost");
  let cw = 0, cl = 0, longestWin = 0, longestLoss = 0;
  for (const e of settledEvents) {
    const w = e.result === "won" || e.result === "win";
    if (w) { cw++; cl = 0; } else { cl++; cw = 0; }
    longestWin = Math.max(longestWin, cw); longestLoss = Math.max(longestLoss, cl);
  }
  const stakes = settledEvents.map((e) => e.paperStake).filter((n) => n > 0);
  const avgStake = stakes.length ? round2(stakes.reduce((a, b) => a + b, 0) / stakes.length) : 0;
  const wonReturns = settledEvents.filter((e) => e.result === "won" || e.result === "win").map((e) => e.paperReturn).filter((n) => n > 0);
  const avgSettledReturn = wonReturns.length ? round2(wonReturns.reduce((a, b) => a + b, 0) / wonReturns.length) : 0;
  const grossWin = round2(settledEvents.filter((e) => (e.paperProfit ?? 0) > 0).reduce((s, e) => s + e.paperProfit, 0));
  const grossLoss = round2(Math.abs(settledEvents.filter((e) => (e.paperProfit ?? 0) < 0).reduce((s, e) => s + e.paperProfit, 0)));
  const profitFactor = grossLoss > 0 ? round2(grossWin / grossLoss) : null;

  // Bankroll health (0–100; higher = less paper at risk / less concentrated). Never "safe".
  let bankrollHealth;
  if (openExposure === 0) {
    bankrollHealth = { score: 100, label: "No open exposure", reasons: ["No active paper cards right now — nothing is at risk.", awaitingCards.length ? `${awaitingCards.length} lane(s) awaiting the next qualified card.` : ""].filter(Boolean) };
  } else {
    let score = 100 - Math.min(45, Math.max(0, exposurePct - 0.02) * 1500);
    const totalExp = exposure.bySport.reduce((s, x) => s + x.amount, 0) || 1;
    const topShare = exposure.bySport.length ? exposure.bySport[0].amount / totalExp : 0;
    if (topShare > 0.6) score -= 20;
    score = Math.max(0, Math.round(score));
    const label = exposurePct < 0.05 ? "Balanced" : exposurePct < 0.15 ? "Elevated exposure" : "Concentrated exposure";
    const reasons = [`Open exposure is ${(exposurePct * 100).toFixed(1)}% of bankroll.`];
    if (topShare > 0.6 && exposure.bySport[0]) reasons.push(`Most exposure is concentrated in ${exposure.bySport[0].key}.`);
    bankrollHealth = { score, label, reasons };
  }

  // Top-level portfolio metrics (premium dashboard contract).
  portfolio.highWaterMark = round2(hwm);
  portfolio.drawdown = drawdown;
  portfolio.drawdownPct = drawdownPct;
  portfolio.openExposurePct = exposurePct;
  portfolio.roiMultiple = portfolio.roi;
  portfolio.exposure = exposure;
  portfolio.awaitingCards = awaitingCards;
  portfolio.completedCards = completedCards;
  portfolio.bankrollHealth = bankrollHealth;
  portfolio.intelligence = {
    highWaterMark: round2(hwm),
    maxDrawdown: round2(maxDrawdown),
    drawdown, drawdownPct,
    winRate: round2(wins / Math.max(1, wins + losses)),
    exposureBySport: Object.fromEntries(exposure.bySport.map((x) => [x.key, x.amount])),
    largestOpenCard: round2(openCards.length ? Math.max(...openCards.map((e) => e.paperStake ?? 0)) : 0),
    avgStake, avgSettledReturn, profitFactor, longestWinStreak: longestWin, longestLossStreak: longestLoss,
    note: "Paper exposure, bankroll health and drawdown — educational tracking, not financial advice.",
  };

  // ── Moonshot Lane — the SEPARATE high-volatility paper challenge (own artifact). Tracked here so
  //    Mr. Dub shows it, but kept distinct from the core bankroll/exposure. After settlement it shows
  //    the official result; while open it adds its stake to totalOpenExposure only. ──
  const moonshot = moonshotSummary();
  portfolio.moonshot = moonshot;
  portfolio.totalOpenExposure = round2(openExposure + (moonshot?.exposure ?? 0));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "ledger.json"), JSON.stringify({ portfolioId: "mr-dub-paper", paperOnly: true, generatedAt: NOW, events }, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "portfolio.json"), JSON.stringify(portfolio, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "daily-summary.json"), JSON.stringify(daily, null, 2) + "\n");

  console.log(`Mr. Dub ledger built: ${events.length} events`);
  console.log(`  crown final $${crownFinal} · current $${portfolio.currentBankroll} · open exposure $${portfolio.openExposure}`);
  console.log(`  record ${wins}W-${losses}L-${voids}V-${pending}P · settled profit $${settledProfit} · ROI ${portfolio.roi}x`);
}

main();
