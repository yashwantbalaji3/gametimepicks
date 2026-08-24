/**
 * Curated picks layer — turns raw World Cup projections + player props into MODEL-RANKED picks
 * grouped by game (top team picks + top player picks), instead of a raw prop dump. Pure: reads the
 * existing public artifacts via the world-cup loaders. No fabrication — every field comes from real
 * odds (The Odds API) or the projection framework / API-Football. Player props are "limited data"
 * (market-implied) and are never marked Bank Builder eligible.
 */
import {
  loadWorldCupProjections,
  loadWorldCupPlayerProjections,
  playerMarketLabel,
  type WcProjection,
  type WcPlayerProjection,
} from "@/lib/world-cup/projections";
import { normTeamName } from "@/lib/world-cup/market-outlook";

export interface CuratedHitRate {
  hits: number;
  total: number;
  percentage: number;
  label: string;
}

export interface CuratedPick {
  id: string;
  sport: "world_cup" | "mlb";
  gameId: string;
  gameLabel: string;
  startTime: string | null;
  entityType: "team" | "player" | "game";
  entityName: string;
  entityImage?: string | null;
  teamName?: string | null;
  teamLogo?: string | null;
  teamCode?: string | null;
  market: string;
  marketLabel: string;
  selection: string;
  line?: number | null;
  odds: number;
  modelProbability?: number;
  marketProbability?: number;
  edge?: number;
  confidence?: string | null;
  dataQuality?: string;
  recentHitRate?: CuratedHitRate | null;
  why: string[];
  curatedScore: number;
  eligibility: {
    suggestedCard: boolean;
    parlayLab: boolean;
    build: boolean;
    bankBuilder: boolean;
  };
  rejectionReasons?: string[];
}

export interface CuratedGame {
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeCode?: string | null;
  awayCode?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  group?: string | null;
  startTime: string | null;
  /** "upcoming" = kickoff still ahead (pregame picks are active); "started" = kickoff has passed
   *  (the pregame picks are shown for reference only, never as active/Bank Builder eligible). */
  status: "upcoming" | "started";
  topTeamPicks: CuratedPick[];
  topPlayerPicks: CuratedPick[];
  playerPickNote?: string;
  totalProps: number;
}

const TEAM_MARKET_LABEL: Record<string, string> = {
  moneyline_90: "Match result",
  double_chance: "Double chance",
  draw_no_bet: "Draw no bet",
  match_total_goals: "Total goals",
  btts: "Both teams to score",
};
const TEAM_MARKET_WEIGHT: Record<string, number> = {
  double_chance: 1.0,
  draw_no_bet: 0.9,
  moneyline_90: 0.7,
  match_total_goals: 0.6,
  btts: 0.5,
};
const DQ_BONUS: Record<string, number> = { A: 0.15, B: 0.1, C: 0.03 };

function formFor(p: WcProjection): { hitRate: CuratedHitRate | null } {
  const pickL = (p.pickLabel || "").toLowerCase();
  const form =
    p.homeTeam && pickL.includes(p.homeTeam.toLowerCase()) ? p.homeForm
    : p.awayTeam && pickL.includes(p.awayTeam.toLowerCase()) ? p.awayForm
    : null;
  const last5 = form?.last5 ?? [];
  const results = last5.map((r) => String((r as { result?: string }).result ?? "").toUpperCase()[0]).filter((r) => "WDL".includes(r));
  if (!results.length) return { hitRate: null };
  const favourable = p.market === "double_chance" ? new Set(["W", "D"]) : new Set(["W"]);
  const hits = results.filter((r) => favourable.has(r)).length;
  return { hitRate: { hits, total: results.length, percentage: Math.round((hits / results.length) * 100), label: `${hits} of last ${results.length}` } };
}

