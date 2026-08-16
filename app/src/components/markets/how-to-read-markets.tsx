/**
 * Market Center reading key (Program 141).
 *
 * The founder's observation was that Market Center is "a wall of raw percentages, American prices
 * and 'pts' deltas" that assumes prior betting knowledge. Every number on that page is defensible;
 * none of them was defined anywhere a first-time reader would look.
 *
 * This is a native <details> disclosure — collapsed by default so it costs a returning user nothing,
 * keyboard-operable for free, and present on the page rather than hidden behind a tooltip that a
 * touch user cannot hover. It defines every term the default view actually shows, and nothing it
 * does not: a glossary listing fields that are not on screen is its own kind of noise.
 *
 * The worked example is the important part. "Model 58.6% − market 66.6% = −8.0 pp" turns three
 * disconnected numbers into one sentence, and it is the exact shape of a real row.
 */

type Term = { term: string; definition: string };

const TERMS: Term[] = [
  {
    term: "Model probability",
    definition:
      "What our simulation estimates the chance of this outcome to be. It is an estimate, not a prediction of what will happen.",
  },
  {
    term: "Market-implied probability",
    definition:
      "The chance the sportsbook's price implies, after removing their built-in margin (the 'vig'). This is what the market thinks.",
  },
  {
    term: "American odds",
    definition:
      "The sportsbook's price. −150 means you would risk 150 to win 100; +150 means you would risk 100 to win 150. A negative number is the more likely side.",
  },
  {
    term: "Moneyline",
    definition: "A bet on which team wins outright, with no handicap.",
  },
  {
    term: "Run line / spread",
    definition: "A handicap applied to the favourite, so both sides price closer to even.",
  },
  {
    term: "Total",
    definition: "The combined score of both teams, priced over or under a line.",
  },
  {
    term: "pp (percentage point)",
    definition:
      "The unit of the difference column. It is the gap between two percentages — NOT scoring points, and not a percentage change. 58.6% and 66.6% are 8.0 pp apart.",
  },
  {
    term: "Difference",
    definition:
      "Model probability minus market-implied probability, in pp. Positive means our model is higher than the market on the listed side; negative means lower. It is a measurement, not a recommendation.",
  },
  {
    term: "Data freshness",
    definition: "When the price and inputs behind a row were captured. Older captures are less reliable.",
  },
  {
    term: "Incomplete input",
    definition:
      "A required input (a lineup, a price, a stat) was missing when the row was built, so the model view is withheld or partial rather than guessed.",
  },
  {
    term: "Qualified",
    definition:
      "A market that met the published policy for appearing on a paper card. Most rows are never qualified — that is normal.",
  },
  {
    term: "No-play",
    definition:
      "The slate was checked in full and nothing met policy. It is a real answer, not a missing update.",
  },
];

export default function HowToReadMarkets() {
  return (
    <details
      className="rounded-xl"
      style={{ border: "1px solid var(--vault-border)", background: "rgba(11, 18, 14,0.45)" }}
    >
      <summary
        className="font-mono uppercase tracking-[0.14em] cursor-pointer px-4 py-3"
        style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
      >
        How to read this page
      </summary>

      <div className="px-4 pb-4 pt-1 flex flex-col gap-4">
        {/* The worked example first. It answers the question the glossary only answers piecemeal. */}
        <div
          className="rounded-lg px-3 py-3"
          style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-border)" }}
        >
          <p className="font-mono" style={{ color: "var(--vault-text)", fontSize: 12.5, lineHeight: 1.7 }}>
            model <strong>58.6%</strong> − market <strong>66.6%</strong> = <strong>−8.0 pp</strong>
          </p>
          <p className="mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.6, maxWidth: "62ch" }}>
            Our simulation puts this outcome at 58.6%. The sportsbook&rsquo;s price implies 66.6% once their
            margin is removed. The model is 8.0 percentage points <em>lower</em> than the market here.
          </p>
          <p className="mt-2" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.6, maxWidth: "62ch" }}>
            A large difference is <strong>not</strong> automatically a good bet. It usually means our model is
            missing something the market knows — our own settled record shows the model does not beat the
            market overall. Treat the difference as a question worth asking, not an answer.
          </p>
        </div>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {TERMS.map((t) => (
            <div key={t.term}>
              <dt className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>
                {t.term}
              </dt>
              <dd className="mt-0.5" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.55 }}>
                {t.definition}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

export { TERMS as MARKET_TERMS };
