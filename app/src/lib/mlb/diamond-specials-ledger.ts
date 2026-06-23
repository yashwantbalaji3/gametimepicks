/**
 * Diamond Specials Ledger — the durable record for the MLB Diamond Specials product (5/day · $20 each ·
 * $100/day), archived forever. Mirrors the World Cup Specials ledger: aggregates the committed history
 * into record / ROI / P&L / win-rate + a per-slate archive (newest first).
 *
 * HONEST: realized figures only from cards the history marks settled; pending = open exposure, never
 * P&L. Returns an empty ledger when no history exists yet. Pure read-side; never mutates money state.
 */
import fs from "node:fs";
import path from "node:path";

export const DIAMOND_STAKE_PER_CARD = 20;
export const DIAMOND_CARDS_PER_DAY = 5;
export const DIAMOND_DAILY_ALLOCATION = DIAMOND_STAKE_PER_CARD * DIAMOND_CARDS_PER_DAY; // $100/day

export interface DiamondLedgerDay {
  date: string; cards: number; settled: number; wins: number; losses: number; pushes: number; pending: number; pnl: number; openExposure: number;
}
export interface DiamondLedger {
  stakePerCard: number;
  dailyAllocation: number;
  totalSlates: number;
  totalCards: number;
  settledCards: number;
  record: { wins: number; losses: number; pushes: number };
  staked: number;
  pnl: number;
  roi: number | null;
  winRate: number | null;
  openExposure: number;
  days: DiamondLedgerDay[];
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

interface HistoryDay { date: string; cards?: Array<{ result?: string | null; combinedOdds?: number | null }> }

function loadHistory(root: string): HistoryDay[] {
  try {
    const h = JSON.parse(fs.readFileSync(path.join(root, "mlb", "diamond-specials-history.json"), "utf8")) as { days?: HistoryDay[] };
    const days = Array.isArray(h.days) ? h.days : [];
    days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return days;
  } catch {
    return [];
  }
}

function summarize(day: HistoryDay): DiamondLedgerDay {
  let wins = 0, losses = 0, pushes = 0, pending = 0, pnl = 0;
  for (const c of day.cards ?? []) {
    const o = classify(c.result);
    if (o === "won") { wins++; pnl += DIAMOND_STAKE_PER_CARD * (typeof c.combinedOdds === "number" ? decFromAmerican(c.combinedOdds) - 1 : 0); }
    else if (o === "lost") { losses++; pnl -= DIAMOND_STAKE_PER_CARD; }
    else if (o === "push") { pushes++; }
    else { pending++; }
  }
  return {
    date: day.date, cards: day.cards?.length ?? 0, settled: wins + losses + pushes,
    wins, losses, pushes, pending, pnl: round2(pnl), openExposure: round2(pending * DIAMOND_STAKE_PER_CARD),
  };
}

/** Build the Diamond Specials ledger. `today` marks which slate's pending cards count as open exposure. */
export function buildDiamondLedger(root: string, today: string): DiamondLedger {
  const days = loadHistory(root).map(summarize);
  const wins = days.reduce((s, d) => s + d.wins, 0);
  const losses = days.reduce((s, d) => s + d.losses, 0);
  const pushes = days.reduce((s, d) => s + d.pushes, 0);
  const settledCards = wins + losses + pushes;
  const staked = round2(settledCards * DIAMOND_STAKE_PER_CARD);
  const pnl = round2(days.reduce((s, d) => s + d.pnl, 0));
  const todayDay = days.find((d) => d.date === today);
  const openExposure = todayDay ? todayDay.openExposure : 0;
  return {
    stakePerCard: DIAMOND_STAKE_PER_CARD, dailyAllocation: DIAMOND_DAILY_ALLOCATION,
    totalSlates: days.length, totalCards: days.reduce((s, d) => s + d.cards, 0), settledCards,
    record: { wins, losses, pushes }, staked, pnl,
    roi: staked > 0 ? round2(pnl / staked) : null,
    winRate: wins + losses > 0 ? round2(wins / (wins + losses)) : null,
    openExposure, days,
    note: settledCards > 0
      ? `Realized from ${settledCards} settled card${settledCards === 1 ? "" : "s"} · ${days.length} slate${days.length === 1 ? "" : "s"} archived.`
      : "No Diamond Specials have been posted or settled yet — the ledger fills in once the MLB board posts and cards settle officially.",
  };
}
