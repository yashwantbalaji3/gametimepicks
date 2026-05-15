import type { ReactNode } from "react";
import { getMeta } from "@/lib/data";
import DataSourceBadge from "@/components/data-source-badge";

export default function MethodologyPage() {
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-[840px] px-6 py-12">
      {/* Header */}
      <div className="vault-hero-grid">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3 inline-flex items-center gap-2"
          style={{ color: "var(--vault-gold)" }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
            style={{ background: "var(--vault-gold-bright)" }}
          />
          methodology · transparent by design
        </div>
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

      {/* Data sources — Iteration 5: panelled deluxe card with each source
          rendered as its own labeled cell instead of a bulleted list. */}
      <section className="mt-12">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-4">
          Data sources
        </h2>
        <div className="vault-deluxe-card p-5 sm:p-6">
          <p
            className="text-[14px] sm:text-[15px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            GametimePicks runs on a multi-source provider system. Each external
            service is accessed through a common adapter interface, so the
            pipeline can fail over from one source to the next without breaking.
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DataSourceCell
              label="NBA stats"
              body="Scores, schedules, and box-score data from the league's official source."
            />
            <DataSourceCell
              label="Sportsbook odds"
              body="Compliant odds feed from a licensed data provider."
            />
            <DataSourceCell
              label="Demo data"
              body="Bundled sample slate, used only when explicitly labeled."
            />
          </div>
          <p
            className="mt-5 text-[13px] leading-relaxed"
            style={{ color: "var(--vault-text-faint)" }}
          >
            The system never scrapes sportsbook websites or reverse-engineers
            mobile apps. Provider credentials live in secured environment
            configuration; nothing is exposed in the codebase.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-4">
          Status states
        </h2>
        <p className="text-[14px] text-[var(--text-mute)] leading-relaxed mb-4 max-w-[780px]">
          Every page labels its current state honestly. The status strip at
          the top of the board surfaces which one is active.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ModeCard
            color="lime"
            label="Model leans available"
            description="Tonight's schedule is loaded and the model has finished scoring it. Player-prop cards include projections, edges, and confidence tiers."
          />
          <ModeCard
            color="lime"
            label="Model leans pending"
            description="Tonight's schedule is loaded; projections will appear before tipoff once the model finishes scoring."
          />
          <ModeCard
            color="text-mute"
            label="No games today"
            description="Confirmed off-day. The next available slate is shown when ready."
          />
          <ModeCard
            color="rose"
            label="Schedule unavailable"
            description="Tonight's schedule couldn't be confirmed yet. We retry automatically. This is not the same as an off-day."
          />
          <ModeCard
            color="amber"
            label="Demo sample"
            description="Explicitly labeled placeholder content used for screenshots or testing. The site never silently substitutes sample data for real data."
          />
        </div>
      </section>

      {/* Limitations — Iteration 5: panelled card with each limitation as
          a labeled bullet so the section reads as a deliberate
          calibration sheet rather than a paragraph dump. */}
      <section className="mt-12 mb-10">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-4">
          Limitations
        </h2>
        <div className="vault-deluxe-card p-5 sm:p-6">
          <ul className="space-y-3.5 text-[14px] sm:text-[15px] leading-relaxed list-none">
            <LimitationRow
              title="No injury / minutes adjustment"
              body="The model treats minutes as constant. A late-scratch starter substantially changes projection inputs but isn't reflected until the next pipeline run."
            />
            <LimitationRow
              title="No back-to-back / rest adjustment"
              body="Travel and fatigue impact production. Not currently modeled."
            />
            <LimitationRow
              title="Lines move"
              body="The board reflects odds at pipeline time. By the time you read it, lines have likely shifted."
            />
            <LimitationRow
              title="No causal claims"
              body="A positive edge is correlation between recent stats and the line, not a guarantee."
            />
          </ul>
        </div>
      </section>

      {/* News overrides — public-friendly explanation (Phase 14 rewrite) */}
      <section className="mt-12 reveal">
        <h2 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight mb-3">
          Verified news signals
        </h2>
        <p className="text-[15px] text-[var(--text-mute)] leading-relaxed mb-4">
          When verifiable news appears — official injury reports, team
          announcements, or reporting from credentialed beat writers — we
          manually log it with a source link and timestamp before it changes
          the board. Each signal includes a directive that tells the model
          what to do (e.g. drop a lean, flag risk on a player).
        </p>
        <p className="text-[15px] text-[var(--text-mute)] leading-relaxed mb-4">
          On every refresh, the model checks the news log, filters out
          expired entries, and attaches active signals to relevant leans.
          Signals appear on prop cards with the source label, update type,
          and a verification link so you can read the original report.
        </p>
        <p className="text-[15px] text-[var(--text-mute)] leading-relaxed mb-4">
          What this does <span className="text-[var(--text)]">not</span> do:
          we do not scrape Twitter/X, do not auto-ingest from any social
          platform, and do not invent player statuses. If no signal exists
          for a player, the UI says &ldquo;no active news signals&rdquo;
          rather than asserting they are healthy.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Block({ title, children }: { title: string; children: ReactNode }) {
  // Iteration 2: numbered step card — pulls a leading "NN · " out of the
  // title, renders it as a gold pill on the left, and frames the rest of
  // the block in a deluxe card with the casino-glow rim. Falls back to a
  // plain heading when the title doesn't start with "NN · ".
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
            fontSize: "clamp(17px, 2.2vw, 20px)",
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
  // Iteration 5: formulas read as deep glass panels with a faint gold
  // top-rule so they look like derivations on an odds-board chalkboard,
  // not flat `<code>` blocks.
  return (
    <div
      className="relative my-4 rounded-[6px] px-4 py-3.5 font-mono text-[13px] tabular leading-relaxed overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(20, 24, 38, 0.92), rgba(10, 14, 28, 0.92))",
        border: "1px solid var(--vault-border)",
        color: "var(--vault-text)",
        boxShadow: "0 4px 14px -10px rgba(0, 0, 0, 0.4)",
      }}
    >
      <span
        aria-hidden
        className="absolute top-0 left-[12%] right-[12%] h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.45), transparent)",
        }}
      />
      {children}
    </div>
  );
}

function LimitationRow({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-2"
        style={{
          background: "var(--vault-warn)",
          boxShadow: "0 0 5px rgba(240, 199, 94, 0.45)",
        }}
      />
      <span>
        <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>
          {title}.
        </span>{" "}
        <span style={{ color: "var(--vault-text-mute)" }}>{body}</span>
      </span>
    </li>
  );
}

function DataSourceCell({ label, body }: { label: string; body: string }) {
  return (
    <div
      className="px-3.5 py-3 rounded-[6px]"
      style={{
        background: "rgba(20, 24, 38, 0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.14em] uppercase"
        style={{ color: "var(--vault-gold-bright)" }}
      >
        {label}
      </div>
      <p
        className="mt-1.5 text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>
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
  // Iteration 5: deluxe card surface + sentence-case label so the modes
  // read as polished badges, not internal-tool stickers.
  return (
    <div className="vault-deluxe-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            background: dotColor,
            boxShadow:
              color === "lime"
                ? "0 0 6px rgba(240, 199, 94, 0.5)"
                : "none",
          }}
        />
        <span
          className="font-display text-[14px] font-semibold tracking-tight"
          style={{ color: "var(--vault-text)" }}
        >
          {label}
        </span>
      </div>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
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
    { label: "NBA data", sub: "official source" },
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
