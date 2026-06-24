/**
 * Pure grading + SEED-MODEL helpers for the daily-portfolio Bank Builder settlement engine.
 *
 * These functions hold the money-critical settlement RULES so they can be unit-tested in isolation from
 * the file-I/O script (scripts/settle-daily-portfolio.mjs imports them). They never fabricate a result:
 * a lane is graded ONLY from the official results bundle, and the seed model moves the canonical bankroll
 * by exactly the lost SEEDS (won steps roll — they change the record + ladder rung, never the bankroll).
 */

export type LaneResult = "won" | "lost" | "void" | "push" | "pending";

export interface OfficialFinal {
  matchId?: number;
  match: string;
  homeGoals: number;
  awayGoals: number;
  status: string; // "FT" once officially final
}
export interface OfficialGradedLeg {
  market: string;
  selection: string;
  odds: number;
  result: LaneResult;
  reason?: string;
}
export interface OfficialGradedCard {
  product: string;
  card: string;            // e.g. "Lane A (stake $1464.71)"
  result: LaneResult;      // card-level official result
  payout: number;
  stake: number;
  legs: OfficialGradedLeg[];
}
export interface OfficialBundle {
  date?: string;
  settlementSource?: string;
  finals: OfficialFinal[];
  graded: OfficialGradedCard[];
}

export interface DailyLaneLeg {
  id?: string;             // "team:47:moneyline_90:away"
  matchup?: string;
  market?: string;
  selection?: string;
  odds?: number;
  provider?: string;
  modelConfidence?: number;
  kickoffEt?: string;
  line?: number | null;
  risk?: string;
}
export interface DailyLaneCard {
  lane?: string;           // "A" | "B"
  step?: number;
  stake?: number;
  combinedOdds?: number;
  legCount?: number;
  legs?: DailyLaneLeg[];
}

