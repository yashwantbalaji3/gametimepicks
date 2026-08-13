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
    kind: "experimental · 10,000-run preseason score simulation",
    lines: [
      "Every eligible game runs 10,000 simulations of the final score. The projected score, win chance, margin and total all come from that one set of runs, so they can never disagree with each other.",
      "It is an early model and we say so: tested on a full season it had never seen, it picked winners no better than a coin flip, so its win percentages sit deliberately close to even and it makes no claim to beat the sportsbook market.",
      "Player projections and touchdown cards need to know who actually plays. Nobody publishes that for preseason games, so those stay withheld rather than invented — the touchdown list is a watchlist, not a card.",
    ],
  },
  mlb: {
    title: "How the MLB simulation works",
    kind: "market-anchored + 10,000-run player-prop sim",
    lines: [
      "Team markets (moneyline / run line / total) are the de-vigged sportsbook lines — a market-anchored read, settled from the official box score.",
      "Player props (strikeouts / hits / total bases) use a 10,000-run simulation from MLB Stats API game logs where the artifact exists; otherwise a projection vs the line.",
      "There is no independent full-game score model yet — full-game outcomes are market-implied and labelled experimental. Team totals stay out of product cards until settlement is proven.",
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
      style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border)" }}
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
        Market-by-market coverage below · paper-only, educational
      </p>
    </section>
  );
}
