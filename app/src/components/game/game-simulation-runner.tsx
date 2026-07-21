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
import Link from "next/link";
import type { GameSimulationView } from "@/lib/game-simulations/game-lab-view";
import type { SimGeneratedPick } from "@/lib/game-simulations/types";
import {
  SportSimulationAnimation,
  SIMULATION_MIN_DURATION_MS,
  SIMULATION_STAGES,
} from "./simulation-animation";

/**
 * The dashboard modules the reveal unlocks — shown BEFORE the click as locked/preview pills ONLY (labels,
 * never data), so the user knows what is coming without seeing any posted price, prop, or distribution.
 */
const DASHBOARD_PREVIEW_PILLS = [
  "Simulation coverage",
  "Player board",
  "Model leads",
  "Market agreement",
  "Distributions",
  "Settlement",
  "Product tags",
  "Market snapshot",
] as const;

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


// ─────────────────────────────────────────────────────────────────────────────
// PURE derivation helpers (exported for real-timer-free unit tests). Everything
// below is deterministic — same picks in ⇒ same output — and reads ONLY real
// artifact fields. Nothing here fabricates a probability, odds, score, or win%.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Humanize a raw board market key for display: split on "_" and title-case each
 * token (e.g. "batter_total_bases" → "Batter Total Bases"). Presentation only —
 * it never changes a number. Empty/nullish ⇒ em dash.
 */
