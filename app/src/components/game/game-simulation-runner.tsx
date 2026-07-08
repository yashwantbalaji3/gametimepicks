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

import { useState, useCallback, useRef, useEffect } from "react";
import type { GameSimulationView } from "@/lib/game-simulations/game-lab-view";
import type { SimGeneratedPick, SimDistribution } from "@/lib/game-simulations/types";
import {
  SportSimulationAnimation,
  SIMULATION_MIN_DURATION_MS,
  SIMULATION_STAGES,
} from "./simulation-animation";

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

/** One generated pick, rendered like the MLB report cards (paper-only). `top` highlights the strongest
 *  lean (the highest-edge pick — the list is edge-ranked). */
function GeneratedPickCard({ p, top }: { p: SimGeneratedPick; top?: boolean }) {
  const selection =
    (p.player ? `${p.player} · ` : p.team ? `${p.team} · ` : "") +
    `${dash(p.side)}${p.line != null ? ` ${p.line}` : ""}`;
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: `1px solid ${top ? "var(--vault-gold-bright)" : "var(--vault-border)"}`, boxShadow: top ? "0 0 0 1px rgba(242,54,69,0.22)" : "none" }}
    >
      {top ? (
        <span className="inline-flex items-center self-start rounded-full px-2 py-0.5 font-mono font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--vault-gold-bright)", background: "rgba(242,54,69,0.10)", border: "1px solid var(--vault-gold-bright)", fontSize: 8.5 }}>
          ★ Strongest lean
        </span>
      ) : null}
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
      {/* Visual depth — real fields only: the model-vs-market edge bar + the projection-vs-line track. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-4">
        <div className="flex-1"><ProbBar model={p.modelProbability} market={p.marketProbability} /></div>
        <div className="flex-1"><ProjVsLine projection={p.projection} line={p.line} side={p.side} /></div>
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

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Model-vs-market probability bar — a visual of the edge, built ONLY from the pick's real
 * `modelProbability` (bar fill) and `marketProbability` (a tick). The gap between them IS the edge.
 * Renders nothing when the model probability is absent (never a fabricated bar).
 */
function ProbBar({ model, market }: { model?: number | null; market?: number | null }) {
  if (model == null || !Number.isFinite(model)) return null;
  const m = clamp01(model);
  const mk = market != null && Number.isFinite(market) ? clamp01(market) : null;
  const ahead = mk == null || m >= mk;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8, color: "var(--vault-text-faint)" }}>
        <span>Model {pct(model)}</span>
        {mk != null ? <span>Market {pct(market)}</span> : null}
      </div>
      <div className="relative w-full rounded-full" style={{ height: 6, background: "rgba(255,255,255,0.07)" }}>
        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${m * 100}%`, background: ahead ? "var(--vault-success)" : "var(--gtp-bank-heat)", transition: "width 300ms ease" }} />
        {mk != null ? (
          <div className="absolute" style={{ top: -2, left: `calc(${mk * 100}% - 1px)`, width: 2, height: 10, background: "var(--vault-text)" }} title={`Market ${pct(market)}`} aria-hidden />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Projection-vs-line visual — the model projection placed against the market line on a shared track
 * (0 → ~2× the line). Built ONLY from the pick's real `projection`, `line`, and `side`. Renders nothing
 * when either number is missing.
 */
function ProjVsLine({ projection, line, side }: { projection?: number | null; line?: number | null; side?: string | null }) {
  if (projection == null || line == null || !Number.isFinite(projection) || !Number.isFinite(line) || line <= 0) return null;
  const span = Math.max(line * 2, projection * 1.15, 1);
  const linePct = clamp01(line / span) * 100;
  const projPct = clamp01(projection / span) * 100;
  const over = String(side ?? "").toLowerCase().includes("over");
  const clears = over ? projection >= line : projection <= line;
  const tone = clears ? "var(--vault-success)" : "var(--gtp-bank-heat)";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8, color: "var(--vault-text-faint)" }}>
        <span>Proj {num2(projection)}</span>
        <span>Line {num2(line)} · {dash(side)}</span>
      </div>
      <div className="relative w-full rounded-full" style={{ height: 6, background: "rgba(255,255,255,0.07)" }}>
        {/* the line marker */}
        <div className="absolute" style={{ top: -2, left: `calc(${linePct}% - 1px)`, width: 2, height: 10, background: "var(--vault-text-mute)" }} title={`Line ${num2(line)}`} aria-hidden />
        {/* the projection dot */}
        <div className="absolute rounded-full" style={{ top: -1, left: `calc(${projPct}% - 4px)`, width: 8, height: 8, background: tone, boxShadow: `0 0 6px ${tone}` }} title={`Projection ${num2(projection)}`} aria-hidden />
      </div>
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

export default function GameSimulationRunner({ view }: { view: GameSimulationView }) {
  const [phase, setPhase] = useState<"idle" | "revealing" | "done">("idle");
  const [stage, setStage] = useState(0);
  const timersRef = useRef<number[]>([]);

  const ready = view.status === "ready" || view.status === "stale";

  // Clear any pending stage timers on unmount so a mid-animation navigation never fires a stray setState.
  useEffect(() => {
    return () => {
      for (const t of timersRef.current) window.clearTimeout(t);
      timersRef.current = [];
    };
  }, []);

  // Pure client STAGING: advance `stage` across SIMULATION_STAGES over SIMULATION_MIN_DURATION_MS (≈1.25s
  // each), then flip to the done dashboard only after the FULL SIMULATION_MIN_DURATION_MS (10s) has
  // elapsed. NO data work, NO randomness — the payload is already loaded; this only stages its reveal, so
  // the same artifact is shown for every click. The done phase is GATED on SIMULATION_MIN_DURATION_MS: the
  // dashboard cannot appear on a sub-10s timer.
  const start = useCallback(() => {
    if (!ready) return;
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
    setPhase("revealing");
    setStage(0);

    const stageCount = SIMULATION_STAGES.length;
    const perStage = SIMULATION_MIN_DURATION_MS / stageCount; // ≈1.25s per stage across the 10s

    // Advance the pre-completion stages [1 .. stageCount-2] on evenly-spaced timers. The final
    // "complete" stage + the dashboard are BOTH gated on the full SIMULATION_MIN_DURATION_MS below.
    for (let i = 1; i < stageCount - 1; i += 1) {
      const t = window.setTimeout(() => setStage(i), Math.round(perStage * i));
      timersRef.current.push(t);
    }
    // The done gate: only at SIMULATION_MIN_DURATION_MS do we mark the final stage AND reveal the dashboard.
    const doneTimer = window.setTimeout(() => {
      setStage(stageCount - 1);
      setPhase("done");
    }, SIMULATION_MIN_DURATION_MS);
    timersRef.current.push(doneTimer);
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

      {/* Reveal animation — the 10s sport-specific staging (baseball diamond for MLB). The dashboard is
          gated on SIMULATION_MIN_DURATION_MS in `start`, so it never appears before the animation finishes. */}
      {phase === "revealing" ? <SportSimulationAnimation sport="mlb" view={view} stage={stage} /> : null}

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
            {view.teams ? (
              <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>
                {dash(view.teams.away)} <span style={{ color: "var(--vault-text-faint)" }}>@</span> {dash(view.teams.home)}
              </h2>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono" style={{ fontSize: 10 }}>
              <span style={{ color: "var(--vault-text-faint)" }}><span style={{ color: "var(--vault-text-mute)" }}>Model</span> {dash(view.modelVersion)}</span>
              {view.allowsRunCountClaim && view.runCount != null ? (
                <span style={{ color: "var(--vault-text-faint)" }}><span style={{ color: "var(--vault-text-mute)" }}>Runs</span> {view.runCount.toLocaleString()}</span>
              ) : null}
              <span style={{ color: "var(--vault-text-faint)" }}>{freshnessLabel(view.generatedAt)}</span>
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
                {view.generatedPicks.map((p, i) => (
                  <GeneratedPickCard key={p.id} p={p} top={i === 0} />
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
