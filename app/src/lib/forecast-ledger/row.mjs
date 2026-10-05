/**
 * Row construction — the one place a ledger row is shaped, so every adapter emits the same canonical field order
 * and every unknown is an explicit `null` (missing stays missing; nothing defaults to 0).
 */
import { LEDGER_SCHEMA_VERSION, ROW_FIELDS } from "./contract.mjs";
import { forecastIdFor } from "./identity.mjs";
import { EMPTY_MEASUREMENT } from "./measure.mjs";

export const EMPTY_SETTLEMENT = Object.freeze({
  state: "PENDING",
  finalValue: null,
  finalCategory: null,
  settledAt: null,
  finality: null,
  corrections: 0,
  source: null,
  reason: null,
});

/** Market context, typed. `impliedProbability` is the book's (de-vigged where the owner says so), never the model's. */
export function marketBlock(m) {
  if (!m) return null;
  const out = {
    line: m.line ?? null,
    price: m.price ?? null,
    impliedProbability: m.impliedProbability ?? null,
    provider: m.provider ?? null,
    capturedAt: m.capturedAt ?? null,
  };
  return Object.values(out).every((v) => v == null) ? null : out;
}

export function makeRow(fields) {
  const forecastId = forecastIdFor(fields);
  const row = {};
  for (const k of ROW_FIELDS) row[k] = null;
  Object.assign(row, fields);
  row.forecastId = forecastId;
  row.schemaVersion = LEDGER_SCHEMA_VERSION;
  row.settlement = { ...EMPTY_SETTLEMENT, ...(fields.settlement ?? {}) };
  row.measurement = { ...EMPTY_MEASUREMENT, ...(fields.measurement ?? {}) };
  row.publicationStatus = fields.publicationStatus ?? "PUBLISHED";
  // Canonical order: rebuild in ROW_FIELDS order so serialisation is deterministic.
  const ordered = {};
  for (const k of ROW_FIELDS) ordered[k] = row[k] === undefined ? null : row[k];
  return ordered;
}
