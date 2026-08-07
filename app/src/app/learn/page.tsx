/**
 * /learn — the plain-English education hub. Explains how to read the product (model vs market
 * probability, model gap, risk tiers), the three tools (Projections / Suggested Cards / Build), Bank
 * Builder, why some picks are gated, and the paper-only framing. This is where long explanations
 * live so the action pages (today/games/picks/build/sport hubs) stay scannable. No betting advice.
 */
import Link from "next/link";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Learn · GameTime Picks",
  description:
    "How to read GameTime Picks — model vs market probability, model gap, risk tiers, suggested cards, Bank Builder, and why some markets are gated. Educational, paper-only.",
};

function Concept({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] px-4 py-4 flex flex-col gap-1.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
      <span className="font-display tracking-tight" style={{ color: "var(--vault-gold-bright)", fontSize: 15, fontWeight: 700 }}>{term}</span>
      <p style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.55 }}>{children}</p>
    </div>
  );
}

const TIERS: Array<{ tier: string; tone: string; note: string }> = [
  { tier: "Low", tone: "var(--vault-success)", note: "Lower-variance picks — favorites, conservative totals. More likely to land, smaller payout." },
  { tier: "Medium", tone: "var(--vault-gold-bright)", note: "Balanced risk — modest plus-money. The everyday middle ground." },
  { tier: "High", tone: "var(--vault-warn)", note: "Plus-money with real variance — bigger payout, lands less often." },
  { tier: "Longshot", tone: "var(--vault-text-mute)", note: "High-variance combos, clearly labeled. Fun to track; rarely hits." },
];

const SPORTS: Array<{ name: string; note: string }> = [
  { name: "MLB", note: "The only sport with a live model. Player-prop simulations — pitcher strikeouts, batter hits, total bases — run against the posted line, plus game-level market context." },
  { name: "NBA", note: "History only. The settled record from earlier seasons stays readable, but nothing new is being modelled or published for NBA." },
  { name: "UFC", note: "Market-implied only. Win probabilities are read from the posted price; there is no fight model behind them, and no method / distance / round markets." },
  { name: "World Cup", note: "Closed. The 2026 tournament ran 90-minute regulation only (a Draw was a real third outcome). Kept as an archive of what was published at the time." },
];

const GATES: Array<{ label: string; note: string }> = [
  { label: "Predictions switched off for the market", note: "This market's own settled record sits below break-even, so we make no prediction in it. The history stays visible." },
  { label: "Waiting on lineups", note: "A player prop needs the confirmed starting lineup before it can be shown as a card leg." },
  { label: "Market unavailable", note: "The odds provider doesn't offer this market for this event, so there is no price to read against." },
  { label: "Not enough settled results", note: "Too few decided results to say anything yet. It is reported and never acted on." },
];

