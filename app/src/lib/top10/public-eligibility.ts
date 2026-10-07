/**
 * PUBLIC RANKING ELIGIBILITY (PE-1) — may this forecast family be RANKED as a public model pick?
 *
 * The ranked board (lib/top10/top10-picks.ts) feeds /markets' "Model-ranked picks", /today's "Top model picks"
 * and the home page count. Before this it ranked every non-Pass MLB lean on model confidence, and every one of
 * those leans belongs to a family the coverage registry (lib/market-coverage.ts) marks
 * DEMOTED_TO_MARKET_CONTEXT, publicEligible false. A demoted model may not be promoted to create content.
 *
 * This file adds NO second source of truth. It reads the two canonical owners that already exist:
 *   - the coverage registry, through its committed projection (data/ask-projection/v1/coverage.json — the
 *     same document lib/parlays/card-leg-eligibility.mjs reads), for demoted / publicEligible;
 *   - the model-health scorecard (public/data/admin/model-health.json), for Paused: a family whose live
 *     record is BREACHED (Q7 ALL: every breached family, not only the wired MLB game calls).
 *
 * A row is ranked only when its family resolves in the registry, is publicEligible, is not demoted, has a
 * model prediction source (not a market-implied one: K4), and is not paused. It FAILS CLOSED (Q3): an
 * unreadable registry, an unreadable or stale scorecard, or a family the registry does not name withholds the
 * row; it is never passed through on a guess. UFC is EXPERIMENTAL and not
 * product-eligible (Q6), so it is excluded explicitly, whatever the registry row says. Board display status
 * never grants eligibility (Q9): only the registry does.
 *
 * Withheld rows are counted with their reason, so a short board says why it is short. Pure except the loader.
 */
import fs from "node:fs";
import path from "node:path";

import type { IneligibleReason } from "@/lib/top10/ineligible-reasons";

export type { IneligibleReason } from "@/lib/top10/ineligible-reasons";
export { INELIGIBLE_TEXT } from "@/lib/top10/ineligible-reasons";

/** The scorecard counts as readable for this long (the live-record gate's own window). */
export const SCORECARD_MAX_AGE_HOURS = 72;

interface CoverageRow {
  sport?: string;
  market?: string;
  publicEligible?: boolean;
  predictionSource?: string;
  demotedFamilies?: string[];
  governedFamilies?: string[];
}
export interface EligibilityInputs {
  coverage: { markets?: CoverageRow[] } | null;
  scorecard: { generatedAt?: string; families?: { id?: string; state?: string }[] } | null;
}

/**
 * Prediction sources that are a GameTimePicks model rather than a sportsbook price. A market-implied or
 * market-anchored family can be shown as market context, but its probability is never ranked as a model
 * pick (K4: market-implied probability is never GTP confidence).
 */
const MODEL_BASIS = new Set(["independent_sim", "projection_only", "experimental_model"]);

/** Board sport → registry sport. A sport missing here cannot be judged, so its rows are withheld. */
const REGISTRY_SPORT: Record<string, string> = { mlb: "mlb", "world-cup": "soccer", nfl: "nfl", ufc: "ufc" };

const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** `dataRoot` is app/public/data; the registry projection sits at the repo root. */
export function loadEligibilityInputs(dataRoot: string): EligibilityInputs {
  return {
    coverage: readJson(path.resolve(dataRoot, "..", "..", "..", "data", "ask-projection", "v1", "coverage.json")),
    scorecard: readJson(path.join(dataRoot, "admin", "model-health.json")),
  };
}

/** Is the scorecard fresh enough to judge with at `nowMs`? (Same window and clock-skew rule as live-record-gate.) */
function scorecardReadable(scorecard: EligibilityInputs["scorecard"], nowMs: number): boolean {
  const at = Date.parse(scorecard?.generatedAt ?? "");
  return Number.isFinite(at) && Number.isFinite(nowMs)
    && nowMs - at <= SCORECARD_MAX_AGE_HOURS * 3600e3 && at - nowMs <= 3600e3
    && Array.isArray(scorecard?.families);
}

/** null = eligible to be ranked; otherwise the reason it is withheld. */
export function rankingIneligibility(
  row: { sport: string; family: string },
  inputs: EligibilityInputs,
  nowMs: number,
): IneligibleReason | null {
  if (!Array.isArray(inputs.coverage?.markets) || !scorecardReadable(inputs.scorecard, nowMs)) return "STATUS_UNREADABLE";
  if (row.sport === "ufc") return "UFC_EXPERIMENTAL";
  const sport = REGISTRY_SPORT[row.sport];
  if (!sport || !row.family) return "UNRESOLVED_FAMILY";

  const entries = inputs.coverage!.markets!.filter((m) => String(m.sport).toLowerCase() === sport
    && (m.market === row.family || (m.governedFamilies ?? []).includes(row.family) || (m.demotedFamilies ?? []).includes(row.family)));
  if (!entries.length) return "UNRESOLVED_FAMILY";
  if (entries.some((m) => (m.demotedFamilies ?? []).includes(row.family))) return "DEMOTED";
  if (!entries.every((m) => m.publicEligible === true)) return "NOT_PUBLIC_ELIGIBLE";
  if (!entries.every((m) => MODEL_BASIS.has(String(m.predictionSource)))) return "MARKET_BASIS";

  const breached = (inputs.scorecard!.families ?? []).some((f) => f?.state === "BREACHED" && f.id === `${sport}_${row.family}`);
  return breached ? "PAUSED" : null;
}

export interface WithheldRow { id: string; family: string; reason: IneligibleReason }

/** Split candidates into those that may be ranked and those withheld (with reasons). Order is preserved. */
export function partitionRankable<T extends { id: string; sport: string; family: string }>(
  rows: T[],
  inputs: EligibilityInputs,
  nowMs: number,
): { kept: T[]; withheld: WithheldRow[] } {
  const kept: T[] = [];
  const withheld: WithheldRow[] = [];
  for (const r of rows) {
    const reason = rankingIneligibility(r, inputs, nowMs);
    if (reason) withheld.push({ id: String(r.id), family: r.family, reason });
    else kept.push(r);
  }
  return { kept, withheld };
}
