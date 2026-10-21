/**
 * NBA PLAYER-PROP SETTLEMENT READINESS — which prop families have been GRADED FORWARD. Pure, client-safe, no I/O.
 *
 * The release owner's hard blocker (docs/nba/NBA_PRODUCT_INTEGRATION_PLAN_2026-10-21.md) holds every NBA player-prop
 * leg out of every product until BOTH:
 *   1. a player-prop grader exists (prop-settlement.mjs, PR 1169) and the lab settler routes NBA legs to it
 *      (parlays/nba-lab-grading.mjs), and
 *   2. that grader has been graded FORWARD: shadow-settled on real frozen pre-tip rows against official box scores,
 *      with corrections handled.
 * This module turns (2) into evidence instead of a comment. It reads the append-only shadow ledger
 * (data/internal/research/nba/prop-grades/v0.1/ledger.jsonl, written only by scripts/nba/grade-nba-player-props.mjs)
 * and reports, per family, how many (event, player) rows currently stand GRADED. The latest entry per key wins, so a
 * CORRECTION supersedes what it corrects and a row that moved back under review stops counting.
 *
 * WHAT "READY" MEANS — AND DOES NOT. A family is settlement-ready when at least one real forward row of it stands
 * GRADED. That is a fact about the grading machinery only. It is NOT product eligibility: the registry
 * (HISTORICAL_ONLY), the price authorization, the operator allowlist and the preregistered §7 bars (≥ 500 priced rows
 * per family) all still refuse every NBA leg, each on its own. No threshold here is a model-quality claim.
 */
import { PROP_FAMILIES } from "./prop-settlement.mjs";

export const NBA_PROP_READINESS_VERSION = "nba-prop-settlement-readiness@1";
const SCHEMA = "nba-prop-shadow-grade@1";
const GRADED = "GRADED";

/**
 * @param {ReadonlyArray<object>|null|undefined} entries ledger entries in file order (append-only)
 * @returns {Readonly<{ version: string, entries: number, families: Record<string, {graded: number, events: number, dates: string[]}>,
 *   readyFamilies: string[], basis: string }>}
 */
export function nbaPropSettlementReadiness(entries) {
  const latest = new Map();
  let n = 0;
  for (const e of entries ?? []) {
    if (!e || e.schema !== SCHEMA || typeof e.key !== "string") continue;
    n += 1;
    const prev = latest.get(e.key);
    if (!prev || (Number(e.seq) || 0) >= (Number(prev.seq) || 0)) latest.set(e.key, e);
  }
  const families = {};
  for (const f of Object.keys(PROP_FAMILIES)) families[f] = { graded: 0, events: new Set(), dates: new Set() };
  for (const e of latest.values()) {
    if (e.state !== GRADED || !families[e.family]) continue;
    const f = families[e.family];
    f.graded += 1;
    f.events.add(String(e.eventId));
    f.dates.add(String(e.date));
  }
  const out = {};
  for (const [k, v] of Object.entries(families)) out[k] = Object.freeze({ graded: v.graded, events: v.events.size, dates: Object.freeze([...v.dates].sort()) });
  const readyFamilies = Object.keys(out).filter((k) => out[k].graded > 0).sort();
  return Object.freeze({
    version: NBA_PROP_READINESS_VERSION,
    entries: n,
    families: Object.freeze(out),
    readyFamilies: Object.freeze(readyFamilies),
    basis: "latest entry per (date, event, player, family) in the append-only v0.1 shadow ledger; a family is ready when one real forward row stands GRADED",
  });
}
