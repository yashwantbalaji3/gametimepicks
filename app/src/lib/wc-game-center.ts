/**
 * wc-game-center.ts — the market-implied Soccer / World Cup Game Center.
 *
 * Groups the WC projection's flat market list (public/data/world-cup/projections/latest.json →
 * matches[], one entry per market per fixture, each with de-vigged `outcomes[].marketProbability`)
 * by matchId and derives a clean Game Center: 3-way match result, double chance, draw-no-bet,
 * match total + O/U lean, and BTTS. Every number is a DIRECT read of the de-vigged prices — no
 * parametric model, no sampling, no fabricated scoreline/player market.
 *
 * HONESTY: this is a MARKET-IMPLIED dashboard, NOT a 10,000-run Monte Carlo simulation — there is
 * no `runCount` here and the UI must never claim one. 90-minute (regulation) markets only; extra
 * time / penalties do not count. Unsupported modules (shots, SOT, assists, corners, cards, xG,
 * first/anytime scorer, exact score, Asian handicap, team totals) are declared unavailable, never
 * invented. Money-independent: reads only the WC projection.
 */
import { loadWorldCupProjections } from "@/lib/world-cup/projections";

interface RawOutcome {
  label?: string;
  side?: string;
  marketProbability?: number | null;
  americanOdds?: number | null;
}
interface RawMarket {
  matchId?: string | number;
  market?: string;
  line?: number | null;
  homeTeam?: string;
  awayTeam?: string;
  homeCode?: string;
  awayCode?: string;
  kickoffUtc?: string | null;
  stage?: string | null;
  regulationOnly?: boolean;
  bookmaker?: string;
  outcomes?: RawOutcome[];
}