export function humanizeMarket(market?: string | null): string {
  if (market == null || market === "") return "—";
  return String(market)
    .split("_")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Only picks that carry a real (priced) market probability. */
export function pricedPicks(picks: SimGeneratedPick[]): SimGeneratedPick[] {
  return (picks ?? []).filter((p) => p.marketProbability != null && Number.isFinite(p.marketProbability));
}

/**
 * One derived takeaway card's data. All fields trace back to a real pick.
 */
export interface SimTakeaway {
  key: "strongest_lean" | "highest_confidence" | "biggest_edge" | "common_market";
  label: string;
  /** The headline value (already formatted for display). */
  value: string;
  /** The pick/family this takeaway was derived from (for honest attribution). */
  from: string;
}

/**
 * Derive 3–4 takeaway cards from the generated picks, all from real fields and
 * fully deterministic. Ties break by FIRST occurrence, then alphabetically by a
 * stable subject string — never by a timer or random draw. Empty picks ⇒ [].
 */
export function deriveTakeaways(picks: SimGeneratedPick[]): SimTakeaway[] {
  const list = picks ?? [];
  if (list.length === 0) return [];

  const subjectOf = (p: SimGeneratedPick) => p.player || p.team || humanizeMarket(p.market);
  // Deterministic key for alphabetical tie-breaks (subject + market + side + line).
  const alphaKey = (p: SimGeneratedPick) =>
    `${subjectOf(p)}|${humanizeMarket(p.market)}|${dash(p.side)}|${p.line ?? ""}`.toLowerCase();

  // Pick the extreme by a numeric selector; ties → first occurrence, then alpha.
  const extremeBy = (sel: (p: SimGeneratedPick) => number): SimGeneratedPick => {
    let best = list[0];
    let bestIdx = 0;
    for (let i = 1; i < list.length; i += 1) {
      const p = list[i];
      const v = sel(p);
      const bv = sel(best);
      if (!Number.isFinite(v)) continue;
      if (!Number.isFinite(bv) || v > bv) {
        best = p;
        bestIdx = i;
      } else if (v === bv) {
        // tie: keep earlier index (already have it); if same index impossible, alpha decides.
        if (alphaKey(p) < alphaKey(best) && i < bestIdx) {
          best = p;
          bestIdx = i;
        }
      }
    }
    return best;
  };

  const strongest = extremeBy((p) => (Number.isFinite(p.edgePct) ? p.edgePct : -Infinity));
  const confident = extremeBy((p) => (Number.isFinite(p.confidence) ? p.confidence : -Infinity));

  // Most common humanized market family — mode; ties → first-seen family (insertion order).
  const familyCounts = new Map<string, number>();
  for (const p of list) {
    const fam = humanizeMarket(p.market);
    familyCounts.set(fam, (familyCounts.get(fam) ?? 0) + 1);
  }
  let modeFamily = humanizeMarket(list[0].market);
  let modeCount = 0;
  for (const [fam, count] of familyCounts) {
    if (count > modeCount) {
      modeFamily = fam;
      modeCount = count;
    }
  }

  const out: SimTakeaway[] = [
    {
      key: "strongest_lean",
      label: "Strongest lean",
      value: edgeTxt(strongest.edgePct),
      from: `${subjectOf(strongest)} · ${humanizeMarket(strongest.market)} ${dash(strongest.side)}${strongest.line != null ? ` ${strongest.line}` : ""}`,
    },
    {
      key: "highest_confidence",
      label: "Highest confidence",
      value: pct(confident.confidence),
      from: `${subjectOf(confident)} · ${humanizeMarket(confident.market)} ${dash(confident.side)}${confident.line != null ? ` ${confident.line}` : ""}`,
    },
    {
      key: "biggest_edge",
      label: "Biggest model gap",
      value: edgeTxt(strongest.edgePct),
      from: `from ${subjectOf(strongest)} · ${humanizeMarket(strongest.market)}`,
    },
    {
      key: "common_market",
      label: "Most common market",
      value: modeFamily,
      from: `${modeCount} of ${list.length} generated pick${list.length === 1 ? "" : "s"}`,
    },
  ];
  return out;
}

/** The current-slate model-vs-market agreement summary (NOT historical calibration). */
export interface SimMarketAgreement {
  /** Count of picks carrying BOTH a model and a market probability. */
  pricedCount: number;
  /** Mean absolute |model − market| gap, in probability points (0..1). */
  avgGap: number;
  /** The single widest |model − market| gap among priced picks (0..1). */
  widestGap: number;
  /** The pick that owns the widest gap (for honest attribution). */
  widestPick: SimGeneratedPick;
  /** A tier label derived from `avgGap`: ≤0.06 "tightly aligned", ≤0.12 "moderate", else "stretched". */
  tier: "tightly aligned" | "moderate" | "stretched";
}

/**
 * Compute the CURRENT-SLATE model-vs-market agreement over ONLY the picks that
 * carry both a model AND a market probability. Returns null when there are zero
 * priced picks (the module is then hidden entirely). This is a snapshot of THIS
 * artifact's spread — it is NOT a Brier score or long-term calibration.
 */
export function marketAgreement(picks: SimGeneratedPick[]): SimMarketAgreement | null {
  const priced = (picks ?? []).filter(
    (p) =>
      p.modelProbability != null &&
      Number.isFinite(p.modelProbability) &&
      p.marketProbability != null &&
      Number.isFinite(p.marketProbability),
  );
  if (priced.length === 0) return null;

  let sum = 0;
  let widestGap = -Infinity;
  let widestPick = priced[0];
  for (const p of priced) {
    const gap = Math.abs((p.modelProbability as number) - (p.marketProbability as number));
    sum += gap;
    if (gap > widestGap) {
      widestGap = gap;
      widestPick = p;
    }
  }
  const avgGap = sum / priced.length;
  const tier: SimMarketAgreement["tier"] = avgGap <= 0.06 ? "tightly aligned" : avgGap <= 0.12 ? "moderate" : "stretched";

  return { pricedCount: priced.length, avgGap, widestGap, widestPick, tier };
}

/**
 * Build a copyable plain-text recap from ONLY real fields. The "N-run" line is
 * gated on `allowsRunCountClaim && runCount != null`; otherwise it is omitted.
 * No fabricated claims and nothing from the banned-copy list.
 */
export function buildRecap(view: GameSimulationView): string {
  const lines: string[] = [];
  const matchup =
    view.teams && (view.teams.away || view.teams.home)
      ? `${dash(view.teams.away)} @ ${dash(view.teams.home)}`
      : "Matchup —";
  lines.push(matchup);
  lines.push(`Model ${dash(view.modelVersion)}`);
  if (view.allowsRunCountClaim && view.runCount != null) {
    lines.push(`${view.runCount.toLocaleString()}-run simulation`);
  }

  const lean = view.generatedPicks[0];
  if (lean) {
    const subject = lean.player || lean.team || humanizeMarket(lean.market);
    lines.push(
      `Strongest lean: ${subject} — ${humanizeMarket(lean.market)} ${dash(lean.side)}${lean.line != null ? ` ${lean.line}` : ""}`,
    );
    lines.push(`  Model ${pct(lean.modelProbability)} · Market ${pct(lean.marketProbability)} · Gap ${edgeTxt(lean.edgePct)}`);
  } else {
    lines.push("Strongest lean: no qualified lean generated");
  }

  lines.push(`Generated picks: ${view.generatedPicks.length}`);
  lines.push("Paper-only · deterministic · not betting advice");
  return lines.join("\n");
}








/**
 * PropTable — a scrollable table of ALL generated picks (capped at a sensible top-N with an honest
 * "showing top N of M" note when capped). Every cell is null-guarded. This is the full ledger of what
 * the run produced, paper-only.
 */
const PROP_TABLE_CAP = 12;




export default function GameSimulationRunner({
  view,
  postReveal,
  marketSnapshot,
  homeLogo,
  awayLogo,
}: {
  view: GameSimulationView;
  /** Rendered ONLY in the done phase, below the dashboard — the dense report + spotlight + tabs shell,
   *  so on an MLB-sim page they are ABSENT from the pre-click DOM (gated behind the reveal). */
  postReveal?: React.ReactNode;
  /** The market-snapshot node (MlbGameCenter) — rendered as report section 2 (right after the header,
   *  before the model output) so "what the book says" leads the read. Gated (done phase only). */
  marketSnapshot?: React.ReactNode;
  homeLogo?: string | null;
  awayLogo?: string | null;
}) {
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

      {/* Before click: the premium pre-sim "Generate card" — headline, explanation, a locked dashboard-
          preview pill row (LABELS ONLY, never data), then the prominent Generate button. The dense report,
          posted prices, prop tables, distributions, and price tabs are GATED behind the reveal (they live
          in `postReveal`, rendered only in the done phase) so nothing priced is in this pre-click DOM. */}
      {phase === "idle" ? (
        <div
          className="relative overflow-hidden flex flex-col gap-5 rounded-[18px] px-5 py-7 sm:px-7 sm:py-8"
          style={{
            border: "1px solid var(--vault-border-strong)",
            background:
              "radial-gradient(130% 150% at 50% 0%, rgba(242,54,69,0.13) 0%, transparent 55%), linear-gradient(140deg, rgba(20,20,22,0.96) 0%, rgba(10,10,11,0.99) 100%)",
            boxShadow: "0 22px 56px -28px rgba(0,0,0,0.78)",
          }}
        >
          {/* faint field-grid texture behind the CTA (decorative, motion-free) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(242,54,69,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(242,54,69,0.05) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              opacity: 0.55,
              maskImage: "radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 82%)",
              WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 82%)",
            }}
          />
          <div className="relative flex flex-col gap-2">
            <Eyebrow>Model simulation</Eyebrow>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(23px, 3.4vw, 28px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.02em" }}>
              {view.allowsRunCountClaim && view.runCount != null
                ? `Generate the ${view.runCount.toLocaleString()}-run simulation`
                : "Generate the model simulation"}
            </h2>
            <span style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.55, maxWidth: 560 }}>
              A precomputed model artifact — the same result for every user. The dashboard unlocks after the reveal. Paper-only.
            </span>
          </div>

          {/* dashboard preview — LOCKED labels only (no numbers, no picks). What the reveal will unlock. */}
          <div className="relative flex flex-col gap-2">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
              Unlocks after the reveal
            </span>
            <div className="flex flex-wrap gap-1.5">
              {DASHBOARD_PREVIEW_PILLS.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 font-mono uppercase tracking-[0.08em]"
                  style={{ background: "rgba(10,10,11,0.5)", border: "1px dashed var(--vault-rule)", color: "var(--vault-text-faint)", fontSize: 9.5 }}
                >
                  <span aria-hidden style={{ fontSize: 8.5, opacity: 0.85 }}>🔒</span>
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1">
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
            className="gtp-cta-lava vault-press relative inline-flex items-center justify-center gap-2 self-start rounded-[12px] px-6 font-mono uppercase tracking-[0.14em]"
            style={{ fontSize: 13, fontWeight: 700, minHeight: 50, border: "none", cursor: "pointer" }}
          >
            <span aria-hidden style={{ fontSize: 13 }}>▶</span> Generate Simulation
          </button>
          <span className="relative font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
            ≈10-second reveal · then the full model dashboard
          </span>
        </div>
      ) : null}

      {/* Reveal animation — the 10s sport-specific staging (premium baseball diamond + team marks for MLB).
          The dashboard is gated on SIMULATION_MIN_DURATION_MS in `start`, so it never appears before the
          animation finishes. Team logos are threaded through (monogram fallback when null). */}
      {phase === "revealing" ? <SportSimulationAnimation sport={view.sport} view={view} stage={stage} homeLogo={homeLogo} awayLogo={awayLogo} /> : null}

      {/* After reveal: the precomputed artifact, reorganized into the 10-section dashboard. A gentle
          fade/slide-in makes the animation→dashboard handoff feel intentional (motion-gated). */}
      {phase === "done" ? (
        <div className="gtp-sim-reveal flex flex-col gap-4">
          {/* Scoped reveal transition — soft fade + rise, disabled under reduced motion (content stays). */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
@keyframes gtp-sim-reveal-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.gtp-sim-reveal { animation: gtp-sim-reveal-in 460ms cubic-bezier(0.22,0.61,0.36,1) both; }
@media (prefers-reduced-motion: reduce) { .gtp-sim-reveal { animation: none; } }
`,
            }}
          />
          {/* 1 · HEADER — the summary (badge, matchup, model/runs/freshness, headline). Projected numbers
              are labelled explicitly as a MODEL PROJECTION, never a final/actual score. */}
          <section
            className="flex flex-col gap-2 rounded-[14px] px-5 py-4"
            style={{ border: "1px solid var(--vault-border-strong)", background: "radial-gradient(120% 140% at 0% 0%, rgba(46,160,102,0.10) 0%, transparent 55%), linear-gradient(140deg, rgba(20,20,22,0.94) 0%, rgba(10,10,11,0.98) 100%)" }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono uppercase tracking-[0.12em]"
                style={{ color: "var(--gtp-success-on-dark, #7ee2a8)", border: "1px solid rgba(46,160,102,0.4)", fontSize: 9, background: "rgba(46,160,102,0.14)" }}
              >
                <span aria-hidden>✓</span> Simulation complete
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
            {view.simulationSummary?.projectedTotal != null ||
            view.simulationSummary?.projectedHomeScore != null ||
            view.simulationSummary?.projectedAwayScore != null ? (
              <div className="flex flex-col gap-1">
                <Eyebrow color="var(--vault-text-faint)">Model projection · not a final score</Eyebrow>
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
              </div>
            ) : null}
          </section>

          {/* PRIMARY REPORT — the unified V2.5 report renders right after the "Simulation complete" header.
              It owns the market snapshot (its §10), the player board, leans, agreement, distributions, settlement,
              product eligibility and methodology, so nothing here competes with it above. */}
          {postReveal ? <div className="flex flex-col gap-5">{postReveal}</div> : null}


          {/* Paper-only — the single closing disclaimer (detailed disclaimers live in the report methodology). */}
          <p className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            Paper-only · educational · not betting advice · same model output for every user · {versionNote}
          </p>

          {/* Post-reveal navigation — a primary "run another" plus quiet secondaries (back to the lobby /
              today's picks). Grouped so the next action is obvious after the reveal. */}
          <nav className="mt-2 flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: "1px solid var(--vault-rule)" }} aria-label="After the simulation">
            <Link
              href="/simulate"
              className="gtp-cta-lava vault-press inline-flex items-center gap-1.5 rounded-[10px] px-5 font-mono uppercase tracking-[0.12em]"
              style={{ fontSize: 11.5, fontWeight: 700, textDecoration: "none", minHeight: 44 }}
            >
              <span aria-hidden>▶</span> Try another game
            </Link>
            <Link
              href="/simulate"
              className="vault-press inline-flex items-center rounded-[10px] px-4 font-mono uppercase tracking-[0.12em]"
              style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 44 }}
            >
              ← All simulations
            </Link>
            <Link
              href="/today"
              className="vault-press inline-flex items-center rounded-[10px] px-4 font-mono uppercase tracking-[0.12em]"
              style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 44 }}
            >
              See today&apos;s picks
            </Link>
          </nav>
        </div>
      ) : null}
    </section>
  );
}
