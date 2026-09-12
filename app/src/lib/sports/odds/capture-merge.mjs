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
