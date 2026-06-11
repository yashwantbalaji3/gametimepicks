/**
 * Normalized public data contracts — one shape per concept so shared components render every
 * sport identically. Adapters convert sport-specific artifacts into these contracts. World Cup
 * adapters are implemented here; MLB/NBA/UFC adapters follow the same contract in later PRs.
 */
import fs from "node:fs";
import path from "node:path";
import type { WcParlays, WcProjections, WcPlayerProjections } from "@/lib/world-cup/projections";
import { americanToDecimal, decimalToAmerican } from "@/lib/odds-math";

/** Daily mixed-sport cards (built by pipeline.daily.build_mixed_sport_cards). The artifact already
 *  matches the PublicSuggestedCard contract; returns [] when none. */
export function loadDailyMixedCards(): PublicSuggestedCard[] {
  try {
    const d = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "daily", "cards", "latest.json"), "utf8"),
    ) as { cards?: PublicSuggestedCard[] };
    return Array.isArray(d.cards) ? d.cards : [];
  } catch {
    return [];
  }
}

export type SportKey = "world_cup" | "mlb" | "nba" | "ufc";
export type RiskTier = "Low" | "Medium" | "High" | "Longshot";

export interface PublicProjection {
  id: string;
  sport: SportKey;
  sportLabel: string;
  date: string;
  matchId?: number | string | null;
  gameLabel: string;
  market: string;
  marketLabel: string;
  participantType: "team" | "player" | "fighter" | "game";
  player?: { id?: number | string; name: string; team?: string; position?: string | null; photo?: string | null } | null;
  pickLabel: string;
  line?: number | string | null;
  americanOdds?: number | null;
  bookmaker?: string | null;
  modelProbability?: number | null;
  marketProbability?: number | null;
  edgePct?: number | null;
  confidence: "Low" | "Medium" | "High";
  riskTier?: RiskTier;
  public: boolean;
  parlayEligible: boolean;
  bankBuilderEligible: boolean;
  status: string;
  lineupStatus?: string;
  caveats?: string[];
}

export interface PublicSuggestedCard {
  id: string;
  date: string;
  title: string;
  sports: SportKey[];
  sportLabels: string[];
  cardType: "single_sport" | "mixed_sport" | "bank_builder_candidate";
  riskTier: RiskTier;
  legs: Array<{ sport: SportKey; label: string; sublabel?: string; americanOdds: number; photo?: string | null }>;
  combinedAmericanOdds: number;
  defaultStake: number;
  isPublic: boolean;
  bankBuilderEligible: boolean;
  whyThisCard?: string[];
  caveats?: string[];
}

export interface SportSummary {
  sport: SportKey;
  label: string;
  href: string;
  accent: string;
  live: boolean;
  stats: Array<{ label: string; value: string | number }>;
}

const WC_MARKET_LABEL: Record<string, string> = {
  moneyline_90: "Moneyline (90′)",
  double_chance: "Double chance",
  match_total_goals: "Total goals",
  match_total_corners: "Total corners",
  player_shots: "Shots",
  player_shots_on_target: "Shots on target",
  player_assists: "Assists",
  player_goal_scorer_anytime: "Anytime goalscorer",
};

export function normalizeWcCards(parlays: WcParlays | null): PublicSuggestedCard[] {
  if (!parlays) return [];
  return parlays.cards.map((c) => ({
    id: c.id,
    date: parlays.date,
    title: c.title,
    sports: ["world_cup"],
    sportLabels: ["World Cup"],
    cardType: "single_sport",
    riskTier: c.riskTier as RiskTier,
    legs: c.legs.map((l) => ({
      sport: "world_cup" as SportKey,
      label: l.pick,
      sublabel: l.match,
      americanOdds: l.americanOdds,
    })),
    combinedAmericanOdds: c.combinedAmericanOdds,
    defaultStake: c.defaultStake,
    isPublic: true,
    bankBuilderEligible: false,
    whyThisCard: c.whyThisCard,
    caveats: c.dataCaveats,
  }));
}

export function normalizeWcProjections(projections: WcProjections | null): PublicProjection[] {
  if (!projections) return [];
  return projections.matches.map((p) => ({
    id: p.id,
    sport: "world_cup",
    sportLabel: "World Cup",
    date: p.date,
    matchId: p.matchId,
    gameLabel: `${p.homeTeam} vs ${p.awayTeam}`,
    market: p.market,
    marketLabel: WC_MARKET_LABEL[p.market] ?? p.market,
    participantType: "team",
    pickLabel: p.pickLabel ?? `${p.homeTeam} vs ${p.awayTeam}`,
    line: p.line,
    americanOdds: p.americanOdds,
    bookmaker: p.bookmaker,
    modelProbability: p.modelProbability,
    marketProbability: p.marketProbability,
    edgePct: p.edgePct,
    confidence: (p.confidence as "Low" | "Medium" | "High") ?? "Low",
    riskTier: p.riskTier as RiskTier,
    public: p.public ?? true,
    parlayEligible: p.parlayEligible ?? false,
    bankBuilderEligible: false,
    status: p.projectionStatus ?? "public_projection",
    caveats: p.caveats,
  }));
}

