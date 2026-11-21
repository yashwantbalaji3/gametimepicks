/**
 * NFL SIMULATION V2 · PERSONNEL UNDER eligibility@1 (NFL completion row E, PD 2026-11-11). PURE: no fs, no clock.
 *
 * Who the simulated games may give an opportunity to, and how the Theater may show them:
 *   INELIGIBLE  never in the simulated personnel (no slot, no share: the role-share redistribution in
 *               receipt.mjs playersFromRoleShares moves the share to available teammates) — e.g. a carried IR
 *               designation the feed no longer lists (Achane, INC-2026-11-08-01), a release, an Out
 *   UNKNOWN     also kept out of the personnel (the shadow build's rule since eligibility contract v1,
 *               participation-eligibility.mjs shareExclusions, which its replay re-applies); should a receipt ever carry
 *               one, the Theater labels him "availability not verified" and never features him
 *   ELIGIBLE    simulated; FEATURED only when featurable() — Questionable / Doubtful / Day-To-Day (R6) and the R3a
 *               source disagreement are simulated at the usual share and never featured
 * The Theater reads the receipt's map through simulation-theater/run-box-availability.mjs (no imports, client-safe).
 * The receipt records the eligibility snapshot it used: a stamp-free id over (player, state, reasons, flags), so the
 * same availability gives the same id (and the same receipt) however often the sources are re-captured.
 */
import { CONTRACT_VERSION, featurable } from "../../../availability/eligibility.mjs";
import { opportunityEligibility } from "../participation-eligibility.mjs";
import { fnv1a64 } from "../../../forecast-ledger/identity.mjs";

const ROLE_FAMILIES = ["passAttempts", "targets", "rushAttempts"];

/**
 * One team's eligibility@1 record for every role-share player, by the same call the share exclusions use
 * (participation-eligibility.mjs opportunityEligibility), so the receipt's record and the simulated personnel agree.
 * @returns {Map<string, object>} playerId → eligibilityRecord
 */
export function teamEligibilityRecords(teamBlock, teamAbbr, ctx) {
  const records = new Map();
  for (const k of ROLE_FAMILIES) for (const p of teamBlock?.[k]?.players ?? []) if (!records.has(p.playerId)) records.set(p.playerId, opportunityEligibility(p, teamAbbr, ctx).eligibility);
  return records;
}

/** The availability of the SIMULATED players (excluded ones have no slot), keyed by player id, stamps left out. */
export function playerAvailability(records, excluded) {
  const out = {};
  for (const id of [...records.keys()].sort()) {
    if (excluded.has(id)) continue;
    const r = records.get(id);
    out[id] = { state: r.state, ...(r.reasons?.length ? { reasons: r.reasons } : {}), ...(r.flags?.length ? { flags: r.flags } : {}), featurable: featurable(r) };
  }
  return out;
}

/** Stamp-free snapshot id over every role-share player's state, reasons and flags (both teams). */
export function eligibilitySnapshot(recordsByTeam) {
  const rows = [];
  for (const [team, records] of Object.entries(recordsByTeam).sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const id of [...records.keys()].sort()) { const r = records.get(id); rows.push([team, id, r.state, r.reasons ?? [], r.flags ?? []]); }
  }
  const count = (s) => rows.filter((r) => r[2] === s).length;
  return { contractVersion: CONTRACT_VERSION, snapshotId: `${CONTRACT_VERSION}:${fnv1a64(JSON.stringify(rows))}`, players: rows.length, ineligible: count("INELIGIBLE"), unknown: count("UNKNOWN"), eligible: count("ELIGIBLE") };
}
