import type { ReactNode } from "react";
import { getMeta } from "@/lib/data";
import DataSourceBadge from "@/components/data-source-badge";
import SportOverviewHero from "@/components/sport-overview-hero";

/**
 * /methodology — the full multi-sport product methodology hub (June 15 rebuild).
 *
 * Replaces the old NBA-centric page. Explains, honestly and scannably: the daily
 * workflow, the universal math (American→implied, no-vig, model prob, edge,
 * composite confidence, data quality, parlay odds, paper return), each sport's
 * inputs/model/markets/card-rules/settlement/limits, the UFC first-slate learning
 * (6–1 moneyline / 0–4 cards / concentration lesson), data-integrity rules, and
 * the roadmap. Paper-only, educational; uses no outcome-promise language.
 */
export default function MethodologyPage() {
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-[880px] px-4 sm:px-6 py-10">
      <SportOverviewHero
        eyebrow="Methodology · transparent by design"
        sport="How GameTimePicks builds projections"
        tagline="paper-only · odds-backed + model-only · official settlement"
        statusKind="neutral"
        statusLabel="Reference"
        accent="gold"
        ctas={[
          { href: "/results/model-audit", label: "Audit deep-dive", primary: true },
          { href: "/results", label: "Latest results" },
        ]}
        framing="Transparency over performance. The models are intentionally explainable — no deep learning, no black boxes — so the reasoning behind every projection is auditable. Every number here is paper-only and educational, never wagering advice."
      />

      <div className="mt-6 reveal reveal-d1">
        <DataSourceBadge meta={meta} />
      </div>

      {/* Honest top-line: what odds-backed vs model-only means + validation-stage */}
      <section className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 reveal reveal-d2">
        <ConceptCard
          tone="success"
          label="Odds-backed"
          body="A real sportsbook price exists. The projection is compared to the de-vigged market and is eligible for suggested cards."
        />
        <ConceptCard
          tone="heat"
          label="Model-only"
          body="No market price in the feed (e.g. UFC method/round props). Shown for insight, clearly labeled, and never priced into a parlay."
        />
        <ConceptCard
          tone="muted"
          label="Validation-stage"
          body="A new sport stays validation-stage until the model is graded against real settled results with a no-leakage backtest."
        />
      </section>

      {/* SECTION 1 — Daily workflow */}
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
              Sportsbook prices include vig. When both sides are known we strip
              it proportionally so the two probabilities sum to 1 — the fair
              market baseline a model edge is measured against.
            </p>
            <Formula>
              p_novig_side = p_raw_side / (p_raw_side + p_raw_other)
            </Formula>
          </Block>

          <Block title="03 · Model probability">
            <p>
              Continuous markets (NBA/MLB player stats) model the stat as a normal
              distribution at the projection; soccer uses Poisson goal expectations;
              UFC blends the market baseline with a small, capped fighter-stats
              adjustment.
            </p>
            <Formula>P(over) = 1 − Φ ( (line − projection) / σ )</Formula>
          </Block>

          <Block title="04 · Edge">
            <Formula>edge_pp = ( P_model − P_market_novig ) × 100</Formula>
            <p className="mt-2 text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
              In percentage points. The lean is the side with positive edge. A
              large edge is one input, not a verdict — oversized edges often signal
              overprojection and are capped, not celebrated.
            </p>
          </Block>

          <Block title="05 · Composite confidence">
            <p>
              Confidence is <span style={{ color: "var(--vault-text)" }}>not</span> the
              model probability. It blends edge, data completeness, sample size,
              source freshness, and market agreement, then buckets the result.
            </p>
            <ul className="mt-3 space-y-1.5 font-mono text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              <li><span style={{ color: "var(--vault-text-faint)" }}>watchlist</span> · model-only or thin/contrarian signal</li>
              <li><span style={{ color: "var(--vault-text)" }}>lean → standard → strong</span> · rising composite score on odds-backed legs</li>
              <li><span style={{ color: "var(--gtp-bank-heat)" }}>high-risk value · longshot</span> · positive-EV but low win probability</li>
            </ul>
          </Block>

          <Block title="06 · Data-quality grade">
            <ul className="space-y-1.5 font-mono text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              <li><span style={{ color: "var(--vault-success)" }}>A</span> — current odds + full stats + confirmed event</li>
              <li><span style={{ color: "var(--vault-text)" }}>B</span> — current odds + partial stats</li>
              <li><span style={{ color: "var(--vault-text)" }}>C</span> — model-only / stale-limited but explainable</li>
              <li><span style={{ color: "var(--gtp-bank-heat)" }}>D</span> — below the paid-card threshold</li>
              <li><span style={{ color: "var(--vault-text-faint)" }}>unavailable</span> — cannot project; shown as needs-data</li>
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
          </Block>
        </div>
      </Section>

      {/* SECTION 3 — Sport methodology cards */}
      <Section title="By sport">
        <div className="space-y-4">
          <SportCard
            accent="var(--gtp-bank-heat)"
            name="UFC / MMA"
            stage="moneyline V1 · validation-stage"
            inputs="Moneyline (h2h) odds from The Odds API MMA; fighter record, recent win rate, finish rate, sig-strikes & takedowns per round, reach, experience from a UFCStats dataset; per-bout data-quality."
            model="Market-implied baseline + a small, capped fighter-stats adjustment, shrunk toward the market when data is thin. Public eligibility requires a no-leakage backtest and data-quality ≥ B."
            markets="Odds-backed: moneyline. Model-only (no feed odds): goes-the-distance, total rounds, method — shown for insight, not parlay eligible."
            cards="Concentration-aware: one favorite cannot anchor every card; longshots must carry a distinct thesis."
            settlement="Official ESPN MMA finals (status final only); KO/sub method graded only when present in the feed, else needs-review."
            limits="Small-sample sport; no prop-odds feed; no licensed fighter-image source (initials avatars)."
          />
          <SportCard
            accent="var(--vault-success)"
            name="MLB"
            stage="player props + game markets"
            inputs="Schedule + game logs (MLB Stats API); prop odds (DK/FD via The Odds API): batter hits / total bases, pitcher strikeouts."
            model="Pitcher K: 0.55·last3 + 0.45·season, σ floored. Batter: 0.5·last10 + 0.5·season. P(over) via normal CDF. Conservative by design; oversized edges are flagged and capped."
            markets="Odds-backed: batter hits, total bases, pitcher strikeouts. Others default to insufficient-data."
            cards="Odds-backed legs only; lower-variance vs longshot lanes separated; same-game over-correlation flagged."
            settlement="Official MLB Stats API boxscores."
            limits="No park / weather / bullpen-fatigue / handedness-split inputs yet (roadmap)."
          />
          <SportCard
            accent="var(--vault-text)"
            name="NBA"
            stage="player props"
            inputs="Player game logs (official source); prop odds; home/away splits; recent-form windows."
            model="proj = 0.45·last5 + 0.35·last10 + 0.20·season + 0.30·(split − base); P(over) via normal CDF; anomaly guardrails cap implausible edges."
            markets="Odds-backed: PTS / REB / AST player props."
            cards="Confidence + edge thresholds per risk profile; max legs per game; anomaly exclusion on lower-variance lanes."
            settlement="Official boxscore (manual override → league API → ESPN → stats-unavailable)."
            limits="No minutes / rest / back-to-back adjustment yet. Off-season shows no-slate, never stale finals as active."
          />
          <SportCard
            accent="var(--vault-text)"
            name="World Cup / Soccer"
            stage="odds-backed + recent form"
            inputs="PRICES from The Odds API (soccer_fifa_world_cup): 3-way moneyline, totals, double chance, BTTS, draw-no-bet. STATS from API-Football: recent form (last-5 across all competitions), group/standings, lineups, and settlement (final scores)."
            model="Two providers: The Odds API supplies the odds → de-vigged market-implied probabilities (3-way for moneyline/double chance); API-Football attaches real recent form + group. A full Poisson team-strength model follows once enough WC matches are played (season stats are thin this early)."
            markets="Odds-backed: match winner (3-way, Draw is a real outcome), totals, double chance (real book odds), BTTS, draw-no-bet. Player props (anytime goalscorer + shots on target) are live — odds-backed, market-implied, limited-data, not parlay/Bank-Builder eligible."
            cards="Favorites only above a probability floor; stale fixtures never shown as active; no card without a live price; honest counts (no padding)."
            settlement="Official final score from API-Football, regulation 90 only (no extra time / penalties)."
            limits="Recent form is live; per-team WC-season stats and the Poisson model are thin until more group games are played. Player-prop projections (odds + recent form) are the next increment."
          />
          <SportCard
            accent="var(--vault-gold)"
            name="Bank Builder"
            stage="paper ladder · run #1 completed"
            inputs="Draws only from the official Suggested-parlay pool; selects on combined American price within a target window (not on edge/confidence)."
            model="A fixed paper stake compounds up a ladder; each step rolls the prior bankroll forward only after the step settles officially."
            markets="Whatever the eligible suggested slip contains (may mix sports)."
            cards="One pending step at a time; honest diagnosis when no eligible slip exists."
            settlement="Official results per leg; the bankroll changes only on settlement."
            limits="Run #1 is complete ($100 → $10,376.17, 5–0). No active pending step — a new ladder is coming soon."
          />
          <SportCard
            accent="var(--gtp-bank-heat)"
            name="Suggested cards"
            stage="conservative → longshot"
            inputs="Eligible odds-backed legs from the day's boards across sports."
            model="Greedy build per risk profile (confidence tiers, minimum edge, max legs, recent-form requirement), then a concentration score over the slip."
            markets="Conservative / balanced / high-risk / longshot lanes; an optional mixed card only when data quality is strong enough."
            cards="Active-date + odds-backed only; no settled events; no single anchor across every card; longshots must be a different thesis; honest 'not enough current odds-backed legs' state when thin."
            settlement="Each leg settles on its official result; slip status is win/loss/push/pending/void."
            limits="Concentration caps are being promoted from shadow to live under an operator-approved path (see UFC lesson)."
          />
        </div>
      </Section>

      {/* SECTION 4 — UFC first-slate learning */}
      <Section title="UFC first-slate learning (UFC 250, settled)">
        <div className="vault-deluxe-card casino-glow-card p-5 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <StatChip value="6–1" label="moneyline model" tone="success" />
            <StatChip value="+320" label="Hokit underdog hit" tone="success" />
            <StatChip value="−520" label="Topuria fav missed" tone="heat" />
            <StatChip value="0–4" label="suggested cards" tone="heat" />
          </div>
          <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            The straight-pick signal was strong (six of seven moneylines, including
            a +320 underdog). The suggested cards went 0–4 — and every card failed
            for the <span style={{ color: "var(--vault-text)" }}>same reason</span>:
            each one leaned on the same heavy favorite (Topuria, −520), who lost.
            That is concentration risk, not a model-accuracy problem.
          </p>
          <div className="mt-4 rounded-[8px] px-4 py-3" style={{ background: "rgba(242,54,69,0.08)", border: "1px solid var(--vault-rule)" }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] mb-1.5" style={{ color: "var(--gtp-bank-heat)" }}>
              Card-builder V2 lesson
            </div>
            <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              No single leg may anchor every card; heavy-favorite exposure is
              capped; each card now carries a concentration score; and a stress
              test asks &ldquo;what if the top favorite loses?&rdquo; before
              publishing. One slate does not prove a model — the validation-stage
              label stays on.
            </p>
          </div>
        </div>
      </Section>

      {/* SECTION 5 — Data integrity */}
      <Section title="Data integrity">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ModeCard color="lime" label="Official settlement only" description="Results settle from official sources (league APIs / ESPN finals), never from screenshots, web snippets, or user reports." />
          <ModeCard color="lime" label="Stale-date gating" description="Past slates never show as 'today'. Stale content moves to results/archive; it never sits in active picks." />
          <ModeCard color="amber" label="Unavailable / needs-data" description="When a source or credential is missing, the page says so. It does not fabricate a formula output." />
          <ModeCard color="rose" label="No fabrication" description="No invented odds, projections, results, fighter/player images, fight histories, player stats, or injuries. Missing images fall back to initials." />
        </div>
      </Section>

      {/* SECTION 6 — Limitations + roadmap */}
      <Section title="Limitations &amp; roadmap">
        <div className="vault-deluxe-card p-5 sm:p-6">
          <ul className="space-y-3.5 text-[14px] sm:text-[15px] leading-relaxed list-none">
            <LimitationRow title="Generation is operator-run" body="Slates are generated on demand, not yet fully automated; freshness reflects the last pipeline run." />
            <LimitationRow title="Lines move" body="Boards reflect odds at pipeline time. By the time you read them, prices have likely shifted." />
            <LimitationRow title="UFC props need a feed" body="Method / round / distance stay model-only until a real prop-odds feed and a graded model for them exist." />
            <LimitationRow title="MLB context inputs" body="Park factor, weather, bullpen fatigue, and handedness splits are on the roadmap, not yet modeled." />
            <LimitationRow title="Soccer depth" body="World Cup prices come from The Odds API; recent form, group, lineups, settlement, and player identity/photos from API-Football. Odds-backed player props (anytime goalscorer + shots on target) are live but market-implied only — labelled limited-data and not parlay/Bank-Builder eligible. Per-team WC-season stats and the Poisson model stay thin until more group games are played." />
            <LimitationRow title="Richer feeds + automation" body="Fuller data feeds, a licensed fighter-image source, and detailed fight histories are planned." />
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

function StatChip({ value, label, tone }: { value: string; label: string; tone: "success" | "heat" }) {
  const color = tone === "success" ? "var(--vault-success)" : "var(--gtp-bank-heat)";
  return (
    <div className="rounded-[8px] px-3 py-2.5 text-center" style={{ background: "rgba(26,16,11,0.45)", border: "1px solid var(--vault-rule)" }}>
      <div className="font-display tabular font-bold" style={{ color, fontSize: 20 }}>{value}</div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] mt-0.5" style={{ color: "var(--vault-text-faint)" }}>{label}</div>
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
    </div>
  );
}