/** Bank-Builder eligibility mirror (conservative; matches the V2 survival floor in spirit). */
function teamBankEligible(p: WcProjection): boolean {
  if (!(p.market === "double_chance" || p.market === "draw_no_bet")) return false;
  if ((p.modelProbability ?? 0) < 0.8) return false;
  const dq = String(p.dataQuality ?? "").toUpperCase();
  if (!(dq === "A" || dq === "B")) return false;
  return typeof p.americanOdds === "number" && p.americanOdds < 0;
}

function curateTeamPick(p: WcProjection): CuratedPick | null {
  if (typeof p.americanOdds !== "number" || !p.pickLabel) return null;
  const { hitRate } = formFor(p);
  const weight = TEAM_MARKET_WEIGHT[p.market] ?? 0.4;
  const dq = String(p.dataQuality ?? "B").toUpperCase();
  const score =
    (p.modelProbability ?? 0) * 0.55 +
    Math.max(0, p.edgePct ?? 0) * 0.6 +
    weight * 0.25 +
    (DQ_BONUS[dq] ?? 0) +
    (hitRate ? (hitRate.percentage / 100) * 0.12 : 0);
  const why: string[] = [];
  // P202: this line builds USER-FACING copy — never coalesce a probability to 0 in a claim. The
  // ≥0.8 filter above guarantees modelProbability here; market may genuinely be absent and says so.
  why.push(`Model ${Math.round((p.modelProbability as number) * 100)}%${p.marketProbability != null ? ` vs market ${Math.round(p.marketProbability * 100)}%` : " · market price unavailable"}`);
  if ((p.edgePct ?? 0) > 0.01) why.push(`${Math.round((p.edgePct ?? 0) * 100)}% edge`);
  if (hitRate) why.push(`recent form ${hitRate.label}`);
  if (p.market === "double_chance") why.push("covers two of three outcomes (lower variance)");
  return {
    id: `wc-team-${p.matchId}-${p.market}`,
    sport: "world_cup",
    gameId: String(p.matchId),
    gameLabel: `${p.homeTeam} vs ${p.awayTeam}`,
    startTime: p.kickoffUtc,
    entityType: "team",
    entityName: p.pickLabel,
    teamCode: pickCode(p),
    market: p.market,
    marketLabel: TEAM_MARKET_LABEL[p.market] ?? p.market,
    selection: p.pickLabel,
    odds: p.americanOdds,
    modelProbability: p.modelProbability,
    marketProbability: p.marketProbability,
    edge: p.edgePct,
    confidence: p.confidence,
    dataQuality: p.dataQuality,
    recentHitRate: hitRate,
    why,
    curatedScore: score,
    eligibility: {
      suggestedCard: !!p.parlayEligible,
      parlayLab: true,
      build: true,
      bankBuilder: teamBankEligible(p),
    },
  };
}

function pickCode(p: WcProjection): string | null {
  const pl = (p.pickLabel || "").toLowerCase();
  if (p.homeTeam && pl.includes(p.homeTeam.toLowerCase())) return p.homeCode ?? null;
  if (p.awayTeam && pl.includes(p.awayTeam.toLowerCase())) return p.awayCode ?? null;
  return null;
}

