/**
 * Official Bank Builder candidate loader — reads the PUBLISHED candidate artifact
 * (e.g. official-step4-candidate.json). Unlike the World-Cup-derived generator in
 * world-cup-flex.ts, this is an explicitly selected card (can mix sports, e.g. one
 * World Cup leg + one MLB leg) recorded as a pending artifact.
 *
 * Honesty gates (all enforced here, fail-closed):
 *   - status must be "pending" (a settled card lives in the ledger, never here);
 *   - artifact step must equal the CURRENT public ladder step (after settlement the
 *     step advances/resets and the stale card must vanish);
 *   - artifact date must be TODAY's ET slate (a played slate never resurfaces);
 *   - every leg must carry real odds + model AND market support (≥55% / ≥50%) —
 *     re-validated at read time so a hand-edited artifact can't bypass the gates.
 *
 * NEVER mutates the bankroll/ledger/nextPick — presentation of a pending pick only.
 */
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "@/lib/freshness";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";

export interface OfficialCandidateLeg {
  sport: "world_cup" | "mlb" | "nba" | string;
  label: string;
  market: string;
  marketLabel: string;
  gameLabel: string;
  americanOdds: number;
  bookmaker?: string | null;
  modelProbability: number;
  marketProbability: number;
  // World Cup legs
  homeTeam?: string;
  awayTeam?: string;
  homeCode?: string;
  awayCode?: string;
  regulationOnly?: boolean;
  // MLB legs
  playerId?: number | string;
  playerName?: string;
  team?: string;
  opponent?: string;
  side?: string;
  line?: number | null;
  lineupBasis?: string;
  settlementRule?: string;
}

export interface OfficialCandidate {
  step: number;
  date: string;
  status: string;
  cardType?: string;
  selectionNote?: string;
  correlationNote?: string;
  stake: number;
  combinedAmericanOdds: number;
  projectedReturn: number;
  projectedProfit: number;
  combinedModelProbability: number;
  combinedMarketProbability?: number;
  targetMin: number;
  targetPreferred: number;
  legs: OfficialCandidateLeg[];
}

/** The published official candidate for the CURRENT step + TODAY's slate, or null.
 *  Reads `official-step{currentStep}-candidate.json` so each rung's card is gated to its
 *  own step — a settled/advanced step makes the prior card vanish automatically. */
export function loadOfficialPublishedCandidate(): OfficialCandidate | null {
  const summary = loadPublicBankBuilderSummary();
  if (!summary) return null;
  const step = summary.currentProgressionStep;
  let c: OfficialCandidate;
  try {
    c = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "public", "data", "bank-builder", `official-step${step}-candidate.json`),
        "utf8",
      ),
    ) as OfficialCandidate;
  } catch {
    return null;
  }
  if (!c || c.status !== "pending" || !Array.isArray(c.legs) || c.legs.length === 0) return null;
  if (c.date !== currentEtDate()) return null; // never resurface a played slate
  if (summary.currentProgressionStep !== c.step) return null; // settled/advanced → gone
  // Re-validate the ladder gates at read time (fail-closed on a weak/hand-edited artifact).
  for (const l of c.legs) {
    if (typeof l.americanOdds !== "number") return null;
    if (!(l.modelProbability >= 0.55) || !(l.marketProbability >= 0.5)) return null;
  }
  return c;
}
