/**
 * SEEDABLE-CARD MAP (P210 · Release B) — the ONE owner of "which suggested cards can seed the
 * shared Parlay Center draft, and with exactly which legs".
 *
 * Sources, all committed artifacts, never re-derived:
 *   · the MLB risk ladder (tier cards of record);
 *   · every sport lane ladder (/cards/<sport> — UFC, EPL, NFL) via the same loader the lane page
 *     renders, so a Customize link and its lane always agree;
 *   · every identity-complete suggested card (the optimizer families whose producer decomposes
 *     legs — P209 Release F).
 *
 * PARTICIPANT CONVENTION for the canonical key (sport|player|marketLabel|side|line): the named
 * participant where the sport has one (fighter, player); otherwise the team; otherwise the
 * matchup label (a match-total has no participant — the fixture IS the subject). Deterministic
 * and documented here because this map DEFINES the convention for lane legs; no other surface
 * adds these legs to the slip.
 *
 * Fail-closed: a leg without a real price (odds null/0) rides through as the 0 sentinel and the
 * seeder discloses and skips it; a card family whose producer does not decompose legs never
 * enters this map (its UI states the reason instead).
 */
import type { SlipLegInput } from "@/lib/slip/leg-identity";
import type { SeedableCard } from "@/components/build-experience";
import { loadRiskLadder } from "@/lib/parlays/risk-ladder";
import { loadCurrentSportLabLadder, type SportLabLeg } from "@/lib/parlays/sport-lab-cards";
import { loadSuggestedCards } from "@/lib/picks/suggested-cards";
import { mlbHeadshotUrl } from "@/lib/player-headshots";

const LANE_SPORTS = ["ufc", "epl", "nfl"] as const;

function laneLegToSlip(sport: string, l: SportLabLeg): SlipLegInput {
  return {
    sport,
    player: l.player ?? l.team ?? l.matchup ?? "—",
    marketLabel: l.marketLabel,
    side: l.side,
    line: l.line ?? null,
    /* 0 = "no current price" sentinel (JSON-safe); the seeder discloses and skips it. */
    americanOdds: l.odds ?? 0,
    matchup: l.matchup ?? (l.player && l.opponent ? `${l.player} vs ${l.opponent}` : (l.team ?? null)),
    photoUrl: l.photoUrl ?? null,
    teamAbbr: l.team ?? null,
    opponentAbbr: l.opponent ?? null,
  };
}

export function buildSeedableCards(dataRoot: string, ladderDate: string): Record<string, SeedableCard> {
  const out: Record<string, SeedableCard> = {};

  // MLB risk ladder — tier cards of record (richest labels win id collisions below).
  const mlb = loadRiskLadder(dataRoot, ladderDate);
  for (const card of mlb?.cards ?? []) {
    out[card.slipId] = {
      label: `the ${card.tierLabel} card`,
      legs: card.legs.map((l) => ({
        sport: "mlb", player: l.player, marketLabel: l.marketLabel, side: l.side, line: l.line,
        americanOdds: l.odds ?? 0,
        matchup: l.team && l.opponent ? `${l.team} vs ${l.opponent}` : (l.opponent ?? null),
        photoUrl: l.playerId ? mlbHeadshotUrl(l.playerId) : null,
        teamAbbr: l.team, opponentAbbr: l.opponent,
      })),
    };
  }

  // Sport lane ladders — the same loader the /cards/<sport> pages render (current-day gated).
  for (const sport of LANE_SPORTS) {
    const lane = loadCurrentSportLabLadder(sport);
    for (const card of lane?.cards ?? []) {
      if (out[card.slipId]) continue;
      out[card.slipId] = {
        label: `the ${sport.toUpperCase()} ${card.tier} card`,
        legs: card.legs.map((l) => laneLegToSlip(sport, l)),
      };
    }
  }

  // Identity-complete suggested cards (optimizer families) — P209 Release F.
  for (const card of loadSuggestedCards(ladderDate)) {
    if (out[card.id]) continue;
    if (card.legs.length === 0 || !card.legs.every((l) => l.slipLeg)) continue;
    out[card.id] = { label: card.title, legs: card.legs.map((l) => l.slipLeg!) };
  }

  return out;
}
