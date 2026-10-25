/**
 * LEVEL A · PAGE MODEL. Node-only, read-only: the official frozen forecasts for the product day
 * (level-a/sources.mjs) → the Level A answer (level-a/suggestions.mjs), plus NBA Predicted Player Statistics.
 * Rendered by Bank Builder, Moonshot and the Parlay Center when NEXT_PUBLIC_LEVEL_A_SUGGESTIONS is "1".
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { buildAsOfIso } from "../../build-asof.ts";
import { levelASources } from "./sources.mjs";
import { levelASuggestions, productDayOf } from "./suggestions.mjs";
import { nbaGameWinnerTiers, nbaGameWinnerTiersEnabled } from "./nba-game-winner-tiers.mjs";
import { nbaGameWinnerDisplay } from "./nba-game-winner-source.mjs";

/**
 * THE LEVEL A SWITCH. One committed constant, default false: the release owner flips it to true in the release
 * vehicle after acceptance, and rollback is flipping it back. No Production env var is needed.
 * NEXT_PUBLIC_LEVEL_A_SUGGESTIONS="1" is an additional override for local and preview builds only.
 */
export const LEVEL_A_SUGGESTIONS_PUBLIC = true;
export const LEVEL_A_FLAG = "NEXT_PUBLIC_LEVEL_A_SUGGESTIONS";
export const levelAEnabled = (env = { [LEVEL_A_FLAG]: process.env.NEXT_PUBLIC_LEVEL_A_SUGGESTIONS }) => LEVEL_A_SUGGESTIONS_PUBLIC || env[LEVEL_A_FLAG] === "1";

/** The note an NBA side carries when it can appear in the NBA game winners cards (both switches on). It replaces the
 *  display's "for information only and does not tier this leg", which would be false beside those cards. */
export const NBA_GW_LEG_NOTE = "Not tiered in the cross-sport cards. Its Elo-derived game-winner estimate is published, so this side can appear in the NBA game winners cards.";

/**
 * The NBA game winners block (rule docs/LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md), or null. Null unless BOTH switches are
 * on: this rule's NBA_GAME_WINNER_TIERS_PUBLIC and the display's own. Null means the model is exactly what it was
 * without this rule (no key, no note changed).
 */
export function nbaGameWinnersBlock({ answer, repoRoot, day, enabled = nbaGameWinnerTiersEnabled(), display = null }) {
  if (!enabled) return null;
  const d = display ?? nbaGameWinnerDisplay({ repoRoot, date: day });
  if (!d.enabled) return null;
  return nbaGameWinnerTiers({ legs: (answer.untiered ?? []).filter((l) => l.sport === "nba"), accessor: d.accessor, receiptOf: d.receiptOf, disclosure: d.disclosure, enabled: true });
}

export function buildLevelAModel({ repoRoot = path.resolve(process.cwd(), ".."), now = new Date().toISOString(), productDay = null, nbaGameWinners: gw = {} } = {}) {
  const day = productDay ?? productDayOf(now);
  const src = levelASources({ repoRoot, date: day });
  const answer = levelASuggestions({ selections: src.selections, now, productDay: day });
  /** @type {Record<string, number>} */
  const refusedByReason = {};
  for (const r of answer.refused) for (const c of r.reasons) if (c !== "OTHER_PRODUCT_DAY") refusedByReason[c] = (refusedByReason[c] ?? 0) + 1;
  const nbaGameWinners = nbaGameWinnersBlock({ answer, repoRoot, day, ...gw });
  const tierable = new Set((nbaGameWinners?.legs ?? []).map((l) => String(l.eventId)));
  return {
    ...answer,
    ...(nbaGameWinners ? { nbaGameWinners, untiered: answer.untiered.map((l) => (l.sport === "nba" && tierable.has(String(l.eventId)) ? { ...l, probabilityNote: NBA_GW_LEG_NOTE } : l)) } : {}),
    refusedByReason,
    nbaProjections: src.nbaProjections.filter((p) => productDayOf(p.startUtc) === day && Date.parse(p.startUtc) > Date.parse(now)).slice(0, 8),
  };
}

/**
 * The sports a page's Level A section actually shows a pick for: its own card(s) plus the untiered official sides
 * (Predicted Player Statistics are not picks). The priced-universe list points to Level A only for these, so on a
 * day with no NBA games it never points to an NBA suggestion that is not there.
 * @param {"parlay-lab" | "bank-builder" | "moonshot"} mode
 * @returns {string[]}
 */
export function levelASportsShown(model, mode) {
  if (!model) return [];
  const cards = mode === "bank-builder" ? [model.bankBuilder?.card] : mode === "moonshot" ? [model.moonshot?.card] : (model.parlayLab ?? []).map((t) => t.card);
  const legs = [...cards.filter(Boolean).flatMap((c) => c.legs ?? []), ...(model.untiered ?? [])];
  return [...new Set(legs.map((l) => l.sport))].sort();
}

/**
 * THE MODEL A BUILD SHOWS. Every Level A surface in one build (the three pages and /data/level-a/v1/model.json)
 * evaluates at the build's ONE stamped instant (build-asof.ts), so they are the same evaluation by construction
 * rather than by scheduling luck. The recorder reads that served file from Production; it never re-evaluates "now".
 */
export const LEVEL_A_SERVED_PATH = "/data/level-a/v1/model.json";
export const LEVEL_A_SERVED_SCHEMA = "gtp.level-a.served-model@1";
export const modelSha256 = (model) => createHash("sha256").update(JSON.stringify(model)).digest("hex");

export function levelAPageModel() {
  return { asOf: buildAsOfIso(), ...buildLevelAModel({ now: buildAsOfIso() }) };
}

export function levelAServedDoc() {
  const model = levelAPageModel();
  return { schema: LEVEL_A_SERVED_SCHEMA, public: levelAEnabled(), asOf: model.asOf, productDay: model.productDay, modelSha256: modelSha256(model), model };
}
