/**
 * Cricket / IPL board loader.
 *
 * Cricket is **projections-only** in this codebase — boards never
 * feed the parlay optimizer, the custom builder, or Results tracking.
 * The data is loaded by the `/projections` server component and
 * rendered through `<CricketBoardSection />`.
 *
 * Schema lock — keep in sync with
 * `pipeline/cricket/fetch_ipl_board.py`.
 */
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "./freshness";

/* -------------------------------------------------------------------------- */
/* Types — mirror pipeline/cricket/fetch_ipl_board.py                          */
/* -------------------------------------------------------------------------- */

export type CricketOddsStatus = "ok" | "pending" | "unavailable";
export type CricketConfidence = "High" | "Medium" | "Low" | "insufficient";

export interface CricketTeam {
  name: string | null;
  abbr: string | null;
}

export interface CricketMoneylineBook {
  book: string;
  home: number;
  away: number;
}

export interface CricketMoneylineConsensus {
  home: number;
  away: number;
  homeImpliedProb: number;
  awayImpliedProb: number;
  dispersion: number;
}

export interface CricketMoneylineMarket {
  books: CricketMoneylineBook[];
  consensus: CricketMoneylineConsensus;
  /** "home" | "away" — the model-projected winner (here equals the
   *  consensus higher implied prob; market-based, no edge claim). */
  projection: "home" | "away";
  edgePct: number;
  confidence: CricketConfidence;
}

export interface CricketTotalBook {
  book: string;
  line: number;
  overOdds: number;
  underOdds: number;
}

export interface CricketTotalConsensus {
  line: number;
  overOdds: number;
  underOdds: number;
  overImpliedProb: number;
  underImpliedProb: number;
  lineDispersion: number;
}

export interface CricketTotalMarket {
  books: CricketTotalBook[];
  consensus: CricketTotalConsensus;
  projection: number;
  edgePct: number;
  confidence: CricketConfidence;
}

export interface CricketMatch {
  matchId: string;
  shortName: string | null;
  longName: string | null;
  startTimeUtc: string | null;
  venue: string | null;
  stage: string | null;
  home: CricketTeam;
  away: CricketTeam;
  markets: {
    moneyline: CricketMoneylineMarket | null;
    total: CricketTotalMarket | null;
  };
}

export interface CricketBoard {
  sport: "cricket";
  league: "IPL";
  date: string;
  generatedAt: string;
  scheduleSource: string;
  oddsSource: string | null;
  oddsStatus: CricketOddsStatus;
  matches: CricketMatch[];
  preTossNote: string;
}

/* -------------------------------------------------------------------------- */
/* File loading                                                                */
/* -------------------------------------------------------------------------- */

const BOARDS_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "cricket",
  "boards",
);

/** Return the cricket board for a YYYY-MM-DD date, or null when no file
 *  exists. Pure file read — no fabrication. */
export function getCricketBoardForDate(date: string): CricketBoard | null {
  const p = path.join(BOARDS_DIR, `${date}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CricketBoard;
  } catch {
    return null;
  }
}

/** Return the most relevant cricket board for today's ET date.
 *
 * Lookup order:
 *   1. Today (ET)
 *   2. Tomorrow (ET) — common pre-game preview window
 *   3. Most recent past board (so a board from yesterday still appears
 *      until the next match is fetched)
 *
 * Returns null when nothing is on disk. */
export function getActiveCricketBoard(): CricketBoard | null {
  const today = currentEtDate();
  const direct = getCricketBoardForDate(today);
  if (direct) return direct;
  // +1 day check — IPL playoff slots often line up with the
  // pre-toss preview surface.
  const tomorrow = _addDaysEt(today, 1);
  const next = getCricketBoardForDate(tomorrow);
  if (next) return next;
  // Walk backward up to 7 days for the most recent historical board.
  for (let i = 1; i <= 7; i++) {
    const past = getCricketBoardForDate(_addDaysEt(today, -i));
    if (past) return past;
  }
  return null;
}

function _addDaysEt(date: string, days: number): string {
  const [y, m, d] = date.split("-").map((s) => Number(s));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
