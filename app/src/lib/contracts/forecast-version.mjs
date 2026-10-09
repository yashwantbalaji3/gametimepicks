/**
 * CONTRACT-001 · CANONICAL FORECAST VERSION + SETTLEMENT — a read-only projection of `forecast-ledger@1` rows.
 *
 * The roadmap's §3 entities (ForecastVersion, SettlementEvent) already exist in pieces: the Forecast Ledger
 * (lib/forecast-ledger) is the measured one-row-per-forecast projection every sport feeds. This module does NOT
 * replace it, re-identify anything or touch a file. It states each row in the canonical vocabulary, with every
 * field the ledger never recorded present as `null` AND classified — never filled in.
 *
 * Two founder rules shape it (2026-10-09):
 *   · Forecast of record = verifiable PUBLIC availability before the event (Option B). The ledger's `publishedAt` is
 *     each owner's own timestamp (for MLB game calls, the revision's generation time), so it is carried as
 *     `ownerTimestamp` and `publishedAt` stays null until publication evidence is attached. A git commit time alone
 *     is not publication evidence.
 *   · Missing provenance stays null and classified; research/shadow rows never project (the public ledger never
 *     holds them; this refuses them anyway).
 *
 * Pure. No fs, no clock.
 */

import { LEDGER_SCHEMA_VERSION, PUBLIC_LEDGER_STATUSES } from "../forecast-ledger/contract.mjs";

export const CONTRACTS = Object.freeze({
  forecastVersion: "gtp.contract.forecast-version@1",
  settlement: "gtp.contract.settlement@1",
});

/** Why a canonical field is null on a projected legacy row. */
export const NULL_REASON = Object.freeze({
  LEGACY_UNRECORDED: "LEGACY_UNRECORDED", // the owner never recorded it
  NO_PUBLICATION_EVIDENCE: "NO_PUBLICATION_EVIDENCE", // only an owner timestamp exists (founder Option B)
  LEGACY_COUNT_ONLY: "LEGACY_COUNT_ONLY", // corrections were counted, not chained
});

/** The canonical settlement vocabulary. A result is decisive only when it is WIN or LOSS on a SETTLED row. */
export const SETTLEMENT_STATES = Object.freeze(["PENDING", "SETTLED", "VOID", "NO_MEASUREMENT"]);
export const RESULTS = Object.freeze(["WIN", "LOSS", "PUSH"]);

export class ContractRefusal extends Error {}

/**
 * The horizon is DERIVED, never asserted: `forecast-ledger@1` refuses any row stamped at/after its event start
 * (validateRow), so a valid public row is pregame. A row without both stamps is UNKNOWN, not assumed.
 */
function horizonOf(row) {
  const stamp = Date.parse(row.publishedAt ?? "");
  const start = Date.parse(row.eventStart ?? "");
  if (!Number.isFinite(stamp) || !Number.isFinite(start)) return "UNKNOWN";
  return stamp < start ? "PREGAME" : "INVALID_NOT_PREGAME";
}

export function projectForecastVersion(row) {
  if (!row || row.schemaVersion !== LEDGER_SCHEMA_VERSION) throw new ContractRefusal(`not a ${LEDGER_SCHEMA_VERSION} row`);
  if (!PUBLIC_LEDGER_STATUSES.includes(row.publicationStatus)) {
    throw new ContractRefusal(`publicationStatus ${row.publicationStatus} never projects (research/shadow stay isolated)`);
  }
  return {
    contract: CONTRACTS.forecastVersion,
    forecastId: row.forecastId, // identity is the ledger's, unchanged
    source: { schemaVersion: row.schemaVersion, owner: row.provenance?.owner ?? null, recoverability: row.recoverability },
    event: { sport: row.sport, competition: row.competition ?? null, season: row.season ?? null, eventId: row.eventId, eventStart: row.eventStart ?? null },
    subject: { type: row.subjectType, id: row.subjectId, display: row.subjectDisplay ?? null, teamId: row.teamId ?? null },
    target: { family: row.family, kind: row.forecastKind, direction: row.direction ?? null },
    quantity: {
      projection: row.projection ?? null, rangeLow: row.rangeLow ?? null, rangeHigh: row.rangeHigh ?? null, rangeCoverage: row.rangeCoverage ?? null,
      probability: row.probability ?? null, probabilityType: row.probabilityType ?? null, classProbabilities: row.classProbabilities ?? null,
    },
    model: { id: row.modelId ?? null, version: row.modelVersion ?? null, statusAtPublish: row.modelStatusAtPublish ?? null },
    horizon: horizonOf(row),
    timing: {
      ownerTimestamp: row.publishedAt ?? null, // what the owner stamped — NOT proof of publication
      frozenAt: row.frozenAt ?? null,
      publishedAt: null,
      publicationEvidence: null,
    },
    publication: { status: row.publicationStatus, surface: row.publicationSurface ?? null, receiptId: row.receiptId ?? null },
    market: row.market ?? null,
    predecessor: null,
    worldReceiptRef: null,
    featureSnapshotRef: null,
    nullReasons: {
      "timing.publishedAt": NULL_REASON.NO_PUBLICATION_EVIDENCE,
      predecessor: NULL_REASON.LEGACY_UNRECORDED,
      worldReceiptRef: NULL_REASON.LEGACY_UNRECORDED,
      featureSnapshotRef: NULL_REASON.LEGACY_UNRECORDED,
      ...(row.modelVersion == null ? { "model.version": NULL_REASON.LEGACY_UNRECORDED } : {}),
      ...(row.modelId == null ? { "model.id": NULL_REASON.LEGACY_UNRECORDED } : {}),
    },
  };
}

/**
 * The settlement in the canonical vocabulary. `result` is the ledger's DIRECTIONAL result, never the outcome
 * category (`finalCategory` is what happened — "HIT", "OVER", a fighter's name — and is carried as is).
 * Pending / void / no-measurement rows can never be decisive. MLB stores a push as state VOID + a PUSH result.
 */
export function projectSettlement(row) {
  const s = row?.settlement ?? {};
  if (!SETTLEMENT_STATES.includes(s.state)) throw new ContractRefusal(`settlement state ${s.state}`);
  const raw = row?.measurement?.directionalResult ?? null;
  const directional = RESULTS.includes(raw) ? raw : null;
  const result = s.state === "SETTLED" || (s.state === "VOID" && directional === "PUSH") ? directional : null;
  return {
    contract: CONTRACTS.settlement,
    forecastId: row.forecastId,
    state: s.state,
    result,
    decisive: s.state === "SETTLED" && (result === "WIN" || result === "LOSS"),
    outcomeCategory: s.finalCategory ?? null,
    finalValue: s.finalValue ?? null,
    finality: s.finality ?? null,
    settledAt: s.settledAt ?? null,
    source: s.source ?? null,
    corrections: { count: Number.isInteger(s.corrections) ? s.corrections : 0, chain: null },
    ruleVersion: null,
    nullReasons: { "corrections.chain": NULL_REASON.LEGACY_COUNT_ONLY, ruleVersion: NULL_REASON.LEGACY_UNRECORDED },
  };
}
