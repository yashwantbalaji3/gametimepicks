/**
 * mlb-team-markets.ts — loader + Game Center deriver for the MLB full-market layer.
 *
 * Reads `public/data/mlb/team-markets/<date>.json` (written by
 * scripts/ingest-mlb-team-markets.mjs — de-vigged DraftKings h2h/spreads/totals) and
 * derives a **market-implied** Game Center per game: win probability, the market's
 * game total + over/under lean, and the run-line lean. Everything here is a DIRECT read
 * of the de-vigged prices — no parametric model, no fabricated score/margin/distribution.
 *
 * HONESTY: this is a market-implied read of the sportsbook, kept DISTINCT from the
 * GameTime player-prop MODEL. Run-scored distributions need the alternate-line ladders
 * (not ingested), so they are reported as an honest unavailable module, never invented.
 *
 * Money-independent: reads only mlb/team-markets; never portfolio/money.
 */
import fs from "node:fs";
import path from "node:path";

export interface TeamMarketSide {
  odds: number;
  impliedProb?: number | null;
  noVigProb: number | null;
}
export interface TeamMarketGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string;
  moneyline?: { home: TeamMarketSide; away: TeamMarketSide; draw: null };
  runLine?: {
    line: number | null;
    home: { line: number | null; odds: number; coverNoVigProb: number | null };
    away: { line: number | null; odds: number; coverNoVigProb: number | null };
  };
  total?: {
    line: number | null;
    over: { odds: number; noVigProb: number | null };
    under: { odds: number; noVigProb: number | null };
  };
}
export interface TeamMarketArtifact {
  sport: "mlb";
  date: string;
  generatedAt: string;
  source: string;
  bookmaker: string;
  method: string;
  marketsCovered: string[];
  gameCount: number;
  games: Record<string, TeamMarketGame>;
}

const DATA = path.join(process.cwd(), "public", "data", "mlb", "team-markets");

function readArtifact(date: string): TeamMarketArtifact | null {
  try {
    const p = path.join(DATA, `${date}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as TeamMarketArtifact;
  } catch (err) {
    console.warn(`[mlb-team-markets] could not load ${date}:`, err);
    return null;
  }
}

/** Newest team-markets date on disk (capped by caller if needed). */
export function latestTeamMarketsDate(): string | null {
  try {
    const files = fs
      .readdirSync(DATA)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort();
    return files.length ? files[files.length - 1] : null;
  } catch {
    return null;
  }
}

export function getTeamMarketsForDate(date: string): TeamMarketArtifact | null {
  return readArtifact(date);
}

/** The de-vigged team markets for one game on a date, or null when absent. */
export function getTeamMarketGame(date: string, gameId: string): TeamMarketGame | null {
  const art = readArtifact(date);
  return art?.games?.[gameId] ?? null;
}

// ── Game Center (market-implied) ───────────────────────────────────────────────

export interface GameCenterMoneyline {
  homeWinProb: number;
  awayWinProb: number;
  homeOdds: number;
  awayOdds: number;
  favorite: "home" | "away" | "even";
}
export interface GameCenterTotal {
  line: number;
  overProb: number;
  underProb: number;
  lean: "over" | "under" | "balanced";
}
export interface GameCenterRunLine {
  line: number;
  favorite: "home" | "away";
  favoriteCoverProb: number;
}
export interface MlbGameCenter {
  method: "market_implied";
  source: string;
  homeTeam: string;
  awayTeam: string;
  /** Scheduled first pitch (ISO, from the board's commenceTime). Null when the feed omitted it. */
  firstPitch: string | null;
  moneyline: GameCenterMoneyline | null;
  total: GameCenterTotal | null;
  runLine: GameCenterRunLine | null;
  /** Full-game modules that this main-line-only feed can't back (honest, not fabricated). */
  unavailable: { module: string; reason: string; displayCopy: string }[];
}

/** A total lean only when the de-vigged over/under diverge enough to matter (≥2.5pp). */
function totalLean(overProb: number, underProb: number): "over" | "under" | "balanced" {
  if (overProb - underProb >= 0.025) return "over";
  if (underProb - overProb >= 0.025) return "under";
  return "balanced";
}

/** Pure: derive the market-implied Game Center from one game's de-vigged team markets. */
export function buildMlbGameCenter(tm: TeamMarketGame | null): MlbGameCenter | null {
  if (!tm) return null;
  const ml = tm.moneyline;
  const moneyline: GameCenterMoneyline | null =
    ml && ml.home.noVigProb != null && ml.away.noVigProb != null
      ? {
          homeWinProb: ml.home.noVigProb,
          awayWinProb: ml.away.noVigProb,
          homeOdds: ml.home.odds,
          awayOdds: ml.away.odds,
          favorite:
            Math.abs(ml.home.noVigProb - ml.away.noVigProb) < 0.02
              ? "even"
              : ml.home.noVigProb > ml.away.noVigProb
                ? "home"
                : "away",
        }
      : null;

  const total: GameCenterTotal | null =
    tm.total && tm.total.line != null && tm.total.over.noVigProb != null && tm.total.under.noVigProb != null
      ? {
          line: tm.total.line,
          overProb: tm.total.over.noVigProb,
          underProb: tm.total.under.noVigProb,
          lean: totalLean(tm.total.over.noVigProb, tm.total.under.noVigProb),
        }
      : null;

  // Run line: the side whose cover no-vig prob is higher (the run-line favorite).
  const rl = tm.runLine;
  let runLine: GameCenterRunLine | null = null;
  if (rl && rl.home.coverNoVigProb != null && rl.away.coverNoVigProb != null) {
    const homeFav = rl.home.coverNoVigProb >= rl.away.coverNoVigProb;
    runLine = {
      line: (homeFav ? rl.home.line : rl.away.line) ?? rl.line ?? 0,
      favorite: homeFav ? "home" : "away",
      favoriteCoverProb: homeFav ? rl.home.coverNoVigProb : rl.away.coverNoVigProb,
    };
  }

  const unavailable = [
    {
      module: "run_distributions",
      reason: "requires_alternate_ladders",
      displayCopy:
        "Run-scored, total, and margin distributions need the alternate-line ladders (multiple priced totals/spreads), which aren't ingested for this slate. The Game Center shows the market's main-line reads only.",
    },
  ];

  return {
    method: "market_implied",
    source: `${tm.bookmaker} · de-vigged`,
    homeTeam: tm.homeTeam,
    awayTeam: tm.awayTeam,
    firstPitch: typeof tm.commenceTime === "string" && tm.commenceTime ? tm.commenceTime : null,
    moneyline,
    total,
    runLine,
    unavailable,
  };
}

/** Convenience: derive the Game Center for a game on a date directly from disk. */
export function getMlbGameCenter(date: string, gameId: string): MlbGameCenter | null {
  return buildMlbGameCenter(getTeamMarketGame(date, gameId));
}
