/**
 * SportMethodologyPanel — a short, honest "how this simulation works" explainer per sport. Complements
 * the SimulationCoverageMatrix (which lists market-by-market status): this panel is the narrative on what
 * kind of read it is (market-anchored / market-implied / experimental) and what is NOT claimed.
 *
 * Pure/static copy that matches the `market-coverage` registry's honesty baseline. No fabrication.
 */

type Sport = "mlb" | "nfl" | "soccer" | "ufc";

const METHODOLOGY: Record<Sport, { title: string; kind: string; lines: string[] }> = {
  // P175-C: NFL joins this SHARED owner rather than getting a forked panel. Purely additive —
  // every existing sport's copy is untouched, which is what lets MLB output stay byte-identical.
  nfl: {
    title: "How the NFL simulation works",
    kind: "experimental · regular-season team forecasts (public)",
    lines: [
      "Each week's games get independent team forecasts — win chance, projected score and a total range — from the public regular-season model. Every number reacts to the specific teams playing.",
      "The old preseason score model is archived: on its held-out season it picked winners no better than a coin flip, so it never fed products. The regular-season model replaced it, stays labelled experimental, and makes no claim to beat the sportsbook market.",
      "Player forecasts publish only where a family passed its evaluation (receptions, receiving yards, anytime touchdown). Passing and rushing stay withheld rather than invented, and availability states travel with every player row.",
    ],
  },
  mlb: {
    title: "How the MLB simulation works",
    kind: "independent full-game sim + 10,000-run player-prop sim",
    lines: [
      "Team markets (moneyline / run line / total) are the de-vigged sportsbook lines — a market-anchored read, settled from the official box score.",
      "Player props (strikeouts / hits / total bases) use a 10,000-run simulation from MLB Stats API game logs where the artifact exists; otherwise a projection vs the line.",
      "An independent full-game Monte Carlo — 10,000 complete simulated games built from the pregame board projections — produces the projected score, win probability and run distributions where its artifact qualifies; games without one show no projected score. It has not been validated to out-predict the market, and team totals stay out of product cards until settlement is proven.",
    ],
  },
  soccer: {
    title: "How the World Cup simulation works",
    kind: "market-implied 90-minute read",
    lines: [
      "A de-vigged, market-implied 90-minute read from real sportsbook odds — NOT an independent soccer simulation.",
      "Covers match result, double chance, draw-no-bet, total goals and BTTS where odds exist. Settled on the 90' result (extra time / penalties do not count for 90' markets).",
      "Player props, corners, cards and goalscorer markets need a provider feed + settlement — shown as unavailable, never faked. Finalists stay TBD until the semifinals are played.",
    ],
  },
  ufc: {
    title: "How the UFC read works (experimental)",
    kind: "experimental · market-implied moneyline",
    lines: [
      "Moneyline is a market-implied winner read from real MMA odds. Experimental — excluded from Bank Builder / Moonshot until the model clears its validation threshold.",
      "Method / distance are experimental fighter-data reads, not odds-backed and never priced into a card.",
      "Round / distance odds need a provider feed; results review is pending. Nothing is fabricated.",
    ],
  },
};

export default function SportMethodologyPanel({ sport }: { sport: Sport }) {
  const m = METHODOLOGY[sport];
  return (
    <section
      aria-label="Simulation methodology"
      className="rounded-[12px] px-4 py-4 flex flex-col gap-2"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>
          {m.title}
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>
          {m.kind}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {m.lines.map((line) => (
          <li key={line} className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            · {line}
          </li>
        ))}
      </ul>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>
        Market-by-market coverage below
      </p>
    </section>
  );
}
