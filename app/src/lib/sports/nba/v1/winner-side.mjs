/**
 * PREP · Stage 12 (NBA V1), local only. NOT WIRED.
 *
 * THE PREGAME WINNER SIDE (Stage 3 Q3, decided 2026-10-06): every winner-capable forecast freezes `publishedSide`
 * or `TOO_CLOSE` before the start, and no Results reader may infer a side afterwards. The NBA receipt
 * (`nba-forecast-receipt@1`) freezes two winner heads (`forecast.sim.pHome`, `forecast.elo.pHome`) and NO side, so
 * under the 3A helper every NBA winner row would be NO_PICK (HISTORICAL_MODEL_FAVORED is NFL-only).
 *
 * This module is the side a future receipt would freeze AT WRITE TIME, next to the probabilities. Two inputs are
 * deliberately parameters, not decisions:
 *   - `head`: which frozen probability is the forecast of record ("sim" | "elo"). Founder decision (model choice).
 *   - `tooCloseBelow`: the abstention threshold. Stage 3 says it is a later product/model rule and must NOT be
 *     "both sides under 50%". Default 0: only an exact 0.5 abstains — no threshold is invented here.
 *
 * Pure. Never reads an outcome.
 */

export const TOO_CLOSE = "TOO_CLOSE"; // same word as the 3A helper's TOO_CLOSE

export const WINNER_HEADS = Object.freeze(["sim", "elo"]);

/** Founder decision N2 (Yash, 2026-10-07 03:21Z): Elo sets the frozen NBA winner side for the initial generation. */
export const DECIDED_WINNER_HEAD = "elo";

/**
 * @param forecast    a receipt game's `forecast` block ({ sim: { pHome }, elo: { pHome } })
 * @param generation  the receipt's exact modelVersion (N2: recorded on every frozen side)
 * @returns {{ head, pHome, publishedSide: "HOME"|"AWAY"|"TOO_CLOSE"|null, sideRule }}
 *          publishedSide null = the head's probability is missing (no side is ever guessed)
 */
export function frozenWinnerSide(forecast, { head, tooCloseBelow = 0, generation = null } = {}) {
  if (!WINNER_HEADS.includes(head)) throw new Error(`nba winner side: head must be one of ${WINNER_HEADS.join("/")} (founder decision), got ${head}`);
  if (!(typeof tooCloseBelow === "number" && tooCloseBelow >= 0 && tooCloseBelow < 0.5)) throw new Error("nba winner side: tooCloseBelow must be in [0, 0.5)");
  const p = forecast?.[head]?.pHome;
  // N2: the exact model generation that set the side is frozen with it, so a later challenger can be compared.
  const sideRule = { id: "nba-winner-side@0", head, tooCloseBelow, generation: generation == null ? null : String(generation) };
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) return { head, pHome: null, publishedSide: null, sideRule };
  const gap = Math.abs(p - 0.5);
  const publishedSide = p === 0.5 || gap < tooCloseBelow ? TOO_CLOSE : p > 0.5 ? "HOME" : "AWAY";
  return { head, pHome: p, publishedSide, sideRule };
}

/** How often the two frozen heads point at different teams on a set of receipt games (evidence for the founder). */
export function headDisagreement(games) {
  let compared = 0, disagree = 0;
  const rows = [];
  for (const g of games ?? []) {
    const s = g?.forecast?.sim?.pHome, e = g?.forecast?.elo?.pHome;
    if (typeof s !== "number" || typeof e !== "number" || s === 0.5 || e === 0.5) continue;
    compared += 1;
    const d = (s > 0.5) !== (e > 0.5);
    if (d) disagree += 1;
    rows.push({ eventId: String(g.providerEventId), sim: s, elo: e, disagree: d });
  }
  return { compared, disagree, rows };
}
