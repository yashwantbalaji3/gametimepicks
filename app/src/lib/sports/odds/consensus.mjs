/**
 * TWO-WAY MARKET CONSENSUS (P276) — a median that is still a probability distribution.
 *
 * Each book's two-way price is de-vigged proportionally, so within ONE book home + away = 1 exactly.
 * The consensus across books was then built by taking the median of the home probabilities and,
 * separately, the median of the away probabilities — and a median is not a linear operator. The two
 * medians can come from different books, so their sum is 1 only by coincidence.
 *
 * Measured on the 2026-09-12 NFL capture: 10 of 13 events summed outside the settlement contract's
 * ±1e-3 tolerance (1.0003 to 1.0075, worst on the most lopsided games — CLE@JAX 0.7799/0.2277), and
 * the contract refused a settlement target for every one of them. Ten of the thirteen games we had
 * just paid to price could not be graded against the market.
 *
 * The fix is to normalise the pair. Both medians still carry their books' information; dividing by
 * their sum is the smallest change that makes the result a distribution, and it is symmetric — the
 * alternative (take the home median, derive away as 1 − home) silently discards one side's books.
 *
 * A CONSENSUS IS NOT A FORECAST. These are the books' own numbers with the margin removed; this
 * repo publishes them as market context and has never shown a model that beats them.
 */

/** Lower median — the same rule the capture scripts already used, extracted so there is one. */
export function medianOf(values) {
  const s = (values ?? []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

/**
 * The de-vigged two-way consensus across books, normalised so it sums to exactly 1.
 *
 * @param {Array<{noVigWinProb?: {home?: number, away?: number}}>} books
 * @returns {{homeWinProbNoVig: number|null, awayWinProbNoVig: number|null, basis: string, books: number, preNormalisedSum: number|null}}
 */
export function twoWayConsensus(books) {
  const list = books ?? [];
  const home = medianOf(list.map((b) => b?.noVigWinProb?.home));
  const away = medianOf(list.map((b) => b?.noVigWinProb?.away));
  const basis =
    "median across captured books of each side's proportionally de-vigged price, then normalised so the pair sums to 1 " +
    "(two independent medians need not, and on a lopsided game they miss by most)";
  /* One side alone is not a consensus. Publishing the home median with a null away would be half a
     distribution wearing the name of a whole one, and every downstream sum check would read the
     missing side as zero. Both or neither. */
  if (!Number.isFinite(home) || !Number.isFinite(away)) {
    return { homeWinProbNoVig: null, awayWinProbNoVig: null, basis, books: list.length, preNormalisedSum: null };
  }
  const sum = home + away;
  /* A non-positive sum is not a market to normalise — it is corrupt input, and inventing 0.5/0.5
     from it would be the same class of mistake as the unnormalised median. */
  if (!(sum > 0)) return { homeWinProbNoVig: null, awayWinProbNoVig: null, basis, books: list.length, preNormalisedSum: sum };
  const round = (v) => Math.round(v * 1e6) / 1e6;
  const h = round(home / sum);
  /* The away side is the complement of the ROUNDED home value, so the published pair sums to 1 at
     the precision it is published in — rounding both independently can leave a 1e-6 residue, which
     is exactly the kind of near-miss a tolerance check is there to catch. */
  return {
    homeWinProbNoVig: h,
    awayWinProbNoVig: round(1 - h),
    basis,
    books: list.length,
    /** What the two medians summed to before normalising — the size of the correction, kept as evidence. */
    preNormalisedSum: round(sum),
  };
}
