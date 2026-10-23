/**
 * LEVEL A · PAGE MODEL. Node-only, read-only: the official frozen forecasts for the product day
 * (level-a/sources.mjs) → the Level A answer (level-a/suggestions.mjs), plus NBA Predicted Player Statistics.
 * Rendered by Bank Builder, Moonshot and the Parlay Center when NEXT_PUBLIC_LEVEL_A_SUGGESTIONS is "1".
 */
import path from "node:path";
import { levelASources } from "./sources.mjs";
import { levelASuggestions, productDayOf } from "./suggestions.mjs";

/**
 * THE LEVEL A SWITCH. One committed constant, default false: the release owner flips it to true in the release
 * vehicle after acceptance, and rollback is flipping it back. No Production env var is needed.
 * NEXT_PUBLIC_LEVEL_A_SUGGESTIONS="1" is an additional override for local and preview builds only.
 */
export const LEVEL_A_SUGGESTIONS_PUBLIC = false;
export const LEVEL_A_FLAG = "NEXT_PUBLIC_LEVEL_A_SUGGESTIONS";
export const levelAEnabled = (env = { [LEVEL_A_FLAG]: process.env.NEXT_PUBLIC_LEVEL_A_SUGGESTIONS }) => LEVEL_A_SUGGESTIONS_PUBLIC || env[LEVEL_A_FLAG] === "1";

export function buildLevelAModel({ repoRoot = path.resolve(process.cwd(), ".."), now = new Date().toISOString(), productDay = null } = {}) {
  const day = productDay ?? productDayOf(now);
  const src = levelASources({ repoRoot, date: day });
  const answer = levelASuggestions({ selections: src.selections, now, productDay: day });
  /** @type {Record<string, number>} */
  const refusedByReason = {};
  for (const r of answer.refused) for (const c of r.reasons) if (c !== "OTHER_PRODUCT_DAY") refusedByReason[c] = (refusedByReason[c] ?? 0) + 1;
  return {
    ...answer,
    refusedByReason,
    nbaProjections: src.nbaProjections.filter((p) => productDayOf(p.startUtc) === day && Date.parse(p.startUtc) > Date.parse(now)).slice(0, 8),
  };
}
