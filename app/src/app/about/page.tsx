/**
 * /about — friendly explainer for non-bettors.
 *
 * Six short sections covering what GameTimePicks is, how the model
 * works, how to read a projection, what confidence means, why results
 * matter, and responsible use. Long-form technical detail still lives
 * on /methodology, /responsible-use, and /results/model-audit — this
 * page is the casual entry point.
 */
import { CATEGORY_SETTLED_RATES } from "@/lib/category-settled-rates";
import { glossaryTerm } from "@/lib/glossary";
import Link from "next/link";

import PageHero from "@/components/page-hero";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

/*
 * The canonical `edge` term, resolved once at module scope so a missing one REFUSES THE BUILD rather
 * than rendering a gap in the sentence. `glossaryTerm` is a lookup that can miss, and the failure
 * mode of quietly rendering nothing is how a definition goes absent without anyone noticing — the
 * same class of silence as the undefined token in P270.
 */
const EDGE_TERM = (() => {
  const t = glossaryTerm("edge");
  if (!t) throw new Error("REFUSED: /about renders the glossary's `edge` term and it is not defined");
  return t;
})();

export const metadata = withRouteMetadata("/about/", {
  title: "About · GameTime Picks",
  description:
    "What GameTimePicks does, how the projection model works, and how to read a projection. Plain-English explainer for non-bettors.",
});

