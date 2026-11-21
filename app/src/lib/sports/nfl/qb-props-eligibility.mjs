/**
 * NFL QB PROPS · ELIGIBILITY AT FREEZE (pre-registration v1.3 §confirmatory filter: "eligibility@1 says ELIGIBLE at freeze").
 *
 * WHY THIS EXISTS. The grader (qb-props-grade.mjs) marks a row CONFIRMATORY only when eligibility@1 resolved the
 * projected QB as ELIGIBLE at the receipt's freeze. Until this module, the grade inputs passed `eligibilityAt: null`
 * (qb-props-inputs.mjs: "not on this branch"), so every row since the founder's 2026-11-10T18:55:07Z approval was
 * PENDING_ELIGIBILITY_CONTRACT and none could ever count: the approved forward test stood at 0/300 by construction.
 *
 * WHAT "AT FREEZE" MEANS HERE. Each shadow receipt pins the exact availability capture it was simulated from:
 * `availabilitySnapshotId = "injuries@<generatedAt>+rosters@<generatedAt>"`. The resolution uses THOSE two captures —
 * never a later one — with asOf = the receipt's generatedAt, starter: true (a Doubtful starter is INELIGIBLE), and the
 * contract's own build window (R4). No outcome, box score or final is read. A pinned capture that cannot be found is
 * not guessed: the key is left out, and the grader keeps the row PENDING (never confirmatory).
 *
 * THE RECORD. data/internal/research/nfl/qb-props/eligibility-at-freeze.json, keyed `${asOf}|${team}|${playerId}`.
 * Append-only: an existing key is never rewritten (a re-run with the same inputs writes identical bytes). No wall-clock
 * field, so an unchanged slate commits nothing.
 *
 * Pure except `loadEligibilityRecord` (one read).
 */
import fs from "node:fs";
import path from "node:path";
import { resolveEligibility, CONTRACT_VERSION } from "../../availability/eligibility.mjs";
import { projectedQbs } from "./qb-props-grade.mjs";

export const ELIGIBILITY_AT_FREEZE_REL = "data/internal/research/nfl/qb-props/eligibility-at-freeze.json";
export const ELIGIBILITY_AT_FREEZE_SCHEMA = "gtp.nfl.qb-props-eligibility-at-freeze@1";

const PIN = /^injuries@([^+]+)\+rosters@(.+)$/;

/** The two capture stamps a receipt was simulated from, or null when the receipt does not pin both. */
export function pinnedAvailability(receipt) {
  const m = PIN.exec(String(receipt?.availabilitySnapshotId ?? receipt?.inputSnapshotIds?.availability ?? ""));
  return m ? { injuriesAt: m[1], rostersAt: m[2] } : null;
}

export const freezeKey = ({ asOf, teamAbbr, playerId }) => {
  const pid = String(playerId).startsWith("nfl-athlete-") ? String(playerId) : `nfl-athlete-${playerId}`;
  return `${asOf}|${teamAbbr}|${pid}`;
};

/** providerTeamId for a team abbreviation, from the pinned roster capture itself. */
const teamIdOf = (roster, abbr) => {
  const t = (roster?.teams ?? []).find((x) => x?.teamAbbr === abbr || x?.abbreviation === abbr || x?.abbr === abbr);
  return t?.providerTeamId != null ? String(t.providerTeamId) : null;
};

/**
 * Resolve every projected QB of one receipt against its pinned captures.
 * @param {{ receipt: object, injuriesAt: (stamp: string) => object|null, rosterAt: (stamp: string) => object|null }} a
 * @returns {{ entries: Array<[string, object]>, missing: string|null }}
 */
export function resolveReceiptQbs({ receipt, injuriesAt, rosterAt }) {
  const pin = pinnedAvailability(receipt);
  if (!pin) return { entries: [], missing: "RECEIPT_PINS_NO_AVAILABILITY" };
  const injuries = injuriesAt(pin.injuriesAt);
  const roster = rosterAt(pin.rostersAt);
  if (!injuries || injuries.generatedAt !== pin.injuriesAt) return { entries: [], missing: `PINNED_INJURIES_UNAVAILABLE ${pin.injuriesAt}` };
  if (!roster || roster.generatedAt !== pin.rostersAt) return { entries: [], missing: `PINNED_ROSTER_UNAVAILABLE ${pin.rostersAt}` };
  const asOf = receipt.generatedAt;
  const entries = [];
  for (const [team, qb] of Object.entries(projectedQbs(receipt)).sort(([a], [b]) => a.localeCompare(b))) {
    const e = resolveEligibility({ sport: "nfl", playerId: qb.playerId, teamId: teamIdOf(roster, team), asOf, injuries, roster, starter: true });
    entries.push([freezeKey({ asOf, teamAbbr: team, playerId: qb.playerId }), {
      eventId: String(receipt.eventId), state: e.state, reasons: e.reasons, flags: e.flags, sources: e.sources,
      contractVersion: e.contractVersion, pinned: pin,
    }]);
  }
  return { entries, missing: null };
}

/**
 * Merge new resolutions into the record, append-only. An existing key is kept verbatim even if a re-resolution differs
 * (the difference is reported, never written).
 */
export function mergeRecord(previous, additions) {
  const entries = { ...(previous?.entries ?? {}) };
  const conflicts = [];
  let added = 0;
  for (const [k, v] of additions) {
    if (k in entries) { if (JSON.stringify(entries[k]) !== JSON.stringify(v)) conflicts.push(k); continue; }
    entries[k] = v; added += 1;
  }
  const sorted = Object.fromEntries(Object.keys(entries).sort().map((k) => [k, entries[k]]));
  return {
    record: {
      schema: ELIGIBILITY_AT_FREEZE_SCHEMA,
      contractVersion: CONTRACT_VERSION,
      rule: "projected QB (largest pass-attempt median per team) resolved under eligibility@1 (starter: true, build window) with asOf = receipt generatedAt, from the injuries + roster captures the receipt pins in availabilitySnapshotId; append-only; reads no outcome",
      entries: sorted,
    },
    added, conflicts,
  };
}

/** The grader's hook: (playerId, teamAbbr, asOf) → the recorded resolution, or null (⇒ PENDING, never confirmatory). */
export function eligibilityAtFrom(record) {
  const entries = record?.entries ?? {};
  return ({ playerId, teamAbbr, asOf }) => entries[freezeKey({ asOf, teamAbbr, playerId })] ?? null;
}

export function loadEligibilityRecord(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, ELIGIBILITY_AT_FREEZE_REL), "utf8")); } catch { return null; }
}
