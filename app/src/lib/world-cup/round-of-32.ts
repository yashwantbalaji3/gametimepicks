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
import { americanToDecimal, decimalToAmerican } from "@/lib/odds-math";
import { confidenceLabel, volatilityLabel, type Confidence, type Volatility } from "@/lib/world-cup/wc-editorial";

export type RoundOf32Status = "live_odds" | "started" | "completed" | "odds_pending";

// 90' + halftime + stoppage + a buffer for extra time / penalties — past this, a knockout fixture is over.
const GAME_LENGTH_MS = 2.5 * 60 * 60 * 1000;

/**
 * Effective status from the fixture's KICKOFF vs build time — never from a fabricated score. A fixture
 * whose kickoff is well in the past reads "completed" (awaiting official settlement); one that just kicked
 * off reads "started" (picks frozen); a future fixture keeps the artifact's own status (live_odds /
 * odds_pending). This stops finished knockout games from being presented as live, bettable picks.
 */
export function effectiveRoundOf32Status(g: RoundOf32Game, nowMs: number): RoundOf32Status {
  const ko = Date.parse(g.kickoffUtc);
  if (Number.isFinite(ko) && ko <= nowMs) return nowMs - ko >= GAME_LENGTH_MS ? "completed" : "started";
  return g.status; // future fixture keeps its artifact status
}
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
  /** Tournament stage code from the schedule (r32/r16/qf/…). Optional — older artifacts omit it. */
  stage?: string | null;
}

/** Friendly tournament-stage label from a schedule stage code. Falls back to the raw code, never blank. */
const STAGE_LABELS: Record<string, string> = {
  group: "Group Stage", r32: "Round of 32", r16: "Round of 16",
  qf: "Quarter-finals", sf: "Semi-finals", third: "Third-place Play-off", final: "Final",
};
export function stageLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return STAGE_LABELS[code] ?? code.toUpperCase();
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
    // Derive each game's effective status from kickoff vs build time so finished knockout games read
    // "completed — awaiting settlement" instead of "live odds" (the artifact is generated pre-event and
    // never re-stamps a started/finished fixture). Pure time-based; no fabricated scores.
    const nowMs = Date.now();
    board.games = board.games.map((g) => ({ ...g, status: effectiveRoundOf32Status(g, nowMs) }));
    board.byStatus = board.games.reduce<Record<string, number>>((acc, g) => {
      acc[g.status] = (acc[g.status] ?? 0) + 1;
      return acc;
    }, {});
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

// ─────────────────────────── Model-implied score lean (derived, never fabricated) ───────────────────────────
export type ScoreLeanConfidence = "High" | "Medium" | "Low";
export interface ScoreLean {
  available: boolean;
  scoreLean: string | null;   // "France 2–0 Sweden" or "1–1 draw lean"
  homeGoals: number | null;
  awayGoals: number | null;
  confidence: ScoreLeanConfidence;
  explanation: string;
  note?: string;              // shown when totals are missing ("Score lean limited — totals market unavailable.")
}

/**
 * A MODEL-IMPLIED score lean — NOT a guaranteed prediction. Derived ONLY from the board's real market
 * picks (3-way moneyline probabilities, the totals line + over/under lean, and the BTTS pick) — never
 * fabricated. Total goals come from the totals line nudged to the leaned side; the winner is the moneyline
 * favourite (or a draw scoreline when the draw is the most likely 3-way outcome / the price is near a
 * coin-flip); BTTS No keeps the underdog off the scoresheet. When the totals market is absent we return a
 * directional read with an explicit "score lean limited" note rather than inventing a scoreline.
 */