export default function LearnPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-9">
      <SectionHeader
        as="h1"
        eyebrow="Learn"
        title="How to read GameTime Picks"
        sub="A 2-minute guide for everyone — no betting background needed. Everything here is educational and paper-only: there are no real wagers, just hypothetical paper tracked honestly."
      />

      {/* Anchor quick-nav */}
      <nav aria-label="Learn sections" className="flex flex-wrap gap-1.5">
        {[
          { href: "#start", label: "Start here" },
          { href: "#probabilities", label: "The three probabilities" },
          { href: "#projections", label: "Reading a card" },
          { href: "#picks", label: "Picks" },
          { href: "#build", label: "Build" },
          { href: "#bank-builder", label: "Bank Builder" },
          { href: "#sports", label: "Sports" },
          { href: "#methodology", label: "Methodology" },
          { href: "#glossary", label: "Glossary" },
        ].map((a) => (
          <a key={a.href} href={a.href} className="vault-press rounded-full px-3 py-1 font-mono uppercase tracking-[0.08em]"
            style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10, textDecoration: "none" }}>
            {a.label}
          </a>
        ))}
      </nav>

      {/* Start here — the whole flow in one line */}
      <section id="start" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Start here</h2>
        <div className="rounded-[10px] px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          {[
            { n: "1", t: "Today", d: "What's live now", href: "/today" },
            { n: "2", t: "Simulate", d: "Pick a game, any sport", href: "/simulate" },
            { n: "3", t: "Picks", d: "The model's cards", href: "/picks" },
            { n: "4", t: "Build", d: "Make your own", href: "/build" },
          ].map((s) => (
            <Link key={s.n} href={s.href} className="vault-press flex flex-col gap-0.5" style={{ textDecoration: "none" }}>
              <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{s.n}</span>
              <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{s.t}</span>
              <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{s.d}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* THE canonical explanation of the three probability layers. Every other page that shows those
          numbers carries a one-line local note and links back to this anchor — one place to keep true
          instead of four copies drifting apart. */}
      <section id="probabilities" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>The three probabilities</h2>
        <p style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.55, maxWidth: "70ch" }}>
          Wherever we show a chance for the same outcome, you may see it three ways. They are not three
          opinions of equal weight — the third one is the benchmark the other two are measured against.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Concept term="Raw simulation">
            What the simulation produced, unmodified. Kept as evidence and never overwritten — and
            historically about nine points more confident than the settled results justified.
          </Concept>
          <Concept term="Calibrated">
            The raw number corrected against what actually happened on earlier slates. This makes our
            stated confidence more accurate; it does not add predictive information.
          </Concept>
          <Concept term="Sportsbook (no-vig)">
            Derived from <em>both</em> sides of the posted price with the bookmaker&apos;s margin
            removed. It is their number, not ours, and on the settled record it is the better estimate.
          </Concept>
        </div>
        <div className="rounded-[10px] px-4 py-4" style={{ background: "rgba(26, 16, 11,0.45)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55 }}>
            <strong style={{ color: "var(--vault-text)" }}>The difference between our number and theirs is a
            disagreement, not an advantage.</strong> On the settled record, the largest disagreements have
            settled <em>worse</em> than the small ones, so nothing on this site is ranked or recommended by
            the size of that difference. Where a market&apos;s own measured record sits below break-even, we
            switch its predictions off and keep the history visible.
          </p>
        </div>
      </section>

      <section id="projections" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>The numbers on a card</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Concept term="Odds">Shown American-style: −150 means risk 150 (paper) to win 100; +130 means risk 100 to win 130. Combine legs and the odds multiply.</Concept>
          <Concept term="Decided vs pending">A rate only counts results that have been decided. Pending games are not counted yet, and pushes are listed separately rather than folded in.</Concept>
          <Concept term="Denominator">Every rate on the site is shown with how many decided results it is over and how wide its uncertainty is. A rate over a small sample is mostly noise.</Concept>
          <Concept term="Withheld vs not produced">A slate we refused to settle after an integrity check reads &ldquo;withheld&rdquo;. A date where no slate was ever built reads &ldquo;not produced&rdquo;. Neither carries a rate, and neither is hidden.</Concept>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Risk tiers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TIERS.map((t) => (
            <div key={t.tier} className="flex items-start gap-3 rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <span className="font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ color: t.tone, border: `1px solid ${t.tone}`, fontSize: 10 }}>{t.tier}</span>
              <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.5 }}>{t.note}</span>
            </div>
          ))}
        </div>
      </section>

      <span id="build" className="scroll-mt-16" aria-hidden />
      <section id="picks" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>The three tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Concept term="Projections">Every market the model has a read on — shown with model %, market %, and the gap between them. A &ldquo;projection view&rdquo; is information; not every view is suggested as a card.</Concept>
          <Concept term="Suggested cards">The model&apos;s actual paper picks for the day, bundled into cards by risk tier. Enter any stake to see the projected paper return. Browse them all on <Link href="/build#suggested-cards" style={{ color: "var(--vault-gold-bright)" }}>Picks</Link>.</Concept>
          <Concept term="Build">Make your own paper card from eligible legs across sports on <Link href="/build" style={{ color: "var(--vault-gold-bright)" }}>Build</Link> — add legs, set a stake, and see the combined odds + payout live.</Concept>
        </div>
      </section>

      <section id="bank-builder" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Bank Builder</h2>
        <div className="rounded-[10px] px-4 py-4" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.55 }}>
            A transparent <strong style={{ color: "var(--vault-text)" }}>paper</strong> ladder: one disciplined pick per rung, compounding a starting bankroll toward a target. It only advances when a genuinely eligible low-risk card clears strict gates — when nothing qualifies, it waits rather than forcing a pick. Track it on <Link href="/bank-builder" style={{ color: "var(--vault-gold-bright)" }}>Bank Builder</Link>. Paper-only, for education.
          </p>
        </div>
      </section>

      <section id="sports" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>By sport</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SPORTS.map((s) => (
            <div key={s.name} className="rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>{s.name}</span>
              <p className="mt-0.5" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.5 }}>{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Why some picks aren&apos;t suggested</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {GATES.map((g) => (
            <div key={g.label} className="rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.45)", border: "1px solid var(--vault-border)" }}>
              <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{g.label}</span>
              <p className="mt-0.5" style={{ color: "var(--vault-text-faint)", fontSize: 12, lineHeight: 1.5 }}>{g.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Per-market claims used to live here as a hand-written summary ("hits Overs are the strongest
          settled market", "REB/PRA were the strongest recent markets"). They were written from one
          window of settled data and then never revised, so they aged into confident statements nobody
          was re-checking. What replaced them is a description of the PROCESS, which does not go stale;
          the live per-market standing is read from the canonical record on Results. */}
      <section id="methodology" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>How a market earns its place</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            ["Every market is measured, not assumed", "Each market carries its own settled record. Until it has enough decided results to say anything, it is reported and nothing more — its numbers are never used to lead a page."],
            ["The benchmark is the sportsbook, not 50%", "A market clearing half its calls proves nothing. It is scored against the de-vigged market price on the identical settled rows, and so far none of ours scores better."],
            ["A bad record switches predictions off", "When a market's hit-rate interval sits entirely below break-even across a large sample, we stop making predictions in it. The history stays on the site and is never placed in a ranked list."],
            ["Settlement is official or it does not happen", "Results come from official box scores. If the event mapping fails an integrity check, the whole slate is withheld rather than partially graded."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-[10px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{t}</span>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{d}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/results" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>The settled record →</Link>
          <Link href="/methodology" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>Full methodology →</Link>
        </div>
      </section>

      <section id="glossary" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Glossary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            ["Model probability", "Our model's estimate that an outcome happens, 0–100%."],
            ["Implied / market probability", "The same chance baked into the sportsbook price, margin removed."],
            ["Model gap", "Model probability minus market probability — a difference, not a proven advantage. Positive = the model reads it higher than the price."],
            ["American odds", "−150 = risk 150 to win 100; +130 = risk 100 to win 130."],
            ["Parlay", "Several picks combined into one card — all must hit; the odds multiply."],
            ["Leg", "A single pick inside a parlay card."],
            ["Lineup pending", "A player prop shown before the starting lineup is confirmed — labeled until lineups post."],
            ["Model-only", "A pick the model rates but the sportsbook doesn't price — shown without a paper payout (e.g. some UFC cards)."],
            ["Gated", "A projection the model has, but that hasn't cleared our bar to be a suggested card yet."],
          ].map(([term, def]) => (
            <div key={term} className="rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{term}</span>
              <p className="mt-0.5" style={{ color: "var(--vault-text-faint)", fontSize: 12, lineHeight: 1.5 }}>{def}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[10px] px-4 py-4" style={{ background: "rgba(26, 16, 11,0.45)", border: "1px solid var(--vault-border)" }}>
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>Paper-only</span>
        <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55 }}>
          GameTime Picks is an educational analytics project. Nothing here is betting advice or a recommendation to wager. Every &ldquo;stake&rdquo; and &ldquo;payout&rdquo; is hypothetical paper, tracked honestly — wins and losses both. For every term (model %, market %, model gap, confidence, no-play, pending) see the <Link href="/market-guide" style={{ color: "var(--vault-gold-bright)" }}>Market Guide</Link>; for the full model write-up see <Link href="/methodology" style={{ color: "var(--vault-gold-bright)" }}>Methodology</Link>; for our stance see <Link href="/responsible-use" style={{ color: "var(--vault-gold-bright)" }}>Responsible use</Link>.
        </p>
      </section>
    </div>
  );
}
