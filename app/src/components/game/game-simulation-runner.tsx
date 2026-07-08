"use client";

/**
 * GameSimulationRunner — the "Generate Simulation" REVEAL for one MLB fixture.
 *
 * It renders the PRECOMPUTED, deterministic simulation view built at BUILD TIME by
 * `buildGameSimulationView` (@/lib/game-simulations/game-lab-view) and threaded through
 * `game-detail.ts` as a prop. This component is animation-ONLY: clicking "Generate Simulation"
 * plays a staged reveal from pure client state (setTimeout + CSS), then shows the artifact that was
 * ALREADY loaded. It does NOT fetch, read the filesystem, write anything, or randomize — every user
 * sees the SAME picks for the same game + model version.
 *
 * HONESTY (mirrors the artifact contract + validator):
 *   • The word "simulated" / a run count appears ONLY when the view says so:
 *       - a "ready" (or "stale") status carries the real payload;
 *       - "N-run" copy is gated on `view.allowsRunCountClaim` (runCount is a positive integer).
 *   • Histograms render ONLY when `view.distributions` is present (a real, non-empty block).
 *   • No xG / corners / cards / first-scorer — those are declared "not generated" and shown as such.
 *   • Copy is deterministic + paper-only, and stays inside the honest-language allowlist (no hype /
 *     no certainty / no in-play-wagering terms). The reveal replays a precomputed, seeded artifact.
 *
 * The existing `MlbGameLabReport` stays visible regardless — this is an additive reveal beside it.
 */

import { useState, useCallback } from "react";
import type { GameSimulationView } from "@/lib/game-simulations/game-lab-view";
import type { SimGeneratedPick, SimDistribution } from "@/lib/game-simulations/types";

