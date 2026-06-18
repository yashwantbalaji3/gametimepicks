/**
 * Maps the methodology engine's game-specific (same-game) suggested cards onto a specific World Cup
 * fixture. The engine groups same-game cards by the leg's event id, which for World Cup is a MIX of
 * the Odds API event-id hash (e.g. 289bc2…) and an internal numeric matchId (e.g. 27) depending on the
 * market — so a single identifier never catches every card. We match by BOTH:
 *   1) exact game-id === the fixture's Odds API matchId (catches hash-keyed groups), and
 *   2) a leg participant that contains one of the fixture's team names (catches numeric-keyed groups,
 *      e.g. "Canada or Draw" → Canada–Qatar).
 * A card is attributed to a fixture only when it actually belongs — never leaked to the wrong game,
 * never fabricated. Server-only (build-time), reads the canonical engine slate.
 */
import { loadTodaySlate, type SuggestedParlayCard } from "@/lib/parlays/ui-loader";
import type { RiskLevel } from "@/lib/parlays/types";

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "longshot"];
const norm = (s: string | null | undefined): string => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export interface GameSpecificCards {
  byRisk: Partial<Record<RiskLevel, SuggestedParlayCard[]>>;
  cards: SuggestedParlayCard[];
  total: number;
}

/** Engine same-game cards that belong to this World Cup fixture, bucketed by risk. */
export function getGameSpecificCardsForGame(
  fixture: { matchId?: string; homeTeam?: string; awayTeam?: string },
): GameSpecificCards {
  const teams = [norm(fixture.homeTeam), norm(fixture.awayTeam)].filter(Boolean);
  const matchId = fixture.matchId != null ? String(fixture.matchId) : null;
  const slate = loadTodaySlate();

  const cards: SuggestedParlayCard[] = [];
  const seen = new Set<string>();
  for (const group of slate.gameSpecific) {
    if (group.sport !== "WORLD_CUP") continue;
    const groupMatchesId = matchId != null && String(group.gameId) === matchId;
    for (const card of group.parlays) {
      if (seen.has(card.parlayId)) continue;
      const legMatchesTeam = teams.length > 0 && card.legs.some((l) => {
        const p = norm(l.participant);
        const ev = l.legId.split(":")[1];
        return (matchId != null && ev === matchId) || teams.some((t) => p.includes(t));
      });
      if (!groupMatchesId && !legMatchesTeam) continue;
      seen.add(card.parlayId);
      // The engine's same-game parlayId omits the gameId (collides across games) — scope it to this
      // group so it is unique when used as a React key.
      cards.push({ ...card, parlayId: `${group.gameId}:${card.parlayId}` });
    }
  }

  const byRisk: Partial<Record<RiskLevel, SuggestedParlayCard[]>> = {};
  for (const lvl of RISK_ORDER) {
    const lvlCards = cards.filter((c) => c.riskLevel === lvl);
    if (lvlCards.length) byRisk[lvl] = lvlCards;
  }
  return { byRisk, cards, total: cards.length };
}
