/**
 * NBA PRE-EVENT SHADOW CONTRACT — fail-closed by construction (Program 198 · Release A2).
 *
 * The charter's requirement is exact: "pre-event shadow contracts for schedule, strength,
 * injuries/lineups and prices. They must fail closed; no synthetic current artifact may be
 * manufactured to move the gate." This module IS that contract. It derives one typed state per
 * input and one rung for a prospective event, and the only way it can ever emit a runnable state
 * is for the real gates to open: activation is read from the identity contract's own flags, the
 * lineup source from the founder blocker, prices from an NBA-scoped authorization that does not
 * exist yet. There is no parameter that fabricates readiness — the tests prove the refusals are
 * reachable and the runnable state is NOT, today.
 *
 * Rungs reuse the shared qualification vocabulary (declining order, first match wins):
 *   REFUSED_ACTIVATION_OFF   the sport's contract flags say OFF — nothing may run, full stop
 *   REFUSED_POST_START       the event already started; a pre-event read after tip is worthless
 *   READY_EXCEPT_<CAUSE>     everything else present; the named input is the gap
 *   CURRENT_PRE_EVENT        unreachable until activation, lineups rights, and prices all exist
 */

import { NBA_CONTRACT_FLAGS } from "../../nba/identity-contract.ts";

export const NBA_SHADOW_CONTRACT_VERSION = 1;

export const NBA_INPUT_STATES = Object.freeze(["AVAILABLE", "STALE", "MISSING", "BLOCKED_EXTERNAL", "UNSUPPORTED"]);

/**
 * Typed input states for a prospective event, derived — never asserted.
 * @param {object} args
 * @param {{stamp?: string|null}|null} args.schedule   the committed schedule capture's own stamp
 * @param {{present?: boolean}|null} args.strength     historical corpus/baseline presence
 * @param {{decided?: boolean, source?: string|null}|null} args.lineupRights  the founder blocker's state
 * @param {{authorized?: boolean}|null} args.priceAuthorization  NBA-scoped odds receipt state
 * @param {string} args.nowIso
 */
export function deriveNbaInputs({ schedule, strength, lineupRights, priceAuthorization, nowIso }) {
  const scheduleAge = schedule?.stamp ? (Date.parse(nowIso) - Date.parse(schedule.stamp)) / 3.6e6 : null;
  return {
    schedule: !schedule?.stamp ? "MISSING" : scheduleAge > 60 ? "STALE" : "AVAILABLE",
    strength: strength?.present ? "AVAILABLE" : "MISSING",
    /*
     * The lineup/injury source is a RIGHTS question, not a scraping target. Until the founder
     * decides (blocker-nba-lineup-rights), the input is BLOCKED_EXTERNAL — and deciding "defer"
     * keeps it that way with the interface complete, which is the honest architecture: the
     * adapter's shape exists, the source does not.
     */
    lineups: lineupRights?.decided && lineupRights?.source ? "AVAILABLE" : "BLOCKED_EXTERNAL",
    prices: priceAuthorization?.authorized ? "AVAILABLE" : "BLOCKED_EXTERNAL",
  };
}

/**
 * The rung for one prospective event. Fail-closed: the FIRST failing gate names the state, and
 * CURRENT_PRE_EVENT is reachable only when every gate passes — which today none of the callers
 * can make true without the real receipts.
 */
export function nbaShadowRung({ eventStartUtc, nowIso, inputs, flags = NBA_CONTRACT_FLAGS }) {
  if (!flags.approvedForProduction || flags.publicActivation === false || flags.public === false) {
    return { rung: "REFUSED_ACTIVATION_OFF", reason: "NBA_CONTRACT_FLAGS keep activation OFF; no shadow read may run, let alone publish" };
  }
  if (Number.isFinite(Date.parse(eventStartUtc)) && Date.parse(nowIso) >= Date.parse(eventStartUtc)) {
    return { rung: "REFUSED_POST_START", reason: "the event already started — a pre-event read after tip is not evidence" };
  }
  for (const [id, state] of Object.entries(inputs)) {
    if (state !== "AVAILABLE") {
      return { rung: `READY_EXCEPT_${id.toUpperCase()}`, reason: `${id} is ${state} — widened or refused, never defaulted` };
    }
  }
  return { rung: "CURRENT_PRE_EVENT", reason: "every gate open — reachable only with real activation, rights, and price receipts" };
}
