/**
 * Build-a-card leg pool — the ONLY legs a user may add to a custom paper card: parlay-eligible
 * legs across sports, each carrying real American odds (for the combined-odds math). World Cup
 * eligible projections/player props + NBA/MLB optimizer-slip legs. UFC is model-only (no odds),
 * so it contributes no buildable legs. Pure adapters over the normalized contracts.
 */
import type { SportKey, RiskTier } from "@/lib/normalize";
import { mlbHeadshotUrl, nbaHeadshotUrl } from "@/lib/player-headshots";
import { normalizeWcProjections, normalizeWcPlayerProps } from "@/lib/normalize";
import type { WcProjections, WcPlayerProjections } from "@/lib/world-cup/projections";

export interface BuildLeg {
  id: string;
  sport: SportKey;
  sportLabel: string;
  gameId: string | number | null;
  /** Human matchup label for the game-selector chips (e.g. "USA vs Paraguay", "HOU @ KC"). */
  gameLabel?: string;
  label: string;
  sublabel: string;
  market: string;
  marketLabel: string;
  riskTier: RiskTier;
  americanOdds: number;
  photo?: string | null;
  prelineup: boolean;
  regulationOnly: boolean;
  bankBuilderEligible: boolean;
  searchKey: string;
}

const SPORT_LABEL: Record<SportKey, string> = { world_cup: "World Cup", mlb: "MLB", nba: "NBA", ufc: "UFC" };

function tierFromOdds(o: number): RiskTier {
  if (o <= -150) return "Low";
  if (o <= 120) return "Medium";
  if (o <= 300) return "High";
  return "Longshot";
}

/** Parlay-eligible World Cup legs (team projections + pre-lineup player props). */
export function buildWcLegs(projections: WcProjections | null, players: WcPlayerProjections | null): BuildLeg[] {
  const legs: BuildLeg[] = [];
  for (const p of normalizeWcProjections(projections)) {
    if (!p.parlayEligible || p.americanOdds == null) continue;
    legs.push({
      id: p.id, sport: "world_cup", sportLabel: "World Cup", gameId: p.matchId ?? null,
      gameLabel: p.gameLabel,
      label: p.pickLabel, sublabel: `${p.gameLabel} · ${p.marketLabel}`,
      market: p.market, marketLabel: p.marketLabel, riskTier: p.riskTier ?? "Medium",
      americanOdds: p.americanOdds, prelineup: false, regulationOnly: true,
      bankBuilderEligible: p.riskTier === "Low" && p.participantType === "team",
      searchKey: `${p.pickLabel} ${p.gameLabel}`.toLowerCase(),
    });
  }
  for (const p of normalizeWcPlayerProps(players)) {
    if (!p.parlayEligible || p.americanOdds == null || !p.player) continue;
    const prelineup = !(p.lineupStatus ?? "").startsWith("confirmed");
    legs.push({
      id: p.id, sport: "world_cup", sportLabel: "World Cup", gameId: p.matchId ?? null,
      gameLabel: p.player.team,
      label: `${p.player.name} · ${p.pickLabel}`, sublabel: `${p.player.team} · ${p.marketLabel}`,
      market: p.market, marketLabel: p.marketLabel, riskTier: p.riskTier ?? "Medium",
      americanOdds: p.americanOdds, photo: p.player.photo, prelineup, regulationOnly: true,
      bankBuilderEligible: false, // pre-lineup / player props never Bank Builder
      searchKey: `${p.player.name} ${p.player.team} ${p.marketLabel}`.toLowerCase(),
    });
  }
  return legs;
}

type OptLeg = {
  sport?: string; gameId?: string | null; playerName?: string; displayName?: string; playerId?: number | string | null;
  team?: string | null; opponent?: string | null;
  marketLabel?: string | null; market?: string; side?: string; line?: number | null; oddsForSide?: number | null;
};
type OptSlip = { legs?: OptLeg[] };

/** Distinct parlay-eligible legs from the NBA/MLB optimizer slips (deduped). */
export function buildOptimizerLegs(slips: OptSlip[] | null | undefined): BuildLeg[] {
  if (!Array.isArray(slips)) return [];
  const seen = new Map<string, BuildLeg>();
  for (const s of slips) {
    for (const l of s.legs ?? []) {
      const odds = l.oddsForSide;
      const sport = (l.sport ?? "").toLowerCase() as SportKey;
      if (odds == null || (sport !== "nba" && sport !== "mlb")) continue;
      const who = l.playerName || l.displayName || "Leg";
      const mkt = l.marketLabel || l.market || "";
      const sideLine = `${l.side ?? ""} ${l.line ?? ""}`.trim();
      const key = `${sport}|${who}|${mkt}|${sideLine}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        id: key.replace(/[^a-z0-9]+/gi, "_"), sport, sportLabel: SPORT_LABEL[sport],
        gameId: l.gameId ?? null,
        gameLabel: l.team && l.opponent ? `${l.team} vs ${l.opponent}` : undefined,
        label: `${who} · ${mkt} ${sideLine}`.trim(), sublabel: SPORT_LABEL[sport],
        // Official league-CDN headshot from the artifact's real playerId (see player-headshots.ts).
        photo: sport === "mlb" ? mlbHeadshotUrl(l.playerId) : sport === "nba" ? nbaHeadshotUrl(l.playerId) : null,
        market: l.market ?? mkt, marketLabel: mkt, riskTier: tierFromOdds(odds),
        americanOdds: odds, prelineup: false, regulationOnly: false,
        bankBuilderEligible: tierFromOdds(odds) === "Low",
        searchKey: `${who} ${mkt} ${sideLine}`.toLowerCase(),
      });
    }
  }
  return [...seen.values()];
}
