/**
 * game-model-picks — turns a single World Cup fixture's REAL projection feed (the team markets and
 * player props already on `PublicGameDetail`) into scannable table rows for the game-detail "Model picks"
 * tab. Pure data: it shapes and labels the existing odds-backed projections, derives a short honest NOTE
 * per row from the SHARED knockout-intelligence + editorial brain, and never fabricates a market.
 *
 * INTEGRITY: every value comes from a posted projection (americanOdds / modelProbability / confidence /
 * pickLabel) or is a literal "—". The five team markets in the feed map to the first five table rows; the
 * remaining five (1st-half ML/total, total/team corners, cards) are NOT in the feed and render as honest
 * UNAVAILABLE rows. Notes are ≤ ~10-word market reads, not invented stats.
 */
import type { PublicProjection } from "@/lib/normalize";
import type { KnockoutContext } from "./knockout-intelligence";

const american = (o?: number | null) =>
  typeof o === "number" && Number.isFinite(o) ? (o > 0 ? `+${o}` : `${o}`) : "—";
const pct = (n?: number | null) =>
  typeof n === "number" && Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—";
const txt = (s?: string | null) => (s && String(s).trim() ? String(s) : "—");

export interface ModelPickRow {
  rowLabel: string;       // friendly market name (e.g. "Full-Time Moneyline")
  available: boolean;
  pick: string;
  odds: string;
  prob: string;
  confidence: string;
  note: string;
}

/** The fixed team-market row order: 5 markets the feed carries, then 5 it never offers. */
const TEAM_ROWS: Array<{ rowLabel: string; market: string | null }> = [
  { rowLabel: "Full-Time Moneyline", market: "moneyline_90" },
  { rowLabel: "Full-Time Total Goals", market: "match_total_goals" },
  { rowLabel: "Both Teams To Score", market: "btts" },
  { rowLabel: "Double Chance", market: "double_chance" },
  { rowLabel: "Draw No Bet", market: "draw_no_bet" },
  { rowLabel: "1st Half Moneyline", market: null },
  { rowLabel: "1st Half Total", market: null },
  { rowLabel: "Total Corners", market: null },
  { rowLabel: "Team Corners", market: null },
  { rowLabel: "Cards", market: null },
];

/** A ≤ ~10-word honest read for a team-market row, from the shared knockout/editorial context. */
function teamNote(market: string, proj: PublicProjection, ctx: KnockoutContext | undefined): string {
  const favPct = ctx ? Math.round(ctx.favProb * 100) : null;
  const fav = ctx?.favoriteTeam ?? null;
  if (market === "moneyline_90") {
    if (ctx?.contenderTier === "strong-favorite" && fav && favPct != null) return `Clear favorite — ${fav} ${favPct}% in 90'`;
    if (ctx?.contenderTier === "even") return "Coin-flip tie — extra-time risk on a 90' call";
    if (fav && favPct != null) return `${fav} favored (${favPct}%), but a real contest`;
    return "Result market for this fixture";
  }
  if (market === "match_total_goals") {
    const over = /over/i.test(proj.pickLabel ?? "");
    if (ctx && ctx.defensiveLean >= 0.55) return "Market leans cagey — lower-event knockout profile";
    return over ? "Model leans Over — higher-event read" : "Model leans Under — lower-scoring read";
  }
  if (market === "btts") {
    const no = /:\s*no|\bno\b/i.test(proj.pickLabel ?? "");
    if (ctx && ctx.defensiveLean >= 0.55) return "Cautious tie — one side likely kept quiet";
    return no ? "Model expects a side to be shut out" : "Model expects both sides to score";
  }
  if (market === "double_chance") {
    if (fav) return `Lower-variance cover on ${fav}`;
    return "Lower-variance two-way cover";
  }
  if (market === "draw_no_bet") {
    if (ctx && ctx.extraTimeRisk >= 0.22) return "De-risks the draw — extra-time live here";
    if (fav) return `Backs ${fav}, stake back on a draw`;
    return "Stake returned if the match is drawn";
  }
  return "Posted team market";
}

/**
 * Build the 10 ordered team-market rows: the five posted markets (real odds/prob/confidence/pick + a short
 * note) followed by the five UNAVAILABLE markets the feed doesn't offer.
 */
export function buildTeamModelPickRows(
  teamProjections: PublicProjection[],
  ctx: KnockoutContext | undefined,
): ModelPickRow[] {
  const byMarket = new Map<string, PublicProjection>();
  for (const p of teamProjections) if (p.market && !byMarket.has(p.market)) byMarket.set(p.market, p);
  return TEAM_ROWS.map(({ rowLabel, market }) => {
    const proj = market ? byMarket.get(market) : undefined;
    if (market && proj) {
      return {
        rowLabel,
        available: true,
        pick: txt(proj.pickLabel),
        odds: american(proj.americanOdds),
        prob: pct(proj.modelProbability),
        confidence: txt(proj.confidence),
        note: teamNote(market, proj, ctx),
      };
    }
    return {
      rowLabel,
      available: false,
      pick: "Unavailable",
      odds: "—",
      prob: "—",
      confidence: "—",
      note: "Not offered by current feed",
    };
  });
}

export interface PlayerPickRow {
  player: string;
  team: string;
  market: string;
  pickLine: string;
  odds: string;
  prob: string;
  confidence: string;
  note: string;
}

export interface PlayerPropTable {
  market: string;       // canonical market key
  title: string;        // friendly table title
  rows: PlayerPickRow[];
}

/** The four player-prop tables in display order, each keyed on its real market. */
const PLAYER_TABLES: Array<{ market: string; title: string }> = [
  { market: "player_goal_scorer_anytime", title: "Anytime Goalscorer" },
  { market: "player_assists", title: "Assists" },
  { market: "player_shots_on_target", title: "Shots on Target" },
  { market: "player_shots", title: "Total Shots" },
];

const PLAYER_TABLE_CAP = 8;

/** A short one-word/read note for a player prop row (juice / low-confidence flags, honest and brief). */
function playerNote(p: PublicProjection): string {
  const odds = p.americanOdds;
  const prob = p.modelProbability;
  if (typeof odds === "number" && odds <= -250) return "heavily juiced";
  if (typeof prob === "number" && prob < 0.4) return "low confidence";
  if (typeof prob === "number" && prob >= 0.55) return "strong read";
  return "";
}

/**
 * Build the four player-prop tables. Each holds that market's props sorted by model probability DESC,
 * capped at the top {@link PLAYER_TABLE_CAP}, INCLUDING ONLY props with a real numeric americanOdds. A
 * market with zero odds-backed props yields an empty `rows` array (the UI shows an honest placeholder).
 */
export function buildPlayerPropTables(playerProps: PublicProjection[]): PlayerPropTable[] {
  return PLAYER_TABLES.map(({ market, title }) => {
    const rows = playerProps
      .filter((p) => p.market === market && typeof p.americanOdds === "number" && Number.isFinite(p.americanOdds))
      .sort((a, b) => (b.modelProbability ?? -1) - (a.modelProbability ?? -1))
      .slice(0, PLAYER_TABLE_CAP)
      .map((p): PlayerPickRow => ({
        player: txt(p.player?.name),
        team: txt(p.player?.team),
        market: txt(p.marketLabel),
        pickLine: `${txt(p.pickLabel)}${p.line != null ? ` ${p.line}` : ""}`,
        odds: american(p.americanOdds),
        prob: pct(p.modelProbability),
        confidence: txt(p.confidence),
        note: playerNote(p),
      }));
    return { market, title, rows };
  });
}
