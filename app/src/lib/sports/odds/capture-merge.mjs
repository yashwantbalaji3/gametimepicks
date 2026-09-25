/**
 * A PRICE CAPTURED BEFORE KICKOFF IS NOT UNDONE BY A LATER RUN (P278).
 *
 * The capture's window is pre-start events only, which is right — nobody should buy a price for a
 * game already being played. But the public artifact is written wholesale, so a run taken after the
 * early games kick off holds only the late ones, and writing it deletes the prices the early games
 * were legitimately given hours before. Their forecasts fall back to NO_MARKET, and the read model's
 * "archived price" lane — which exists to remember exactly these — finds nothing. On a Sunday NFL
 * slate that is most of the card, undone by a run that did everything right.
 *
 * The capture already refuses to overwrite a non-empty artifact with an EMPTY one. This is the same
 * idea for the partial case, which is the one that actually happens every game day.
 *
 * A carried row keeps ITS OWN capture stamp. The document's stamp says when the newest prices were
 * taken and would be a lie about a row captured three hours earlier — and every freshness rule
 * downstream compares a capture against a kickoff, so the two must not be confused.
 */

/**
 * @param {Array<Record<string, any>>} priorRows rows from the committed artifact
 * @param {Array<Record<string, any>>} freshRows rows this run captured
 * @param {{priorCapturedAt?: string|null}} [opts] the prior document's stamp, for rows without one
 * @returns {{rows: Array<Record<string, any>>, carried: number}} merged, ordered by kickoff
 */
export function mergeCaptureRows(priorRows, freshRows, { priorCapturedAt = null } = {}) {
  const fresh = (freshRows ?? []).filter(Boolean);
  const freshIds = new Set(fresh.map((r) => String(r.providerEventId)));
  const carried = [];
  for (const r of priorRows ?? []) {
    if (!r || freshIds.has(String(r.providerEventId))) continue; // this run has a newer price for it
    const at = r.capturedAt ?? priorCapturedAt ?? null;
    /* Only a row that WAS pre-kickoff when it was taken. One that never was is not evidence of a
       pregame market, and carrying it forward would launder it into one. */
    if (!at || !r.kickoffUtc) continue;
    if (!(Date.parse(at) < Date.parse(r.kickoffUtc))) continue;
    carried.push({ ...r, capturedAt: at, carriedForward: true });
  }
  const rows = [...fresh, ...carried].sort((a, b) => (String(a.kickoffUtc) < String(b.kickoffUtc) ? -1 : 1));
  return { rows, carried: carried.length };
}

/**
 * When a row's prices were taken — its own stamp, or the document's for a row from before rows
 * carried one. Every freshness judgement downstream should ask this, not the document.
 */
export const rowCapturedAt = (row, doc) => row?.capturedAt ?? doc?.capturedAt ?? null;

/**
 * THE SAME RULE, ONE FIELD OVER: a run that did not ASK about player props must not erase the
 * answer from the run that did.
 *
 * ⚠ THIS WOULD HAVE WIPED 775 PRICES AT THE NEXT SCHEDULED CAPTURE (found 2026-09-25, before it
 * fired). Props are swept on six crons; the three ordinary NFL windows buy the 3-credit team call
 * and pass no `--probe-props`. The capture wrote `propMarkets` and `propPrices` fresh from THIS
 * run's probe every time, so the first ordinary window after a sweep would have published
 * `state: "NOT_PROBED"`, `probedEventIds: []` and `propPrices: null` — and every board, game report
 * and Vault row would have returned to "Not checked" a few hours after the sweep paid for them.
 *
 * Nobody would have seen a failure. The job is green, the artifact validates, and the site simply
 * forgets — which is the shape of every expensive outage in this repo's history.
 *
 * A carried block keeps its OWN `capturedAt`, so staleness stays visible and is never re-dated to
 * now. ⚠ It cannot leak across a week either: a carried `probedEventIds` names last week's events,
 * so a new week's events are absent from it and read NOT_PROBED — which is exactly true of them.
 *
 * @param prior     the committed public capture, or null
 * @param propProbe this run's probe result, or null when it did not probe
 * @returns {{propMarkets, propPrices}|null} the block to carry, or null to use this run's own
 */
export function carryPropsForward(prior, propProbe) {
  if (propProbe?.state === "PROBED") return null;            // this run asked and has its own answer
  if (prior?.propMarkets?.state !== "PROBED") return null;   // nothing worth carrying
  return { propMarkets: prior.propMarkets, propPrices: prior.propPrices ?? null };
}