// ── formatters (always fall back to an em dash; never render undefined/NaN) ──
const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v)) ? "—" : String(v);
const pct = (n?: number | null) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n * 100)}%`);
const num2 = (n?: number | null) => (n == null || !Number.isFinite(n) ? "—" : n.toFixed(2));
const edgeTxt = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/** Human "x days ago"/"today" from an ISO timestamp using the browser clock (client-only, honest). */
function freshnessLabel(iso: string | null): string {
  if (!iso) return "generated recently";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "generated recently";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "generated today";
  if (days === 1) return "generated 1 day ago";
  return `generated ${days} days ago`;
}

const RISK_TONE: Record<string, string> = {
  anchor: "var(--vault-success)",
  core: "var(--vault-gold-bright)",
  value: "var(--vault-gold-bright)",
  longshot: "var(--gtp-bank-heat)",
};

/**
 * The deterministic reveal steps. These describe what the PRECOMPUTED artifact contains — they are
 * pure labels for the animation and do NOT compute anything. Wording stays inside the honest-language
 * allowlist; it is honest about replaying a precomputed, deterministic, seeded artifact.
 */
const REVEAL_STEPS = [
  "Pulling market snapshot",
  "Loading model projections",
  "Reading deterministic simulation artifact",
  "Aggregating generated picks",
  "Checking risk notes",
  "Simulation complete",
] as const;
const STEP_MS = 420;

function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="font-mono uppercase tracking-[0.13em]"
      style={{ color: color ?? "var(--vault-gold-bright)", fontSize: 9.5 }}
    >
      {children}
    </span>
  );
}

/** One generated pick, rendered like the MLB report cards (paper-only). */
function GeneratedPickCard({ p }: { p: SimGeneratedPick }) {
  const selection =
    (p.player ? `${p.player} · ` : p.team ? `${p.team} · ` : "") +
    `${dash(p.side)}${p.line != null ? ` ${p.line}` : ""}`;
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className="font-display tracking-tight break-words leading-tight"
            style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}
          >
            {selection}
          </span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            {dash(p.market)}
          </span>
        </div>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em] shrink-0"
          style={{
            color: RISK_TONE[p.riskTier] ?? "var(--vault-text-mute)",
            border: `1px solid ${RISK_TONE[p.riskTier] ?? "var(--vault-rule)"}`,
            fontSize: 8.5,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {dash(p.riskTier)}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-2">
        <Stat label="Proj" value={num2(p.projection)} />
        <Stat label="Model" value={pct(p.modelProbability)} />
        <Stat label="Market" value={pct(p.marketProbability)} />
        <Stat label="Edge" value={edgeTxt(p.edgePct)} color={(p.edgePct ?? 0) >= 0 ? "var(--vault-success)" : "var(--gtp-bank-heat)"} />
        <Stat label="Conf" value={pct(p.confidence)} />
      </div>
      {p.reasonBullets.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {p.reasonBullets.map((b, i) => (
            <li key={i} className="text-[11px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
              · {dash(b)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
        {label}
      </span>
      <span className="font-mono" style={{ color: color ?? "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

/** A single distribution as a compact honest histogram (only rendered when distributions exist). */
function DistributionCard({ d }: { d: SimDistribution }) {
  const maxP = d.bins.reduce((m, b) => (Number.isFinite(b.probability) ? Math.max(m, b.probability) : m), 0) || 1;
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>
        {dash(d.label)}
      </span>
      <div className="flex items-end gap-1" style={{ height: 48 }}>
        {d.bins.map((b, i) => {
          const h = Math.max(3, Math.round((b.probability / maxP) * 44));
          return (
            <div
              key={i}
              className="flex flex-1 flex-col items-center gap-0.5"
              title={`${dash(b.label)}: ${pct(b.probability)}${b.count != null ? ` · ${b.count} samples` : ""}`}
            >
              <div
                style={{ width: "100%", maxWidth: 16, height: h, borderRadius: 3, background: "var(--vault-gold-bright)", opacity: 0.7 }}
              />
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 7.5 }}>
                {dash(b.label)}
              </span>
            </div>
          );
        })}
      </div>
      {d.sampleCount != null ? (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
          {d.sampleCount.toLocaleString()} deterministic samples · same output every run
        </span>
      ) : null}
    </div>
  );
}

/** The "not generated" modules — honest edge of what the artifact does NOT contain. */
function UnavailableModules({ view }: { view: GameSimulationView }) {
  if (view.unavailableModules.length === 0) return null;
  return (
    <section
      className="flex flex-col gap-2 rounded-[14px] px-4 py-3.5"
      style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}
    >
      <div className="flex flex-col gap-0.5">
        <Eyebrow color="var(--vault-text-faint)">Not generated</Eyebrow>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
          These modules were not generated for this game — we show only what the artifact actually contains, never a fabricated one.
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {view.unavailableModules.map((u) => (
          <div
            key={u.module}
            className="flex flex-col gap-0.5 rounded-[10px] px-3 py-2.5"
            style={{ background: "rgba(0,0,0,0.22)", border: "1px dashed var(--vault-rule)" }}
          >
            <span style={{ color: "var(--vault-text-mute)", fontSize: 12, fontWeight: 600 }}>{dash(u.displayCopy)}</span>
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
              {dash(u.module)} · {dash(u.reason)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The animated reveal overlay (labels only — no computation). */
function RevealSequence({ step }: { step: number }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[14px] px-4 py-4"
      style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <Eyebrow>Generating simulation</Eyebrow>
      <ul className="flex flex-col gap-1.5 mt-1">
        {REVEAL_STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: done ? "var(--vault-success)" : active ? "var(--vault-gold-bright)" : "var(--vault-rule)",
                  boxShadow: active ? "0 0 8px var(--vault-gold-bright)" : "none",
                  transition: "background 200ms ease",
                }}
              />
              <span
                className="font-mono"
                style={{
                  color: done ? "var(--vault-text-mute)" : active ? "var(--vault-text)" : "var(--vault-text-faint)",
                  fontSize: 11.5,
                  transition: "color 200ms ease",
                }}
              >
                {label}
                {active ? " …" : done ? " ✓" : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function GameSimulationRunner({ view }: { view: GameSimulationView }) {
  const [phase, setPhase] = useState<"idle" | "revealing" | "done">("idle");
  const [step, setStep] = useState(0);

  const ready = view.status === "ready" || view.status === "stale";

  // Pure client animation: advance a step counter on a timer. NO data work, NO randomness — the
  // payload is already loaded; this only stages its reveal. Idempotent (same artifact every click).
  const start = useCallback(() => {
    if (!ready) return;
    setPhase("revealing");
    setStep(0);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i < REVEAL_STEPS.length) {
        setStep(i);
        window.setTimeout(tick, STEP_MS);
      } else {
        setStep(REVEAL_STEPS.length);
        setPhase("done");
      }
    };
    window.setTimeout(tick, STEP_MS);
  }, [ready]);

  // ── Unavailable: calm, non-broken. The existing Game Lab report stays visible above this. ──
  if (view.status === "unavailable" || view.status === "error") {
    return (
      <section
        className="flex flex-col gap-1.5 rounded-[14px] px-4 py-4"
        style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}
      >
        <Eyebrow color="var(--vault-text-faint)">Generate Simulation</Eyebrow>
        <span style={{ color: "var(--vault-text-mute)", fontSize: 13, fontWeight: 600 }}>
          Simulation not yet available for this game
        </span>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.5 }}>
          No precomputed model simulation artifact exists for this fixture yet. The model report above is built from the available data. Check back closer to the slate.
        </span>
      </section>
    );
  }

  // Copy that is only honest when a run count is actually claimable.
  const runCopy =
    view.allowsRunCountClaim && view.runCount != null
      ? `${view.runCount.toLocaleString()}-run simulation`
      : "model simulation";
  const versionNote = view.modelVersion ? `model ${view.modelVersion}` : "current model";

  return (
    <section className="flex flex-col gap-3">
      {/* Stale banner — still reveals the artifact, but flags it as behind the current slate/version. */}
      {view.status === "stale" ? (
        <div
          className="flex flex-col gap-0.5 rounded-[12px] px-3.5 py-2.5"
          style={{ background: "rgba(217,164,65,0.10)", border: "1px solid var(--vault-gold-bright)" }}
        >
          <Eyebrow>Stale simulation</Eyebrow>
          <span style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.5 }}>
            This precomputed simulation is older than the current slate or model version. It is shown for reference — the numbers may be behind the latest board.
          </span>
        </div>
      ) : null}

      {/* Before click: the explainer + the prominent Generate button. */}
      {phase === "idle" ? (
        <div
          className="flex flex-col gap-3 rounded-[14px] px-5 py-5"
          style={{
            border: "1px solid var(--vault-border-strong)",
            background:
              "radial-gradient(120% 150% at 0% 0%, rgba(217,164,65,0.10) 0%, transparent 55%), linear-gradient(135deg, rgba(22,30,62,0.94) 0%, rgba(26, 16, 11,0.97) 100%)",
          }}
        >
          <div className="flex flex-col gap-1">
            <Eyebrow>Model simulation</Eyebrow>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 700, lineHeight: 1.1 }}>
              Generate the {runCopy} for this game
            </h2>
            <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.5 }}>
              This is a model-generated, <span style={{ color: "var(--vault-text)" }}>precomputed, deterministic</span> simulation — precomputed for this game. Every user sees the same model output. It is <span style={{ color: "var(--vault-text)" }}>paper-only</span> and educational, not betting advice.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
              <span style={{ color: "var(--vault-text-mute)" }}>Model</span> {dash(view.modelVersion)}
            </span>
            {view.allowsRunCountClaim && view.runCount != null ? (
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
                <span style={{ color: "var(--vault-text-mute)" }}>Runs</span> {view.runCount.toLocaleString()}
              </span>
            ) : null}
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
              {freshnessLabel(view.generatedAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={start}
            className="gtp-cta-lava vault-press inline-flex items-center self-start rounded-full px-5 font-mono uppercase tracking-[0.12em]"
            style={{ fontSize: 12, fontWeight: 700, minHeight: 44, border: "none", cursor: "pointer" }}
          >
            Generate Simulation
          </button>
        </div>
      ) : null}

      {/* Reveal animation (labels only). */}
      {phase === "revealing" ? <RevealSequence step={step} /> : null}

      {/* After reveal: the precomputed artifact. */}
      {phase === "done" ? (
        <div className="flex flex-col gap-4">
          {/* Summary */}
          <section
            className="flex flex-col gap-2 rounded-[14px] px-5 py-4"
            style={{ border: "1px solid var(--vault-border-strong)", background: "linear-gradient(135deg, rgba(22,30,62,0.9) 0%, rgba(26, 16, 11,0.96) 100%)" }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-rule)", fontSize: 9, background: "rgba(217,164,65,0.10)" }}
              >
                Simulation complete
              </span>
              <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                Precomputed for this game
              </span>
            </div>
            {view.simulationSummary?.headline ? (
              <p style={{ color: "var(--vault-text)", fontSize: 13.5, lineHeight: 1.5 }}>{dash(view.simulationSummary.headline)}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {view.simulationSummary?.projectedTotal != null ? (
                <Stat label="Proj total" value={num2(view.simulationSummary.projectedTotal)} />
              ) : null}
              {view.simulationSummary?.projectedHomeScore != null ? (
                <Stat label="Proj home" value={num2(view.simulationSummary.projectedHomeScore)} />
              ) : null}
              {view.simulationSummary?.projectedAwayScore != null ? (
                <Stat label="Proj away" value={num2(view.simulationSummary.projectedAwayScore)} />
              ) : null}
            </div>
          </section>

          {/* Generated picks */}
          {view.generatedPicks.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <Eyebrow>Generated picks · {view.generatedPicks.length}</Eyebrow>
                <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>
                  What the {runCopy} produced
                </h3>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
                  Model probability vs the market price, with edge, per pick — paper-only, deterministic.
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {view.generatedPicks.map((p) => (
                  <GeneratedPickCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-[12px] px-4 py-3.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
              <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
                The simulation produced no qualified pick for this game — nothing is padded to look active.
              </p>
            </div>
          )}

          {/* Distributions — ONLY when the artifact carries a real, non-empty block. */}
          {view.distributions && Object.keys(view.distributions).length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <Eyebrow>Distributions</Eyebrow>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
                  The simulated outcome spread — deterministic bins from the artifact.
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(view.distributions).map(([key, d]) => (
                  <DistributionCard key={key} d={d} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Not-generated modules. */}
          <UnavailableModules view={view} />

          {/* Same-output note + paper-only. */}
          <p className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            Same model output for every user · {versionNote}
          </p>
          <p className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            Paper-only · educational · not betting advice
          </p>
        </div>
      ) : null}
    </section>
  );
}
