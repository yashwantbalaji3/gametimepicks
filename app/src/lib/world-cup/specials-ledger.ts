/**
 * World Cup Specials Ledger — the durable record for the permanent World Cup Specials product: 5
 * suggested parlays/day at $20 each ($100/day allocation), archived forever. Aggregates the committed
 * specials history into a record / ROI / P&L / win-rate, plus a per-slate archive (newest first).
 *
 * HONEST: realized figures come only from cards the history marks settled (won/lost/push). Pending
 * cards contribute open exposure, never P&L. Pure read-side; never mutates money state.
 */
import fs from "node:fs";
import path from "node:path";

import { loadWorldCupSpecialsHistory, type SpecialsHistoryDay } from "./world-cup-specials";

export const SPECIALS_STAKE_PER_CARD = 20;
export const SPECIALS_CARDS_PER_DAY = 5;
export const SPECIALS_DAILY_ALLOCATION = SPECIALS_STAKE_PER_CARD * SPECIALS_CARDS_PER_DAY; // $100/day

export interface SpecialsLedgerDay {
  date: string;
  cards: number;
  settled: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  pnl: number;
  openExposure: number;   // pending cards × stake
}

export interface SpecialsLedger {
  stakePerCard: number;
  dailyAllocation: number;
  totalSlates: number;
  totalCards: number;
  settledCards: number;
  record: { wins: number; losses: number; pushes: number };
  staked: number;
  pnl: number;
  roi: number | null;       // pnl / staked, or null when nothing has settled
  winRate: number | null;   // wins / (wins + losses), or null
  openExposure: number;     // today's pending cards × stake
  days: SpecialsLedgerDay[];
  note: string;
}

const round2 = (n: number) => Number(n.toFixed(2));
const decFromAmerican = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

type Outcome = "won" | "lost" | "push" | "pending";
function classify(result: string | null | undefined): Outcome {
  const r = (result ?? "").toLowerCase();
  if (r === "won" || r === "win") return "won";
  if (r === "lost" || r === "loss") return "lost";
  if (r === "push" || r === "void") return "push";
  return "pending";
}

function summarizeDay(day: SpecialsHistoryDay): SpecialsLedgerDay {
  let wins = 0, losses = 0, pushes = 0, pending = 0, pnl = 0;
  for (const c of day.cards ?? []) {
    const o = classify(c.result);
    if (o === "won") { wins++; pnl += SPECIALS_STAKE_PER_CARD * (typeof c.combinedOdds === "number" ? decFromAmerican(c.combinedOdds) - 1 : 0); }
    else if (o === "lost") { losses++; pnl -= SPECIALS_STAKE_PER_CARD; }
    else if (o === "push") { pushes++; }
    else { pending++; }
  }
  return {
    date: day.date, cards: day.cards?.length ?? day.cardCount ?? 0,
    settled: wins + losses + pushes, wins, losses, pushes, pending,
    pnl: round2(pnl), openExposure: round2(pending * SPECIALS_STAKE_PER_CARD),
  };
}

/** Build the Specials ledger from the durable history. `today` marks which slate's pending cards count
 *  as today's open exposure (older pending slates still show their own pending count, but the headline
 *  open exposure is today's). */
export function buildSpecialsLedger(root: string, today: string): SpecialsLedger {
  const history = loadWorldCupSpecialsHistory(root);
  const days = (history.days ?? []).map(summarizeDay); // already newest-first from the loader

  const wins = days.reduce((s, d) => s + d.wins, 0);
  const losses = days.reduce((s, d) => s + d.losses, 0);
  const pushes = days.reduce((s, d) => s + d.pushes, 0);
  const settledCards = wins + losses + pushes;
  const staked = round2(settledCards * SPECIALS_STAKE_PER_CARD);
  const pnl = round2(days.reduce((s, d) => s + d.pnl, 0));
  const todayDay = days.find((d) => d.date === today);
  const openExposure = todayDay ? todayDay.openExposure : 0;

  return {
    stakePerCard: SPECIALS_STAKE_PER_CARD,
    dailyAllocation: SPECIALS_DAILY_ALLOCATION,
    totalSlates: days.length,
    totalCards: days.reduce((s, d) => s + d.cards, 0),
    settledCards,
    record: { wins, losses, pushes },
    staked, pnl,
    roi: staked > 0 ? round2(pnl / staked) : null,
    winRate: wins + losses > 0 ? round2(wins / (wins + losses)) : null,
    openExposure,
    days,
    note: settledCards > 0
      ? `Realized from ${settledCards} settled card${settledCards === 1 ? "" : "s"} · ${days.length} slate${days.length === 1 ? "" : "s"} archived. Pending cards are open exposure, not P&L.`
      : `No World Cup Specials have settled yet — ${openExposure > 0 ? `$${openExposure} open across today's cards` : "no open cards"}. Every slate is archived; the record fills in on official settlement.`,
  };
}

/**
 * The CANONICAL settled record (Batch 1 · #10): product-ledger/wc-specials.json, the per-card settlement the
 * settlement collector wrote from the official results (world-cup/settlement/<date>.json) and the same source Mr. Dub's
 * master ledger reads. The history file above never received those results, so buildSpecialsLedger reads 0 settled
 * and its "no specials have settled yet" line was false for a retired product with graded cards. Stake and payout are
 * as recorded per card — never the ledger's $20 planning constant. Null when the file is absent or holds no graded card.
 */
export interface SpecialsSettledRecord {
  cards: number;
  wins: number;
  losses: number;
  pushes: number;
  staked: number;
  pnl: number;
  firstDate: string;
  lastDate: string;
}

export function specialsSettledRecord(root: string): SpecialsSettledRecord | null {
  let rows: Array<{ date?: unknown; outcome?: unknown; stake?: unknown; payout?: unknown }> = [];
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(root, "product-ledger", "wc-specials.json"), "utf8")) as { results?: unknown };
    rows = Array.isArray(doc.results) ? doc.results : [];
  } catch {
    return null;
  }
  let wins = 0, losses = 0, pushes = 0, staked = 0, pnl = 0;
  const dates: string[] = [];
  for (const r of rows) {
    const o = classify(typeof r.outcome === "string" ? r.outcome : null);
    if (o === "pending") continue;
    const stake = Number(r.stake), payout = Number(r.payout);
    if (!Number.isFinite(stake) || !Number.isFinite(payout) || typeof r.date !== "string") continue;
    if (o === "won") wins++; else if (o === "lost") losses++; else pushes++;
    staked += stake;
    pnl += payout - stake;
    dates.push(r.date);
  }
  const cards = wins + losses + pushes;
  if (cards === 0) return null;
  dates.sort();
  return { cards, wins, losses, pushes, staked: round2(staked), pnl: round2(pnl), firstDate: dates[0], lastDate: dates[dates.length - 1] };
}
