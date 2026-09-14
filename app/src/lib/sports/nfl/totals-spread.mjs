/**
 * HOW DO OUR TOTALS COMPARE WITH THE SPORTSBOOKS'? (P294; reworded for new bettors in P295)
 *
 * On 2026 Week 1 the v1 totals head's fourteen medians spanned 44–51 (SD 2.06) while the eleven-book
 * market median for the same games spanned 38.5–50.5 (SD 3.82), and actual NFL totals have an SD near
 * 13.6. A reader looking at a column of totals cannot see any of that: every number is plausible on its
 * own, and only the SPREAD gives it away. The founder spotted it by eye from the week table, which is
 * the page that should have said it.
 *
 * So this measures the slate being displayed and hands the page a sentence built from those numbers.
 * Nothing here is a stored claim: when the head changes (v3 play-efficiency, P295) the sentence changes
 * with it, and every clause that compares the two columns is chosen BY the comparison — the P294
 * version asserted "ours separate games less" unconditionally, which a better head could make false.
 *
 * Plain words, because the reader may be new to betting: "run from 41 to 52 points", "higher than
 * theirs", "spread games out less". No standard deviations in the sentence; they stay in the fields.
 *
 * It reports, never grades. "Ours spread games out less than the books do" is a fact about two columns.
 */

const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const points = (x) => `${x} point${x === 1 ? "" : "s"}`;

/**
 * @param {Array<{providerEventId: string|number, total: number|null}>} ours per-event model totals
 * @param {Array<{providerEventId: string|number, marketTotal: number|null}>} market per-event book medians
 * @returns {{
 *   n: number, ourSd: number|null, ourMin: number|null, ourMax: number|null,
 *   paired: number, pairedOurSd: number|null, pairedOurMin: number|null, pairedOurMax: number|null,
 *   marketSd: number|null, marketMin: number|null, marketMax: number|null,
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
  const pairedOur = pairs.map((p) => p.ours);
  const pairedMkt = pairs.map((p) => p.market);

  const out = {
    n: ourVals.length,
    ourSd: r1(sd(ourVals)),
    ourMin: ourVals.length ? Math.min(...ourVals) : null,
    ourMax: ourVals.length ? Math.max(...ourVals) : null,
    paired: pairs.length,
    pairedOurSd: r1(sd(pairedOur)),
    pairedOurMin: pairedOur.length ? Math.min(...pairedOur) : null,
    pairedOurMax: pairedOur.length ? Math.max(...pairedOur) : null,
    marketSd: r1(sd(pairedMkt)),
    marketMin: pairedMkt.length ? Math.min(...pairedMkt) : null,
    marketMax: pairedMkt.length ? Math.max(...pairedMkt) : null,
    offset: pairs.length ? r1(mean(pairs.map((p) => p.ours - p.market))) : null,
    sentence: null,
  };

  if (out.n < 2) return out;

  if (pairs.length < 2 || out.marketSd == null) {
    out.sentence = `Across these ${out.n} games our projected totals run from ${out.ourMin} to ${out.ourMax} points. Real NFL scoring swings far more than that from game to game, so treat small differences between games as small.`;
    return out;
  }

  const lean = out.offset === 0
    ? "On average ours are the same as theirs"
    : `On average ours are ${points(Math.abs(out.offset))} ${out.offset > 0 ? "higher" : "lower"} than theirs`;
  const separation = out.pairedOurSd < out.marketSd
    ? "Ours spread games out less than the books do, so a big gap on one game is more likely a limit of our model than a read on that game."
    : out.pairedOurSd > out.marketSd
      ? "Ours spread games out more than the books do on this slate."
      : "Ours spread games out about as much as the books do.";
  out.sentence = `Across these ${pairs.length} games our projected totals run from ${out.pairedOurMin} to ${out.pairedOurMax} points; the sportsbooks' totals run from ${out.marketMin} to ${out.marketMax}. ${lean}. ${separation}`;
  return out;
}
