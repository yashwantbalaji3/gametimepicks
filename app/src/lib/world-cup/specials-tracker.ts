/**
 * World Cup Specials Tracker — derives a day-by-day tracker view from the committed Specials artifact,
 * WITHOUT changing settlement logic or fabricating anything. World Cup Specials are suggested longshot
 * cards (no placed exposure), so their "record" is the W-L of officially-settled cards and exposure is
 * always $0. Status per card is derived honestly:
 *   - won/lost  → the card carries an official cardStatus (settled review)
 *   - pending   → at least one leg's game has kicked off but the card is not graded yet (in progress)
 *   - candidate → every game is still pre-event
 * Pure + deterministic so it can be unit tested.
 */
import type { WorldCupSpecialsResult, WorldCupSpecialCard } from "./world-cup-specials";

export type SpecialsCardStatus = "candidate" | "pending" | "won" | "lost" | "void";

export interface SpecialsTrackerCard {
  card: WorldCupSpecialCard;
  status: SpecialsCardStatus;
}

export interface SpecialsTracker {
  date: string | null;
  generatedAt: string | null;
  summary: {
    record: string; // settled cards W-L(-V)
    wins: number;
    losses: number;
    voids: number;
    candidateCount: number;
    pendingCount: number;
    settledCount: number;
    exposure: number; // always 0 — Specials are suggested cards, never placed
  };
  pending: SpecialsTrackerCard[];
  candidates: SpecialsTrackerCard[];
  settled: SpecialsTrackerCard[];
}

function statusFor(card: WorldCupSpecialCard, nowMs: number): SpecialsCardStatus {
  if (card.cardStatus === "won") return "won";
  if (card.cardStatus === "lost") return "lost";
  // Any leg whose game has kicked off → the card is in progress (pending settlement), not pre-event.
  const started = (card.legs ?? []).some((l) => {
    if (!l.startTime) return false;
    const t = Date.parse(l.startTime);
    return Number.isFinite(t) && t <= nowMs;
  });
  return started ? "pending" : "candidate";
}

export function deriveSpecialsTracker(result: WorldCupSpecialsResult | null, nowIso: string): SpecialsTracker {
  const nowMs = Date.parse(nowIso);
  const rows: SpecialsTrackerCard[] = (result?.cards ?? []).map((card) => ({ card, status: statusFor(card, Number.isFinite(nowMs) ? nowMs : 0) }));
  const settled = rows.filter((r) => r.status === "won" || r.status === "lost" || r.status === "void");
  const pending = rows.filter((r) => r.status === "pending");
  const candidates = rows.filter((r) => r.status === "candidate");
  const wins = settled.filter((r) => r.status === "won").length;
  const losses = settled.filter((r) => r.status === "lost").length;
  const voids = settled.filter((r) => r.status === "void").length;
  return {
    date: result?.date ?? null,
    generatedAt: result?.generatedAt ?? null,
    summary: {
      record: `${wins}–${losses}${voids ? `–${voids}` : ""}`,
      wins,
      losses,
      voids,
      candidateCount: candidates.length,
      pendingCount: pending.length,
      settledCount: settled.length,
      exposure: 0,
    },
    pending,
    candidates,
    settled,
  };
}