export default function AboutPage() {
  return (
    <div className="vault-page-shell px-3 sm:px-6 lg:px-8 py-5 sm:py-10 md:py-14 overflow-x-hidden">
      <PageHero
        eyebrow="About"
        title="Sports projections made simple."
        sub="A short explainer for anyone visiting the site for the first time — no sports-betting background required."
      />

      <div className="space-y-6 max-w-3xl mt-6">
        <Section title="What is GameTimePicks?">
          GameTimePicks is an educational sports analytics project. We
          compare a statistical model's per-game player projections
          against the line the bookmaker is offering, then grade every
          projection after the game so the track record stays honest.
          It's a research lab — not betting advice.
        </Section>

        <Section title="How projections work">
          For each event on the slate we pull the inputs the sport&apos;s own
          model declares — game logs, season rates and home/away context for
          MLB player markets; team-strength ratings for NFL; goal-rate models
          for the Premier League; tracked fight history for UFC — and run a
          deterministic simulation. Where a sportsbook line exists it is shown
          for context, never as an input. We never invent inputs; if a
          player&apos;s log or a fighter&apos;s history is missing, the read is
          suppressed and the page says so.
        </Section>

        <Section title="How to read a projection">
          <ul className="space-y-1 list-disc pl-5">
            <li>
              <strong style={{ color: "var(--vault-text)" }}>Line</strong> · the
              number the bookmaker is offering Over/Under.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text)" }}>Projection</strong>{" "}
              · the model's estimate for that player tonight.
            </li>
            {/*
              P288: THIS ENTRY DEFINED A DIFFERENT QUANTITY THAN THE ONE IT NAMES.
              It read "how much higher or lower the projection is vs. the line, in percentage
              points". The Gap column the game reports actually render is model probability minus
              market probability — lib/projection-framework.ts `edgePoints`, (model − market) × 100 —
              which is not the same number and does not even share its sign. In the 2026-09-12 board
              a hitter projected 1.37 against a 1.5 line (projection BELOW it) carried Gap +10.7, and
              one projected 0.92 against 0.5 (ABOVE it) carried −2.3. A reader who learned the rule
              from this page would have read both backwards on the page that shows them.

              lib/glossary.ts calls itself "the single source of truth for every term the site shows
              a user" and already had this right; /about was simply restating it from memory and
              getting it wrong. So the entry now RENDERS the glossary term rather than paraphrasing
              it, which is the same repair P279 made for the category settled rates: the only way a
              second copy cannot drift is for there not to be one.
            */}
            <li>
              <strong style={{ color: "var(--vault-text)" }}>
                Gap / {EDGE_TERM.term}
              </strong>{" "}
              · {EDGE_TERM.short} It compares two probabilities, not
              the projection and the line — so a projection below the line can
              still show a positive gap, when the model thinks the Over is
              likelier than the price implies.{" "}
              {/* --gtp-bank-heat, not --gtp-bank-cta: the latter is the P270 token that fifteen
                  files read and nothing ever declared, so it renders as body text. */}
              <Link href="/market-guide/" style={{ color: "var(--gtp-bank-heat)" }}>
                Market Guide
              </Link>{" "}
              carries the full definition and its caution.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text)" }}>Side</strong> · Over
              if the projection is above the line, Under if it's below.
            </li>
          </ul>
        </Section>

        <Section title="What the category labels mean">
          Each projection falls into one of three categories, based purely on how
          far the model&rsquo;s number sat from the sportsbook&rsquo;s. The
          category describes how a row was produced. It does <strong>not</strong>{" "}
          rank quality, and it does not affect the order anything is shown in.
          <ul className="mt-3 space-y-1 list-disc pl-5">
            <li>
              <strong style={{ color: "var(--vault-text-mute)" }}>Category A</strong>{" "}
              · model and market differed by 5pp or more. Settled at{" "}
              {CATEGORY_SETTLED_RATES.a.toFixed(1)}%.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text-mute)" }}>Category B</strong>{" "}
              · differed by 2.5&ndash;5pp. Settled at {CATEGORY_SETTLED_RATES.b.toFixed(1)}%.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text-mute)" }}>Category C</strong>{" "}
              · differed by under 2.5pp, or the row was anomaly-flagged. Settled
              at {CATEGORY_SETTLED_RATES.c.toFixed(1)}%.
            </li>
          </ul>
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            Those rates are measured over{" "}
            {CATEGORY_SETTLED_RATES.cohort.toLocaleString("en-US")} settled outcomes, and they run in
            the opposite direction to what the old labels implied. A larger
            disagreement with the market has historically settled{" "}
            <em>worse</em>, not better &mdash; which is why these are neutral
            letters now, and why no category is promoted above another anywhere
            on the site.
          </p>
        </Section>

        <Section title="Why results matter">
          A track record is the only honest claim a projection site can
          make. We publish every settled projection on the{" "}
          <Link
            href="/results"
            style={{ color: "var(--vault-gold-bright)", textDecoration: "none" }}
          >
            Results
          </Link>{" "}
          page — wins, losses, and pushes — and grade after the final box
          score. Pushes are excluded from the hit-rate denominator;
          pending games never count as losses. The deep-dive technical
          breakdown lives at{" "}
          <Link
            href="/results/model-audit"
            style={{ color: "var(--vault-gold-bright)", textDecoration: "none" }}
          >
            /results/model-audit
          </Link>
          .
        </Section>

        <Section title="Responsible use">
          This is research and analytics, not betting advice. Don't risk
          money you can't afford to lose. If gambling is becoming a
          problem, the resources on the{" "}
          <Link
            href="/responsible-use"
            style={{ color: "var(--vault-gold-bright)", textDecoration: "none" }}
          >
            Responsible Use
          </Link>{" "}
          page can help.
        </Section>

        <Section title="What's coming next">
          <ul className="space-y-1 list-disc pl-5">
            <li>
              Parlay-slip persistence so candidate slips can be graded with
              a real hit rate after games settle.
            </li>
            <li>
              Wider market coverage across the four live sports as each
              market clears its own evaluation bar — never before.
            </li>
          </ul>
        </Section>

        <Section title="Model watchlist — archived snapshot (May 24, 2026)">
          {/* ARCHIVED, NOT CURRENT (P241 · A24): this section describes the NBA/MLB era and is
              kept as a dated snapshot of how the watchlist read then. The CURRENT model states
              live on System Status and each sport hub's own coverage table — never here. */}
          An archived read from the NBA/MLB era of the site, kept for the
          record. For current model states, see System Status and each sport
          hub&apos;s coverage table — those derive from live receipts; this
          snapshot does not update.
          <ul className="mt-3 space-y-1 list-disc pl-5">
            <li>
              <strong style={{ color: "var(--vault-success)" }}>
                NBA rebounds
              </strong>{" "}
              — the strongest cohort on record. The model has stable
              signal on REB projections.
            </li>
            <li>
              <strong style={{ color: "var(--vault-warn)" }}>
                NBA points + assists
              </strong>{" "}
              — barely above coin flip on a large sample. We surface
              these projections but treat them as watch-list calls, not
              high-confidence reads.
            </li>
            <li>
              <strong style={{ color: "var(--vault-warn)" }}>
                MLB strikeouts
              </strong>{" "}
              — smallest sample of any market we cover and below coin
              flip so far. The variance profile of pitcher hooks +
              manager decisions makes this an honest weak spot.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text-mute)" }}>
                MLB confidence climbed back into &quot;watch&quot; on
                the May 22 settlement
              </strong>{" "}
              — as of that date High was 49.7% on 396 settled rows,
              Medium 50.4% on 141, Low 53.3% on 435. These are the
              May 22 figures, not current ones; the live rates are in
              the category captions above. Low is still the best MLB
              cohort, but only ONE rival now beats High by ≥1.5pp
              (was both before May 22). The calibration overlay
              auto-promotes MLB High from a &quot;Needs more
              tracking&quot; downgrade back to its raw label. The
              decision rule is pinned by tests — we only invert when ≥ 2 rivals
              beat by ≥ 1.5pp, so a single best-tier (Low) can&apos;t
              trigger inversion.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text-mute)" }}>
                Monte Carlo internal validation — two-date check
              </strong>{" "}
              — May 22 looked promising (MC Strong 62.5%, Watch
              65.2% on 311 joins). May 23 reverted to roughly coin
              flip (Strong 50.0%, Watch 29.4% on 287 joins). Two
              dates is too small to draw a conclusion. Across both:
              Strong 56.7% (17-13), Watch 50.0% (20-20),
              High-variance 50.2% (259-257). Promotion to production
              scoring is on hold until ≥ 5 dates show consistent
              separation.
            </li>
            <li>
              <strong style={{ color: "var(--vault-success)" }}>
                Curated rail is outperforming parlays meaningfully
              </strong>{" "}
              — across the first 2 days of tracking, single-leg
              curated picks are <strong>8-4 (66.7% on 12)</strong>
              while multi-leg saved parlays are{" "}
              <strong>6-44 (12.0% on 50)</strong>. MLB-only curated
              picks are 5-1 (83.3%). The honest read: selectivity
              over volume is working; correlation risk is brutal on
              4-5 leg slips. We surface both tracks but expect
              users to weight the curated rail more heavily.
            </li>
            <li>
              <strong style={{ color: "var(--vault-gold-bright)" }}>
                Curated rail prefers selectivity over volume
              </strong>{" "}
              — the homepage &quot;Tonight&apos;s curated
              projections&quot; rail picks up to six leans per slate
              by edge × calibration-adjusted confidence × market
              strength. Inverted (sport, tier) combos are excluded.
              Better to see six trustworthy reads than 300 of mixed
              quality. The picks are saved before games via{" "}
              <code style={{ color: "var(--vault-text)" }}>
                pipeline.snapshot_curated
              </code>{" "}
              and graded after settlement via{" "}
              <code style={{ color: "var(--vault-text)" }}>
                pipeline.grade_curated
              </code>{" "}
              — so the curated rail will eventually carry a real,
              auditable hit rate of its own.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text-mute)" }}>
                Calibration is now derived from the live audit
              </strong>{" "}
              — the confidence overlay reads{" "}
              <Link
                href="/results/model-audit"
                style={{
                  color: "var(--vault-gold-bright)",
                  textDecoration: "none",
                }}
              >
                model_audit.json
              </Link>{" "}
              every render. When the nightly settle adds more data,
              labels adjust automatically. We fail closed: thin
              samples stay informational and inverted tiers are flagged.
              No category is ever promoted above another: on settled data the
              categories run in the opposite order to what their old names
              implied, so none of them earns priority.
            </li>
          </ul>
          <p
            className="mt-3 text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Numbers are pulled from{" "}
            <Link
              href="/results"
              style={{
                color: "var(--vault-gold-bright)",
                textDecoration: "none",
              }}
            >
              Results
            </Link>
            . Sample sizes are still small in absolute terms — anything
            you read here is a record, not a forecast. No 80%-accuracy
            claim is made anywhere on the site, and won&apos;t be until
            we run a real out-of-sample backtest.
          </p>
        </Section>
      </div>

      {/* Footer links to the technical surfaces */}
      <section
        className="mt-10 rounded-[6px] px-4 py-4"
        style={{
          background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.14em] mb-2"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          Technical surfaces
        </div>
        <ul className="flex flex-wrap gap-3 text-[13px]">
          <li>
            <Link
              href="/methodology"
              style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}
            >
              How the model works (full methodology) →
            </Link>
          </li>
          <li>
            <Link
              href="/results/model-audit"
              style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}
            >
              Deep-dive track record →
            </Link>
          </li>
          <li>
            <Link
              href="/responsible-use"
              style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}
            >
              Responsible use →
            </Link>
          </li>
        </ul>
      </section>

      <p
        className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-center"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Educational analytics · not betting advice
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="vault-deluxe-card rounded-[8px] px-4 sm:px-5 py-4 sm:py-5"
    >
      <h2
        className="font-display tracking-tight mb-3"
        style={{
          color: "var(--vault-gold-bright)",
          fontSize: 18,
          lineHeight: 1.25,
        }}
      >
        {title}
      </h2>
      <div
        className="text-[13.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {children}
      </div>
    </section>
  );
}
