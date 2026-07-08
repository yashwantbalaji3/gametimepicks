"use client";

/**
 * SIMULATION ANIMATION — the sport-specific "Generate Simulation" staging (Phase 6).
 *
 * A purely COSMETIC, deterministic, client-only staging animation that plays for a fixed
 * `SIMULATION_MIN_DURATION_MS` (10s) while the user waits, before the runner reveals the ALREADY-loaded
 * precomputed artifact. This file does NO data work, NO fetch, NO fs, NO randomness — it only renders a
 * baseball diamond (for MLB) and advances a checklist across `SIMULATION_STAGES`. Every user sees the
 * same staging for the same game; the timing is driven by pure client state in the runner.
 *
 * HONESTY (mirrors the artifact contract + the runner):
 *   • The run-count claim ("N-run") is shown ONLY when `view.allowsRunCountClaim && view.runCount != null`;
 *     otherwise a neutral "model simulation" label is used. No sampling-method name, no fabricated numbers.
 *   • Copy stays inside the honest-language allowlist (paper-only, precomputed, same-for-every-user);
 *     no hype / no certainty / no in-play-wagering terms.
 *
 * TESTABILITY: `stageAtElapsed(elapsedMs, stageCount, totalMs)` is a PURE function that maps elapsed time
 * to a stage index, so the 10s gate + the per-stage timing are unit-testable WITHOUT real timers.
 *
 * REDUCED MOTION: an inline media query pins the moving ball to a static position under
 * `prefers-reduced-motion: reduce` — the STAGE SEQUENCE still advances and renders normally.
 */

import type { GameSimulationView } from "@/lib/game-simulations/game-lab-view";

/** The minimum time the staging animation runs before the dashboard may appear (10 seconds). */
export const SIMULATION_MIN_DURATION_MS = 10000;

/**
 * The deterministic staging steps. These describe, in order, what the precomputed artifact contains —
 * they are pure labels for the animation and compute NOTHING. The final label is "Simulation complete";
 * the dashboard is gated until that stage is reached (i.e. until `SIMULATION_MIN_DURATION_MS` elapses).
 */
export const SIMULATION_STAGES = [
  "Pulling market snapshot",
  "Loading model projections",
  "Sampling prop distributions",
  "Aggregating model leans",
  "Comparing market prices",
  "Building player table",
  "Creating recap",
  "Simulation complete",
] as const;

/**
 * PURE stage-timing helper (no timers, no clock). Maps an elapsed time to the index of the stage that
 * should be active at that moment, given `stageCount` evenly-spaced stages over `totalMs`.
 *
 *   • t <= 0                         → 0 (the first stage).
 *   • 0 < t < totalMs                → an intermediate stage in [0, stageCount - 2] (NEVER the final
 *                                       "complete" stage — the dashboard stays hidden before totalMs).
 *   • t >= totalMs                   → stageCount - 1 (the final "complete" stage — dashboard allowed).
 *
 * Deterministic: same inputs ⇒ same output.
 */