export function deriveScoreLean(g: RoundOf32Game): ScoreLean {
  const p = g.picks;
  const ml = p?.moneyline;
  if (!ml) {
    return { available: false, scoreLean: null, homeGoals: null, awayGoals: null, confidence: "Low",
      explanation: "No live moneyline — score lean unavailable.", note: "Score lean unavailable — no live pick yet." };
  }
  const favHome = ml.side === "home";
  const favProb = favHome ? ml.home : ml.away;
  // Draw-leaning: the draw is the most likely of the three 90' outcomes, or the favourite is near a coin-flip.
  const drawLean = (ml.draw >= ml.home && ml.draw >= ml.away) || favProb < 0.45;
  const total = p?.total;
  if (!total || typeof total.line !== "number") {
    return { available: false, scoreLean: null, homeGoals: null, awayGoals: null,
      confidence: drawLean ? "Low" : favProb >= 0.65 ? "Medium" : "Low",
      explanation: drawLean ? "Tight matchup — high draw / extra-time risk." : "Favourite leans to control, but no total to size the scoreline.",
      note: "Score lean limited — totals market unavailable." };
  }
  const under = /under/i.test(total.pick ?? "");
  // Total goals from the line, nudged to the leaned side: Under L.5 ⇒ ⌈L⌉−2, Over L.5 ⇒ ⌈L⌉. Clamped 0..6.
  const expectedTotal = Math.max(0, Math.min(6, under ? Math.ceil(total.line) - 2 : Math.ceil(total.line)));
  const bttsNo = /no/i.test(p?.btts?.pick ?? "");
  const bttsYes = /yes/i.test(p?.btts?.pick ?? "");
  let homeGoals: number, awayGoals: number;
  if (drawLean) {
    // Even split for a draw scoreline; a BTTS-Yes lean keeps it off 0–0 (both teams found to score).
    const each = Math.max(bttsYes ? 1 : 0, Math.floor(expectedTotal / 2));
    homeGoals = each; awayGoals = each;                 // 1–1 (total 2–3 / BTTS Yes), 0–0 (total 0–1)
  } else {
    const loser = bttsNo ? 0 : expectedTotal >= 2 ? 1 : 0;
    const winner = Math.max(loser, expectedTotal - loser);
    homeGoals = favHome ? winner : loser;
    awayGoals = favHome ? loser : winner;
  }
  const totalsProb = typeof total.modelProbability === "number" ? total.modelProbability : 0.5;
  const confidence: ScoreLeanConfidence =
    drawLean || favProb < 0.5 ? "Low" : favProb >= 0.65 && totalsProb >= 0.58 ? "High" : "Medium";
  const bits: string[] = [];
  if (drawLean) bits.push("high draw / extra-time risk");
  else if (favProb >= 0.65) bits.push("favourite control");
  else bits.push("slight favourite");
  bits.push(under ? "low-scoring lean" : "goals expected");
  if (bttsNo) bits.push("BTTS No"); else if (bttsYes) bits.push("both teams to score");
  const scoreLean = drawLean
    ? `${homeGoals}–${awayGoals} draw lean`
    : `${g.home} ${homeGoals}–${awayGoals} ${g.away}`;
  return { available: true, scoreLean, homeGoals, awayGoals, confidence, explanation: bits.join(" · ") };
}

// ─────────────────────────── Knockout Risk Score (derived) ───────────────────────────
export type KnockoutRisk = "Low" | "Medium" | "High";
/**
 * Knockout Risk — how likely the favourite is to be held level at 90' and dragged to extra time / penalties
 * (the exact Germany & Netherlands trap on 2026-06-29: both drew 1–1 and went out on penalties). Derived
 * ONLY from real market signals: the 90' draw probability, a tight moneyline, and a low-scoring (Under +
 * BTTS No) profile. Returns null when there is no live moneyline to read.
 */