export function normalizeWcPlayerProps(players: WcPlayerProjections | null): PublicProjection[] {
  if (!players) return [];
  return players.matches.map((p) => ({
    id: p.id,
    sport: "world_cup",
    sportLabel: "World Cup",
    date: players.date,
    matchId: p.matchId,
    gameLabel: p.player.team,
    market: p.market,
    marketLabel: WC_MARKET_LABEL[p.market] ?? p.market,
    participantType: "player",
    player: { id: p.player.id, name: p.player.name, team: p.player.team, position: p.player.position, photo: p.player.photo },
    pickLabel: p.market === "player_goal_scorer_anytime" ? "Anytime" : `${p.pick} ${p.line ?? ""}`.trim(),
    line: p.line,
    americanOdds: p.americanOdds,
    bookmaker: p.bookmaker,
    modelProbability: p.modelProbability,
    marketProbability: p.marketProbability,
    edgePct: p.edgePct,
    confidence: "Low",
    riskTier: p.riskTier as RiskTier,
    public: p.public ?? true,
    parlayEligible: p.parlayEligible ?? false,
    bankBuilderEligible: false,
    status: p.projectionStatus ?? "pre_lineup_public_projection",
    lineupStatus: p.lineupStatus,
    caveats: p.dataCaveats,
  }));
}

// ── MLB board-lean adapter (model player-prop projections → projection views) ──
type MlbLean = {
  id?: string; playerName?: string; playerRole?: string; playerTeamAbbr?: string; playerTeamName?: string;
  opponentAbbr?: string; awayTeamAbbr?: string; homeTeamAbbr?: string; marketKey?: string; marketLabel?: string;
  line?: number | null; lean?: string; confidence?: string; date?: string; gamePk?: number | string;
  edgePct?: number | null; edgePctOver?: number | null; edgePctUnder?: number | null;
  modelProbOver?: number | null; modelProbUnder?: number | null; impliedOver?: number | null; impliedUnder?: number | null;
  oddsOver?: number | null; oddsUnder?: number | null;
};
type MlbBoardLike = { date?: string; leans?: MlbLean[] };

/** MLB board leans → PublicProjection views (player props). These are model projection VIEWS
 *  (parlayEligible=false); the parlay-eligible subset comes from the optimizer cards. */
export function normalizeMlbLeans(board: MlbBoardLike | null): PublicProjection[] {
  const leans = board?.leans ?? [];
  return leans.map((l, i) => {
    const over = (l.lean ?? "").toLowerCase() === "over";
    return {
      id: l.id ?? `mlb_lean_${i}`,
      sport: "mlb",
      sportLabel: "MLB",
      date: l.date ?? board?.date ?? "",
      matchId: l.gamePk ?? null,
      gameLabel: `${l.awayTeamAbbr ?? ""} @ ${l.homeTeamAbbr ?? ""}`.trim(),
      market: l.marketKey ?? "",
      marketLabel: l.marketLabel ?? l.marketKey ?? "",
      participantType: "player",
      player: { name: l.playerName ?? "Player", team: l.playerTeamAbbr ?? l.playerTeamName, position: l.playerRole ?? null },
      pickLabel: `${l.lean ?? ""} ${l.line ?? ""}`.trim(),
      line: l.line ?? null,
      americanOdds: over ? l.oddsOver ?? null : l.oddsUnder ?? null,
      modelProbability: over ? l.modelProbOver ?? null : l.modelProbUnder ?? null,
      marketProbability: over ? l.impliedOver ?? null : l.impliedUnder ?? null,
      edgePct: l.edgePct ?? (over ? l.edgePctOver : l.edgePctUnder) ?? null,
      confidence: (l.confidence as "Low" | "Medium" | "High") ?? "Low",
      public: true,
      parlayEligible: false,
      bankBuilderEligible: false,
      status: "public_projection",
    };
  });
}