export function stageAtElapsed(elapsedMs: number, stageCount: number, totalMs: number): number {
  if (!Number.isFinite(stageCount) || stageCount <= 1) return 0;
  const last = stageCount - 1;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return last;
  if (elapsedMs >= totalMs) return last;
  // Spread the pre-completion stages [0 .. last-1] evenly across [0, totalMs); the final stage is
  // reserved for elapsed >= totalMs so the dashboard is never allowed early.
  const perStage = totalMs / last;
  const idx = Math.floor(elapsedMs / perStage);
  return Math.min(idx, last - 1);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Small shared bits
// ─────────────────────────────────────────────────────────────────────────────────────────────────

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

/** The staging checklist — reuses the runner's reveal style (dot + label, done ✓ / active …). */
function StageChecklist({ stage }: { stage: number }) {
  return (
    <ul className="flex flex-col gap-1.5 mt-1" aria-label="Simulation staging progress">
      {SIMULATION_STAGES.map((label, i) => {
        const done = i < stage;
        const active = i === stage;
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
  );
}

/** The honest run-count label — a real "N-run" claim ONLY behind `allowsRunCountClaim`. */
function runLabel(view: GameSimulationView): string {
  return view.allowsRunCountClaim && view.runCount != null
    ? `${view.runCount.toLocaleString()}-run simulation`
    : "model simulation";
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Baseball diamond — self-contained inline SVG + CSS @keyframes (no external assets)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The animated baseball diamond. A bases-loaded infield (home plate + 1st/2nd/3rd bases + pitcher's
 * mound + subtle field wedge and foul lines) with a ball that travels the base paths on a loop.
 *
 * The motion is a CSS `@keyframes` (`gtp-sim-ball`) that walks an SVG element around the four bases via
 * `translate`. Under `prefers-reduced-motion: reduce`, the ball animation is disabled (it rests on the
 * mound) — the surrounding stage checklist still advances. Everything is scoped to `.gtp-sim-diamond`.
 */
function DiamondGraphic() {
  return (
    <div className="gtp-sim-diamond" aria-hidden>
      {/* Scoped keyframes + reduced-motion guard. Self-contained; no global CSS. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
.gtp-sim-diamond { position: relative; width: 100%; max-width: 260px; margin: 0 auto; }
.gtp-sim-diamond svg { display: block; width: 100%; height: auto; }
@keyframes gtp-sim-ball {
  0%   { transform: translate(150px, 240px); }  /* home plate */
  25%  { transform: translate(240px, 150px); }  /* 1st base */
  50%  { transform: translate(150px, 60px);  }  /* 2nd base */
  75%  { transform: translate(60px, 150px);  }  /* 3rd base */
  100% { transform: translate(150px, 240px); }  /* home plate */
}
@keyframes gtp-sim-base-pulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}
.gtp-sim-ball {
  animation: gtp-sim-ball 4s linear infinite;
  transform: translate(150px, 240px);
}
.gtp-sim-base { animation: gtp-sim-base-pulse 2s ease-in-out infinite; transform-box: fill-box; }
.gtp-sim-base-1 { animation-delay: 0s; }
.gtp-sim-base-2 { animation-delay: 0.5s; }
.gtp-sim-base-3 { animation-delay: 1s; }
.gtp-sim-base-home { animation-delay: 1.5s; }
@media (prefers-reduced-motion: reduce) {
  .gtp-sim-ball { animation: none; transform: translate(150px, 150px); }  /* rests on the mound, no motion */
  .gtp-sim-base { animation: none; opacity: 0.85; }
}
`,
        }}
      />
      <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Baseball diamond">
        {/* outfield / field wedge — subtle radial-ish fill behind the infield */}
        <path d="M150 250 L20 120 A 184 184 0 0 1 280 120 Z" fill="rgba(52,168,83,0.06)" stroke="none" />
        {/* foul lines from home plate to the corners */}
        <line x1="150" y1="245" x2="18" y2="118" stroke="var(--vault-rule)" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.5" />
        <line x1="150" y1="245" x2="282" y2="118" stroke="var(--vault-rule)" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.5" />
        {/* the diamond (base paths): home → 1st → 2nd → 3rd → home */}
        <polygon
          points="150,245 245,150 150,55 55,150"
          fill="rgba(217,164,65,0.05)"
          stroke="var(--vault-gold)"
          strokeWidth="2"
          opacity="0.8"
        />
        {/* pitcher's mound */}
        <circle cx="150" cy="150" r="16" fill="rgba(217,164,65,0.10)" stroke="var(--vault-gold-bright)" strokeWidth="1.6" />
        <circle cx="150" cy="150" r="3.5" fill="var(--vault-gold-bright)" opacity="0.9" />
        {/* the three bases (squares) */}
        <rect className="gtp-sim-base gtp-sim-base-1" x="238" y="143" width="14" height="14" rx="2" transform="rotate(45 245 150)" fill="var(--vault-text)" opacity="0.85" />
        <rect className="gtp-sim-base gtp-sim-base-2" x="143" y="48" width="14" height="14" rx="2" transform="rotate(45 150 55)" fill="var(--vault-text)" opacity="0.85" />
        <rect className="gtp-sim-base gtp-sim-base-3" x="48" y="143" width="14" height="14" rx="2" transform="rotate(45 55 150)" fill="var(--vault-text)" opacity="0.85" />
        {/* home plate (pentagon-ish) */}
        <polygon className="gtp-sim-base gtp-sim-base-home" points="143,240 157,240 157,248 150,254 143,248" fill="var(--vault-text)" opacity="0.9" />
        {/* the base labels */}
        <text x="262" y="154" fontSize="9" fill="var(--vault-text-faint)" fontFamily="monospace">1B</text>
        <text x="150" y="42" fontSize="9" fill="var(--vault-text-faint)" fontFamily="monospace" textAnchor="middle">2B</text>
        <text x="24" y="154" fontSize="9" fill="var(--vault-text-faint)" fontFamily="monospace" textAnchor="end">3B</text>
        {/* the travelling ball — its transform is animated by the .gtp-sim-ball keyframes */}
        <g className="gtp-sim-ball">
          <circle r="6" fill="#ffffff" stroke="var(--gtp-bank-heat)" strokeWidth="1.4" />
          <path d="M-3 -3 A 6 6 0 0 1 -3 3" fill="none" stroke="var(--gtp-bank-heat)" strokeWidth="0.9" opacity="0.7" />
          <path d="M3 -3 A 6 6 0 0 0 3 3" fill="none" stroke="var(--gtp-bank-heat)" strokeWidth="0.9" opacity="0.7" />
        </g>
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Sport animations
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The MLB staging animation: the matchup + eyebrow + run-count label + paper-only note above an inline
 * baseball diamond, with the stage checklist below. Cosmetic only.
 */
export function BaseballSimulationAnimation({ view, stage }: { view: GameSimulationView; stage: number }) {
  const away = view.teams?.away ?? "Away";
  const home = view.teams?.home ?? "Home";
  return (
    <div
      className="flex flex-col gap-3.5 rounded-[14px] px-4 py-4"
      style={{
        border: "1px solid var(--vault-border-strong)",
        background:
          "radial-gradient(120% 150% at 50% 0%, rgba(217,164,65,0.10) 0%, transparent 55%), linear-gradient(135deg, rgba(22,30,62,0.94) 0%, rgba(26, 16, 11,0.97) 100%)",
      }}
    >
      <div className="flex flex-col gap-1 text-center">
        <Eyebrow>Running GameTime simulation</Eyebrow>
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>
          {away} <span style={{ color: "var(--vault-text-faint)" }}>@</span> {home}
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {runLabel(view)} · Precomputed model artifact
        </span>
      </div>

      {/* the animated diamond */}
      <DiamondGraphic />

      {/* the staging checklist */}
      <StageChecklist stage={stage} />

      {/* paper-only note */}
      <p className="font-mono uppercase tracking-[0.12em] text-center" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Paper-only model output · same output for every user
      </p>
    </div>
  );
}

/**
 * A neutral (non-baseball) staging shell for any other sport — the same eyebrow, matchup, run-count
 * label, checklist, and paper-only note, WITHOUT the baseball graphic.
 */
function NeutralSimulationAnimation({ sport, view, stage }: { sport?: string; view: GameSimulationView; stage: number }) {
  const away = view.teams?.away ?? "Away";
  const home = view.teams?.home ?? "Home";
  // Honest degradation: a sport without a dedicated graphic yet shows the SAME generic staging and says
  // so plainly — never a baseball diamond for a non-baseball game, and never fabricated sport data.
  const sportName = sport ? sport.replace(/_/g, " ") : "this sport";
  return (
    <div
      className="flex flex-col gap-3.5 rounded-[14px] px-4 py-4"
      style={{ border: "1px solid var(--vault-border)", background: "rgba(26, 16, 11,0.6)" }}
    >
      <div className="flex flex-col gap-1">
        <Eyebrow>Running GameTime simulation</Eyebrow>
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700, lineHeight: 1.1 }}>
          {away} <span style={{ color: "var(--vault-text-faint)" }}>@</span> {home}
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {runLabel(view)} · Precomputed model artifact
        </span>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.4 }}>
          No {sportName}-specific view yet — showing the generic model staging.
        </span>
      </div>
      <StageChecklist stage={stage} />
      <p className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Paper-only model output · same output for every user
      </p>
    </div>
  );
}

/**
 * Dispatch to a sport-specific staging animation. MLB gets the baseball diamond; any other sport gets a
 * neutral shell with the same checklist. Defaults to the MLB (baseball) animation.
 */
export function SportSimulationAnimation({
  sport,
  view,
  stage,
}: {
  sport?: string;
  view: GameSimulationView;
  stage: number;
}) {
  if (sport && sport !== "mlb") {
    return <NeutralSimulationAnimation sport={sport} view={view} stage={stage} />;
  }
  return <BaseballSimulationAnimation view={view} stage={stage} />;
}
