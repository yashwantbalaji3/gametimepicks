/**
 * Unified soccer settlement — the single grading framework every soccer product settles through
 * (Bank Builder lanes, Mr. Dub daily portfolio, World Cup Specials, WC parlay cards). It is PURE and
 * deterministic: the caller supplies the OFFICIAL results bundle (90' regulation match scores + official
 * player box-score lines) and these functions apply the documented rule. It NEVER fetches, fabricates, or
 * touches a bankroll — grading and money are separate steps, and money only moves via an explicit, gated,
 * operator-approved write elsewhere.
 *
 * Builds on `lib/parlays/leg-settlement.ts` (moneyline / draw-no-bet / over-under / parlay) and adds the
 * remaining World Cup markets: match total goals, both-teams-to-score, and anytime goalscorer.
 *
 * Soccer convention: 90-minute regulation only (no extra time / penalties). A player who did not feature
 * (no official line) voids player-prop legs rather than losing them.
 */
import {
  gradeSoccerMoneyline, gradeOverUnder, gradeParlayStep, type LegResult,
} from "@/lib/parlays/leg-settlement";

export type { LegResult } from "@/lib/parlays/leg-settlement";

/** Official 90' regulation match result. `status` must be "FT" (full time) for a leg to grade live. */
export interface OfficialMatch {
  matchId: number | string;
  match: string;          // "Home vs Away"
  homeGoals: number;
  awayGoals: number;
  status: string;         // "FT" | "1H" | "HT" | ... — only "FT" is settle-eligible
}

/** Official player box-score line. Absent line ⇒ player did not feature ⇒ player-prop legs void. */
export interface OfficialPlayerLine {
  player: string;
  matchId: number | string;
  goals?: number;
  assists?: number;
  shotsOnTarget?: number;
  shots?: number;
  minutes?: number;
}

export interface OfficialResults {
  date: string;
  source: string;         // e.g. "API-Football /fixtures (official FT regulation scores)"
  matches: OfficialMatch[];
  players: OfficialPlayerLine[];
}

/** A leg normalized from any product, ready to grade. `homeTeam` lets team markets resolve home/away. */
export interface GradeableLeg {
  id: string;
  matchId: number | string | null;
  market: string;         // canonical key: moneyline_90 | match_total_goals | btts | player_goal_scorer_anytime | player_assists | player_shots_on_target
  selection: string;      // human selection text, e.g. "Croatia" | "Under 2.5" | "Both teams to score: No" | "Anytime Goalscorer"
  point?: number | null;  // line for over/under markets
  player?: string | null;
  side?: "over" | "under" | "yes" | "no" | "home" | "away" | null; // parsed side where applicable
  oddsAmerican: number;
}