export function knockoutRisk(g: RoundOf32Game): { label: KnockoutRisk; reason: string } | null {
  const ml = g.picks?.moneyline;
  if (!ml) return null;
  const favProb = ml.side === "home" ? ml.home : ml.away;
  const draw = ml.draw;
  const under = /under/i.test(g.picks?.total?.pick ?? "");
  const bttsNo = /no/i.test(g.picks?.btts?.pick ?? "");
  let score = 0;
  if (draw >= 0.26) score += 2; else if (draw >= 0.2) score += 1;
  if (favProb < 0.55) score += 2; else if (favProb < 0.65) score += 1;
  if (under) score += 1;
  if (bttsNo) score += 1;
  const label: KnockoutRisk = score >= 4 ? "High" : score >= 2 ? "Medium" : "Low";
  const reasons = [
    draw >= 0.2 ? `${Math.round(draw * 100)}% draw chance at 90'` : null,
    favProb < 0.65 ? "tight moneyline" : null,
    under && bttsNo ? "low-scoring, one-side-quiet profile" : null,
  ].filter(Boolean) as string[];
  return { label, reason: reasons.length ? reasons.join(" · ") : "clear favourite, low draw risk" };
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

// ─────────────────────────── Team-market parlays for FUTURE games ───────────────────────────
/**
 * Same-game TEAM-MARKET parlays for a Round-of-32 board game (future fixtures that have no player
 * props yet). These are built ONLY from the board's own `picks` — moneyline, total goals, BTTS,
 * double chance, draw-no-bet — using each market's MODEL pick verbatim, so legs can never contradict
 * one another (you cannot pair Over with Under or BTTS-Yes with BTTS-No because each market has a
 * single model pick). Combined prices are COMPUTED from the real leg prices (decimal product →
 * American), never fabricated. A tier that cannot field ≥2 distinct quality markets is emitted as
 * `{ available: false }` — never padded.
 *
 * Same-game legs are correlated: the combined odds + payout are a MODEL ESTIMATE from multiplying
 * individual prices, and a real book prices correlated same-game legs SHORTER. Every parlay carries
 * that warning verbatim.
 */
export type BoardParlayTier = "Safe" | "Balanced" | "Aggressive";

export interface BoardParlayLeg {
  market: string;
  pick: string;
  americanOdds: number;
}
export interface BoardTeamParlay {
  tier: BoardParlayTier;
  available: true;
  title: string;
  legs: BoardParlayLeg[];
  combinedOdds: number;
  /** Profit on a $10 stake at the combined price, rounded to cents. */
  payout: number;
  confidence: Confidence;
  volatility: Volatility;
  correlationNote: string;
  expectedGameScript: string;
  whyTheseLegs: string;
}
export interface BoardTeamParlayUnavailable {
  tier: BoardParlayTier;
  available: false;
  reason: string;
}
export type BoardTeamParlayResult = BoardTeamParlay | BoardTeamParlayUnavailable;

/** Ultra-juiced floor: a leg priced <= this is near-certain filler that barely moves a slip. */
const BOARD_JUICE_FLOOR = -700;

const CORRELATION_NOTE =
  "MODEL ESTIMATE from multiplying individual prices — a real book prices correlated same-game legs SHORTER.";

/** Combined American odds + decimal from a set of leg prices. Null when any price is missing/zero. */
function combinedBoardOdds(legs: BoardParlayLeg[]): { american: number; decimal: number } | null {
  if (legs.length === 0) return null;
  let decimal = 1;
  for (const l of legs) {
    if (typeof l.americanOdds !== "number" || !Number.isFinite(l.americanOdds) || l.americanOdds === 0) return null;
    decimal *= americanToDecimal(l.americanOdds);
  }
  return { american: decimalToAmerican(decimal), decimal };
}

/** Joint model probability (independence-assumed) across a set of board picks — for the confidence label. */
function jointProb(ps: Array<number | undefined | null>): number {
  let p = 1;
  for (const x of ps) {
    if (typeof x !== "number" || x <= 0) return 0;
    p *= x;
  }
  return p;
}

/** A board market pick → a parlay leg, or null when the pick / its price is missing. */
function legFrom(
  market: string,
  pick: { pick: string; americanOdds: number; modelProbability: number } | undefined,
): { leg: BoardParlayLeg; modelProbability: number } | null {
  if (!pick || typeof pick.americanOdds !== "number" || !Number.isFinite(pick.americanOdds) || pick.americanOdds === 0) {
    return null;
  }
  return { leg: { market, pick: pick.pick, americanOdds: pick.americanOdds }, modelProbability: pick.modelProbability };
}

/**
 * Build up to three team-market parlays (Safe / Balanced / Aggressive) for one board game from its
 * `picks`. Returns one result per tier, each either a real parlay or an honest `{ available:false }`.
 * Empty array when the game has no live picks at all.
 */
export function buildBoardTeamParlays(game: RoundOf32Game): BoardTeamParlayResult[] {
  const picks = game.picks;
  if (!picks || !picks.moneyline) return [];

  const ml = legFrom("Full-Time Moneyline", picks.moneyline);
  const total = legFrom("Total Goals", picks.total);
  const btts = legFrom("BTTS", picks.btts);
  const dc = legFrom("Double Chance", picks.doubleChance);

  const script = expectedGameScript(game) ?? "Favorite controls but no blowout signal in the prices.";
  const noQuality = (tier: BoardParlayTier): BoardTeamParlayUnavailable => ({
    tier,
    available: false,
    reason: "No quality parlay available yet",
  });

  /** Assemble a tier from candidate legs: drop juiced (<= -700) NON-anchor legs, dedupe by market,
   *  require ≥2 distinct markets, then compute the real combined price. */
  const assemble = (
    tier: BoardParlayTier,
    title: string,
    why: string,
    candidates: Array<{ leg: BoardParlayLeg; modelProbability: number } | null>,
  ): BoardTeamParlayResult => {
    const seen = new Set<string>();
    const kept: Array<{ leg: BoardParlayLeg; modelProbability: number }> = [];
    for (const c of candidates) {
      if (!c) continue;
      if (c.leg.americanOdds <= BOARD_JUICE_FLOOR) continue; // ultra-juiced filler — drop
      if (seen.has(c.leg.market)) continue; // never two legs from the same market
      seen.add(c.leg.market);
      kept.push(c);
    }
    if (kept.length < 2) return noQuality(tier);
    const legs = kept.map((k) => k.leg);
    const combined = combinedBoardOdds(legs);
    if (!combined) return noQuality(tier);
    const joint = jointProb(kept.map((k) => k.modelProbability));
    return {
      tier,
      available: true,
      title,
      legs,
      combinedOdds: combined.american,
      payout: Math.round((combined.decimal - 1) * 10 * 100) / 100,
      confidence: confidenceLabel(joint),
      volatility: volatilityLabel(combined.american),
      correlationNote: CORRELATION_NOTE,
      expectedGameScript: script,
      whyTheseLegs: why,
    };
  };

  // SAFE — lowest-variance markets that AGREE with the model: favorite double-chance (only when its
  // price clears the juice floor, i.e. odds > -700), the model's total pick, and the model's BTTS pick.
  // Each leg is the market's own model pick, so the legs can never contradict.
  const safe = assemble(
    "Safe",
    "Safe — lowest-variance lean",
    "The favorite avoids defeat (double chance) alongside the model's own total and BTTS picks — the lowest-variance, same-direction legs the board already favors.",
    [dc, total, btts],
  );

  // BALANCED — moneyline favorite + the model's total pick.
  const balanced = assemble(
    "Balanced",
    "Balanced — favorite + total",
    "The model's moneyline favorite paired with its total-goals pick — a moderate combo pointed the same way as the expected game script.",
    [ml, total],
  );

  // AGGRESSIVE — moneyline favorite + total pick + BTTS pick (whatever the model actually picked).
  const aggressive = assemble(
    "Aggressive",
    "Aggressive — favorite + total + BTTS",
    "The moneyline favorite stacked with the model's total and BTTS picks for a longer same-game price — higher variance because every leg has to land.",
    [ml, total, btts],
  );

  return [safe, balanced, aggressive];
}
