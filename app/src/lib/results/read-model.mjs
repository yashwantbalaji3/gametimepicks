/**
 * THE PERFORMANCE READ MODEL — one way to ask, five records that stay separate.
 *
 * Program 233 · Release B. Five ledgers already exist and are already correct: the Parlay Lab's
 * paper slips (five streams × four risk tiers), each sport's graded model picks, Bank Builder's
 * money portfolio, Moonshot's own lane, and the MLB projection audit. Their separation is not an
 * accident to be tidied away — a model pick and a paper slip are different populations, and a leg
 * is not a parlay.
 *
 * What did not exist is any way for a READER to ask a question of them. `/results` shipped zero
 * filter controls: no record-type selector, no sport filter, no date range, no risk tier. Every
 * number on it was a headline with no path to the rows underneath.
 *
 * SO THIS PROJECTS, IT DOES NOT COMPUTE. Every figure here is read from a committed ledger that a
 * settlement owner already wrote. Nothing re-grades, nothing re-prices, and nothing merges two
 * populations into a total — `RECORD_TYPES` is a closed set precisely so a caller must SAY which
 * record it is asking about instead of getting a blended one by default.
 *
 * THE DENOMINATOR IS THE PRODUCT. A hit rate over zero decisive selections is not 0% and not 100%;
 * it is unavailable, and it says so. Pushes and voids are carried beside wins and losses rather than
 * folded into either, because folding them is how a record quietly improves.
 */

/** The populations. A caller names one; there is no "all records" that averages across them. */
export const RECORD_TYPES = Object.freeze({
  SUGGESTED_PARLAY: "suggested-parlay",   // published paper slips, graded whole, per risk tier
  MODEL_PICK: "model-pick",               // single model selections, graded per selection
  SIGNATURE_PRODUCT: "signature-product", // Bank Builder / Moonshot money ladders
});

export const RISK_TIERS = Object.freeze(["low", "medium", "high", "longshot"]);

/**
 * A rate with its denominator, or an explicit absence.
 *
 * Returning `null` for the rate — rather than 0 — is the whole point: a tier with no settled cards
 * has no hit rate, and rendering 0% there reads as "this strategy loses every time" when the truth
 * is "nothing has been graded yet".
 */
export function rate(wins, losses) {
  const decisive = (wins ?? 0) + (losses ?? 0);
  return decisive === 0
    ? { value: null, decisive: 0, available: false, reason: "no settled decisive selections yet" }
    : { value: wins / decisive, decisive, available: true, reason: null };
}

/**
 * Wilson score interval — an honest band for a proportion at small n, where the normal
 * approximation is worst and every one of these samples is small.
 */
export function interval(wins, losses, z = 1.96) {
  const n = (wins ?? 0) + (losses ?? 0);
  if (n === 0) return null;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half), n };
}

/** One row of the read model. Every field is read; none is derived from another record type. */
function row({ recordType, sport, tier, wins, losses, pushes, voids, pending, staked, returned, source, note }) {
  const r = rate(wins, losses);
  return {
    recordType, sport, tier: tier ?? null,
    wins: wins ?? 0, losses: losses ?? 0, pushes: pushes ?? 0, voids: voids ?? 0, pending: pending ?? 0,
    decisive: r.decisive,
    settled: (wins ?? 0) + (losses ?? 0) + (pushes ?? 0) + (voids ?? 0),
    hitRate: r,
    interval: interval(wins, losses),
    /* Money fields travel only where the source is a money ledger. A calibration record that grew a
       `staked` column would become summable with the paper products, which is the failure the ledger
       separation exists to prevent. */
    staked: staked ?? null,
    returned: returned ?? null,
    source,
    note: note ?? null,
  };
}

/**
 * Project the committed ledgers into rows.
 *
 * @param {{ labLedger?: any, gradedBySport?: Record<string, any>, portfolio?: any, moonshot?: any }} sources
 */
