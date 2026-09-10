/**
 * ONE CURRENT PRODUCT-STATE VIEW (P244 · Release D, completing P243 D-2's derivation half).
 *
 * Bank Builder's "state" is spread across four record systems, each answering a DIFFERENT
 * question, and surfaces have historically mixed them:
 *
 *   daily-portfolio (mr-dub/daily-portfolio.json) — today's generated lanes: step, status,
 *     stake, LIVE exposure. The activation authority for the day.
 *   prospective lifecycle store (products/lifecycle/) — the rule-derived ladder positions from
 *     graded receipts (win → advance, loss → restart), P211's machine.
 *   portfolio.json — the protected settled-money authority: bankroll, record, CROWNED ladders.
 *   lane artifact labels — a display attempt counter carried in text ("cycle 13").
 *
 * This module derives them into one object with every measure NAMED, and every disagreement
 * TYPED in `divergences` instead of silently resolved. Which counter governs progression is part
 * of the founder-gated multi-lane exposure accounting (named in the P243 final report); until
 * that resolves, a surface may render any measure ONLY under its own name, and the divergences
 * are the object's honest remainder — not a banner, a field.
 */
import fs from "node:fs";
import path from "node:path";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * @param {string} dataRoot  app/public/data
 * @returns one derived Bank Builder state object
 */
export function deriveBankBuilderState(dataRoot) {
  const dp = readJson(path.join(dataRoot, "mr-dub", "daily-portfolio.json"));
  const pf = readJson(path.join(dataRoot, "mr-dub", "portfolio.json"));
  const lc = readJson(path.join(dataRoot, "products", "lifecycle", "latest.json"));

  const lanes = (dp?.lanes ?? []).filter((l) => l.product === "bank-builder").map((l) => ({
    lane: l.lane, step: l.step, status: l.status, stake: l.stake, exposure: l.exposure ?? null,
  }));
  const liveExposure = dp?.products?.bankBuilder?.exposure ?? null;
  const settledExposure = pf?.openExposure ?? null; // the settled-money authority's view (post-settlement)
  const crownedLadders = Array.isArray(pf?.completedLadders) ? pf.completedLadders.length : null;

  const storePositions = {};
  for (const [k, v] of Object.entries(lc?.positions ?? {})) {
    if (k.startsWith("bank-builder")) storePositions[k] = { cycle: v.cycle, step: v.step, transition: v.transition };
  }

  const divergences = [];
  for (const l of lanes) {
    const pos = storePositions[`bank-builder-lane-${l.lane}`];
    if (pos && pos.step !== l.step) {
      divergences.push({
        kind: "STEP_COUNTER",
        lane: l.lane,
        generated: l.step,
        lifecycleStore: pos.step,
        // P255: this used to call the choice of counter an open founder question. It is answered: the
        // generator and the board both follow the official daily receipts (products/ladder-position.mjs).
        // The store's counter is kept visible as history, not hidden.
        note: "the lifecycle store's position comes from the 2026-08-17 card store, which nothing has written since; today's card and this board follow the official daily receipts, so the store's counter is history, not the rung",
      });
    }
  }

  return {
    product: "bank-builder",
    date: dp?.date ?? null,
    lanes,
    exposure: { live: liveExposure, settledAuthority: settledExposure },
    cycles: {
      // Three DIFFERENT measures — none is "the" cycle until the gated accounting says so.
      crownedLadders,            // portfolio.json: ladders actually crowned (settled money)
      lifecycleStore: storePositions, // P211 machine: rule-derived per-lane positions
      displayAttemptCounterSource: "lane artifact label text",
    },
    divergences,
    record: pf?.record ?? null,
    activeBankroll: dp?.activeBankroll ?? pf?.currentBankroll ?? null,
  };
}