const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Match total goals over/under (90'): total = home+away vs the line; exactly on the line pushes (void). */
export function gradeMatchTotalGoals(side: "over" | "under", homeGoals: number, awayGoals: number, line: number): LegResult {
  return gradeOverUnder(side, homeGoals + awayGoals, line, true);
}

/** Both teams to score (90'): "yes" wins when both >0; "no" wins when at least one is 0. */
export function gradeBothTeamsToScore(side: "yes" | "no", homeGoals: number, awayGoals: number): LegResult {
  const both = homeGoals > 0 && awayGoals > 0;
  return side === "yes" ? (both ? "won" : "lost") : (both ? "lost" : "won");
}

/** Anytime goalscorer: won when the player's official goals ≥ 1; void when the player did not feature. */
export function gradeAnytimeGoalscorer(line: OfficialPlayerLine | null): LegResult {
  if (!line || typeof line.goals !== "number") return "void"; // DNP / no official line
  return line.goals >= 1 ? "won" : "lost";
}

const findMatch = (o: OfficialResults, id: GradeableLeg["matchId"]) =>
  o.matches.find((m) => String(m.matchId) === String(id)) ?? null;

/**
 * Resolve a leg's player to an official line, scoped to the match. Official feeds (API-Football) often
 * abbreviate first names ("I. Perišić" vs "Ivan Perišić"), so after an exact normalized match we fall
 * back to accent-stripped SURNAME + first-initial matching WITHIN the same match (matchId scoping prevents
 * same-surname collisions across games). Returns null when no confident match exists — the caller then
 * voids/pends rather than guessing.
 */
export function findPlayerLine(o: OfficialResults, player: string, matchId: GradeableLeg["matchId"]): OfficialPlayerLine | null {
  const inMatch = o.players.filter((p) => matchId == null || String(p.matchId) === String(matchId));
  const target = norm(player);
  const exact = inMatch.find((p) => norm(p.player) === target);
  if (exact) return exact;
  const tParts = String(player).trim().split(/\s+/);
  const tSur = norm(tParts[tParts.length - 1]);
  const tInit = norm(tParts[0]).charAt(0);
  if (!tSur) return null;
  const matches = inMatch.filter((p) => {
    const pParts = String(p.player ?? "").trim().split(/\s+/);
    const pSur = norm(pParts[pParts.length - 1]);
    const pInit = norm(pParts[0]).charAt(0);
    return pSur === tSur && (tParts.length === 1 || pParts.length === 1 || tInit === pInit);
  });
  return matches.length === 1 ? matches[0] : null; // only a unique surname+initial hit counts
}
const findPlayer = findPlayerLine;

/** The result of grading one leg, with a human-readable reason for the settlement report. */
export interface GradedLeg {
  leg: GradeableLeg;
  result: LegResult | "pending";
  reason: string;
}

/**
 * Grade ONE leg against the official bundle. Returns "pending" (never a guess) when the match is not
 * Full Time or the official inputs needed are absent — the engine refuses to grade without real data.
 */
export function gradeLeg(leg: GradeableLeg, official: OfficialResults): GradedLeg {
  const m = findMatch(official, leg.matchId);
  const teamMarket = leg.market === "moneyline_90" || leg.market === "match_total_goals" || leg.market === "btts";

  if (teamMarket) {
    if (!m) return { leg, result: "pending", reason: `no official match for id ${leg.matchId}` };
    if (m.status !== "FT") return { leg, result: "pending", reason: `match ${m.match} not Full Time (${m.status})` };
    const score = `${m.homeGoals}-${m.awayGoals}`;
    if (leg.market === "moneyline_90") {
      const pickedIsHome = leg.side === "home";
      const r = gradeSoccerMoneyline(pickedIsHome, m.homeGoals, m.awayGoals);
      return { leg, result: r, reason: `${m.match} ${score} · ${leg.selection} → ${r}` };
    }
    if (leg.market === "match_total_goals") {
      const r = gradeMatchTotalGoals(leg.side === "under" ? "under" : "over", m.homeGoals, m.awayGoals, leg.point ?? 2.5);
      return { leg, result: r, reason: `${m.match} ${score} (${m.homeGoals + m.awayGoals} goals) · ${leg.selection} → ${r}` };
    }
    // btts
    const r = gradeBothTeamsToScore(leg.side === "yes" ? "yes" : "no", m.homeGoals, m.awayGoals);
    return { leg, result: r, reason: `${m.match} ${score} · ${leg.selection} → ${r}` };
  }

  // Player markets
  if (!leg.player) return { leg, result: "pending", reason: "player market missing player name" };
  const line = findPlayer(official, leg.player, leg.matchId);
  if (leg.market === "player_goal_scorer_anytime") {
    if (!line) return { leg, result: "pending", reason: `no official line for ${leg.player}` };
    const r = gradeAnytimeGoalscorer(line);
    return { leg, result: r, reason: `${leg.player} ${line.goals ?? 0} goal(s) · ${r}` };
  }
  if (leg.market === "player_assists") {
    if (!line || typeof line.assists !== "number") return { leg, result: "pending", reason: `no official assists for ${leg.player}` };
    const r = gradeOverUnder(leg.side === "under" ? "under" : "over", line.assists, leg.point ?? 0.5, true);
    return { leg, result: r, reason: `${leg.player} ${line.assists} assist(s) vs ${leg.point ?? 0.5} · ${r}` };
  }
  if (leg.market === "player_shots_on_target") {
    if (!line || typeof line.shotsOnTarget !== "number") return { leg, result: "pending", reason: `no official SOT for ${leg.player}` };
    const r = gradeOverUnder(leg.side === "under" ? "under" : "over", line.shotsOnTarget, leg.point ?? 0.5, true);
    return { leg, result: r, reason: `${leg.player} ${line.shotsOnTarget} SOT vs ${leg.point ?? 0.5} · ${r}` };
  }
  return { leg, result: "pending", reason: `unsupported market ${leg.market}` };
}

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

/** Settlement of a whole card/lane: grade every leg, combine into the parlay result, and compute paper
 *  P/L. Returns `pending` (no P/L) if ANY leg is still pending — a card never half-settles. */
export interface SettledCard {
  legs: GradedLeg[];
  result: LegResult | "pending";
  stake: number;
  combinedDecimal: number;   // product of live (non-void) leg decimals
  payout: number;            // stake × combinedDecimal on win; stake back on void; 0 on loss
  paperPnl: number;          // payout − stake
}

export function settleCard(legs: GradeableLeg[], stake: number, official: OfficialResults): SettledCard {
  const graded = legs.map((l) => gradeLeg(l, official));
  if (graded.some((g) => g.result === "pending")) {
    return { legs: graded, result: "pending", stake, combinedDecimal: 0, payout: 0, paperPnl: 0 };
  }
  const results = graded.map((g) => g.result as LegResult);
  const parlay = gradeParlayStep(results);
  // Combined decimal across the live (non-void) legs only — voided legs drop out (stake redistributes).
  const liveDec = graded.filter((g) => g.result !== "void").reduce((d, g) => d * dec(g.leg.oddsAmerican), 1);
  let payout = 0;
  if (parlay === "won") payout = Number((stake * liveDec).toFixed(2));
  else if (parlay === "void") payout = stake; // all legs voided → stake refunded
  return { legs: graded, result: parlay, stake, combinedDecimal: Number(liveDec.toFixed(4)), payout, paperPnl: Number((payout - stake).toFixed(2)) };
}
