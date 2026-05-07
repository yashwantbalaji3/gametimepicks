import type { ReactNode } from "react";
import { getMeta } from "@/lib/data";
import DataSourceBadge from "@/components/data-source-badge";

export default function MethodologyPage() {
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-[840px] px-6 py-12">
      {/* Header */}
      <div className="reveal">
        <div className="eyebrow">methodology</div>
        <h1 className="mt-2 font-display text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          How the model works
        </h1>
        <p className="mt-3 text-[var(--text-mute)] text-[15px] leading-relaxed">
          Transparency over performance. The model is intentionally explainable
          — no deep learning, no black boxes — so the reasoning behind every
          lean is auditable.
        </p>
      </div>

      <div className="mt-6 reveal reveal-d1">
        <DataSourceBadge meta={meta} />
      </div>

      {/* Current data status — explicit about demo vs live */}
      {meta.isDemo && (
        <aside
          className="surface px-4 py-3 mt-4 border-l-2 reveal reveal-d2"
          style={{ borderLeftColor: "var(--vault-warn)" }}
        >
          <div className="flex items-start gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--vault-warn)] shrink-0 mt-0.5">
              status
            </span>
            <p className="font-mono text-[12px] text-[var(--text-mute)] leading-relaxed">
              Currently in demo mode. The pipeline architecture, model formulas,
              and provider system below are real and runnable. The data flowing
              through them is bundled sample data — not tonight&apos;s NBA slate
              or live sportsbook odds.
            </p>
          </div>
        </aside>
      )}

      {/* Flow diagram */}
      <section className="mt-12 reveal reveal-d2">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-4">
          Flow
        </h2>
        <FlowDiagram />
      </section>

      {/* Formulas */}
      <section className="mt-12 space-y-6 text-[15px] text-[var(--text-mute)] leading-relaxed">
        <Block title="01 · Projection">
          <p>
            For each player and market (PTS / REB / AST), the model produces a
            projection by blending three rolling windows plus a home/away
            adjustment:
          </p>
          <Formula>
            projection = 0.45·last5 + 0.35·last10 + 0.20·season
            <br />
            &nbsp;&nbsp;+ 0.30 · ( split_avg − base )
          </Formula>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            The split adjustment uses the player's home or away average
            depending on tonight's matchup. Weights are deliberately simple
            and tuned for explainability rather than peak fit.
          </p>
        </Block>

        <Block title="02 · Implied probability">
          <p>
            Sportsbooks publish American odds with vig built in. We strip vig
            using two-sided proportional de-vigging:
          </p>
          <Formula>
            p_raw_over = 100 / (odds_over + 100)&nbsp;&nbsp;&nbsp;
            (when odds &gt; 0)
            <br />
            p_raw_over = −odds / (−odds + 100)&nbsp;(when odds &lt; 0)
            <br />
            p_implied_over = p_raw_over / (p_raw_over + p_raw_under)
          </Formula>
        </Block>

        <Block title="03 · Model probability">
          <p>
            We model the player's stat as a normal distribution centered at
            the projection, with σ derived from recent dispersion:
          </p>
          <Formula>
            P(over) = 1 − Φ ( (line − projection) / σ )
          </Formula>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            Φ is the standard normal CDF. σ is the population standard
            deviation of the player's last-N games on the same stat, with a
            floor of 1.0 to prevent degenerate cases.
          </p>
        </Block>

        <Block title="04 · Edge">
          <Formula>
            edge_pp = ( P_model − P_implied ) × 100
          </Formula>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            Reported in percentage points. The lean (Over / Under) is whichever
            side has positive edge.
          </p>
        </Block>

        <Block title="05 · Confidence tiers">
          <p>Tiers are assigned by edge magnitude AND data-quality sanity check.</p>
          <ul className="mt-3 space-y-1.5 font-mono text-[13px]">
            <li>
              <span className="text-[var(--vault-gold-bright)]">High</span>
              {" — "}edge ≥ 5pp <span className="text-[var(--text-faint)]">AND</span> ≥ 8 recent games of data
            </li>
            <li>
              <span className="text-[var(--vault-warn)]">Medium</span>
              {" — "}edge ≥ 2.5pp <span className="text-[var(--text-faint)]">AND</span> ≥ 5 recent games
            </li>
            <li>
              <span className="text-[var(--text-faint)]">Low / No Play</span>
              {" — "}anything below the medium threshold
            </li>
          </ul>
        </Block>
      </section>

      {/* Data sources */}
      <section className="mt-12">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-4">
          Data sources
        </h2>
        <div className="text-[15px] text-[var(--text-mute)] leading-relaxed space-y-3">
          <p>
            GametimePicks runs on a multi-source provider system. Each external
            service is accessed through a common adapter interface, so the
            pipeline can fail over from one source to the next without breaking.
          </p>
          <ul className="space-y-1.5 font-mono text-[13px] mt-3">
            <li>
              <span className="text-[var(--text)]">nba_api</span>{" "}
              <span className="text-[var(--text-faint)]">— official NBA.com Stats endpoints (Tier 1, no key)</span>
            </li>
            <li>
              <span className="text-[var(--text)]">The Odds API</span>{" "}
              <span className="text-[var(--text-faint)]">— compliant sportsbook odds (Tier 1, free tier 500 req/mo)</span>
            </li>
            <li>
              <span className="text-[var(--text)]">demo</span>{" "}
              <span className="text-[var(--text-faint)]">— bundled fallback (Tier 1, always works)</span>
            </li>
            <li className="text-[var(--text-faint)]">
              balldontlie · espn · opticodds · sportsdata
              <span className="ml-2">(Tier 2/3 — scaffolded, opt-in)</span>
            </li>
          </ul>
          <p className="mt-3">
            The system never scrapes sportsbook websites or reverse-engineers
            mobile apps. Every key lives in environment variables; nothing is
            hardcoded.
          </p>
        </div>
      </section>

      {/* Phase 7B-2 mode explainer — replaces the old Demo/Live/Hybrid block */}
      <section className="mt-12">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-4">
          Data modes
        </h2>
        <p className="text-[14px] text-[var(--text-mute)] leading-relaxed mb-4 max-w-[780px]">
          Every page reads the same five-state machine. The data-source badge
          at the top of the board surfaces which one is active.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ModeCard
            color="lime"
            label="Live"
            description="Real schedule from nba_api OR a manually-verified override, plus real player props from The Odds API. Prop cards are scored against player game logs."
          />
          <ModeCard
            color="lime"
            label="ScheduleLiveOddsUnavailable"
            description="Real schedule (nba_api or manual override), but no player props — either ODDS_API_KEY isn't set, the odds fetch failed, or the slate has zero props. Sub-state on board.json tells you which."
          />
          <ModeCard
            color="text-mute"
            label="NoGames"
            description="The schedule provider explicitly confirmed zero NBA games for this date (an off-day). This is different from a provider failure."
          />
          <ModeCard
            color="rose"
            label="ScheduleUnavailable"
            description="The schedule provider failed AND no manual override exists for this date. The pipeline genuinely doesn't know what's on — it does NOT pretend it's an off-day."
          />
          <ModeCard
            color="amber"
            label="DemoForced"
            description="NBA_DATA_MODE=demo or ODDS_DATA_MODE=demo is set in the environment. The board shows a representative sample slate clearly labeled as demo. There is no automatic fall-back from real to demo — that path was removed in 7B-1.1."
          />
        </div>
      </section>

      {/* Limitations */}
      <section className="mt-12 mb-10">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-4">
          Limitations
        </h2>
        <ul className="space-y-2 text-[15px] text-[var(--text-mute)] leading-relaxed">
          <li>
            <span className="text-[var(--text)]">No injury / minutes adjustment.</span>{" "}
            The model treats minutes as constant. A late-scratch starter
            substantially changes projection inputs but isn't reflected until
            the next pipeline run.
          </li>
          <li>
            <span className="text-[var(--text)]">No back-to-back / rest adjustment.</span>{" "}
            Travel and fatigue impact production. Not currently modeled.
          </li>
          <li>
            <span className="text-[var(--text)]">Lines move.</span>{" "}
            The board reflects odds at pipeline time. By the time you read it,
            lines have likely shifted.
          </li>
          <li>
            <span className="text-[var(--text)]">No causal claims.</span>{" "}
            A positive edge is correlation between recent stats and the line,
            not a guarantee.
          </li>
        </ul>
      </section>

      {/* News overrides — Phase 7B-1 */}
      <section className="mt-12 reveal">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-3">
          Manual news overrides
        </h2>
        <p className="text-[15px] text-[var(--text-mute)] leading-relaxed mb-4">
          Phase 7B-1 introduces a free, compliant news layer: a local JSON
          file at{" "}
          <code className="font-mono text-[13px] text-[var(--text)]">
            pipeline/manual_overrides/news_signals.json
          </code>
          . The operator manually adds entries when verifiable news appears
          (official injury reports, beat reporters, team accounts). Each
          signal carries a source URL, timestamp, and{" "}
          <code className="font-mono text-[13px]">modelAction</code> directive
          (e.g.{" "}
          <code className="font-mono text-[13px]">remove_from_board</code>,{" "}
          <code className="font-mono text-[13px]">flag_risk</code>).
        </p>
        <p className="text-[15px] text-[var(--text-mute)] leading-relaxed mb-4">
          The pipeline reads this file on every run, filters expired signals,
          and attaches relevant ones to each lean. Signals appear on prop
          cards with the source label, update type, and a verification link.
        </p>
        <p className="text-[15px] text-[var(--text-mute)] leading-relaxed mb-4">
          What this does <span className="text-[var(--text)]">not</span> do:
          we do not scrape Twitter/X, do not auto-ingest from any social
          platform, and do not invent player statuses. If no signal exists
          for a player, the UI says &ldquo;No active manual signals&rdquo;
          rather than asserting they are healthy. See{" "}
          <code className="font-mono text-[13px]">docs/news_overrides.md</code>{" "}
          in the repo for the operator workflow.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="reveal">
      <h3 className="font-display text-[18px] font-semibold tracking-tight text-[var(--text)] mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-[3px] px-4 py-3 my-3 font-mono text-[13px] tabular text-[var(--text)] leading-relaxed">
      {children}
    </div>
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
    <div className="surface p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: dotColor }}
        />
        <span className="font-display text-[14px] font-semibold tracking-tight uppercase">
          {label}
        </span>
      </div>
      <p className="text-[13px] text-[var(--text-mute)] leading-relaxed">
        {description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow diagram (pure SVG)
// ---------------------------------------------------------------------------
function FlowDiagram() {
  const steps = [
    { label: "NBA data", sub: "nba_api" },
    { label: "Market line", sub: "The Odds API" },
    { label: "Projection", sub: "weighted avg" },
    { label: "Model probability", sub: "normal CDF" },
    { label: "Edge", sub: "model − implied" },
    { label: "Confidence", sub: "tiered" },
    { label: "Tracked result", sub: "settled" },
  ];

  return (
    <div className="surface p-5">
      <div className="overflow-x-auto -mx-1">
        <div className="flex items-center gap-2 px-1 min-w-min">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
              <div
                className="bg-[var(--surface-elevated)] border border-[var(--border-strong)] rounded-[3px] px-3 py-2.5 min-w-[120px] text-center"
              >
                <div className="font-display text-[13px] font-semibold tracking-tight">
                  {step.label}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)] mt-0.5">
                  {step.sub}
                </div>
              </div>
              {i < steps.length - 1 && (
                <span className="text-[var(--text-faint)] font-mono text-[14px] shrink-0">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
