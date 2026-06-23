/**
 * World Cup Specials Ledger — the durable record for the permanent World Cup Specials product: 5
 * suggested parlays/day at $20 each ($100/day allocation), archived forever. Aggregates the committed
 * specials history into a record / ROI / P&L / win-rate, plus a per-slate archive (newest first).
 *
 * HONEST: realized figures come only from cards the history marks settled (won/lost/push). Pending
 * cards contribute open exposure, never P&L. Pure read-side; never mutates money state.
 */
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