export interface LaneSettlementPlan {
  laneLetter: string;
  status: LaneResult;
  payout: number;
  reason?: string;
  settledLegs: any[];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Map a daily-portfolio leg id "team:47:moneyline_90:away" → { eventId, marketType, side }. */
export function parseLegId(id: string | undefined): { eventId: string | null; marketType: string | null; side: string | null } {
  const m = String(id ?? "").match(/^team:(\d+):([a-z0-9_]+):?(.*)$/i);
  return m ? { eventId: m[1], marketType: m[2], side: m[3] || null } : { eventId: null, marketType: null, side: null };
}

/** Build the rich active-ladder settled-step leg from a daily-portfolio leg + its official graded leg. */
export function buildSettledLeg(
  dpLeg: DailyLaneLeg,
  gradedLeg: OfficialGradedLeg | undefined,
  finalByMatch: Map<string, OfficialFinal>,
  date: string,
  idx: number,
): any {
  const { eventId, marketType, side } = parseLegId(dpLeg.id);
  const fin = finalByMatch.get(dpLeg.matchup ?? "");
  const [home, away] = String(dpLeg.matchup ?? " vs ").split(" vs ");
  const official90 = fin ? `${home} ${fin.homeGoals}-${fin.awayGoals} ${away} (FT, API-Football)` : null;
  const result = gradedLeg?.result ?? "pending";
  const won = result === "won";
  const isVoid = result === "void" || result === "push";
  return {
    legId: `WORLD_CUP:${eventId ?? idx}:${marketType ?? "market"}:${dpLeg.selection ?? ""}:`,
    sport: "WORLD_CUP",
    eventId: eventId ?? null,
    label: `${dpLeg.selection} ${marketType ?? dpLeg.market}`,
    participantName: dpLeg.selection ?? null,
    marketType: marketType ?? null,
    odds: dpLeg.odds ?? gradedLeg?.odds ?? null,
    modelProbability: dpLeg.modelConfidence ?? null,
    legQualityTier: dpLeg.risk === "Lower-volatility" ? "core" : "broader",
    side,
    line: dpLeg.line ?? null,
    matchup: dpLeg.matchup ?? null,
    homeTeam: home ?? null,
    awayTeam: away ?? null,
    marketLabel: dpLeg.market ?? null,
    kickoffEt: dpLeg.kickoffEt ?? null,
    eventDate: date,
    provider: dpLeg.provider ?? null,
    displaySelection: `${dpLeg.matchup} — ${dpLeg.market}: ${dpLeg.selection}`,
    settlement: { result, official: official90, source: "api_football" },
    settlementSource: "API-Football (official 90-minute result)",
    currentGameStatus: fin ? "final" : "pending",
    settlementStatus: isVoid ? "void" : won ? "hit" : "miss",
    settlementReason: gradedLeg?.reason ?? null,
  };
}

/**
 * Grade one active Bank Builder lane card against the official bundle. NEVER fabricates: if a graded card
 * is missing, or ANY leg's game is not officially final (FT), the lane is "pending" (the whole card holds).
 */
export function gradeLaneCard(laneCard: DailyLaneCard, official: OfficialBundle): LaneSettlementPlan {
  const laneLetter = String(laneCard.lane ?? "").toUpperCase();
  const finals = official.finals ?? [];
  const finalByMatch = new Map(finals.map((f) => [f.match, f] as const));
  const graded = (official.graded ?? [])
    .filter((g) => g.product === "bank-builder")
    .find((g) => new RegExp(`Lane ${laneLetter}\\b`).test(g.card ?? ""));

  if (!graded) return { laneLetter, status: "pending", payout: 0, reason: `no graded card for Lane ${laneLetter} in the official bundle`, settledLegs: [] };

  const notFinal = (laneCard.legs ?? []).filter((lg) => {
    const fin = finalByMatch.get(lg.matchup ?? "");
    return !fin || String(fin.status).toUpperCase() !== "FT";
  });
  if (notFinal.length) return { laneLetter, status: "pending", payout: 0, reason: `${notFinal.length} leg(s) not officially final`, settledLegs: [] };

  const settledLegs = (laneCard.legs ?? []).map((lg, i) => buildSettledLeg(lg, (graded.legs ?? [])[i], finalByMatch, official.date ?? "", i));
  return { laneLetter, status: graded.result, payout: round2(graded.payout ?? 0), settledLegs };
}

export interface Record4 { wins: number; losses: number; voids: number; pending: number }
export interface SeedModelOutcome {
  record: Record4;
  bankroll: number;
  wonCount: number;
  lostCount: number;
  voidCount: number;
  seedLost: number;
}

/**
 * Apply the SEED MODEL to a before-state given the lane plans. THROWS if any plan is still pending (no
 * partial/fake settlement). Won steps roll (bankroll unchanged, record.wins +1); lost steps drop the
 * $100 SEED (bankroll −$100, record.losses +1); void/push returns the seed (no record/bankroll change).
 * The crown is never an input here — it is immutable and never written by settlement.
 */
export function seedModelOutcome(
  before: { record: Record4; bankroll: number },
  plans: LaneSettlementPlan[],
  seedPerLane = 100,
): SeedModelOutcome {
  const pending = plans.filter((p) => p.status === "pending");
  if (pending.length) throw new Error(`refuse: ${pending.length} lane(s) not officially final`);

  let wonCount = 0, lostCount = 0, voidCount = 0, seedLost = 0;
  for (const p of plans) {
    if (p.status === "won") wonCount++;
    else if (p.status === "lost") { lostCount++; seedLost += seedPerLane; }
    else if (p.status === "void" || p.status === "push") voidCount++;
  }
  return {
    record: {
      wins: before.record.wins + wonCount,
      losses: before.record.losses + lostCount,
      voids: before.record.voids + voidCount,
      pending: 0,
    },
    bankroll: round2(before.bankroll - seedLost),
    wonCount, lostCount, voidCount, seedLost,
  };
}
