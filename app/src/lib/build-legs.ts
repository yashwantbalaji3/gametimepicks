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
import { classifyPlayerRoles, roleKeyForRow } from "@/lib/world-cup/player-role-quality";
import { modelQualifies } from "@/lib/world-cup/model-qualified-props";
import { hydrateBuildLegs, type BuildLegAtoms } from "@/lib/build/leg-atoms";

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
  /** The model's own probability for this leg, where the SOURCE provides one (engine slate legs and
   *  WC props carry it; some legacy sources do not). Null means "not modelled", and the UI must
   *  render absence — never a derived stand-in from odds. This is the field whose absence blocked
   *  honest grading (Program 144 Release F); it is display-truth first, rubric later. */
  modelProbability?: number | null;
  /** The slate date the leg's source artifact was generated for. Freshness for grading: a leg from
   *  an older slate is never grade-eligible, whatever its model probability says. */
  sourceDate?: string | null;
  photo?: string | null;
  prelineup: boolean;
  regulationOnly: boolean;
  bankBuilderEligible: boolean;
  searchKey: string;
  /** The leg's canonical draft identity + display fields, so any surface adds THE SAME slip leg
   *  the boards add (one reader draft, one key — P208 Release A). */
  slipLeg?: import("@/lib/slip/leg-identity").SlipLegInput;
}

const SPORT_LABEL: Record<SportKey, string> = { world_cup: "World Cup", mlb: "MLB", nba: "NBA", ufc: "UFC" };

import { tierFromOdds as tierFromOddsShared } from "@/lib/build/risk-tier.mjs";
const tierFromOdds = tierFromOddsShared as (o: number) => RiskTier;

