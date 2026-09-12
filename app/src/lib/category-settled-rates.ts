/**
 * THE A/B/C SETTLED RATES, IN ONE PLACE (P279).
 *
 * /about and the market-guide glossary each carried their own copy of these three numbers, for the
 * same 21,192 settled outcomes, and they disagreed: A matched at 49.3%, but /about said B 50.0% and
 * C 51.0% while the glossary said B 50.6% and C 51.7%. Two public pages stating different settled
 * rates for the same cohort is the kind of thing this whole site exists to not do.
 *
 * Neither copy carried a receipt, so neither could be shown to be the later measurement. The values
 * kept here are /about's, because that page presents them as its own measured claim with the cohort
 * beside them; the glossary now renders the same object rather than a second transcription.
 *
 * BOTH WERE ALSO WRONG, AND THE LEDGER SAID SO. `published-rate-claims.test.mjs` already recomputes
 * these from `public/data/mlb/results/settled_leans.jsonl`; run against it, the real rates are
 * A 49.35% (n=18,191), B 50.20% (n=5,940), C 50.94% (n=16,876) over 41,007 decisive rows — not the
 * 21,192 both pages claimed, which was an older snapshot neither had refreshed. The values below are
 * the measured ones, and that guard now checks THIS object rather than scanning each page for a
 * literal, so the numbers cannot drift from the ledger or from each other again.
 *
 * The direction is the part that matters and it survives: a larger disagreement with the market has
 * settled WORSE, not better.
 */
export const CATEGORY_SETTLED_RATES = Object.freeze({
  /** Decisive (win or loss) rows in the settled-leans ledger at `measuredOn`. */
  cohort: 41007,
  measuredOn: "2026-09-12",
  a: 49.4,
  b: 50.2,
  c: 50.9,
});

/** "A settled 49.4%, B 50.2%, C 50.9%" — the one phrasing both surfaces use. */
export const categoryRatesPhrase = (): string => {
  const r = CATEGORY_SETTLED_RATES;
  return `A settled ${r.a.toFixed(1)}%, B ${r.b.toFixed(1)}%, C ${r.c.toFixed(1)}%`;
};
