/**
 * MLB settlement engine — the PURE grader that settles Homer Nukes picks and Diamond Specials cards
 * from OFFICIAL box scores (MLB Stats API). No I/O and NO money mutation: it returns graded results +
 * aggregate stats; a separate, explicitly operator-run step writes histories, and only an additional
 * gated step ever touches the protected bankroll/exposure (this module never does).
 *
 * Grading is honest: a player with no box-score line (DNP) grades VOID, never a loss; an "Over X.5"
 * market hits when the official stat exceeds the line; a "Yes" market (e.g. anytime HR) hits at ≥ 1.
 */

export interface BoxScoreLine {
  player: string;
  homeRuns?: number; hits?: number; totalBases?: number; rbis?: number; runs?: number;
  strikeouts?: number; outs?: number; earnedRuns?: number;
}

export type LegResult = "hit" | "miss" | "void";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** market key → the box-score stat field it settles against. */
const MARKET_STAT: Record<string, keyof BoxScoreLine> = {
  batter_home_runs: "homeRuns", to_hit_a_home_run: "homeRuns", home_run_anytime: "homeRuns", anytime_home_run: "homeRuns", player_home_runs: "homeRuns",
  batter_hits: "hits", batter_total_bases: "totalBases", batter_rbis: "rbis", batter_runs_scored: "runs",
  pitcher_strikeouts: "strikeouts", pitcher_outs: "outs", pitcher_earned_runs: "earnedRuns",
};

export interface Gradeable { player: string; market: string; selection: string; point?: number | null }

/** Grade one prop against the box score. Returns "void" when the player has no official line (DNP). */
export function gradeProp(g: Gradeable, lines: BoxScoreLine[]): LegResult {
  const stat = MARKET_STAT[g.market];
  if (!stat) return "void";
  const line = lines.find((l) => norm(l.player) === norm(g.player));
  if (!line || typeof line[stat] !== "number") return "void"; // DNP / no official stat → void
  const value = line[stat] as number;
  const sel = (g.selection ?? "").toLowerCase();
  if (sel.includes("under")) return value < (g.point ?? 0) ? "hit" : "miss";
  if (sel.includes("over")) return value > (g.point ?? 0) ? "hit" : "miss";
  // "Yes" / anytime-style markets hit at one or more.
  return value >= 1 ? "hit" : "miss";
}

export interface SettledHomerPick { player: string; result: LegResult }
export interface HomerSettlement { graded: SettledHomerPick[]; hits: number; misses: number; voids: number; accuracy: number | null }

/** Settle a set of Homer Nukes picks (player to hit a HR) from the box score. */
export function settleHomerNukes(picks: Array<{ player: string; market?: string; selection?: string; point?: number | null }>, lines: BoxScoreLine[]): HomerSettlement {
  const graded = picks.map((p) => ({ player: p.player, result: gradeProp({ player: p.player, market: p.market ?? "batter_home_runs", selection: p.selection ?? "Yes", point: p.point ?? null }, lines) }));
  const hits = graded.filter((g) => g.result === "hit").length;
  const misses = graded.filter((g) => g.result === "miss").length;
  const voids = graded.filter((g) => g.result === "void").length;
  const decided = hits + misses;
  return { graded, hits, misses, voids, accuracy: decided > 0 ? Number((hits / decided).toFixed(3)) : null };
}

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const round2 = (n: number) => Number(n.toFixed(2));

export interface SettledCard { id: string; category: string; result: "won" | "lost" | "push"; pnl: number; legResults: LegResult[] }
export interface DiamondSettlement { cards: SettledCard[]; record: { wins: number; losses: number; pushes: number }; pnl: number; staked: number; roi: number | null }

/**
 * Settle Diamond Specials cards. A card WINS only if every non-void leg hits (void legs are dropped,
 * shortening the parlay); all legs void → push. Stake $20/card; P/L from the surviving combined odds.
 */
export function settleDiamondSpecials(cards: Array<{ id: string; category: string; stake?: number; legs: Array<{ player: string; market: string; selection: string; point?: number | null; odds: number }> }>, lines: BoxScoreLine[]): DiamondSettlement {
  const out: SettledCard[] = [];
  let wins = 0, losses = 0, pushes = 0, pnl = 0, staked = 0;
  for (const c of cards) {
    const stake = c.stake ?? 20;
    staked += stake;
    const legResults = c.legs.map((l) => gradeProp(l, lines));
    const nonVoid = legResults.filter((r) => r !== "void");
    let result: SettledCard["result"], cardPnl: number;
    if (nonVoid.length === 0) { result = "push"; cardPnl = 0; pushes++; }       // all legs DNP → push
    else if (nonVoid.some((r) => r === "miss")) { result = "lost"; cardPnl = -stake; losses++; }
    else {                                                                      // every surviving leg hit
      const liveDecimal = c.legs.reduce((d, l, i) => legResults[i] === "hit" ? d * dec(l.odds) : d, 1);
      result = "won"; cardPnl = round2(stake * (liveDecimal - 1)); wins++;
    }
    pnl += cardPnl;
    out.push({ id: c.id, category: c.category, result, pnl: round2(cardPnl), legResults });
  }
  const decided = wins + losses;
  return { cards: out, record: { wins, losses, pushes }, pnl: round2(pnl), staked: round2(staked), roi: staked > 0 ? round2(pnl / staked) : null };
}
