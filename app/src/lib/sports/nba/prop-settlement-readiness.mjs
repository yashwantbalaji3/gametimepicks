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
 * READY IS NECESSARY, NEVER SUFFICIENT (release owner, 2026-10-21). Opening the gate from the ledger alone would be
 * automatic promotion, and the founder rule is that nothing is promoted automatically. `nbaPropSettlementGate` opens a
 * family only when BOTH hold:
 *   - the ledger shows it graded forward (this module's readiness), and
 *   - the append-only NBA promotion record (data/internal/research/nba/promotion-record.json, promotion-record.mjs)
 *     holds a valid PROMOTION for that family's market, with a named human approver, that no later ROLLBACK reverses.
 * With no such record the gate stays closed, however complete the ledger is.
 *
 * WHAT "READY" MEANS — AND DOES NOT. A family is settlement-ready when at least one real forward row of it stands
 * GRADED. That is a fact about the grading machinery only. It is NOT product eligibility: the registry
 * (HISTORICAL_ONLY), the price authorization, the operator allowlist and the preregistered §7 bars (≥ 500 priced rows
 * per family) all still refuse every NBA leg, each on its own. No threshold here is a model-quality claim.
 */
import { PROP_FAMILIES } from "./prop-settlement.mjs";
import { RECORD_KIND, validatePromotionRecord } from "./promotion-record.mjs";
import { NBA_PROP_SETTLEMENT_GATE_SCHEMA } from "../../parlays/nba-lab-grading.mjs";

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

/** Our family keys → the provider market keys a promotion record may name (either spelling is accepted). */
const FAMILY_MARKET = Object.freeze({
  pts: "player_points", reb: "player_rebounds", ast: "player_assists", threePm: "player_threes",
  pra: "player_points_rebounds_assists", ptsReb: "player_points_rebounds", ptsAst: "player_points_assists",
});
const SETTLEMENT_FAMILY = "v0.1"; // the official player family (nba-official-composition@1)

/**
 * The prop-settlement gate. Pure. Every input is re-validated here; an invalid record counts as no record.
 * @param {{ readiness: ReturnType<typeof nbaPropSettlementReadiness>|null, promotionRecord: object|null }} input
 * @returns {Readonly<{ schema: string, openFamilies: string[], families: Record<string, {evidence: boolean, promotionSeq: number|null, open: boolean, reason: string}> }>}
 */
export function nbaPropSettlementGate({ readiness = null, promotionRecord = null } = {}) {
  const ready = new Set(readiness?.version === NBA_PROP_READINESS_VERSION ? readiness.readyFamilies ?? [] : []);
  const records = Array.isArray(promotionRecord?.records) ? promotionRecord.records : [];
  // Re-validate each record against its own prefix (append-only lineage), exactly as the record's guard does.
  const valid = [];
  for (let i = 0; i < records.length; i += 1) {
    const { seq, ...rec } = records[i] ?? {};
    if (Number.isInteger(seq) && validatePromotionRecord(rec, { records: records.slice(0, i) }).ok) valid.push(records[i]);
  }
  const rolledBack = new Set(valid.filter((r) => r.kind === RECORD_KIND.ROLLBACK).map((r) => r.rollsBack));
  const families = {};
  for (const f of Object.keys(PROP_FAMILIES)) {
    const names = new Set([f, FAMILY_MARKET[f]]);
    const promo = valid.filter((r) => r.kind === RECORD_KIND.PROMOTION && r.family === SETTLEMENT_FAMILY && names.has(r.market) && !rolledBack.has(r.seq)).at(-1) ?? null;
    const evidence = ready.has(f);
    const open = evidence && promo != null;
    families[f] = Object.freeze({
      evidence, promotionSeq: promo?.seq ?? null, open,
      reason: open ? `graded forward and promoted (record seq ${promo.seq})`
        : !evidence && !promo ? "not graded forward; no founder-approved promotion"
        : !evidence ? "a promotion exists but the family is not graded forward in the ledger"
        : "graded forward, but no founder-approved promotion in the NBA promotion record",
    });
  }
  return Object.freeze({
    schema: NBA_PROP_SETTLEMENT_GATE_SCHEMA,
    openFamilies: Object.freeze(Object.keys(families).filter((f) => families[f].open).sort()),
    families: Object.freeze(families),
  });
}