/** Parlay-eligible World Cup legs (team projections + pre-lineup player props). */
export function buildWcLegs(projections: WcProjections | null, players: WcPlayerProjections | null, nowIso?: string): BuildLeg[] {
  const legs: BuildLeg[] = [];
  // Only UPCOMING matches are eligible build candidates — exclude started/completed games so the
  // Build page never lists a stale/in-progress fixture as an active leg.
  const now = nowIso ?? new Date().toISOString();
  const kickoffByMatch = new Map<string, string>();
  for (const m of projections?.matches ?? []) {
    if (m?.matchId != null && (m as any).kickoffUtc) kickoffByMatch.set(String(m.matchId), String((m as any).kickoffUtc));
  }
  const notStarted = (matchId: unknown): boolean => {
    const k = kickoffByMatch.get(String(matchId ?? ""));
    return !!k && k > now; // require a known future kickoff
  };
  for (const p of normalizeWcProjections(projections)) {
    if (!p.parlayEligible || p.americanOdds == null) continue;
    if (!notStarted(p.matchId)) continue;
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
  // Team-name → kickoff (player files key matches differently), to gate player props to upcoming games.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const kickoffByTeam = new Map<string, string>();
  for (const m of projections?.matches ?? []) {
    const k = (m as any).kickoffUtc;
    if (!k) continue;
    if ((m as any).homeTeam) kickoffByTeam.set(norm(String((m as any).homeTeam)), String(k));
    if ((m as any).awayTeam) kickoffByTeam.set(norm(String((m as any).awayTeam)), String(k));
  }
  for (const p of normalizeWcPlayerProps(players)) {
    if (!p.parlayEligible || p.americanOdds == null || !p.player) continue;
    // Gate to upcoming only when we have kickoff data (real usage always passes team projections).
    if (kickoffByTeam.size > 0) {
      const teamKick = kickoffByTeam.get(norm(p.player.team ?? ""));
      if (!teamKick || teamKick <= now) continue;
    }
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

/**
 * The sports the card builder accepts a leg from. Anything else is refused with a stated reason
 * below — never by falling through an unexplained `continue`.
 */
export const BUILD_INVENTORY_SPORTS: ReadonlySet<string> = new Set(["nba", "mlb"]);

/**
 * Why a sport is not in the builder. NFL cites the SAME gate the money path enforces, so the two
 * surfaces cannot drift into giving a reader different answers to the same question.
 */
export const BUILD_INVENTORY_EXCLUSIONS: Readonly<Record<string, string>> = Object.freeze({
  nfl: "the NFL model is an explicitly experimental preseason beta; only a validated model version may become a selectable leg, so no NFL forecast enters the builder today",
  ufc: "the UFC surface is a settled archive — there is no current fight output to build from",
  world_cup: "the World Cup is closed as a destination; its legs remain in the archive, not the builder",
});

/** What the builder refused, and why — for surfaces that state their own coverage honestly. */
export function buildInventoryExclusion(sport: string): string {
  return (
    BUILD_INVENTORY_EXCLUSIONS[sport?.toLowerCase?.() ?? ""] ??
    `${sport || "an unnamed sport"} is not a registered card-builder sport — an unregistered sport is refused, never accepted by default`
  );
}

/**
 * What the builder REFUSED from this slip set, and why — one row per excluded sport with its leg
 * count. A surface can print this instead of leaving a reader to infer an oversight from a gap.
 */
export function buildOptimizerLegExclusions(slips: OptSlip[] | null | undefined): Array<{ sport: string; legs: number; reason: string }> {
  const counts = new Map<string, number>();
  for (const s of slips ?? []) {
    for (const l of s.legs ?? []) {
      const sport = (l.sport ?? "").toLowerCase();
      if (l.oddsForSide == null || BUILD_INVENTORY_SPORTS.has(sport)) continue;
      counts.set(sport, (counts.get(sport) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sport, legs]) => ({ sport, legs, reason: buildInventoryExclusion(sport) }));
}

/** Distinct parlay-eligible legs from the NBA/MLB optimizer slips (deduped). */
export function buildOptimizerLegs(slips: OptSlip[] | null | undefined): BuildLeg[] {
  if (!Array.isArray(slips)) return [];
  const seen = new Map<string, BuildLeg>();
  for (const s of slips) {
    for (const l of s.legs ?? []) {
      const odds = l.oddsForSide;
      const sport = (l.sport ?? "").toLowerCase() as SportKey;
      // P177-B: a rejected sport is COUNTED and REASONED, not silently skipped. The old `continue`
      // made NFL's absence from the card builder indistinguishable from an oversight — the same
      // shape of defect the paper-product gate fixed. The accepted set is unchanged (nba, mlb):
      // this records why everything else is refused so a surface can say it out loud.
      if (odds == null) continue;
      if (!BUILD_INVENTORY_SPORTS.has(sport)) continue;   // counted by buildOptimizerLegExclusions
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

/**
 * Canonical engine Build legs — adapts the methodology engine's eligible-leg pool (the SAME source
 * /today, /picks and /parlays use) into BuildLegs. Engine legs are already gated: not-started,
 * leakage-safe, odds-backed, current slate (no stale/started games). Covers MLB pitcher/hitter props,
 * World Cup team markets, and World Cup player props. Pure adapter — never fabricates.
 */
export function buildEngineLegAtoms(
  eligible: import("@/lib/parlays/ui-loader").ParlayLegDisplay[],
  sourceDate: string | null = null,
): BuildLegAtoms[] {
  const out: BuildLegAtoms[] = [];
  const seen = new Set<string>();
  // Strongest-survival first so the Build list leads with the most robust legs.
  const sorted = [...eligible].filter((l) => l.odds != null).sort((a, b) => (b.survivalScore ?? 0) - (a.survivalScore ?? 0));
  for (const l of sorted) {
    if (seen.has(l.legId)) continue;
    seen.add(l.legId);
    const sport = l.sportKey as SportKey;
    const eventId = l.legId.split(":")[1] ?? null; // engine legId = SPORT:eventId:market:participant:side
    /* Atoms only. `label`, `sublabel`, `searchKey`, `marketLabel`, `sportLabel`, `gameLabel`,
       `photo` and the whole `slipLeg` block are pure functions of these fields and are rebuilt by
       `hydrateBuildLeg` at the point of use. Optional keys are OMITTED rather than sent as null —
       across an MLB slate the World Cup fields are absent on every row, and `"key":null` costs the
       same bytes as a value. */
    const a: BuildLegAtoms = {
      id: l.legId,
      sport,
      participant: l.participant,
      market: l.market,
      americanOdds: l.odds as number,
    };
    if (eventId != null) a.gameId = eventId;
    if (l.side != null) a.side = l.side;
    if (l.line != null) a.line = l.line;
    if (l.team != null) a.team = l.team;
    if (l.opponent != null) a.opponent = l.opponent;
    if (l.modelProbability != null) a.modelProbability = l.modelProbability;
    if (l.survivalScore != null) a.survivalScore = l.survivalScore;
    if (sport === "world_cup") {
      if (l.identity.photoUrl != null) a.photoUrl = l.identity.photoUrl;
      if (l.identity.kind === "player") a.prelineup = true;
      a.regulationOnly = true;
    } else if (l.identity.playerId != null) {
      a.playerId = l.identity.playerId;
    }
    if (l.identity.kind !== "player") a.kind = l.identity.kind;
    if (sourceDate != null) a.sourceDate = sourceDate;
    // Bank-Builder eligibility mirrors the survival floor (team markets only; player props never).
    if ((l.survivalScore ?? 0) >= 80 && l.identity.kind !== "player") a.bankBuilderEligible = true;
    out.push(a);
  }
  /*
   * NO CAP. This returned `out.slice(0, 180)` — an undisclosed truncation that dropped 193 of 373
   * eligible legs on the 2026-09-01 slate while the marketplace heading beside it said "Legs (373)".
   * The cap existed to bound a 1010 B/leg row that was 61% derived strings; atoms cost 294 B/leg, so
   * the full pool is now SMALLER than the capped one was (107 KB against 177 KB). See
   * `lib/parlays/leg-reachability.test.mjs`.
   */
  return out;
}

/** The hydrated pool. Server callers and tests keep the full `BuildLeg` shape they always had. */
export function buildEngineLegs(
  eligible: import("@/lib/parlays/ui-loader").ParlayLegDisplay[],
  sourceDate: string | null = null,
): BuildLeg[] {
  return hydrateBuildLegs(buildEngineLegAtoms(eligible, sourceDate));
}

/**
 * World Cup PLAYER-PROP Build legs (anytime goalscorer / shots on target). These are limited-data /
 * market-implied (lineup not posted) so the engine never auto-suggests them — but they ARE
 * fixture-joined, odds-backed, and gated here to not-started games (by team kickoff), so a user may
 * still build with them. Always flagged prelineup (limited-data) and never Bank-Builder eligible.
 */
export function buildWcPlayerLegs(projections: WcProjections | null, players: WcPlayerProjections | null, nowIso?: string): BuildLeg[] {
  const now = nowIso ?? new Date().toISOString();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const kickoffByTeam = new Map<string, string>();
  for (const m of projections?.matches ?? []) {
    const k = (m as any).kickoffUtc;
    if (!k) continue;
    if ((m as any).homeTeam) kickoffByTeam.set(norm(String((m as any).homeTeam)), String(k));
    if ((m as any).awayTeam) kickoffByTeam.set(norm(String((m as any).awayTeam)), String(k));
  }
  // Model-qualified gate: the build pool defaults to model-qualified legs, NOT raw sportsbook inventory.
  // Role-quality is classified over the whole slate (per-team ranking needs all rows at once).
  const rawRows = (players?.matches ?? []) as Array<Record<string, any>>;
  const roleByKey = classifyPlayerRoles(
    rawRows.map((r) => ({ player: r.player ?? {}, market: r.market, americanOdds: r.americanOdds, modelProbability: r.modelProbability })),
    Boolean((players as any)?.lineupsPosted),
  );
  const legs: BuildLeg[] = [];
  for (const p of normalizeWcPlayerProps(players)) {
    if (p.americanOdds == null || !p.player) continue;
    // Pre-event only: require a known future kickoff for the player's team.
    if (kickoffByTeam.size > 0) {
      const teamKick = kickoffByTeam.get(norm(p.player.team ?? ""));
      if (!teamKick || teamKick <= now) continue;
    }
    // Only model-qualified props enter the build pool (settlement-supported market, odds window, provider,
    // probability floor, role-quality eligible). Raw inventory is intentionally excluded.
    const role = roleByKey.get(roleKeyForRow({ player: { id: typeof p.player.id === "number" ? p.player.id : null, name: p.player.name, team: p.player.team } }));
    if (!modelQualifies(
      { market: p.market, americanOdds: p.americanOdds, bookmaker: p.bookmaker, modelProbability: p.modelProbability, marketProbability: p.marketProbability },
      Boolean(role?.eligibleForSpecials),
    )) continue;
    legs.push({
      id: p.id, sport: "world_cup", sportLabel: "World Cup", gameId: p.matchId ?? null,
      gameLabel: p.player.team,
      label: `${p.player.name} · ${p.pickLabel}`, sublabel: `${p.player.team} · ${p.marketLabel} · limited-data`,
      market: p.market, marketLabel: p.marketLabel, riskTier: p.riskTier ?? "High",
      americanOdds: p.americanOdds, modelProbability: p.modelProbability ?? null, photo: p.player.photo ?? null, prelineup: true, regulationOnly: true,
      bankBuilderEligible: false,
      searchKey: `${p.player.name} ${p.player.team} ${p.marketLabel}`.toLowerCase(),
      // WC props carry no side/line decomposition; the pick label IS the side for identity purposes.
      slipLeg: {
        sport: "world_cup", player: p.player.name, marketLabel: p.marketLabel, side: p.pickLabel,
        line: typeof p.line === "number" ? p.line : null, americanOdds: p.americanOdds,
        matchup: p.player.team ?? null, photoUrl: p.player.photo ?? null,
        teamAbbr: null, opponentAbbr: null,
      },
    });
  }
  return legs;
}
