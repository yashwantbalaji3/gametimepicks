import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = {
  title: "Methodology — GameTimePicks",
  description:
    "How GameTimePicks turns a schedule and a sportsbook price into a probability, how those probabilities are scored against the market, and what we refuse to publish. Paper-only, educational, public beta.",
  openGraph: {
    title: "GameTimePicks Methodology",
    description:
      "No-vig probabilities, the model–market difference, calibration, and official-settlement-only integrity. Paper-only, public beta.",
    type: "article",
  },
};
import DataSourceBadge from "@/components/data-source-badge";
import HowToReadThis from "@/components/research/how-to-read-this";
import TerminalSummaryPanel from "@/components/research/terminal-summary-panel";
import { loadTerminal } from "@/lib/research/public-contract-adapter";
import FreshnessBadge from "@/components/ui/freshness-badge";
import { currentEtDate } from "@/lib/freshness";
import SportOverviewHero from "@/components/sport-overview-hero";
import SimulationCoverageMatrix from "@/components/simulation-coverage-matrix";

/**
 * /methodology — how a number on this site is produced and how it is judged.
 *
 * It explains the daily workflow, the arithmetic (American → implied → no-vig → model probability →
 * the model–market difference), what each sport's coverage actually is today, the settlement and
 * data-integrity rules, and the standing limitations.
 *
 * Two things it deliberately does NOT do any more. It does not carry the paper-ladder rules — those
 * are product mechanics and belong with the product, not in a methodology write-up whose reader is
 * asking "where does this number come from". And it does not carry a chip row of results from one
 * settled fight card: a four-figure record from a single event, frozen in the source and never
 * revised, reads as a track record and is not one.
 */
