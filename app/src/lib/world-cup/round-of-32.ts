/**
 * Round-of-32 Model Picks Board loader (build-time, static, server-side).
 *
 * Reads the pre-generated `world-cup/round-of-32/board.json` artifact — real, de-vigged model picks
 * from posted odds (The Odds API). This loader does NOT compute or fabricate anything: it returns the
 * artifact as-is (typed), and a small set of pure helpers that DERIVE display labels (upset-risk band,
 * expected game script) from values already present in each pick. When the artifact is missing or
 * malformed it fails closed (returns null) so no fabricated board is ever shown.
 *
 * 90-minute markets only. "Advance" is the 90-min moneyline favorite used as a de-vig proxy — never an
 * outright/to-advance market. Paper-only, educational; not betting advice; not the Bank Builder ladder.
 */
import fs from "node:fs";
import path from "node:path";

export type RoundOf32Status = "live_odds" | "started" | "odds_pending";
export type RoundOf32Confidence = "Strong" | "Solid" | "Lean" | "Coin-flip";

export interface RoundOf32MoneylinePick {
  pick: string;
  side: "home" | "away";
  americanOdds: number;
  modelProbability: number;
  home: number;
  draw: number;
  away: number;
}
export interface RoundOf32MarketPick {
  pick: string;
  americanOdds: number;
  modelProbability: number;
}
export interface RoundOf32TotalPick extends RoundOf32MarketPick {
  line: number;
}
export interface RoundOf32NamedMarketPick {
  market: string;
  pick: string;
  americanOdds: number;
  modelProbability: number;
}
export interface RoundOf32Picks {
  bookmaker: string;
  moneyline: RoundOf32MoneylinePick;
  total?: RoundOf32TotalPick;
  btts?: RoundOf32MarketPick;
  doubleChance?: RoundOf32MarketPick;
  drawNoBet?: RoundOf32MarketPick;
  saferMarket?: RoundOf32NamedMarketPick;
  valueMarket?: RoundOf32NamedMarketPick;
}
export interface RoundOf32Game {
  eventId: string;
  home: string;
  away: string;
  kickoffUtc: string;
  kickoffEt: string;
  matchDate: string;
  homeCode: string | null;
  awayCode: string | null;
  gameSlug: string;
  status: RoundOf32Status;
  confidence: RoundOf32Confidence;
  note: string | null;
  picks: RoundOf32Picks | null;
}
export interface RoundOf32Board {
  generatedAt: string;
  sport: string;
  stage: string;
  horizonEt: string;
  slateLabel: string;
  disclaimer: string;
  gameCount: number;
  byStatus: Record<string, number>;
  games: RoundOf32Game[];
}

/** Read the Round-of-32 board artifact. Pure, server-side, fail-closed (null when absent/malformed). */
export function loadRoundOf32Board(root?: string): RoundOf32Board | null {
  const base = root ?? path.join(process.cwd(), "public", "data");
  const file = path.join(base, "world-cup", "round-of-32", "board.json");
  try {
    const raw = fs.readFileSync(file, "utf8");
    const board = JSON.parse(raw) as RoundOf32Board;
    if (!board || !Array.isArray(board.games)) return null;
    return board;
  } catch {
    return null;
  }
}

/** Group games into matchDate buckets, preserving artifact (kickoff) order within each date. */
export function groupRoundOf32ByDate(board: RoundOf32Board): Array<{ date: string; games: RoundOf32Game[] }> {
  const order: string[] = [];
  const byDate = new Map<string, RoundOf32Game[]>();
  for (const g of board.games) {
    const d = g.matchDate || "TBD";
    if (!byDate.has(d)) {
      byDate.set(d, []);
      order.push(d);
    }
    byDate.get(d)!.push(g);
  }
  return order.map((date) => ({ date, games: byDate.get(date)! }));
}

/** Friendly "Mon Jun 29" date sub-header from the matchDate (YYYY-MM-DD). Falls back to the raw value. */
export function formatRoundOf32DateHeader(matchDate: string): string {
  try {
    const d = new Date(`${matchDate}T12:00:00Z`);
    return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  } catch {
    return matchDate;
  }
}

/** Win % (0–100) for the moneyline pick, rounded. Null when no live pick. */
export function winPercent(g: RoundOf32Game): number | null {
  const p = g.picks?.moneyline?.modelProbability;
  return typeof p === "number" ? Math.round(p * 100) : null;
}

export type UpsetRisk = "Low" | "Medium" | "High";
/**
 * Upset risk band from the 90-min model favorite's win probability. Derived as 100 − winProb%
 * (the chance the favorite does NOT win in regulation — a draw/loss). Low ≥65% fav, Medium ≥50%,
 * else High. Returns null when no live moneyline pick.
 */
export function upsetRisk(g: RoundOf32Game): { pct: number; label: UpsetRisk } | null {
  const win = winPercent(g);
  if (win == null) return null;
  const pct = 100 - win;
  const label: UpsetRisk = win >= 65 ? "Low" : win >= 50 ? "Medium" : "High";
  return { pct, label };
}

/**
 * One-line expected game script, derived ONLY from the artifact's total + BTTS + moneyline picks:
 *   • high total (Over) + BTTS Yes  → open, goals expected
 *   • low total (Under) + BTTS No   → cautious, low-scoring
 *   • near coin-flip moneyline      → tight, extra-time live
 *   • otherwise                     → a measured fallback from whatever is present.
 * Returns null when there is no live pick to derive from.
 */
export function expectedGameScript(g: RoundOf32Game): string | null {
  const picks = g.picks;
  if (!picks) return null;
  const ml = picks.moneyline;
  const totalPick = (picks.total?.pick ?? "").toLowerCase();
  const bttsPick = (picks.btts?.pick ?? "").toLowerCase();
  const isOver = totalPick.includes("over");
  const isUnder = totalPick.includes("under");
  const bttsYes = bttsPick.includes("yes");
  const bttsNo = bttsPick.includes("no");
  const win = typeof ml?.modelProbability === "number" ? ml.modelProbability : null;

  if (isOver && bttsYes) return "Open game — goals expected from both sides.";
  if (isUnder && bttsNo) return "Cautious, low-scoring — one side likely kept quiet.";
  if (win != null && win < 0.48) return "Tight matchup — extra time / penalties live.";
  if (isUnder) return "Lean low-scoring — fewer goals than a typical group game.";
  if (isOver) return "Goals on the cards — value tilts to the Over.";
  if (g.confidence === "Coin-flip") return "Tight matchup — extra time / penalties live.";
  return "Favorite controls but no blowout signal in the prices.";
}

/** Format an American price with an explicit +/- sign. Returns "—" for null/undefined. */
export function formatAmericanOdds(odds: number | null | undefined): string {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** Probability (0–1) → "NN%". Returns "—" for null/undefined. */
export function formatProbability(p: number | null | undefined): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}%`;
}
