/**
 * The public ladder's lane, drawn from the SAME record the generator deals from.
 *
 * The /bank-builder board drew its rungs from the dual-ladder card store, which stopped moving on
 * 2026-08-17, while the daily card came from the daily portfolio. Once the generator started reading
 * the official receipts (products/ladder-position.mjs), the board and the card would have disagreed
 * about which rung a lane stands on — so the board reads the receipts too, through this adapter into
 * the LaneDisplay shape buildPublicDualLadder already takes.
 *
 * THE CARD ON THE TABLE WINS FOR TODAY. A card placed this morning was dealt at its own step and
 * stake; if that disagrees with what the receipts now say (the first morning of the ladder, when the
 * old generator had already dealt Step 1), the board shows the card that is actually riding, and the
 * receipts take over from the next deal. Drawing today's $100 card on rung 2 would be a bet that
 * does not exist.
 */
import { BANK_BUILDER_LADDER } from "@/lib/bank-builder-ladder";
import type { LaneDisplay, LaneStepDisplay } from "@/lib/parlays/ui-loader";

export interface ReceiptPosition {
  lane: string; state: string; nextStep: number; clearedSteps: number; rolledStake: number; targetReturn: number; cycle: number;
  why: string; basis: { date: string; step: number; result: string; stake: number; payout: number | null } | null;
}
export interface ReceiptRunStep { date: string; step: number; stake: number; result: string; payout: number }
export interface TableCard { step: number; stake: number; combinedOdds: number; potentialReturn: number; date: string }

export function laneDisplayFromReceipts({
  letter, position, run, card, waitingReason,
}: {
  letter: "A" | "B";
  position: ReceiptPosition;
  run: ReceiptRunStep[];
  card: TableCard | null;
  waitingReason: string | null;
}): LaneDisplay {
  const standing = card ? { step: card.step, stake: card.stake } : { step: position.nextStep, stake: position.rolledStake };
  const goal = BANK_BUILDER_LADDER.find((r) => r.step === standing.step)?.goal ?? position.targetReturn;
  // The cleared rungs beneath the standing one: the current run's wins when they lead to it; none
  // when today's card restarted the lane; otherwise the most recent wins that fit beneath it.
  const cleared = standing.step <= 1 ? [] : run.slice(-(standing.step - 1));
  const steps: LaneStepDisplay[] = cleared.map((r) => ({
    step: r.step, status: "settled", result: "won", slateDate: r.date, combinedOdds: null, survivalScore: null,
    stake: r.stake, payout: Number.isFinite(r.payout) ? r.payout : null, projected: false, target: null, legs: [], blockers: [],
  }));
  steps.push({
    step: standing.step, status: card ? "pending" : "coming_soon", result: null, slateDate: card?.date ?? null,
    combinedOdds: card?.combinedOdds ?? null, survivalScore: null, stake: standing.stake,
    payout: card ? card.potentialReturn : null, projected: true, target: goal, legs: [], blockers: [],
  });
  const heldOrWaiting = position.state === "held" ? position.why : (waitingReason ?? "No card on today's slate reaches this rung's price yet.");
  return {
    label: `Lane ${letter} (cycle ${position.cycle})`,
    legs: [], survivalScore: 0, combinedOdds: card?.combinedOdds ?? null, result: null,
    advanced: standing.step > 1, currentStep: standing.step, target: goal, steps,
    laneStatus: standing.step > 1 ? "advanced" : "active", publicVisible: true, restart: null,
    nextCandidate: card ? null : {
      status: "pending", headline: `Step ${standing.step} · awaiting a qualified card`, reason: heldOrWaiting,
      stake: standing.stake, combinedOdds: null, projectedReturn: null, legs: [],
    },
  };
}

/** The receipts' lane rows, by date, for the cleared-rung detail — official grades, verbatim. */
interface ReceiptDoc { date: string; lanes?: Array<{ product?: string; lane?: string; step?: number; legs?: Array<{ selection?: string | null; market?: string | null; official?: unknown; result?: string }> }> }

const toAmerican = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));

/**
 * The detail behind each CLEARED rung of the current run, from the same receipt that graded it.
 *
 * The page read this from mr-dub/ledger.json's `lane_step_won` events with "last write wins" — July
 * events from a ladder that has since restarted. Once the board follows the receipts, that reader
 * would have hung July-6's Spain + Belgium legs under a Step 1 cleared on 2026-09-11. Each rung shows
 * the legs its own receipt graded, with the official figure beside each. The price is derived from
 * the stake and the payout the receipt recorded, never typed.
 */
export function clearedDetailFromReceipts(receipts: ReceiptDoc[], run: ReceiptRunStep[], product: string, letter: "A" | "B") {
  const out: Record<number, { date: string; stake: number; returned: number; profit: number; combinedOdds: number | null; settledStatus: string; source: string | null; legs: Array<{ selection: string; market: string | null; officialResult: string | null; result: string }> }> = {};
  for (const r of run) {
    const doc = receipts.find((d) => d.date === r.date);
    const lane = doc?.lanes?.find((l) => l.product === product && String(l.lane ?? "").toUpperCase() === letter && Number(l.step) === r.step);
    const decimal = r.stake > 0 && Number.isFinite(r.payout) ? r.payout / r.stake : null;
    out[r.step] = {
      date: r.date, stake: r.stake, returned: r.payout, profit: 0,
      combinedOdds: decimal && decimal > 1 ? toAmerican(decimal) : null,
      settledStatus: "settled", source: "MLB Stats API official results",
      legs: (lane?.legs ?? []).map((g) => ({
        selection: String(g.selection ?? ""), market: g.market ?? null,
        officialResult: g.official == null ? null : String(g.official), result: String(g.result ?? ""),
      })),
    };
  }
  return out;
}

/** The position record LifecycleRecord renders, with the card on the table winning for today. */
export function receiptPositionRecord(position: ReceiptPosition, tableStep: number | null) {
  const b = position.basis;
  return {
    cycle: position.cycle,
    step: tableStep ?? position.nextStep,
    afterCard: b ? `${b.date} · Step ${b.step}` : "",
    result: b?.result ?? "",
    transition: !b ? "start" : b.result === "won" ? "advance" : b.result === "lost" ? "restart" : "hold",
  };
}