export default function MethodologyPage() {
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-[880px] px-4 sm:px-6 py-10">
      <SportOverviewHero
        eyebrow="Methodology"
        sport="Where the numbers come from"
        tagline="paper-only · official settlement · scored against the market"
        statusKind="neutral"
        statusLabel="Reference"
        accent="gold"
        ctas={[
          { href: "/results", label: "The settled record", primary: true },
          { href: "/system-status", label: "Service status" },
        ]}
        framing="The models are intentionally explainable — no deep learning, no black boxes — so the reasoning behind every projection can be checked. Every number here is paper-only and educational, never wagering advice."
      />

      <div className="mt-6 reveal reveal-d1 flex flex-wrap items-center gap-2">
        <DataSourceBadge meta={meta} />
        {/* Honest age of the NBA/legacy pipeline metadata — the client badge recomputes with the real
            browser clock, so a weeks-old meta.json reads "N days ago" instead of implying currency.
            (The World Cup + MLB slates carry their own fresh dates on their pages.) */}
        <FreshnessBadge slateDate={(meta?.lastPipelineRun ?? "").slice(0, 10) || null} serverToday={currentEtDate()} noun="legacy pipeline run" />
      </div>

      {/* Three labels the reader will meet on every board. They describe what EXISTS for a market, not
          how good it is — that judgement is the settled record's job, not a label's. */}
      <section className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 reveal reveal-d2">
        <ConceptCard
          tone="success"
          label="Priced"
          body="A real sportsbook price exists on both sides, so our probability can be shown next to the de-vigged market number."
        />
        <ConceptCard
          tone="heat"
          label="Unpriced"
          body="No market price in the feed for this market. Anything we show for it stands alone, with nothing to check it against."
        />
        <ConceptCard
          tone="muted"
          label="Not enough settled results"
          body="Too few decided results to judge a market. It is reported and never acted on, and it never leads a page."
        />
      </section>

      {/* SECTION 1 — Daily workflow */}
      {/* Moved here from the homepage (Program 139). This comparison — how the model scores against
          the sportsbook on settled results — is true and important, and it belongs where a reader has
          already chosen to ask "how does this work?". Leading the homepage with "Behind" and
          "Withheld" told a first-time visitor the product was failing before telling them what it is.
          The panel is unchanged; only its placement moved, so nothing was softened. */}
      <TerminalSummaryPanel terminal={loadTerminal()} />

      <Section title="The daily workflow">
        <p className="text-[14px] sm:text-[15px] leading-relaxed mb-4" style={{ color: "var(--vault-text-mute)" }}>
          The same loop runs every day, per sport. Each step fails closed — if a
          source is missing, the board says so rather than inventing a number.
        </p>
        <WorkflowDiagram />
      </Section>

      {/* SECTION 2 — Universal math */}
      <Section title="Universal math">
        <div className="space-y-5">
          <Block title="01 · American odds → implied probability">
            <Formula>
              odds &gt; 0 :&nbsp; p = 100 / (odds + 100)
              <br />
              odds &lt; 0 :&nbsp; p = |odds| / (|odds| + 100)
            </Formula>
          </Block>

          <Block title="02 · No-vig (two-sided) probability">
            <p>
              Sportsbook prices include the bookmaker&rsquo;s margin. When both sides are known we strip
              it proportionally so the two probabilities sum to 1. This is the baseline every model
              number on the site is scored against — and on the settled record it is the better
              estimate of the two.
            </p>
            <Formula>
              p_novig_side = p_raw_side / (p_raw_side + p_raw_other)
            </Formula>
          </Block>

          <Block title="03 · Model probability">
            <p>
              A player-stat market is modelled as a distribution around the projection, and the chance
              of clearing the line is the area of that distribution above it. The width of the
              distribution matters as much as its centre: understating it makes every probability look
              more certain than the evidence supports.
            </p>
            <Formula>P(over) = 1 − Φ ( (line − projection) / σ )</Formula>
            <p className="mt-2 text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
              This applies to MLB, the only sport currently producing model output. UFC prices are shown
              as the sportsbook&rsquo;s own de-vigged numbers with no model behind them.
            </p>
          </Block>

          <Block title="04 · The model–market difference">
            <Formula>difference_pp = ( P_model − P_market_novig ) × 100</Formula>
            <p className="mt-2 text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
              In percentage points. This is a <span style={{ color: "var(--vault-text)" }}>disagreement measure, not an
              advantage</span>: across the settled corpus, the largest positive differences are where the
              model performed <em>worst</em> against the market. It is computed because a disagreement is
              worth looking at, and nothing on the site selects a side because the difference is large.
            </p>
          </Block>

          <Block title="05 · Calibration">
            <p>
              A stated probability is only useful if outcomes arrive at roughly the stated frequency.
              Calibration maps our stated probabilities onto the frequencies actually observed on earlier
              settled slates — the raw output has run systematically hot, so the corrected number is
              lower and closer to true.
            </p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
              Calibration changes how confident we sound, not what we know. It is fitted on earlier
              slates and scored on results it never saw, and the raw number is kept alongside it rather
              than overwritten. Full walkthrough on{" "}
              <Link href="/learn#probabilities" className="underline" style={{ color: "var(--vault-text)" }}>Learn</Link>.
            </p>
          </Block>

          <Block title="06 · Data-quality grade">
            <p>
              A per-market grade for how complete the inputs were. It describes the data, not the
              answer: an A-grade projection is not more likely to be right, it is only better evidenced.
            </p>
            <ul className="mt-3 space-y-1.5 font-mono text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              <li><span style={{ color: "var(--vault-success)" }}>A</span> — current price + full stats + confirmed event</li>
              <li><span style={{ color: "var(--vault-text)" }}>B</span> — current price + partial stats</li>
              <li><span style={{ color: "var(--vault-text)" }}>C</span> — no price to read against, or stale-limited but explainable</li>
              <li><span style={{ color: "var(--vault-text-faint)" }}>unavailable</span> — cannot project; shown as needs-data rather than estimated</li>
            </ul>
          </Block>

          <Block title="07 · Parlay odds + paper return">
            <Formula>
              decimal = Π ( per-leg decimal )
              <br />
              paper_return = stake × decimal&nbsp;&nbsp;(null if any leg lacks a price)
            </Formula>
            <p className="mt-2 text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
              A combined price is never shown if any leg is missing odds — the slip
              reads &ldquo;—&rdquo; rather than a fabricated payout.
            </p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
              Multiplying legs also multiplies exposure to a shared result — <span style={{ color: "var(--vault-text)" }}>concentration
              risk</span>. The first settled UFC slate made that concrete: the individual moneylines graded
              6–1 while every multi-leg card lost, 0–4, because each card was anchored on the same
              favourite and he was upset. A slip that repeats one anchor across every card stakes all of
              them on a single outcome, however well the legs grade on their own.
            </p>
          </Block>
        </div>
      </Section>

      {/* SECTION 2.5 — What a prediction is allowed to use. Trimmed from a nine-block framework tour
          that described a cross-sport engine in the present tense and named product surfaces by old
          labels. What survives is the part a reader needs to judge the numbers: the no-leakage rule
          and the difference between a probability and our confidence in it. */}
      <Section title="What a prediction is allowed to use">
        <p className="text-[14px] sm:text-[15px] leading-relaxed mb-4" style={{ color: "var(--vault-text-mute)" }}>
          Every input has to exist before the event starts. That sounds obvious and is the single
          easiest way for a backtest to flatter itself, so it is enforced rather than assumed.
        </p>
        <div className="space-y-5">
          <Block title="The prediction-time rule">
            <Formula>feature_timestamp ≤ prediction_time &lt; event_start_time</Formula>
            <p className="mt-2">
              We never use final scores, box scores, an unconfirmed lineup, rolling averages that
              include the event being predicted, or a price captured after the prediction was made.
              Each prediction records the timestamps of the data behind it and is checked against this
              rule; a prediction that fails the check is not published.
            </p>
          </Block>

          <Block title="Confidence is not probability">
            <p>
              Probability is how likely an outcome is. <span style={{ color: "var(--vault-text)" }}>Confidence</span> is
              how much the projection can be trusted — driven by data freshness, sample size, and
              whether a critical input is missing at all. They move independently: a 70% probability
              built on three games is not the same claim as a 70% probability built on three hundred.
            </p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
              On the measured record our highest-confidence groupings have not been our most accurate,
              which is why nothing on the site is ordered by confidence.
            </p>
          </Block>

          <Block title="Missing and thin data is shown, not defaulted">
            <p>
              If a feed is missing, stale or thin, the page says so rather than quietly substituting a
              default. Historical features carry their sample size and are weighted down accordingly,
              and a market with too few settled results is reported without being acted on.
            </p>
          </Block>
        </div>
      </Section>

      {/* SECTION 3 — Sport coverage. These cards state what is TRUE TODAY per sport, which for most of
          them is "not modelled". They previously described NBA and soccer models in the present tense
          long after either stopped producing anything. */}
      <Section title="By sport — what is actually modelled">
        <p className="text-[14px] sm:text-[15px] leading-relaxed mb-4" style={{ color: "var(--vault-text-mute)" }}>
          One sport has a live model. The rest are either history we keep readable or a market price
          shown as a market price. Nothing below is described in the present tense unless it is
          producing output today.
        </p>
        <div className="space-y-4">
          <SportCard
            accent="var(--vault-success)"
            name="MLB"
            stage="live model · player props + game markets"
            inputs="Schedule and game logs from the official MLB Stats API; player-prop and game-market prices captured from the odds provider (batter hits, batter total bases, pitcher strikeouts, moneyline, run line, totals)."
            model="Each stat is modelled as a distribution around a projection built from recent-form and season windows, then converted to P(over) against the posted line. Simulated game outcomes come from those same projections. Stated probabilities are then calibrated against earlier settled slates."
            markets="Read side by side with the de-vigged sportsbook price. A market whose own settled record sits below break-even has its predictions switched off and keeps only its history."
            cards="Only markets with a real two-sided price are placed beside a market comparison; the rest are labelled as having no price to read against."
            settlement="Official MLB Stats API box scores. If the event mapping fails an integrity check, the whole slate is withheld rather than partially graded."
            limits="No park, weather, bullpen-fatigue or handedness-split inputs. On the settled record the model does not out-score the de-vigged market price in any market."
          />
          <SportCard
            accent="var(--vault-text)"
            name="NBA"
            stage="history only · nothing new is produced"
            inputs="Player game logs and prop prices captured while the model was running."
            model="The projection model that produced this history is no longer run. Nothing is being generated, graded or published for NBA."
            markets="None currently. The archived player-prop record remains readable."
            cards="None."
            settlement="The historical record was settled from official box scores at the time."
            limits="Frozen. A record that stops updating is a record of the past, and it is labelled as one wherever it appears — it says nothing about today."
          />
          <SportCard
            accent="var(--gtp-bank-heat)"
            name="UFC / MMA"
            stage="market-implied only · no fight model"
            inputs="Moneyline prices from the odds provider."
            model="There is no fight model. The probability shown is the posted price with the margin removed — the sportsbook's number, presented as theirs."
            markets="Moneyline only. Method, round and distance markets are not covered at all."
            cards="None."
            settlement="Official finals; a bout that cannot be matched to a result is left ungraded rather than guessed."
            limits="No settled record exists against which any UFC number here could be judged."
          />
          <SportCard
            accent="var(--vault-text)"
            name="Soccer / World Cup"
            stage="closed · archive only"
            inputs="Prices and fixtures captured during the 2026 tournament."
            model="Match-winner probabilities were de-vigged market prices with recent form attached. Nothing is being produced now."
            markets="None. The tournament archive stays readable as a record of what was published at the time."
            cards="None."
            settlement="Official final score, regulation 90 minutes only — extra time and penalties never counted toward a 90-minute market."
            limits="Closed as a destination. It is kept for the record, not offered as a product."
          />
        </div>
      </Section>

      {/* SECTION 4 — Data integrity */}
      <Section title="Data integrity">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ModeCard color="lime" label="Official settlement only" description="Results settle from official league sources, never from screenshots, web snippets, or user reports." />
          <ModeCard color="lime" label="Stale-date gating" description="A past slate is never presented under today's heading. When today's data does not exist, the page says so and names the slate it is actually showing." />
          <ModeCard color="amber" label="Unavailable / needs-data" description="When a source is missing, the page says so. It does not fabricate a formula output or fall back to an older number." />
          <ModeCard color="rose" label="Refuse rather than guess" description="A slate whose event mapping fails an integrity check is withheld entirely — no partial grading, no rate, and it stays visible in the accounting with the reason." />
        </div>
      </Section>

      {/* SECTION 5 — Standing limitations */}
      <Section title="Standing limitations">
        <div className="vault-deluxe-card p-5 sm:p-6">
          <ul className="space-y-3.5 text-[14px] sm:text-[15px] leading-relaxed list-none">
            <LimitationRow title="The market is still the better estimate" body="Scored on identical settled results, the de-vigged sportsbook price beats our probabilities. Nothing here has been shown to out-predict it, and a disagreement between the two is not evidence that we are right." />
            <LimitationRow title="One sport is live" body="MLB is the only sport producing model output. NBA is frozen history, UFC is a market price with no model behind it, and soccer is closed." />
            <LimitationRow title="Lines move" body="Boards reflect prices as captured, with the capture time shown. By the time you read them, prices have likely shifted, and there is no retained snapshot series to chart movement from." />
            <LimitationRow title="Missing context inputs" body="Park factor, weather, bullpen fatigue and handedness splits are not modelled for MLB." />
            <LimitationRow title="Some markets are switched off" body="Where a market's own settled record sits entirely below break-even across a large sample, predictions in it are disabled. The history stays visible and is never placed in a ranked or difference-ordered list." />
            <LimitationRow title="Legacy rows are labelled, not restamped" body="Settled results that predate the current event-identity checks are labelled legacy rather than retroactively stamped with lineage they never had." />
          </ul>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section + concept helpers
// ---------------------------------------------------------------------------
function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-12 reveal">
      <h2 className="font-display text-[22px] md:text-[28px] font-semibold tracking-tight mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ConceptCard({
  tone,
  label,
  body,
}: {
  tone: "success" | "heat" | "muted";
  label: string;
  body: string;
}) {
  const color = {
    success: "var(--vault-success)",
    heat: "var(--gtp-bank-heat)",
    muted: "var(--vault-text-faint)",
  }[tone];
  return (
    <div className="vault-deluxe-card p-4">
      <div className="font-mono text-[10px] tracking-[0.14em] uppercase mb-1.5" style={{ color }}>
        {label}
      </div>
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {body}
      </p>
    </div>
  );
}