export interface WcMatchResult {
  home: number;
  draw: number;
  away: number;
  topResult: "home" | "draw" | "away";
}
export interface WcDoubleChance {
  homeOrDraw: number | null;
  awayOrDraw: number | null;
  homeOrAway: number | null;
}
export interface WcDrawNoBet {
  home: number;
  away: number;
}
export interface WcTotal {
  line: number;
  over: number;
  under: number;
  lean: "over" | "under" | "balanced";
}
export interface WcBtts {
  yes: number;
  no: number;
  lean: "yes" | "no" | "balanced";
}
export interface WcUnavailableModule {
  module: string;
  reason: string;
  displayCopy: string;
}
export interface WcGameCenter {
  method: "market_implied";
  source: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCode: string;
  awayCode: string;
  kickoffUtc: string | null;
  stage: string | null;
  regulationOnly: boolean;
  matchResult: WcMatchResult | null;
  doubleChance: WcDoubleChance | null;
  drawNoBet: WcDrawNoBet | null;
  total: WcTotal | null;
  btts: WcBtts | null;
  unavailable: WcUnavailableModule[];
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Probability of an outcome whose `side` is in the given set, or null when absent. */
function sideProb(mkt: RawMarket | undefined, sides: string[]): number | null {
  if (!mkt?.outcomes) return null;
  const o = mkt.outcomes.find((x) => sides.includes(String(x.side)));
  return o ? num(o.marketProbability) : null;
}

/** Modules soccer's odds-only feed can't back — listed honestly, never fabricated. */
const WC_UNAVAILABLE: WcUnavailableModule[] = [
  { module: "exact_score", reason: "not_ingested", displayCopy: "Exact score / scoreline isn't ingested for this slate." },
  { module: "first_scorer", reason: "not_ingested", displayCopy: "First / anytime scorer isn't ingested." },
  { module: "player_shots", reason: "not_ingested", displayCopy: "Player shots, shots-on-target, and assists aren't ingested." },
  { module: "corners", reason: "not_ingested", displayCopy: "Corners aren't ingested." },
  { module: "cards", reason: "not_ingested", displayCopy: "Cards aren't ingested." },
  { module: "xg", reason: "not_ingested", displayCopy: "Expected goals (xG) isn't ingested." },
  { module: "asian_handicap", reason: "not_ingested", displayCopy: "Asian handicap isn't ingested." },
  { module: "team_totals", reason: "not_ingested", displayCopy: "Team goal totals aren't ingested." },
];

/** Pure: build the Game Center for one matchId from its market-projection rows. */
export function buildWcGameCenter(matchId: string, rows: RawMarket[]): WcGameCenter | null {
  if (!rows || rows.length === 0) return null;
  const head = rows[0];
  const byMarket = new Map<string, RawMarket>();
  for (const r of rows) if (r.market) byMarket.set(r.market, r);

  // 3-way match result
  const mlHome = sideProb(byMarket.get("moneyline_90"), ["home"]);
  const mlDraw = sideProb(byMarket.get("moneyline_90"), ["draw"]);
  const mlAway = sideProb(byMarket.get("moneyline_90"), ["away"]);
  const matchResult: WcMatchResult | null =
    mlHome != null && mlDraw != null && mlAway != null
      ? {
          home: mlHome,
          draw: mlDraw,
          away: mlAway,
          topResult: mlHome >= mlDraw && mlHome >= mlAway ? "home" : mlAway >= mlDraw ? "away" : "draw",
        }
      : null;

  // double chance (overlapping 1X / X2 / 12)
  const dcHD = sideProb(byMarket.get("double_chance"), ["1X", "homeOrDraw", "home_or_draw"]);
  const dcAD = sideProb(byMarket.get("double_chance"), ["X2", "awayOrDraw", "away_or_draw"]);
  const dcHA = sideProb(byMarket.get("double_chance"), ["12", "homeOrAway", "home_or_away"]);
  const doubleChance: WcDoubleChance | null =
    dcHD != null || dcAD != null || dcHA != null
      ? { homeOrDraw: dcHD, awayOrDraw: dcAD, homeOrAway: dcHA }
      : null;

  // draw no bet
  const dnbHome = sideProb(byMarket.get("draw_no_bet"), ["home"]);
  const dnbAway = sideProb(byMarket.get("draw_no_bet"), ["away"]);
  const drawNoBet: WcDrawNoBet | null =
    dnbHome != null && dnbAway != null ? { home: dnbHome, away: dnbAway } : null;

  // match total goals
  const totMkt = byMarket.get("match_total_goals");
  const over = sideProb(totMkt, ["over"]);
  const under = sideProb(totMkt, ["under"]);
  const totLine = num(totMkt?.line);
  const total: WcTotal | null =
    over != null && under != null && totLine != null
      ? { line: totLine, over, under, lean: over - under >= 0.025 ? "over" : under - over >= 0.025 ? "under" : "balanced" }
      : null;

  // BTTS
  const bttsYes = sideProb(byMarket.get("btts"), ["yes"]);
  const bttsNo = sideProb(byMarket.get("btts"), ["no"]);
  const btts: WcBtts | null =
    bttsYes != null && bttsNo != null
      ? { yes: bttsYes, no: bttsNo, lean: bttsYes - bttsNo >= 0.025 ? "yes" : bttsNo - bttsYes >= 0.025 ? "no" : "balanced" }
      : null;

  return {
    method: "market_implied",
    source: `${head.bookmaker ?? "sportsbook"} · de-vigged`,
    matchId,
    homeTeam: head.homeTeam ?? "",
    awayTeam: head.awayTeam ?? "",
    homeCode: head.homeCode ?? "",
    awayCode: head.awayCode ?? "",
    kickoffUtc: head.kickoffUtc ?? null,
    stage: head.stage ?? null,
    regulationOnly: head.regulationOnly !== false,
    matchResult,
    doubleChance,
    drawNoBet,
    total,
    btts,
    unavailable: WC_UNAVAILABLE,
  };
}

/** Convenience: derive the Game Center for a matchId from the live WC projection. */
export function getWcGameCenter(matchId: string): WcGameCenter | null {
  const proj = loadWorldCupProjections();
  if (!proj?.matches) return null;
  const rows = (proj.matches as unknown as RawMarket[]).filter((m) => String(m.matchId) === String(matchId));
  return rows.length ? buildWcGameCenter(String(matchId), rows) : null;
}
