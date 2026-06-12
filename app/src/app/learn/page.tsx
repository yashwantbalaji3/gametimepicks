/**
 * /learn — the plain-English education hub. Explains how to read the product (model vs market
 * probability, edge, risk tiers), the three tools (Projections / Suggested Cards / Build), Bank
 * Builder, why some picks are gated, and the paper-only framing. This is where long explanations
 * live so the action pages (today/games/picks/build/sport hubs) stay scannable. No betting advice.
 */
import Link from "next/link";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Learn · GameTime Picks",
  description:
    "How to read GameTime Picks — model vs market probability, edge, risk tiers, suggested cards, Bank Builder, and why some markets are gated. Educational, paper-only.",
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
  { name: "World Cup", note: "90-minute regulation only — a Draw is a real third outcome (no extra time/penalties). Double chance, total goals/corners, and player props (labeled lineup-pending until lineups post)." },
  { name: "MLB", note: "Player-prop projections — pitcher strikeouts, batter hits / total bases — from game logs vs the line, plus optimizer suggested cards." },
  { name: "NBA", note: "Player-prop projections — points, rebounds, assists and more — for the active slate, with Finals context preserved." },
  { name: "UFC", note: "Moneyline only (V1). Win probabilities vs the market price. Suggested cards are model-probability only — no market odds, so no paper payout is shown. No method/distance/round props yet." },
];

const GATES: Array<{ label: string; note: string }> = [
  { label: "Edge below card threshold", note: "The model agrees with the market — not enough disagreement to suggest a card. Shown as a projection view." },
  { label: "Waiting on lineups", note: "A player prop needs the confirmed starting lineup before it's card-eligible." },
  { label: "Market unavailable", note: "The current odds provider doesn't offer this market for this event yet." },
  { label: "Building a bigger sample", note: "Early-tournament or thin data — confidence is capped until more games are graded." },
];

export default function LearnPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-9">
      <SectionHeader
        eyebrow="Learn"
        title="How to read GameTime Picks"
        sub="A 2-minute guide for everyone — no betting background needed. Everything here is educational and paper-only: there are no real wagers, just hypothetical paper tracked honestly."
      />

      {/* Anchor quick-nav */}
      <nav aria-label="Learn sections" className="flex flex-wrap gap-1.5">
        {[
          { href: "#start", label: "Start here" },
          { href: "#projections", label: "Projections" },
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
            { n: "2", t: "Games", d: "Pick a game, any sport", href: "/games" },
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

      <section id="projections" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>The numbers on a card</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Concept term="Model probability">Our model&apos;s estimate of how likely an outcome is — e.g. &ldquo;Model 56%&rdquo; means the model thinks it happens 56 times out of 100.</Concept>
          <Concept term="Market probability">The same chance implied by the sportsbook&apos;s price (the odds), stripped of the book&apos;s margin. It&apos;s the &ldquo;crowd&rsquo;s&rdquo; estimate.</Concept>
          <Concept term="Edge">The gap between the two: Model − Market. A positive edge means the model rates the pick higher than the market prices it. Small edges are normal; big edges often mean thin data, not a free lunch.</Concept>
          <Concept term="Odds">Shown American-style: −150 means risk 150 (paper) to win 100; +130 means risk 100 to win 130. Combine legs and the odds multiply.</Concept>
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
          <Concept term="Projections">Every market the model has a read on — shown with model %, market %, and edge. A &ldquo;projection view&rdquo; is information; not every view is suggested as a card.</Concept>
          <Concept term="Suggested cards">The model&apos;s actual paper picks for the day, bundled into cards by risk tier. Enter any stake to see the projected paper return. Browse them all on <Link href="/picks" style={{ color: "var(--vault-gold-bright)" }}>Picks</Link>.</Concept>
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

      <section id="methodology" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Methodology, briefly — updated from settled results (June 12)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            ["World Cup", "Ensemble model (market prior + team strength + form), 90-minute regulation only — a draw is a real outcome. Bank Builder legs now require BOTH model and market support; the model-disfavored plus-money side lost on June 11 and is downweighted."],
            ["MLB", "Player props settled nightly against official box scores (8,800+ decisive leans). Hits Overs are the strongest settled market; total-bases and strikeout Overs under-delivered and are excluded from suggested cards, as are outsized model-vs-market edges."],
            ["NBA", "Player props settled against official box scores (3,100+ decisive). REB/PRA were the strongest recent markets — the settled Finals card hit both legs. Season-dependent."],
            ["Bank Builder", "One card per ladder step, full-bankroll stake, official-source settlement, and seven hard gates (real odds, model + market support, low correlation, clear settlement rules, target-fit, no lineup-pending props). No card that clears = no card published."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-[10px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{t}</span>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{d}</p>
            </div>
          ))}
        </div>
        <Link href="/methodology" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>Full methodology →</Link>
      </section>

      <section id="glossary" className="scroll-mt-16 flex flex-col gap-3">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Glossary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            ["Model probability", "Our model's estimate that an outcome happens, 0–100%."],
            ["Implied / market probability", "The same chance baked into the sportsbook price, margin removed."],
            ["Edge", "Model probability minus market probability. Positive = the model likes it more than the price."],
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
          GameTime Picks is an educational analytics project. Nothing here is betting advice or a recommendation to wager. Every &ldquo;stake&rdquo; and &ldquo;payout&rdquo; is hypothetical paper, tracked honestly — wins and losses both. For the full model write-up see <Link href="/methodology" style={{ color: "var(--vault-gold-bright)" }}>Methodology</Link>; for our stance see <Link href="/responsible-use" style={{ color: "var(--vault-gold-bright)" }}>Responsible use</Link>.
        </p>
      </section>
    </div>
  );
}