function SportCard({
  accent,
  name,
  stage,
  inputs,
  model,
  markets,
  cards,
  settlement,
  limits,
}: {
  accent: string;
  name: string;
  stage: string;
  inputs: string;
  model: string;
  markets: string;
  cards: string;
  settlement: string;
  limits: string;
}) {
  const rows: Array<[string, string]> = [
    ["Inputs", inputs],
    ["Model", model],
    ["Markets", markets],
    ["Card rules", cards],
    ["Settlement", settlement],
    ["Limitations", limits],
  ];
  return (
    <div className="vault-deluxe-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="font-display text-[18px] sm:text-[20px] font-semibold tracking-tight" style={{ color: "var(--vault-text)" }}>
          <span aria-hidden className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
          {name}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] rounded px-2 py-0.5" style={{ color: accent, background: "rgba(242,54,69,0.08)", border: "1px solid var(--vault-rule)" }}>
          {stage}
        </span>
      </div>
      <dl className="space-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[88px_1fr] gap-3 items-baseline">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)" }}>
              {k}
            </dt>
            <dd className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reused presentational helpers (V1 crimson surfaces)
// ---------------------------------------------------------------------------
function Block({ title, children }: { title: string; children: ReactNode }) {
  const match = /^(\d+)\s*·\s*(.+)$/.exec(title);
  const numeral = match ? match[1] : null;
  const heading = match ? match[2] : title;
  return (
    <div className="reveal vault-deluxe-card casino-glow-card p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-3">
        {numeral && (
          <span className="gtp-method-numeral shrink-0" aria-hidden>
            {numeral}
          </span>
        )}
        <h3
          className="font-display font-semibold tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: "clamp(16px, 2.2vw, 19px)",
            lineHeight: 1.2,
            marginTop: numeral ? 2 : 0,
          }}
        >
          {heading}
        </h3>
      </div>
      <div className="space-y-2" style={{ color: "var(--vault-text-mute)" }}>
        {children}
      </div>
    </div>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative my-3 rounded-[6px] px-4 py-3.5 font-mono text-[12px] sm:text-[13px] tabular leading-relaxed overflow-x-auto"
      style={{
        background: "linear-gradient(180deg, rgba(26, 16, 11, 0.92), rgba(18, 12, 8, 0.92))",
        border: "1px solid var(--vault-border)",
        color: "var(--vault-text)",
        boxShadow: "0 4px 14px -10px rgba(0, 0, 0, 0.4)",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <span
        aria-hidden
        className="absolute top-0 left-[12%] right-[12%] h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(242, 54, 69, 0.45), transparent)" }}
      />
      <div className="min-w-0 whitespace-nowrap sm:whitespace-normal">{children}</div>
    </div>
  );
}