// ── NBA board-lean adapter (model player-prop projections → projection views) ──
const NBA_MARKET_LABEL: Record<string, string> = {
  PTS: "Points", REB: "Rebounds", AST: "Assists", "3PM": "Threes Made",
  PRA: "Pts+Reb+Ast", BLK: "Blocks", STL: "Steals", PR: "Pts+Reb", PA: "Pts+Ast", RA: "Reb+Ast",
};
type NbaLean = {
  id?: string; playerName?: string; market?: string; line?: number | null; lean?: string;
  confidence?: string; edgePct?: number | null; modelProbability?: number | null; impliedProbability?: number | null;
  oddsOver?: number | null; oddsUnder?: number | null; team?: string; opponent?: string; gameId?: string; date?: string;
};
type NbaBoardLike = { date?: string; generatedFor?: string; leans?: NbaLean[] };

/** NBA board leans → PublicProjection views. Only actual plays (Over/Under) become views;
 *  "No Play" leans (no edge / lines pending) are skipped. parlayEligible=false (projection views). */
export function normalizeNbaLeans(board: NbaBoardLike | null): PublicProjection[] {
  const leans = board?.leans ?? [];
  return leans
    .filter((l) => l.lean === "Over" || l.lean === "Under")
    .map((l, i) => {
      const over = l.lean === "Over";
      return {
        id: l.id ?? `nba_lean_${i}`,
        sport: "nba",
        sportLabel: "NBA",
        date: l.date ?? board?.date ?? board?.generatedFor ?? "",
        matchId: l.gameId ?? null,
        gameLabel: `${l.team ?? ""} vs ${l.opponent ?? ""}`.trim().replace(/^vs |vs $/g, ""),
        market: l.market ?? "",
        marketLabel: NBA_MARKET_LABEL[l.market ?? ""] ?? l.market ?? "",
        participantType: "player",
        player: { name: l.playerName ?? "Player", team: l.team ?? undefined },
        pickLabel: `${l.lean} ${l.line ?? ""}`.trim(),
        line: l.line ?? null,
        americanOdds: over ? l.oddsOver ?? null : l.oddsUnder ?? null,
        modelProbability: l.modelProbability ?? null,
        marketProbability: l.impliedProbability ?? null,
        edgePct: l.edgePct ?? null,
        confidence: l.confidence === "High" || l.confidence === "Medium" ? l.confidence : "Low",
        public: true,
        parlayEligible: false,
        bankBuilderEligible: false,
        status: "public_projection",
      };
    });
}

// ── NBA / MLB optimizer-slip adapter (defensive — works for either slip shape) ──
const PROFILE_TIER: Record<string, RiskTier> = {
  conservative: "Low", balanced: "Medium", aggressive: "High", lottery: "Longshot",
  low: "Low", medium: "Medium", high: "High", longshot: "Longshot",
};
type LooseLeg = {
  playerName?: string; displayName?: string; teamAbbr?: string; opponentAbbr?: string;
  marketLabel?: string | null; market?: string; side?: string; line?: number | null;
  oddsForSide?: number | null; odds?: number | null; americanOdds?: number | null;
};
type LooseSlip = {
  slipId?: string; id?: string; profile?: string; riskProfile?: string;
  sport?: string; legs?: LooseLeg[]; combinedAmerican?: number | null; rationale?: string;
};

function legOdds(l: LooseLeg): number | null {
  return l.oddsForSide ?? l.odds ?? l.americanOdds ?? null;
}
function legLabel(l: LooseLeg): string {
  const who = l.playerName || l.displayName || l.teamAbbr || "Leg";
  const mkt = l.marketLabel || l.market || "";
  const side = l.side ? ` ${l.side}` : "";
  const line = l.line != null ? ` ${l.line}` : "";
  return `${who} · ${mkt}${side}${line}`.replace(/\s+/g, " ").trim();
}