export function buildResultRows(sources = {}) {
  const rows = [];
  const { labLedger, gradedBySport = {}, portfolio, moonshot } = sources;

  /* ── suggested paper slips, whole-slip, per sport and per tier ─────────────────────────────── */
  for (const s of labLedger?.streams ?? []) {
    const rec = s.record ?? {};
    rows.push(row({
      recordType: RECORD_TYPES.SUGGESTED_PARLAY, sport: s.id, tier: null,
      wins: rec.wins, losses: rec.losses, pushes: rec.pushes,
      staked: rec.staked, returned: rec.returned,
      source: "parlays/lab-ledger.json",
      note: s.live === false ? "stream not live" : null,
    }));
    /* byTier is an OBJECT keyed by tier; reading it as an array yields [] and every tier silently
       disappears. That exact mistake is recorded in the ledger-reconciliation guard. */
    for (const [tier, t] of Object.entries(s.byTier ?? {})) {
      rows.push(row({
        recordType: RECORD_TYPES.SUGGESTED_PARLAY, sport: s.id, tier,
        wins: t.wins, losses: t.losses, pushes: t.pushes,
        staked: t.staked, returned: t.returned,
        source: "parlays/lab-ledger.json",
      }));
    }
  }

  /* ── single model selections, per sport ────────────────────────────────────────────────────── */
  for (const [sport, g] of Object.entries(gradedBySport)) {
    const c = g?.counts ?? {};
    rows.push(row({
      recordType: RECORD_TYPES.MODEL_PICK, sport,
      wins: c.hits, losses: c.misses, voids: c.voided,
      /* `total` counts every published pick; `counted` counts the decided ones. The difference is
         genuinely pending or ungraded and is reported rather than dropped from the denominator. */
      pending: Math.max(0, (c.total ?? 0) - (c.counted ?? 0) - (c.voided ?? 0)),
      source: `${sport}/graded-picks.json`,
      note: g?.moneyClass === "NON_MONEY" ? "model selections — no stake is recorded for these" : null,
    }));
  }

  /* ── signature money products ──────────────────────────────────────────────────────────────── */
  const money = [
    ["bank-builder", portfolio?.record ?? portfolio?.bankBuilder?.record ?? null, "mr-dub/portfolio.json"],
    ["moonshot", moonshot?.record ?? null, "product-ledger/moonshot.json"],
  ];
  for (const [id, rec, source] of money) {
    if (!rec) continue;
    rows.push(row({
      recordType: RECORD_TYPES.SIGNATURE_PRODUCT, sport: id,
      wins: rec.wins, losses: rec.losses, pushes: rec.pushes, voids: rec.voids, pending: rec.pending,
      staked: rec.staked ?? null, returned: rec.returned ?? null,
      source,
    }));
  }

  return rows;
}

/**
 * Narrow the rows. Every filter is exact; an unknown value returns nothing rather than silently
 * widening the scope, because a filter that quietly ignores itself is worse than one that finds
 * nothing.
 */
export function filterRows(rows, { recordType = null, sport = null, tier = null } = {}) {
  return rows.filter((r) =>
    (!recordType || r.recordType === recordType) &&
    (!sport || r.sport === sport) &&
    (tier === null ? true : r.tier === tier));
}

/**
 * Pool a set of rows into one record.
 *
 * Pools WINS AND LOSSES, never averages rates — averaging daily or per-tier percentages weights a
 * two-card tier the same as a forty-card one. Refuses to pool across record types at all: that is
 * the combined-total failure, and it is a throw rather than a warning.
 */
export function poolRows(rows) {
  const types = new Set(rows.map((r) => r.recordType));
  if (types.size > 1) {
    throw new Error(`results: refusing to pool across record types (${[...types].join(", ")}) — they are different populations`);
  }
  const sum = (k) => rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  const wins = sum("wins");
  const losses = sum("losses");
  return {
    recordType: [...types][0] ?? null,
    wins, losses, pushes: sum("pushes"), voids: sum("voids"), pending: sum("pending"),
    hitRate: rate(wins, losses),
    interval: interval(wins, losses),
    rows: rows.length,
  };
}
