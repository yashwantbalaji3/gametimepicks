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
import TeamMark from "@/components/ui/team-mark";

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

/** The staging checklist — dot/marker + label, with a clearly emphasised ACTIVE row (glowing dot +
 *  brighter text on a faint highlight), completed rows checked, pending rows quiet. Mobile-friendly:
 *  labels wrap, markers never shrink, no unreadably-small type. */
function StageChecklist({ stage }: { stage: number }) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Simulation staging progress">
      {SIMULATION_STAGES.map((label, i) => {
        const done = i < stage;
        const active = i === stage;
        return (
          <li
            key={label}
            className="flex items-center gap-2.5 rounded-[7px] px-2 py-1"
            style={{
              background: active ? "rgba(52, 211, 153, 0.08)" : "transparent",
              transition: "background 200ms ease",
            }}
          >
            <span
              aria-hidden
              className="inline-flex items-center justify-center shrink-0"
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: done ? "rgba(46,160,102,0.18)" : active ? "rgba(52, 211, 153, 0.18)" : "transparent",
                border: `1px solid ${done ? "rgba(46,160,102,0.5)" : active ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                boxShadow: active ? "0 0 9px -1px var(--vault-gold-bright)" : "none",
                transition: "all 200ms ease",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: done ? "var(--vault-success)" : active ? "var(--vault-gold-bright)" : "var(--vault-rule)",
                }}
              />
            </span>
            <span
              className="font-mono leading-tight"
              style={{
                color: done ? "var(--vault-text-mute)" : active ? "var(--vault-text)" : "var(--vault-text-faint)",
                fontSize: 12,
                fontWeight: active ? 600 : 400,
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
 * The animated baseball diamond — a cleaner, higher-fidelity infield: a graded field wedge, dashed foul
 * lines, the base-path diamond, an infield-dirt ring around the mound, crisp bases (1st/2nd/3rd + home
 * plate) that pulse in sequence, a base-path trail the ball follows, and a ball (with stitching + a soft
 * glow) that walks the paths on a loop.
 *
 * The motion is a CSS `@keyframes` (`gtp-sim-ball`) that walks an SVG element around the four bases via
 * `translate`. Under `prefers-reduced-motion: reduce`, the ball animation is disabled (it rests on the
 * mound) and the base pulse stops — the surrounding stage checklist still advances. Everything is scoped
 * to `.gtp-sim-diamond`.
 */
function DiamondGraphic() {
  return (
    <div className="gtp-sim-diamond" aria-hidden>
      {/* Scoped keyframes + reduced-motion guard. Self-contained; no global CSS. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
.gtp-sim-diamond { position: relative; width: 100%; max-width: 320px; margin: 0 auto; }
.gtp-sim-diamond svg { display: block; width: 100%; height: auto; overflow: visible; }
@keyframes gtp-sim-ball {
  0%   { transform: translate(150px, 242px); }  /* home plate */
  25%  { transform: translate(242px, 150px); }  /* 1st base */
  50%  { transform: translate(150px, 58px);  }  /* 2nd base */
  75%  { transform: translate(58px, 150px);  }  /* 3rd base */
  100% { transform: translate(150px, 242px); }  /* home plate */
}
@keyframes gtp-sim-base-pulse {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 1; }
}
@keyframes gtp-sim-trail {
  to { stroke-dashoffset: -540; }
}
@keyframes gtp-sim-mound {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.1); }
}
@keyframes gtp-sim-spark {
  0%, 100% { opacity: 0.2; }
  50%      { opacity: 0.6; }
}
.gtp-sim-ball {
  animation: gtp-sim-ball 5.2s cubic-bezier(0.5,0,0.5,1) infinite;
  transform: translate(150px, 242px);
}
.gtp-sim-ball-spin { animation: gtp-sim-ball 5.2s cubic-bezier(0.5,0,0.5,1) infinite; }
.gtp-sim-trail { stroke-dasharray: 9 7; animation: gtp-sim-trail 3s linear infinite; }
.gtp-sim-mound-glow { animation: gtp-sim-mound 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.gtp-sim-base { animation: gtp-sim-base-pulse 2.2s ease-in-out infinite; transform-box: fill-box; }
.gtp-sim-base-1 { animation-delay: 0s; }
.gtp-sim-base-2 { animation-delay: 0.55s; }
.gtp-sim-base-3 { animation-delay: 1.1s; }
.gtp-sim-base-home { animation-delay: 1.65s; }
.gtp-sim-spark { animation: gtp-sim-spark 3.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .gtp-sim-ball { animation: none; transform: translate(150px, 150px); }  /* rests on the mound, no motion */
  .gtp-sim-trail { animation: none; }
  .gtp-sim-mound-glow { animation: none; opacity: 0.85; transform: none; }
  .gtp-sim-base { animation: none; opacity: 0.85; }
  .gtp-sim-spark { animation: none; opacity: 0.35; }
}
`,
        }}
      />
      <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Baseball diamond">
        <defs>
          <radialGradient id="gtp-sim-field" cx="50%" cy="80%" r="92%">
            <stop offset="0%" stopColor="rgba(52,168,83,0.20)" />
            <stop offset="55%" stopColor="rgba(52,168,83,0.08)" />
            <stop offset="100%" stopColor="rgba(52,168,83,0)" />
          </radialGradient>
          <radialGradient id="gtp-sim-infield" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(217,164,65,0.10)" />
            <stop offset="100%" stopColor="rgba(217,164,65,0)" />
          </radialGradient>
          <radialGradient id="gtp-sim-ballglow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        {/* outfield / field wedge — graded fill behind the infield */}
        <path d="M150 252 L18 118 A 187 187 0 0 1 282 118 Z" fill="url(#gtp-sim-field)" stroke="none" />
        {/* outfield arc — a clean grass boundary line */}
        <path d="M30 124 A 170 170 0 0 1 270 124" fill="none" stroke="rgba(52,168,83,0.28)" strokeWidth="1.4" opacity="0.7" />
        {/* foul lines from home plate to the corners */}
        <line x1="150" y1="244" x2="18" y2="116" stroke="var(--vault-text-faint)" strokeWidth="1.4" strokeDasharray="4 5" opacity="0.5" />
        <line x1="150" y1="244" x2="282" y2="116" stroke="var(--vault-text-faint)" strokeWidth="1.4" strokeDasharray="4 5" opacity="0.5" />
        {/* infield dirt fill + ring around the mound */}
        <circle cx="150" cy="150" r="104" fill="url(#gtp-sim-infield)" stroke="none" />
        <circle cx="150" cy="150" r="104" fill="none" stroke="rgba(217,164,65,0.16)" strokeWidth="1" strokeDasharray="2 7" />
        {/* the diamond (base paths): home → 1st → 2nd → 3rd → home */}
        <polygon
          points="150,242 242,150 150,58 58,150"
          fill="rgba(217,164,65,0.05)"
          stroke="var(--vault-gold)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          opacity="0.9"
        />
        {/* the ball's travelling trail along the base paths (animated dashes) */}
        <polygon className="gtp-sim-trail" points="150,242 242,150 150,58 58,150" fill="none" stroke="var(--vault-gold-bright)" strokeWidth="1.8" strokeLinejoin="round" opacity="0.55" />
        {/* pitcher's mound */}
        <circle className="gtp-sim-mound-glow" cx="150" cy="150" r="18" fill="rgba(217,164,65,0.12)" stroke="var(--vault-gold-bright)" strokeWidth="1.6" />
        <circle cx="150" cy="150" r="3.5" fill="var(--vault-gold-bright)" opacity="0.95" />
        {/* the three bases (squares), crisper with a subtle outline */}
        <rect className="gtp-sim-base gtp-sim-base-1" x="235" y="143" width="15" height="15" rx="2.5" transform="rotate(45 242 150)" fill="var(--vault-text)" stroke="var(--vault-gold)" strokeWidth="0.75" opacity="0.92" />
        <rect className="gtp-sim-base gtp-sim-base-2" x="142" y="50" width="15" height="15" rx="2.5" transform="rotate(45 150 58)" fill="var(--vault-text)" stroke="var(--vault-gold)" strokeWidth="0.75" opacity="0.92" />
        <rect className="gtp-sim-base gtp-sim-base-3" x="50" y="143" width="15" height="15" rx="2.5" transform="rotate(45 58 150)" fill="var(--vault-text)" stroke="var(--vault-gold)" strokeWidth="0.75" opacity="0.92" />
        {/* home plate (pentagon-ish) */}
        <polygon className="gtp-sim-base gtp-sim-base-home" points="142,236 158,236 158,245 150,252 142,245" fill="var(--vault-text)" stroke="var(--vault-gold)" strokeWidth="0.75" opacity="0.95" />
        {/* the base labels */}
        <text x="261" y="154" fontSize="9" fill="var(--vault-text-faint)" fontFamily="monospace">1B</text>
        <text x="150" y="42" fontSize="9" fill="var(--vault-text-faint)" fontFamily="monospace" textAnchor="middle">2B</text>
        <text x="25" y="154" fontSize="9" fill="var(--vault-text-faint)" fontFamily="monospace" textAnchor="end">3B</text>
        {/* the travelling ball — its transform is animated by the .gtp-sim-ball keyframes; a soft trailing
            after-glow sits just behind it for a smoother sense of motion */}
        <g className="gtp-sim-ball">
          <circle className="gtp-sim-spark" r="15" fill="url(#gtp-sim-ballglow)" />
          <circle r="11" fill="url(#gtp-sim-ballglow)" opacity="0.8" />
          <circle r="6.5" fill="#ffffff" stroke="var(--gtp-bank-heat)" strokeWidth="1.4" />
          <path d="M-3.4 -3.2 A 6.5 6.5 0 0 1 -3.4 3.2" fill="none" stroke="var(--gtp-bank-heat)" strokeWidth="0.9" opacity="0.8" />
          <path d="M3.4 -3.2 A 6.5 6.5 0 0 0 3.4 3.2" fill="none" stroke="var(--gtp-bank-heat)" strokeWidth="0.9" opacity="0.8" />
        </g>
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Sport animations
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A subtle CSS data-grid + scanline backdrop for the elevated staging card. Pure decoration (two fixed
 * gradients + one animated scan sweep), scoped to `.gtp-sim-backdrop`, pointer-events-none, and honestly
 * reduced-motion-aware (the sweep stops; the static grid stays). No data, no external asset.
 */
function BackdropGrid() {
  return (
    <div className="gtp-sim-backdrop" aria-hidden>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.gtp-sim-backdrop {
  position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none;
  background-image:
    linear-gradient(rgba(217,164,65,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(217,164,65,0.05) 1px, transparent 1px);
  background-size: 26px 26px, 26px 26px;
  opacity: 0.5; mask-image: radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 85%);
  -webkit-mask-image: radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 85%);
}
.gtp-sim-scan {
  position: absolute; left: 0; right: 0; height: 40%; top: -40%;
  background: linear-gradient(180deg, transparent, rgba(217,164,65,0.10), transparent);
  animation: gtp-sim-scan 4.5s ease-in-out infinite;
}
@keyframes gtp-sim-scan { 0% { top: -40%; } 100% { top: 100%; } }
@media (prefers-reduced-motion: reduce) { .gtp-sim-scan { animation: none; display: none; } }
`,
        }}
      />
      <div className="gtp-sim-scan" />
    </div>
  );
}

/**
 * The MLB staging animation — an ELEVATED card: a data-grid/scanline backdrop, the matchup rendered with
 * REAL team marks (TeamMark logos when the artifact carries them, honest monogram fallback otherwise)
 * flanking the animated baseball diamond, the run-count label + paper-only note, and the 8-stage
 * checklist. Cosmetic only — no fabricated data.
 */
export function BaseballSimulationAnimation({
  view,
  stage,
  homeLogo,
  awayLogo,
}: {
  view: GameSimulationView;
  stage: number;
  homeLogo?: string | null;
  awayLogo?: string | null;
}) {
  const away = view.teams?.away ?? "Away";
  const home = view.teams?.home ?? "Home";
  const complete = stage >= SIMULATION_STAGES.length - 1;
  return (
    <div
      className="relative overflow-hidden rounded-[18px] px-4 py-6 sm:px-7 sm:py-8"
      style={{
        border: "1px solid var(--vault-border-strong)",
        background:
          "radial-gradient(130% 150% at 50% 0%, rgba(52, 211, 153, 0.13) 0%, transparent 58%), linear-gradient(140deg, rgba(20,20,22,0.96) 0%, rgba(10,10,11,0.99) 100%)",
        boxShadow: "0 22px 56px -26px rgba(0,0,0,0.8), 0 0 0 1px rgba(52, 211, 153, 0.08)",
      }}
    >
      <BackdropGrid />

      {/* content sits above the backdrop */}
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>
            <span className="gtp-ember-dot" aria-hidden /> Running GameTime simulation
          </span>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            {runLabel(view)} · Precomputed model artifact
          </span>
        </div>

        {/* matchup + flanking team marks around the animated diamond */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-5">
          <div className="flex w-full items-center justify-center gap-8 sm:hidden">
            <TeamSide name={away} logoUrl={awayLogo} align="end" />
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>at</span>
            <TeamSide name={home} logoUrl={homeLogo} align="start" />
          </div>
          <div className="hidden sm:block"><TeamSide name={away} logoUrl={awayLogo} align="end" /></div>
          <div className="flex flex-1 flex-col items-center gap-1" style={{ maxWidth: 320 }}>
            <span className="hidden sm:inline font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}>at</span>
            <DiamondGraphic />
          </div>
          <div className="hidden sm:block"><TeamSide name={home} logoUrl={homeLogo} align="start" /></div>
        </div>

        <h2 className="text-center font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(18px, 2.6vw, 22px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.01em" }}>
          {away} <span style={{ color: "var(--vault-text-faint)", fontWeight: 600 }}>@</span> {home}
        </h2>

        {/* the staging checklist */}
        <div className="rounded-[12px] px-3.5 py-3" style={{ background: "rgba(10,10,11,0.4)", border: "1px solid var(--vault-rule)" }}>
          <StageChecklist stage={stage} />
        </div>

        {/* end-state handoff — becomes prominent as the final stage lands, then the runner reveals. */}
        <div className="flex items-center justify-center min-h-[18px]">
          {complete ? (
            <span className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--gtp-success-on-dark, #7ee2a8)", fontSize: 10 }}>
              <span aria-hidden>✓</span> Simulation ready — opening the dashboard
            </span>
          ) : (
            <p className="font-mono uppercase tracking-[0.12em] text-center" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
              Paper-only model output · same output for every user
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** One flanking team identity — a TeamMark (logo → monogram) on a crest plate above the team token,
 *  sized to flank the field prominently. */
function TeamSide({ name, logoUrl, align }: { name: string; logoUrl?: string | null; align: "start" | "end" }) {
  return (
    <div className={`flex shrink-0 flex-col items-center gap-2 ${align === "end" ? "sm:items-end" : "sm:items-start"}`} style={{ width: 64 }}>
      <span
        className="inline-flex items-center justify-center rounded-[13px]"
        style={{ width: 58, height: 58, background: "rgba(10,10,11,0.6)", border: "1px solid var(--vault-border-strong)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
      >
        <TeamMark name={name} logoUrl={logoUrl} size="xl" />
      </span>
      <span className="font-mono uppercase tracking-[0.08em] text-center break-words leading-tight" style={{ color: "var(--vault-text-mute)", fontSize: 10, maxWidth: 64 }}>
        {name}
      </span>
    </div>
  );
}

/**
 * A neutral (non-baseball) staging shell for any other sport — the same eyebrow, matchup, run-count
 * label, checklist, and paper-only note, WITHOUT the baseball graphic.
 */
function NeutralSimulationAnimation({
  sport,
  view,
  stage,
  homeLogo,
  awayLogo,
}: {
  sport?: string;
  view: GameSimulationView;
  stage: number;
  homeLogo?: string | null;
  awayLogo?: string | null;
}) {
  const away = view.teams?.away ?? "Away";
  const home = view.teams?.home ?? "Home";
  // Honest degradation: a sport without a dedicated graphic yet shows the SAME generic staging and says
  // so plainly — never a baseball diamond for a non-baseball game, and never fabricated sport data.
  const sportName = sport ? sport.replace(/_/g, " ") : "this sport";
  return (
    <div
      className="flex flex-col gap-3.5 rounded-[14px] px-4 py-4"
      style={{ border: "1px solid var(--vault-border)", background: "rgba(11, 18, 14,0.6)" }}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center rounded-[10px] shrink-0" style={{ width: 40, height: 40, background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-border)" }}>
          <TeamMark name={away} logoUrl={awayLogo} size="md" />
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>@</span>
        <span className="inline-flex items-center justify-center rounded-[10px] shrink-0" style={{ width: 40, height: 40, background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-border)" }}>
          <TeamMark name={home} logoUrl={homeLogo} size="md" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Eyebrow>Running GameTime simulation</Eyebrow>
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700, lineHeight: 1.1 }}>
            {away} <span style={{ color: "var(--vault-text-faint)" }}>@</span> {home}
          </h2>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            {runLabel(view)} · Precomputed model artifact
          </span>
        </div>
      </div>
      <span style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.4 }}>
        No {sportName}-specific view yet — showing the generic model staging.
      </span>
      <StageChecklist stage={stage} />
      <p className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Paper-only model output · same output for every user
      </p>
    </div>
  );
}

/**
 * Dispatch to a sport-specific staging animation. MLB gets the baseball diamond; any other sport gets a
 * neutral shell with the same checklist. Defaults to the MLB (baseball) animation. The optional team
 * logos are threaded through to whichever shell renders (monogram fallback when null).
 */
export function SportSimulationAnimation({
  sport,
  view,
  stage,
  homeLogo,
  awayLogo,
}: {
  sport?: string;
  view: GameSimulationView;
  stage: number;
  homeLogo?: string | null;
  awayLogo?: string | null;
}) {
  if (sport && sport !== "mlb") {
    return <NeutralSimulationAnimation sport={sport} view={view} stage={stage} homeLogo={homeLogo} awayLogo={awayLogo} />;
  }
  return <BaseballSimulationAnimation view={view} stage={stage} homeLogo={homeLogo} awayLogo={awayLogo} />;
}