export function normalizeOptimizerSlips(
  slips: LooseSlip[] | null | undefined,
  opts: { sportFilter?: "nba" | "mlb"; date: string } = { date: "" },
): PublicSuggestedCard[] {
  if (!Array.isArray(slips)) return [];
  const out: PublicSuggestedCard[] = [];
  for (const s of slips) {
    const sport = (s.sport ?? "").toLowerCase();
    if (opts.sportFilter && sport !== opts.sportFilter) continue;
    if (sport !== "nba" && sport !== "mlb" && sport !== "multi") continue;
    const legs = (s.legs ?? []).filter((l) => legOdds(l) != null);
    if (legs.length === 0) continue;
    const dec = legs.reduce((acc, l) => acc * americanToDecimal(legOdds(l) as number), 1);
    const sports: SportKey[] = sport === "multi"
      ? Array.from(new Set(legs.map((l) => "nba" as SportKey))) // refined below
      : [sport as SportKey];
    const distinct = Array.from(new Set((s.legs ?? []).map((l) => (l as { sport?: string }).sport).filter(Boolean))) as SportKey[];
    const finalSports = distinct.length ? distinct : sports;
    const label = (k: SportKey) => (k === "nba" ? "NBA" : k === "mlb" ? "MLB" : k === "ufc" ? "UFC" : "World Cup");
    out.push({
      id: s.slipId || s.id || `opt_${out.length}`,
      date: opts.date,
      title: finalSports.length > 1 ? "Mixed-sport card" : `${label(finalSports[0])} parlay`,
      sports: finalSports,
      sportLabels: finalSports.map(label),
      cardType: finalSports.length > 1 ? "mixed_sport" : "single_sport",
      riskTier: PROFILE_TIER[(s.profile ?? s.riskProfile ?? "").toLowerCase()] ?? "Medium",
      legs: legs.map((l) => ({
        sport: ((l as { sport?: string }).sport as SportKey) ?? (finalSports[0] ?? "nba"),
        label: legLabel(l),
        americanOdds: legOdds(l) as number,
      })),
      combinedAmericanOdds: s.combinedAmerican ?? decimalToAmerican(dec),
      defaultStake: 25,
      isPublic: true,
      bankBuilderEligible: false,
      whyThisCard: s.rationale ? [s.rationale] : undefined,
    });
  }
  return out;
}

// ── UFC V1 moneyline-projection adapter (real moneyline odds → projection views) ──
type UfcV1Projection = {
  fighter?: string; opponent?: string; oddsPrice?: number; marketImpliedProbability?: number;
  modelProbability?: number; label?: string;
};
type UfcV1ProjectionsLike = { eventName?: string; generatedAt?: string; projections?: UfcV1Projection[] };

/** UFC V1 moneyline projections → PublicProjection views (real moneyline odds; participantType
 *  fighter). parlayEligible=false — the suggested cards are the model-only curated subset. */
export function normalizeUfcProjections(v1: UfcV1ProjectionsLike | null): PublicProjection[] {
  const projs = v1?.projections ?? [];
  return projs.map((p, i) => {
    const model = p.modelProbability ?? null;
    const market = p.marketImpliedProbability ?? null;
    return {
      id: `ufc_proj_${i}`,
      sport: "ufc",
      sportLabel: "UFC",
      date: "",
      gameLabel: `${p.fighter ?? ""} vs ${p.opponent ?? ""}`.trim(),
      market: "moneyline",
      marketLabel: "Moneyline",
      participantType: "fighter",
      player: { name: p.fighter ?? "Fighter" },
      pickLabel: `${p.fighter ?? "Fighter"} ML`,
      line: null,
      americanOdds: p.oddsPrice ?? null,
      modelProbability: model,
      marketProbability: market,
      edgePct: model != null && market != null ? Math.round((model - market) * 1000) / 10 : null,
      confidence: "Low",
      public: true,
      parlayEligible: false,
      bankBuilderEligible: false,
      status: "public_projection",
    };
  });
}

// ── UFC adapter (V1 moneyline, model-only — no market odds, so no stake payout) ──
type UfcLeg = { fighter?: string; modelProbability?: number };
type UfcCard = { riskLabel?: string; legs?: UfcLeg[]; modelCombinedProbability?: number; rationale?: string };
export function normalizeUfcCards(
  ufc: { cards?: UfcCard[]; eventName?: string; publicReady?: boolean } | null,
  date: string,
): PublicSuggestedCard[] {
  if (!ufc?.publicReady || !Array.isArray(ufc.cards)) return [];
  const tier = (label?: string): RiskTier =>
    /conserv/i.test(label ?? "") ? "Low" : /balanc/i.test(label ?? "") ? "Medium" : /aggress/i.test(label ?? "") ? "High" : "Longshot";
  return ufc.cards.map((c, i) => ({
    id: `ufc_${date}_${i}`,
    date,
    title: c.riskLabel || "UFC moneyline card",
    sports: ["ufc"],
    sportLabels: ["UFC"],
    cardType: "single_sport",
    riskTier: tier(c.riskLabel),
    legs: (c.legs ?? []).map((l) => ({
      sport: "ufc" as SportKey,
      label: l.fighter ?? "Fighter",
      sublabel: l.modelProbability != null ? `Model ${Math.round(l.modelProbability * 100)}%` : undefined,
      americanOdds: 0, // model-only V1: no market odds → stake/payout not shown for UFC
    })),
    combinedAmericanOdds: 0,
    defaultStake: 25,
    isPublic: true,
    bankBuilderEligible: false,
    whyThisCard: c.rationale ? [c.rationale] : undefined,
    caveats: ["UFC V1 is moneyline, model-probability only — no market odds, so no paper payout shown."],
  }));
}
