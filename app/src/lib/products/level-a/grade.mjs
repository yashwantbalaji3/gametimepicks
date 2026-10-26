/**
 * LEVEL A · FORWARD GRADER. PURE. Grades each entry of the suggestions record (record.mjs) against official finals,
 * through each sport's EXISTING settlement rule — no new grading logic:
 *   MLB      settleMlbMoneyline (mlb/product-settlement/mlb-markets.ts) on the committed linescore
 *   EPL      gradeSoccerLeg match_result (sports/soccer/settlement-contract.mjs) on the EPL lane's official finals
 *   Ligue 1  gradeSoccerLeg match_result on the league's committed finals
 *   NBA      gradeNbaLabLeg moneyline (parlays/nba-lab-grading.mjs → the NBA settlement contract)
 *
 * THREE RULES (release owner 2026-10-23):
 *   PENDING IS NEVER A LOSS. No final, an unjoined result, a quarantined score, an unknown market: pending, and the
 *     entry is graded on a later run.
 *   VOID IS NEVER A LOSS. A leg its contract voids (NBA no-measurement / push) makes the card VOID unless another leg
 *     LOST; a void card is neither a win nor a loss.
 *   THE RECORD IS NEVER REWRITTEN. Grades go to their own append-only file, one row per entry, written once the
 *     entry is final. A later run that would grade an entry differently reports a CONFLICT and changes nothing.
 *     A row's legs are a snapshot at gradedAt: a card already lost on one leg is final at once, so it is written while
 *     its other legs may still be pending. Those legs are not regraded into the row (it is never rewritten); a conflict
 *     is a different CARD result, never a pending leg that has since become final.
 * Card result: any leg lost → LOSS; else any leg pending → PENDING; else any leg void → VOID; else WIN.
 */
import { createHash } from "node:crypto";
import { settleMlbMoneyline } from "../../mlb/product-settlement/mlb-markets.ts";
import { gradeSoccerLeg } from "../../sports/soccer/settlement-contract.mjs";
import { gradeNbaLabLeg } from "../../parlays/nba-lab-grading.mjs";

export const LEVEL_A_GRADE_SCHEMA = "gtp.level-a.grade@1";
export const LEVEL_A_GRADER_VERSION = "level-a-forward-grader@1";
const FINAL = new Set(["win", "loss", "void"]);

/**
 * Grade one leg. `finals` supplies the committed official results:
 *   finals.mlb(leg) → { homeRuns, awayRuns, isFinal } | null
 *   finals.soccer(sport, eventId) → { status, homeGoalsFT, awayGoalsFT } | null
 *   finals.nba(eventId) → the NBA settlement contract's result shape | null
 */
export function gradeLevelALeg(leg, finals) {
  const side = leg?.selection?.code ?? null;
  const out = (result, reason, grader) => ({ sport: leg?.sport ?? null, eventId: leg?.eventId ?? null, side, result, reason, grader });
  if (!side) return out("pending", "no selection on the recorded leg — held, never a loss", null);
  if (leg.sport === "mlb") {
    let s = null;
    try { s = finals?.mlb?.(leg) ?? null; } catch { s = null; }
    const o = settleMlbMoneyline({ homeScore: s?.homeRuns ?? null, awayScore: s?.awayRuns ?? null, selectedTeam: side, gameFinal: s?.isFinal === true });
    return out(o.status === "win" || o.status === "loss" ? o.status : "pending", o.reason ?? o.status, "mlb-moneyline");
  }
  if (leg.sport === "epl" || leg.sport === "ligue-1") {
    let r = null;
    try { r = finals?.soccer?.(leg.sport, leg.eventId) ?? null; } catch { r = null; }
    const g = gradeSoccerLeg({ market: "match_result", side }, r, { competition: leg.sport });
    return out(g.outcome === "WIN" ? "win" : g.outcome === "LOSS" ? "loss" : "pending", g.reason, "soccer-match-result");
  }
  if (leg.sport === "nba") {
    const g = gradeNbaLabLeg({ sport: "nba", eventId: leg.eventId, market: "moneyline", side }, (eventId) => finals?.nba?.(eventId) ?? null);
    return out(FINAL.has(g.result) ? g.result : "pending", g.reason, g.grader);
  }
  return out("pending", `no Level A grader for ${leg.sport} — held, never a loss`, null);
}

/** The card's result from its legs' results. */
export function cardResult(legResults) {
  const rs = legResults.map((l) => l.result);
  if (rs.includes("loss")) return "loss";
  if (rs.includes("pending") || rs.length === 0) return "pending";
  if (rs.includes("void")) return "void";
  return "win";
}

export function gradeEntry(entry, finals) {
  const legs = (entry.legs ?? []).map((l) => gradeLevelALeg(l, finals));
  return { result: cardResult(legs), legs };
}

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * New grade rows for a record, plus conflicts with grades already written. Pure.
 * Only FINAL entries (win/loss/void) produce a row; pending entries wait. Grades already written are never rewritten.
 */
export function gradeRecord({ record, graded = [], finals, gradedAt }) {
  const done = new Map(graded.map((g) => [g.entryId, g]));
  const rows = [], conflicts = [];
  let pending = 0;
  for (const e of record) {
    const g = gradeEntry(e, finals);
    const prev = done.get(e.id);
    if (prev) {
      if (g.result !== "pending" && g.result !== prev.result) conflicts.push({ entryId: e.id, recorded: prev.result, now: g.result, legs: g.legs });
      continue;
    }
    if (g.result === "pending") { pending++; continue; }
    rows.push({
      schema: LEVEL_A_GRADE_SCHEMA, id: sha(`${e.id}|${LEVEL_A_GRADER_VERSION}`), entryId: e.id, productDay: e.productDay, policy: e.policy, tier: e.tier,
      jointProbability: e.jointProbability ?? null, result: g.result, legs: g.legs, graderVersion: LEVEL_A_GRADER_VERSION, gradedAt,
      priced: false, payout: null,
    });
    done.set(e.id, rows.at(-1));
  }
  return { rows, conflicts, pending };
}

/** Guard over the grades file: prefix-preserving, one row per entry, only final results, no payout. */
export function gradeViolations({ beforeText = "", afterText = "", recordIds = null }) {
  const v = [];
  if (!afterText.startsWith(beforeText)) v.push("the grades before this run are not an unchanged prefix of the grades after it");
  const seen = new Set();
  afterText.split("\n").filter((l) => l.trim()).forEach((l, i) => {
    let g; try { g = JSON.parse(l); } catch { v.push(`line ${i + 1}: not JSON`); return; }
    if (g.schema !== LEVEL_A_GRADE_SCHEMA) v.push(`line ${i + 1}: schema`);
    if (seen.has(g.entryId)) v.push(`line ${i + 1}: entry ${g.entryId} graded twice`);
    seen.add(g.entryId);
    if (!FINAL.has(g.result)) v.push(`line ${i + 1}: result ${g.result} is not final`);
    if (g.payout !== null || g.priced !== false) v.push(`line ${i + 1}: a payout appears in a Level A grade`);
    if (recordIds && !recordIds.has(g.entryId)) v.push(`line ${i + 1}: entry ${g.entryId} is not in the record`);
  });
  return v;
}
