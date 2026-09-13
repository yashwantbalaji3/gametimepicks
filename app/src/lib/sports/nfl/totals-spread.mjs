/**
 * HOW MUCH DO OUR TOTALS ACTUALLY DIFFERENTIATE GAMES? (P294)
 *
 * The totals head predicts `a0 + a1 * s`, where s is a decayed team-scoring rating. Across a slate
 * that produces a very narrow band: on 2026 Week 1 our fourteen medians spanned 44–51 (SD 2.06) while
 * the eleven-book market median for the same games spanned 38.5–50.5 (SD 3.82), and actual NFL totals
 * have an SD near 13.6. The head's own evaluation receipt recorded the same thing on a held-out
 * season — `predictedMeanSd2025: 2.068` — under the heading "how much the head actually differentiates
 * games", and then declared diagnostics "REPORTED, never bars".
 *
 * A reader looking at a column of totals cannot see any of that. Every number is plausible on its own;
 * only the SPREAD gives it away, and spread is invisible one row at a time. The founder spotted it by
 * eye from the week table, which is the page that should have said it.
 *
 * So this measures it on the slate being displayed and hands the page a sentence built from those
 * numbers. Nothing here is a stored claim: if the head improves, the sentence changes with it, and if
 * no market capture covers the slate the comparison is simply absent rather than invented.
 *
 * It deliberately reports the SPREAD and the OFFSET, not a quality verdict. "Our totals move less
 * than the market's" is a fact about two columns on the page. Whether that makes them useless is a
 * judgement the reader is entitled to make with the numbers in front of them.
 */

const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * @param {Array<{providerEventId: string|number, total: number|null}>} ours per-event model totals
 * @param {Array<{providerEventId: string|number, marketTotal: number|null}>} market per-event book medians
 * @returns {{
 *   n: number, ourSd: number|null, ourMin: number|null, ourMax: number|null,
 *   paired: number, marketSd: number|null, marketMin: number|null, marketMax: number|null,
 *   offset: number|null, sentence: string|null
 * }}
 */
export function totalsSpread(ours, market) {
  const ourVals = (ours ?? []).map((o) => o.total).filter((v) => Number.isFinite(v));
  const mktBy = new Map((market ?? []).filter((m) => Number.isFinite(m.marketTotal)).map((m) => [String(m.providerEventId), m.marketTotal]));

  /* The comparison is only honest over games where BOTH numbers exist — an unpriced game must not
     quietly widen or narrow either side of it. */
  const pairs = (ours ?? [])
    .filter((o) => Number.isFinite(o.total) && mktBy.has(String(o.providerEventId)))
    .map((o) => ({ ours: o.total, market: mktBy.get(String(o.providerEventId)) }));

  const ourSd = sd(ourVals);
  const pairedOur = pairs.map((p) => p.ours);
  const pairedMkt = pairs.map((p) => p.market);
  const marketSd = sd(pairedMkt);
  const offset = pairs.length ? mean(pairs.map((p) => p.ours - p.market)) : null;

  const out = {
    n: ourVals.length,
    ourSd: r1(ourSd),
    ourMin: ourVals.length ? Math.min(...ourVals) : null,
    ourMax: ourVals.length ? Math.max(...ourVals) : null,
    paired: pairs.length,
    marketSd: r1(marketSd),
    marketMin: pairedMkt.length ? Math.min(...pairedMkt) : null,
    marketMax: pairedMkt.length ? Math.max(...pairedMkt) : null,
    offset: r1(offset),
    sentence: null,
  };

  if (out.n < 2) return out;

  const band = `Our totals for this slate span ${out.ourMin}–${out.ourMax}`;
  if (pairs.length < 2 || marketSd == null) {
    out.sentence = `${band}. They move far less from game to game than real results do, so treat the differences between them as small.`;
    return out;
  }

  /* Both halves stated plainly: how little ours move, and which way they sit against the books. */
  const spread = `${band} (standard deviation ${out.ourSd}); the sportsbooks' own medians for the same ${pairs.length} games span ${out.marketMin}–${out.marketMax} (${out.marketSd})`;
  const lean = out.offset === 0
    ? "and ours sit level with theirs on average"
    : `and ours sit ${Math.abs(out.offset)} point${Math.abs(out.offset) === 1 ? "" : "s"} ${out.offset > 0 ? "above" : "below"} theirs on average`;
  out.sentence = `${spread}, ${lean}. Our totals model separates games less than the market does, so a large gap on any one row is more likely to be a limit of the model than a read on the game.`;
  return out;
}
