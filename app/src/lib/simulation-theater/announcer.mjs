/**
 * SIMULATION THEATER V2 · ANNOUNCER POLICY (spec §3.8, S9). Pure: the caller supplies the wall clock.
 *
 *   at 1×   one announcement per drive result, and at breaks; quarter rollovers only if nothing else is pending
 *   above 1× only scores, possession-ending turnovers/downs and breaks, at most one per 3 s; a newer one replaces a
 *           queued older one
 *   pause / seek-settle (250 ms): the current drive in full, immediately
 *   never per frame; silent while seeking
 */

export const MIN_GAP_MS = 3000;
export const SEEK_SETTLE_MS = 250;

/** Which announcement kinds are worth saying at a speed. */
export function eligible(kind, speed) {
  if (kind === "FULL") return true;
  if (speed <= 1) return ["RESULT", "SCORE", "STOP", "BREAK", "ROLLOVER"].includes(kind);
  return ["SCORE", "STOP", "BREAK"].includes(kind);
}

export function createAnnouncer() {
  return { lastAt: -Infinity, queued: null, spoken: null };
}

/**
 * Offer a message. Returns { state, say } where `say` is the text to put in the live region now (or null).
 * @param {{ lastAt: number, queued: any, spoken: any }} st
 * @param {{ kind: string, text: string }} msg
 * @param {{ speed: number, now: number }} ctx
 */
export function offer(st, msg, { speed, now }) {
  if (!eligible(msg.kind, speed)) return { state: st, say: null };
  if (msg.kind === "FULL") return { state: { lastAt: now, queued: null, spoken: msg }, say: msg.text };
  if (msg.kind === "ROLLOVER" && st.queued) return { state: st, say: null };
  const gap = speed <= 1 ? 0 : MIN_GAP_MS;
  if (now - st.lastAt >= gap) return { state: { lastAt: now, queued: null, spoken: msg }, say: msg.text };
  return { state: { ...st, queued: msg }, say: null };
}

/** Release a queued message once the gap has passed. */
export function flush(st, { speed, now }) {
  if (!st.queued) return { state: st, say: null };
  const gap = speed <= 1 ? 0 : MIN_GAP_MS;
  if (now - st.lastAt < gap) return { state: st, say: null };
  return { state: { lastAt: now, queued: null, spoken: st.queued }, say: st.queued.text };
}
