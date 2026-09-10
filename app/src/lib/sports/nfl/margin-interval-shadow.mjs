/**
 * THE MARGIN-INTERVAL CHALLENGER, GRADED IN SHADOW — how the NFL margin band gets better from results
 * without anyone tuning it by hand.
 *
 * The preregistration (data/internal/research/nfl/reports/margin-interval-challenger-preregistration.json,
 * frozen 2026-09-10) names exactly one challenger: the incumbent's own median, with its 80% band set
 * from the empirical 10th/90th percentiles of the 2023–24 training residuals instead of a normal
 * curve. On the held-out 2025 season the two were indistinguishable — incumbent 0.8246, challenger
 * 0.8175, both inside the contract's band, and flat across pre-game terciles of the predicted margin
 * (0.84 / 0.82 / 0.81). So the incumbent keeps publishing; the challenger is scored beside it on every
 * settled regular-season game, and the frozen regular-season contract alone decides whether it takes
 * over:
 *
 *   · under the contract minimum (games AND weeks) the figures are reported and decide nothing
 *   · PROMOTE only when the challenger's coverage is inside the band while the incumbent's is not
 *   · otherwise KEEP the incumbent
 *   · a preregistration whose bytes changed decides nothing, ever
 *
 * The bars are read from the contract's own text, never typed here, so they cannot drift apart. The
 * two medians are identical by construction, so the MAE bar is met automatically and reported as such.
 */

export const CHALLENGER = Object.freeze({
  id: "margin-interval-empirical-residuals-v1",
  // Produced by the preregistered procedure (train 2023–24 residuals); pinned against the evaluation
  // report's `fit` block by the test beside this file.
  residualQ10: -17.409,
  residualQ90: 17.416,
  preregistration: "data/internal/research/nfl/reports/margin-interval-challenger-preregistration.json",
  preregistrationSha256: "4aa70f85ded08fe1444fa2709c7e199cabebe04d9ac82cfafdbcecc444fbb4dc",
});

const round1 = (n) => Math.round(n * 10) / 10;

/** The challenger's 80% band around a published median. */
export function challengerInterval(median) {
  return { p10: round1(median + CHALLENGER.residualQ10), p90: round1(median + CHALLENGER.residualQ90) };
}

/** The contract's bars, parsed from its own words. Throws when the wording no longer says them. */
export function contractBars(contract) {
  const minimumSample = Number(contract?.evaluationMode?.minimumSample);
  const minimumWeeks = Number(contract?.evaluationMode?.minimumWeeks);
  const req = String(contract?.bars?.marginHead?.requirement ?? "");
  const band = /BAND\s+([0-9.]+)\s*-\s*([0-9.]+)/.exec(req);
  const pad = /by more than ([0-9.]+) points/.exec(req);
  if (!Number.isFinite(minimumSample) || !Number.isFinite(minimumWeeks) || !band || !pad) {
    throw new Error("contractBars: the regular-season contract no longer states its margin bars in the expected words");
  }
  return { minimumSample, minimumWeeks, bandLo: Number(band[1]), bandHi: Number(band[2]), maePad: Number(pad[1]) };
}

const isRegular = (st) => st === 2 || st === "2" || /regular/i.test(String(st ?? ""));

/** Every settled REGULAR-SEASON margin, from the experimental settlement receipts. */
export function shadowRows(settlementDocs) {
  const rows = [];
  const seen = new Set();
  for (const doc of settlementDocs ?? []) {
    for (const e of doc?.events ?? []) {
      const m = e?.grade?.margin;
      if (!isRegular(e?.seasonType) || !m || !Number.isFinite(m.projected) || !Number.isFinite(m.actual)) continue;
      const id = String(e.canonicalEventId ?? e.providerEventId ?? "");
      if (!id || seen.has(id)) continue; // exactly once per game
      seen.add(id);
      const iv = challengerInterval(m.projected);
      rows.push({ id, week: e.week ?? null, projected: m.projected, actual: m.actual, incumbentInside: m.insideInterval80 === true, challengerInside: m.actual >= iv.p10 && m.actual <= iv.p90 });
    }
  }
  return rows;
}

/** The contract's verdict on the rows so far. */
export function decide({ rows, contract, preregistrationSha256 }) {
  const bars = contractBars(contract);
  const n = rows.length;
  const weeks = new Set(rows.map((r) => r.week).filter((w) => w != null)).size;
  const cov = (k) => (n ? rows.filter((r) => r[k]).length / n : null);
  const inc = cov("incumbentInside"), cha = cov("challengerInside");
  const inBand = (c) => c != null && c >= bars.bandLo && c <= bars.bandHi;
  const figures = {
    n, weeks, bars,
    incumbent: { id: "incumbent", coverage80: inc == null ? null : Number(inc.toFixed(4)), inBand: inBand(inc) },
    challenger: { id: CHALLENGER.id, coverage80: cha == null ? null : Number(cha.toFixed(4)), inBand: inBand(cha) },
    maeDelta: 0,
    maeNote: "identical medians by construction, so identical MAE — the MAE bar is met automatically",
  };
  if (preregistrationSha256 !== CHALLENGER.preregistrationSha256) {
    return { ...figures, decision: "PREREGISTRATION_ALTERED", why: "the preregistration's bytes no longer match the frozen hash — nothing is decided on an altered registration" };
  }
  if (n < bars.minimumSample || weeks < bars.minimumWeeks) {
    return { ...figures, decision: "INSUFFICIENT_SAMPLE", why: `${n}/${bars.minimumSample} games over ${weeks}/${bars.minimumWeeks} weeks — under the contract minimum the figures support no promotion in either direction` };
  }
  if (figures.challenger.inBand && !figures.incumbent.inBand) {
    return { ...figures, decision: "PROMOTE_CHALLENGER", why: `the challenger covers ${figures.challenger.coverage80} (inside ${bars.bandLo}–${bars.bandHi}) while the incumbent's ${figures.incumbent.coverage80} is outside it` };
  }
  return { ...figures, decision: "KEEP_INCUMBENT", why: figures.incumbent.inBand ? "the incumbent is inside the band — nothing to fix" : "the challenger is not inside the band either" };
}

/**
 * The band the generator publishes: the incumbent's, unless the contract has promoted the challenger.
 * A missing or unreadable report keeps the incumbent — promotion must be positively evidenced.
 */
export function publishedMarginInterval({ median, incumbentP10, incumbentP90, report }) {
  if (report?.decision === "PROMOTE_CHALLENGER" && report?.challenger?.id === CHALLENGER.id) {
    return { ...challengerInterval(median), source: CHALLENGER.id };
  }
  return { p10: incumbentP10, p90: incumbentP90, source: "incumbent" };
}
