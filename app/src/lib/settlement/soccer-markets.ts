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

/** Official match result. `homeGoals`/`awayGoals` are the 90-MINUTE (regulation) score — for a knockout
 *  game this is `score.fulltime`, NOT the post-extra-time aggregate — so 90' markets grade on it. */
export interface OfficialMatch {
  matchId: number | string;
  match: string;          // "Home vs Away"
  homeGoals: number;      // 90-minute (regulation) goals
  awayGoals: number;      // 90-minute (regulation) goals
  status: string;         // "FT" | "AET" | "PEN" are 90'-final; "1H" | "HT" | ... pend (see is90MinuteFinal)
  advanceWinner?: string | null; // team that advanced (incl. via penalties) — for advancement markets
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

// ── Knockout (extra time / penalties) settlement policy ───────────────────────────────────────────
// Soccer markets here settle on the 90-MINUTE (regulation) result. A World Cup knockout game can finish
// level after 90' and be decided in extra time (status "AET") or on penalties (status "PEN"). The 90'
// score is STILL official and known in those cases (the bundle carries it as homeGoals/awayGoals =
// score.fulltime), so:
//   • 90-minute TEAM markets (moneyline_90 · double_chance · draw_no_bet · btts · match_total_goals)
//     settle on the 90' score for FT, AET and PEN alike — PEN/AET no longer blocks team settlement.
//   • An ADVANCEMENT / outright market would settle on who advanced (incl. via penalties); none of the
//     products here carry one today, so it is documented but not graded.
//   • PLAYER props are different: the official box score (API-Football /fixtures/players) is a FULL-MATCH
//     aggregate that INCLUDES extra time, so there is no clean 90' player line. On AET/PEN games we PEND
//     player props rather than guess — with ONE exception that is certain by arithmetic: an over/anytime
//     prop whose full-match count is already at/below the line LOSES (the 90' count can only be ≤ the
//     full-match count, so it cannot have hit in regulation). We never settle a player prop as a WIN off
//     an ET-inclusive number. A clean regulation finish ("FT") means full match == 90', so we grade
//     player props directly.
const STATUS_90_FINAL = new Set(["FT", "AET", "PEN"]);
const STATUS_REGULATION = new Set(["FT"]);
/** The 90-minute result is final & official — a regulation finish (FT) or a knockout decided in extra
 *  time (AET) or penalties (PEN). 90-minute team markets settle on the 90' score for all three. */
export function is90MinuteFinal(status: string): boolean { return STATUS_90_FINAL.has(String(status).toUpperCase().trim()); }
/** A clean regulation finish (no extra time played) — the only case where a FULL-MATCH player box score
 *  equals the 90-minute line, so player props grade directly off the official stat. */
export function isRegulationOnly(status: string): boolean { return STATUS_REGULATION.has(String(status).toUpperCase().trim()); }

/** Match total goals over/under (90'): total = home+away vs the line; exactly on the line pushes (void). */
export function gradeMatchTotalGoals(side: "over" | "under", homeGoals: number, awayGoals: number, line: number): LegResult {
  return gradeOverUnder(side, homeGoals + awayGoals, line, true);
}

/** Both teams to score (90'): "yes" wins when both >0; "no" wins when at least one is 0. */
export function gradeBothTeamsToScore(side: "yes" | "no", homeGoals: number, awayGoals: number): LegResult {
  const both = homeGoals > 0 && awayGoals > 0;
  return side === "yes" ? (both ? "won" : "lost") : (both ? "lost" : "won");
}

/**
 * Double chance (90'): the selection covers TWO of the three outcomes, parsed from the human text:
 *   "<Team> or Draw" / "Draw or <Team>"  → that team wins OR draw (1X if home, X2 if away)
 *   "<Team1> or <Team2>"                 → either team wins, i.e. NOT a draw (12)
 * `homeName`/`awayName` come from the official "Home vs Away" string so we can resolve which side the
 * selection covers. Never voids on a result — DC always settles win/lost at FT.
 */
export function gradeDoubleChance(selection: string, homeName: string, awayName: string, homeGoals: number, awayGoals: number): LegResult {
  const parts = String(selection).split(/\bor\b/i).map((p) => norm(p)).filter(Boolean);
  const home = norm(homeName), away = norm(awayName);
  const covered = (team: string) => !!team && parts.some((p) => p === team || p.includes(team) || team.includes(p));
  const coversDraw = parts.some((p) => p.includes("draw"));
  const coversHome = covered(home);
  const coversAway = covered(away);
  if (homeGoals === awayGoals) return coversDraw ? "won" : "lost";
  if (homeGoals > awayGoals) return coversHome ? "won" : "lost";
  return coversAway ? "won" : "lost";
}

/**
 * Draw no bet (90'): a draw is a PUSH (void → stake refunded, leg drops from the parlay). Otherwise the
 * picked team must win. The picked team is parsed from the selection text (the "draw no bet" suffix is
 * stripped) against the official home/away names. Returns "pending" only if the team can't be resolved.
 */
export function gradeDrawNoBet(selection: string, homeName: string, awayName: string, homeGoals: number, awayGoals: number): LegResult | "pending" {
  if (homeGoals === awayGoals) return "void"; // push
  const sel = norm(String(selection).replace(/draw\s*no\s*bet/ig, ""));
  const home = norm(homeName), away = norm(awayName);
  const pickedHome = !!home && (sel.includes(home) || home.includes(sel));
  const pickedAway = !!away && (sel.includes(away) || away.includes(sel));
  const homeWon = homeGoals > awayGoals;
  if (pickedHome && !pickedAway) return homeWon ? "won" : "lost";
  if (pickedAway && !pickedHome) return homeWon ? "lost" : "won";
  return "pending"; // could not confidently resolve the picked team
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
  const teamMarket = leg.market === "moneyline_90" || leg.market === "match_total_goals" || leg.market === "btts"
    || leg.market === "double_chance" || leg.market === "draw_no_bet";

  if (teamMarket) {
    if (!m) return { leg, result: "pending", reason: `no official match for id ${leg.matchId}` };
    // 90-minute team markets settle on the 90' score (homeGoals/awayGoals = score.fulltime) whenever the
    // 90' result is final — FT, or a knockout decided in extra time (AET) / penalties (PEN). Only a match
    // that has NOT reached a final 90' result pends.
    if (!is90MinuteFinal(m.status)) return { leg, result: "pending", reason: `match ${m.match} 90' result not final (${m.status})` };
    const score = `${m.homeGoals}-${m.awayGoals}`;
    const [homeName, awayName] = String(m.match).split(/\s+vs\s+/i);
    if (leg.market === "double_chance") {
      const r = gradeDoubleChance(leg.selection, homeName ?? "", awayName ?? "", m.homeGoals, m.awayGoals);
      return { leg, result: r, reason: `${m.match} ${score} · ${leg.selection} → ${r}` };
    }
    if (leg.market === "draw_no_bet") {
      const r = gradeDrawNoBet(leg.selection, homeName ?? "", awayName ?? "", m.homeGoals, m.awayGoals);
      return { leg, result: r, reason: `${m.match} ${score} · ${leg.selection} → ${r}` };
    }
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

  // ── Player markets ────────────────────────────────────────────────────────────────────────────
  // Player props grade off the official box score, a FULL-MATCH aggregate (includes extra time). On a
  // clean regulation finish ("FT") that line IS the 90' line → grade directly. On a knockout that went
  // beyond 90' (AET/PEN) there is no clean 90' line, so we PEND — except a count already at/below the
  // line, which is a CERTAIN loss (90' count ≤ full-match count, so the over cannot have hit in 90').
  if (!leg.player) return { leg, result: "pending", reason: "player market missing player name" };
  const line = findPlayer(official, leg.player, leg.matchId);
  const beyond90 = !!m && !isRegulationOnly(m.status); // AET/PEN (or any non-FT final) ⇒ ET-inclusive stats

  if (leg.market === "player_goal_scorer_anytime") {
    if (!line || typeof line.goals !== "number") return { leg, result: "pending", reason: `no official line for ${leg.player}` };
    if (beyond90) {
      if (line.goals === 0) return { leg, result: "lost", reason: `${leg.player} 0 goals (beyond 90', ${m!.status}) → lost (no regulation goal)` };
      return { leg, result: "pending", reason: `${leg.player} ${line.goals} goal(s) — ${m!.match} beyond 90' (${m!.status}); goal may be in extra time` };
    }
    const r = gradeAnytimeGoalscorer(line);
    return { leg, result: r, reason: `${leg.player} ${line.goals} goal(s) · ${r}` };
  }

  // Over/under COUNT props — assists, shots (total) and shots on target share one grading path.
  const count = leg.market === "player_assists" ? { label: "assist(s)", value: line?.assists }
    : leg.market === "player_shots" ? { label: "shot(s)", value: line?.shots }
    : leg.market === "player_shots_on_target" ? { label: "SOT", value: line?.shotsOnTarget }
    : null;
  if (count) {
    if (!line || typeof count.value !== "number") return { leg, result: "pending", reason: `no official ${count.label} for ${leg.player}` };
    const point = leg.point ?? 0.5;
    const value = count.value;
    if (beyond90) {
      const isOver = leg.side !== "under";
      if (isOver && value <= point) return { leg, result: "lost", reason: `${leg.player} ${value} ${count.label} ≤ ${point} (beyond 90', ${m!.status}) → lost (cannot reach in regulation)` };
      return { leg, result: "pending", reason: `${leg.player} ${value} ${count.label} — ${m!.match} beyond 90' (${m!.status}); no clean 90' line` };
    }
    const r = gradeOverUnder(leg.side === "under" ? "under" : "over", value, point, true);
    return { leg, result: r, reason: `${leg.player} ${value} ${count.label} vs ${point} · ${r}` };
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
