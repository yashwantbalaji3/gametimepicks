/**
 * ONCE A LANE IS PLACED FOR A DATE, IT STAYS PLACED (P257 · 2026-09-11).
 *
 * Automatically generated Bank Builder / Moonshot cards had no lock — card locks exist only for operator-
 * approved cards — so every run of the daily-portfolio writer re-selected them from whatever odds and pool
 * it saw. On 2026-09-11 the morning chain published four cards at 09:27 ET; GitHub fired the backstop crons
 * four hours late, a third production chain re-captured odds, and at 10:51 ET all four cards were swapped
 * for different legs. A card a reader has seen must not change under them, and the card that settles must
 * be the card that was published.
 *
 * So the writer carries every lane that was ACTIVE in the portfolio it is replacing, for the same date,
 * verbatim. A lane that had no card may still activate later (that is a placement, not a swap). A new date
 * starts fresh. Every aggregate is recomputed from the final lanes exactly as the builder computes it.
 */
import { sumActiveExposure } from "./exposure.ts";

const round2 = (x) => Math.round(x * 100) / 100;
const key = (l) => `${l.product}:${l.lane}`;

/**
 * @param {object|null} existing  the daily portfolio on disk (the one being replaced)
 * @param {object} fresh          what the builder just produced
 * @returns {{ dp: object, carried: Array<{lane: string, freshStatus: string, changedLegs: boolean}> }}
 */
export function carryPlacedLanes(existing, fresh) {
  if (!existing || !fresh || existing.date !== fresh.date) return { dp: fresh, carried: [] };
  const placed = new Map((existing.lanes ?? []).filter((l) => l.status === "active").map((l) => [key(l), l]));
  if (!placed.size) return { dp: fresh, carried: [] };
  const carried = [];
  const stamp = (p) => ({ ...p, placedAt: p.placedAt ?? existing.generatedAt ?? null });
  const lanes = (fresh.lanes ?? []).map((l) => {
    const p = placed.get(key(l));
    if (!p) return l;
    carried.push({ lane: key(l), freshStatus: l.status, changedLegs: JSON.stringify(p.legs ?? []) !== JSON.stringify(l.legs ?? []) });
    return stamp(p);
  });
  for (const [k, p] of placed) {
    if (!lanes.some((x) => key(x) === k)) { lanes.push(stamp(p)); carried.push({ lane: k, freshStatus: "absent", changedLegs: true }); }
  }
  const active = lanes.filter((l) => l.status === "active");
  const coreExposure = sumActiveExposure(lanes, (l) => l.product === "bank-builder");
  const moonExposure = sumActiveExposure(lanes, (l) => l.product === "moonshot");
  const openExposure = sumActiveExposure(lanes);
  const zero = { wins: 0, losses: 0, voids: 0, pending: 0 };
  return {
    carried,
    dp: {
      ...fresh,
      lanes,
      openExposure,
      availableBankroll: round2(fresh.activeBankroll - openExposure),
      potentialReturn: round2(active.reduce((s, l) => s + (l.potentialReturn ?? 0), 0)),
      products: {
        ...fresh.products,
        bankBuilder: { ...(fresh.products?.bankBuilder ?? {}), exposure: coreExposure, record: { ...zero, pending: active.filter((l) => l.product === "bank-builder").length } },
        moonshot: { ...(fresh.products?.moonshot ?? {}), exposure: moonExposure, record: { ...zero, pending: active.filter((l) => l.product === "moonshot").length } },
      },
      settlement: { status: active.length ? "pending" : "none", realizedPnl: 0 },
      note: active.length
        ? "Active daily paper portfolio — open exposure is at risk; active bankroll and crown are unchanged until official settlement."
        : fresh.note,
    },
  };
}