function curatePlayerPick(p: WcPlayerProjection): CuratedPick {
  const goal = p.market === "player_goal_scorer_anytime";
  const score =
    (p.modelProbability ?? 0) * 0.5 +
    Math.max(0, p.edgePct ?? 0) * 0.6 +
    (goal ? 0.15 : 0.08) +
    (p.lineupStatus === "confirmed" ? 0.1 : 0);
  const sel = goal ? "Anytime goalscorer" : `${p.pick} ${p.line ?? ""}`.trim();
  const why: string[] = [
    p.modelProbability != null
      ? `Model ${Math.round(p.modelProbability * 100)}%${p.marketProbability != null ? ` vs market ${Math.round(p.marketProbability * 100)}%` : " · market price unavailable"}`
      : "Market-implied only — no independent model probability",
  ];
  if ((p.edgePct ?? 0) > 0.01) why.push(`${Math.round((p.edgePct ?? 0) * 100)}% edge`);
  why.push("limited-data / market-implied — not Bank Builder eligible");
  return {
    id: `wc-player-${p.id}`,
    sport: "world_cup",
    gameId: String(p.matchId),
    gameLabel: p.player.team,
    startTime: null,
    entityType: "player",
    entityName: p.player.name,
    entityImage: p.player.photo,
    teamName: p.player.team,
    teamLogo: p.player.teamLogo,
    market: p.market,
    marketLabel: playerMarketLabel(p.market),
    selection: sel,
    line: p.line,
    odds: p.americanOdds,
    modelProbability: p.modelProbability,
    marketProbability: p.marketProbability,
    edge: p.edgePct,
    confidence: p.confidence,
    dataQuality: "limited",
    recentHitRate: null,
    why,
    curatedScore: score,
    eligibility: {
      suggestedCard: !!p.parlayEligible,
      parlayLab: true,
      build: true,
      bankBuilder: false, // limited-data player props are never Bank Builder eligible
    },
  };
}

/**
 * World Cup curated picks grouped by game: top team picks + top player picks per fixture.
 * Returns [] when projections are gated/unavailable. The raw prop inventory is never the
 * primary surface — callers render these curated picks first.
 */
export function loadWorldCupCuratedGames(opts?: { teamLimit?: number; playerLimit?: number; nowMs?: number }): CuratedGame[] {
  const teamLimit = opts?.teamLimit ?? 4;
  const playerLimit = opts?.playerLimit ?? 6;
  const nowMs = opts?.nowMs ?? Date.now();
  const proj = loadWorldCupProjections();
  const players = loadWorldCupPlayerProjections();
  if (!proj?.matches?.length) return [];

  // Group team projections by numeric matchId.
  const byGame = new Map<string, WcProjection[]>();
  for (const m of proj.matches) {
    const k = String(m.matchId);
    byGame.set(k, [...(byGame.get(k) ?? []), m]);
  }
  const playerRows = players?.matches ?? [];

  const games: CuratedGame[] = [];
  for (const [gameId, rows] of byGame) {
    const head = rows[0];
    const started = !!head.kickoffUtc && new Date(head.kickoffUtc).getTime() <= nowMs;
    const teamSet = new Set([normTeamName(head.homeTeam), normTeamName(head.awayTeam)]);
    const teamPicks = rows
      .map(curateTeamPick)
      .filter((x): x is CuratedPick => !!x)
      .map((p) => (started ? { ...p, eligibility: { ...p.eligibility, bankBuilder: false } } : p))
      .sort((a, b) => b.curatedScore - a.curatedScore)
      .slice(0, teamLimit);

    const matchedPlayers = playerRows.filter((p) => p.player?.team && teamSet.has(normTeamName(p.player.team)));
    const playerPicks = matchedPlayers
      .map(curatePlayerPick)
      .sort((a, b) => b.curatedScore - a.curatedScore)
      .slice(0, playerLimit);

    games.push({
      gameId,
      gameLabel: `${head.homeTeam} vs ${head.awayTeam}`,
      homeTeam: head.homeTeam,
      awayTeam: head.awayTeam,
      homeCode: head.homeCode,
      awayCode: head.awayCode,
      homeLogo: head.homeLogo,
      awayLogo: head.awayLogo,
      group: head.group,
      startTime: head.kickoffUtc,
      status: started ? "started" : "upcoming",
      topTeamPicks: teamPicks,
      topPlayerPicks: playerPicks,
      playerPickNote: matchedPlayers.length === 0 ? "Limited qualified player picks for this fixture." : undefined,
      totalProps: matchedPlayers.length,
    });
  }
  // Upcoming games first, then by kickoff.
  games.sort((a, b) => {
    if (a.status !== b.status) return a.status === "upcoming" ? -1 : 1;
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });
  return games;
}