function LimitationRow({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-2"
        style={{ background: "var(--vault-warn)", boxShadow: "0 0 5px rgba(242, 54, 69, 0.45)" }}
      />
      <span>
        <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{title}.</span>{" "}
        <span style={{ color: "var(--vault-text-mute)" }}>{body}</span>
      </span>
    </li>
  );
}

function ModeCard({
  color,
  label,
  description,
}: {
  color: "lime" | "amber" | "rose" | "text-mute";
  label: string;
  description: string;
}) {
  const dotColor = {
    lime: "var(--vault-gold-bright)",
    amber: "var(--vault-warn)",
    rose: "var(--rose)",
    "text-mute": "var(--text-mute)",
  }[color];
  return (
    <div className="vault-deluxe-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            background: dotColor,
            boxShadow: color === "lime" ? "0 0 6px rgba(242, 54, 69, 0.5)" : "none",
          }}
        />
        <span className="font-display text-[14px] font-semibold tracking-tight" style={{ color: "var(--vault-text)" }}>
          {label}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily workflow diagram (pure, horizontal-scroll on mobile)
// ---------------------------------------------------------------------------
function WorkflowDiagram() {
  const steps = [
    { label: "Collect", sub: "schedule · odds · stats" },
    { label: "Project", sub: "per-sport model" },
    { label: "Compare", sub: "vs no-vig market" },
    { label: "Build", sub: "risk-tiered cards" },
    { label: "Publish", sub: "active-date only" },
    { label: "Settle", sub: "official source" },
    { label: "Learn", sub: "calibrate + audit" },
  ];
  return (
    <div className="surface p-5 rounded-[10px]">
      <div className="overflow-x-auto -mx-1">
        <div className="flex items-center gap-2 px-1 min-w-min">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
              <div className="bg-[var(--surface-elevated)] border border-[var(--border-strong)] rounded-[4px] px-3 py-2.5 min-w-[116px] text-center">
                <div className="font-display text-[13px] font-semibold tracking-tight">{step.label}</div>
                <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--text-faint)] mt-0.5">{step.sub}</div>
              </div>
              {i < steps.length - 1 && (
                <span className="text-[var(--gtp-bank-heat)] font-mono text-[14px] shrink-0">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Honest per-market coverage — what each sport simulates + every gap with the reason. */}
      <div className="mt-10">
        <SimulationCoverageMatrix />
      </div>

      {/* The reader's questions, answered from the SAME canonical artifact the rest of the site
         renders, so an explanation cannot drift from the numbers it explains. */}
      <HowToReadThis terminal={loadTerminal()} />
    </div>
  );
}
