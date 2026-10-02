/**
 * Session 5 · B10 — a leg whose game has started (or whose start is unknown) is never a suggestion.
 * Pure: the start map and the clock are arguments. Fails closed on an unknown start.
 */
export function legHasNotStarted(leg, startByGameId, nowMs) {
  const t = startByGameId?.get(String(leg?.gameId ?? ""));
  return Number.isFinite(t) && Number.isFinite(nowMs) && t > nowMs;
}

/** Every leg of a slip still ahead of its first pitch. */
export function slipHasNotStarted(slip, startByGameId, nowMs) {
  const legs = slip?.legs ?? [];
  return legs.length > 0 && legs.every((l) => legHasNotStarted(l, startByGameId, nowMs));
}
