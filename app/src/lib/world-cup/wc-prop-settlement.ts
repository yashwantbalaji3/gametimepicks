/**
 * World Cup player-prop settlement — PURE, deterministic grading of the exposed props (anytime goalscorer,
 * shots, shots on target, assists) from a finished match's official per-player statistics.
 *
 * Deterministic and honest: given COMPLETE stats it returns an exact win/loss; given a MISSING stat it
 * returns "ungradable" (never guesses, never fabricates a result). This module never touches money — it
 * feeds a SEPARATE paper/model ledger only. Official money / the 19-14 record are out of scope entirely.
 *
 * Settlement policy: WC player props settle on the 90'+ full match (goals/shots/assists over the whole
 * game as reported by the stats provider). No extra-time/penalty special-casing — these are per-player
 * event totals, not a 90'-only team market.
 */
import type { WcPropMarket } from "./wc-player-props";

/** Official per-player statistics from the settlement provider (API-Football fixture player-statistics). */
export interface PlayerMatchStats {
  goals: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  assists: number | null;
}

export interface GradableProp {
  market: WcPropMarket;
  /** "Yes"/"No" for goalscorer/assist-anytime; "Over"/"Under" for shots/SOT/assists lines. */
  pick: string;
  /** Numeric line for Over/Under markets (e.g. 0.5, 1.5); null for Yes/No markets. */
  line: number | null;
}

export type GradeResult = "win" | "loss" | "void" | "ungradable";

export interface GradedProp {
  market: WcPropMarket;
  pick: string;
  line: number | null;
  actual: number | null;
  result: GradeResult;
  reason: string;
}

/** The single per-player stat each market settles against. */
function statFor(market: WcPropMarket, s: PlayerMatchStats): number | null {
  switch (market) {
    case "player_goal_scorer_anytime": return s.goals;
    case "player_shots": return s.shots;
    case "player_shots_on_target": return s.shotsOnTarget;
    case "player_assists": return s.assists;
  }
}

/** Grade an Over/Under numeric line. Lines are typically .5 (no push); an exact integer tie voids. */
function gradeOverUnder(actual: number, pick: string, line: number): GradeResult {
  const p = pick.toLowerCase();
  if (actual === line) return "void"; // exact tie on an integer line → push
  const over = actual > line;
  if (p.startsWith("o")) return over ? "win" : "loss";
  if (p.startsWith("u")) return over ? "loss" : "win";
  return "ungradable";
}

/** Grade a Yes/No "did it happen at least once" market from a count (≥1 ⇒ Yes). */
function gradeYesNo(actual: number, pick: string): GradeResult {
  const happened = actual >= 1;
  const p = pick.toLowerCase();
  if (p.startsWith("y")) return happened ? "win" : "loss";
  if (p.startsWith("n")) return happened ? "loss" : "win";
  return "ungradable";
}

/** Deterministically grade one prop against a finished player's stats. Never fabricates. */
export function gradeWcPlayerProp(prop: GradableProp, stats: PlayerMatchStats): GradedProp {
  const actual = statFor(prop.market, stats);
  const base = { market: prop.market, pick: prop.pick, line: prop.line, actual };
  if (actual == null) {
    return { ...base, result: "ungradable", reason: "official per-player stat unavailable for this market" };
  }
  // Goalscorer + assist markets are Yes/No when there's no numeric line; Over/Under when a line is present.
  if (prop.line == null) {
    return { ...base, result: gradeYesNo(actual, prop.pick), reason: `${actual} vs Yes/No (${prop.pick})` };
  }
  return { ...base, result: gradeOverUnder(actual, prop.pick, prop.line), reason: `${actual} vs ${prop.pick} ${prop.line}` };
}

/** Which markets grade DETERMINISTICALLY given complete stats (all four do — used for the coverage flip). */
export const DETERMINISTIC_MARKETS: WcPropMarket[] = [
  "player_goal_scorer_anytime",
  "player_shots_on_target",
  "player_shots",
  "player_assists",
];

// ── Separate paper/model ledger (NEVER official money / never the 19-14 record) ─────────────────
export interface SettlementLedgerRow extends GradedProp {
  player: string;
  fixture: string;
}
export interface SettlementLedger {
  fixture: string;
  /** Always paper/model — this ledger is fully separate from portfolio.json and the official record. */
  scope: "paper_model_only";
  source: "api_football";
  rows: SettlementLedgerRow[];
  summary: { win: number; loss: number; void: number; ungradable: number; graded: number };
}

/** normalize a name for the stats-lookup join (accent-strip + lowercase). */
export function normName(s: string): string {
  return (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Pure: grade a finished fixture's props into a separate paper/model ledger. `statsByPlayer` is keyed by
 * normalized player name. A prop whose player has no stats row grades "ungradable" (never guessed).
 */
export function buildPropSettlementLedger(
  fixture: string,
  props: Array<GradableProp & { player: string }>,
  statsByPlayer: Record<string, PlayerMatchStats>,
): SettlementLedger {
  const rows: SettlementLedgerRow[] = props.map((p) => {
    const stats = statsByPlayer[normName(p.player)] ?? { goals: null, shots: null, shotsOnTarget: null, assists: null };
    const graded = gradeWcPlayerProp(p, stats);
    return { ...graded, player: p.player, fixture };
  });
  const summary = { win: 0, loss: 0, void: 0, ungradable: 0, graded: 0 };
  for (const r of rows) {
    summary[r.result] += 1;
    if (r.result !== "ungradable") summary.graded += 1;
  }
  return { fixture, scope: "paper_model_only", source: "api_football", rows, summary };
}
