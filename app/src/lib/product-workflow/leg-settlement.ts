/**
 * LEG SETTLEMENT (extended coverage) — PURE grading for paper-card legs beyond MLB team markets:
 *   • MLB player props — graded from a committed `settled_leans.jsonl` row's official `actual` via the
 *     canonical over/under rule (side-correct — never blindly reuse the row's own lean outcome).
 *   • Soccer — graded from a committed World-Cup settlement `finals[]` FT-regulation score.
 *
 * HONEST BY CONSTRUCTION: nothing is fabricated. A missing/uncommitted final ⇒ `pending`; an ambiguous
 * (>1) or zero player-prop match ⇒ `pending`; a DNP / null actual ⇒ `unavailable`. Pending/unavailable is
 * NEVER a loss. No io, no money, no network. Extensionless imports (tsc TS5097).
 */
import { settleOverUnder } from "../mlb/product-settlement/mlb-markets";
import type { SettlementOutcome, OverUnderSide } from "../mlb/product-settlement/mlb-markets";

// ── MLB player props ────────────────────────────────────────────────────────────────────────────────
export interface SettledLeansRow { gamePk: number; marketKey: string; playerName: string; line: number; actual: number | null; outcome?: string; date?: string }

/**
 * Match a player-prop leg to exactly ONE committed settled_leans row (same gamePk + marketKey + line, and
 * the leg selection contains the row's player name). Returns the row or a reason it can't be settled.
 */
export function matchSettledRow(
  leg: { gamePk?: number; marketKey: string; line?: number; selection: string },
  rows: SettledLeansRow[],
): { row: SettledLeansRow } | { row: null; reason: string } {
  if (leg.gamePk == null) return { row: null, reason: "no gamePk resolved for the leg" };
  const cands = rows.filter(
    (r) => r.gamePk === leg.gamePk && r.marketKey === leg.marketKey && r.line === leg.line && typeof r.playerName === "string" && leg.selection.includes(r.playerName),
  );
  if (cands.length === 1) return { row: cands[0] };
  if (cands.length === 0) return { row: null, reason: "no committed settled_leans row (date not settled / no match)" };
  return { row: null, reason: `ambiguous match (${cands.length} rows) — refusing to guess` };
}

/** Grade a player-prop leg from a matched row's official actual (side-correct canonical over/under). */
export function settlePlayerPropFromRow(side: OverUnderSide, line: number | undefined, row: SettledLeansRow): SettlementOutcome {
  if (row.actual == null) return { status: "unavailable", reason: "player did not record the stat (DNP / null actual)" };
  return settleOverUnder(row.actual, side, line);
}

// ── Soccer (committed WC FT finals) ───────────────────────────────────────────────────────────────────
export interface WcFinal { match?: string; home?: string; away?: string; homeGoals: number; awayGoals: number; status?: string }

const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const normalizeTeam = (s: string): string => stripAccents(String(s ?? "")).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Parse "France vs Morocco" (or "France v Morocco") → { home, away } normalized. */
export function teamsFromEvent(event: string): { home: string; away: string } | null {
  const m = String(event ?? "").split(/\s+(?:vs?\.?|@)\s+/i);
  if (m.length !== 2) return null;
  return { home: normalizeTeam(m[0]), away: normalizeTeam(m[1]) };
}

/**
 * Find the committed FT final for a soccer leg's event, oriented to the EVENT's home/away (so a
 * `homeOrDraw` side always refers to the event's home team). Returns oriented goals or null.
 */
export function matchWcFinal(event: string, finals: WcFinal[]): { home: number; away: number; status?: string } | null {
  const t = teamsFromEvent(event);
  if (!t) return null;
  for (const f of finals) {
    const fh = normalizeTeam(f.home ?? (f.match ?? "").split(/\s+vs?\.?\s+/i)[0] ?? "");
    const fa = normalizeTeam(f.away ?? (f.match ?? "").split(/\s+vs?\.?\s+/i)[1] ?? "");
    if (fh === t.home && fa === t.away) return { home: f.homeGoals, away: f.awayGoals, status: f.status };
    if (fh === t.away && fa === t.home) return { home: f.awayGoals, away: f.homeGoals, status: f.status }; // swap to event orientation
  }
  return null;
}

const FT = (status?: string): boolean => status === "FT" || status === "AET" || status === "PEN" || status == null;

/** Grade a soccer leg from an FT-regulation score (event-oriented home/away). Non-FT ⇒ pending. */
export function settleSoccerLeg(
  marketKey: string,
  side: string | undefined,
  line: number | undefined,
  final: { home: number; away: number; status?: string } | null,
): SettlementOutcome {
  if (!final) return { status: "pending", reason: "no committed FT final for this match" };
  if (!FT(final.status)) return { status: "pending", reason: `match not final (status ${final.status})` };
  const { home: h, away: a } = final;
  const result = h > a ? "home" : h < a ? "away" : "draw";
  const win = (cond: boolean): SettlementOutcome => ({ status: cond ? "win" : "loss", actual: h + a, reason: `FT ${h}-${a}` });
  switch (marketKey) {
    case "moneyline_90":
    case "match_result":
      return win(side === result);
    case "double_chance":
      if (side === "homeOrDraw") return win(result !== "away");
      if (side === "awayOrDraw") return win(result !== "home");
      if (side === "homeOrAway") return win(result !== "draw");
      return { status: "pending", reason: `unknown double_chance side ${side}` };
    case "draw_no_bet":
      if (result === "draw") return { status: "push", actual: h + a, reason: `FT ${h}-${a} (draw ⇒ push)` };
      return win(side === result);
    case "match_total_goals":
      return settleOverUnder(h + a, side === "under" ? "under" : "over", line);
    case "btts":
      return win((side === "yes") === (h > 0 && a > 0));
    default:
      return { status: "pending", reason: `soccer market ${marketKey} not wired for paper settlement` };
  }
}
