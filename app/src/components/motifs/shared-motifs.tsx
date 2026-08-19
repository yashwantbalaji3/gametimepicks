/**
 * SHARED CODE-NATIVE MOTIFS — Program 185, Release B4.
 *
 * The charter: "Build code-native shared motifs: stadium-light ambience, score ribbon, probability
 * arc, particle/noise texture and subtle data-grid depth." All five live here, and all five obey
 * the same three rules the rest of this programme established:
 *
 *   1. CSS and SVG only. No image assets, nothing scraped, no licensing surface. A motif that needs
 *      a file is a motif that breaks when the file 404s.
 *   2. Every colour is a SEMANTIC TOKEN. The raw-colour ratchet would fail this file otherwise, and
 *      that is the point — decoration is exactly where hardcoded hex creeps back in.
 *   3. Every animation names a MOTION ROLE from lib/uiux/motion-roles.mjs. A motif that invents its
 *      own timing is how the four near-identical easing curves happened the first time.
 *
 * ── THE LINE BETWEEN DECORATION AND DATA ────────────────────────────────────────────────────────
 * Four of these are decoration and say so with `aria-hidden`. ProbabilityArc is NOT: it renders a
 * real number, so it carries an accessible label, refuses to draw when it has no value, and never
 * animates in a way that suggests the figure is being recomputed. This product publishes
 * deterministic artifacts; a sweeping arc that redraws on every render implies resampling, and the
 * charter bans exactly that.
 *
 * The noise texture uses a FIXED feTurbulence seed for the same reason — deterministic output,
 * identical for every reader, like everything else the product publishes.
 */
import type { CSSProperties, ReactElement } from "react";

/** Shared: decoration never announces itself, and never intercepts a pointer. */
const DECORATION = {
  "aria-hidden": true as const,
  style: { pointerEvents: "none" as const, position: "absolute" as const, inset: 0 },
};

/* ── 1 · STADIUM LIGHTS ─────────────────────────────────────────────────────────────────────────
 * Two soft overhead pools, the way a stadium reads at night. Ambient role: it breathes slowly and
 * disappears entirely under reduced motion. Kept off text — the charter forbids ambient motion
 * behind copy, and the alpha ceiling here is deliberately below the ambient budget. */
export function StadiumLights({ intensity = 1 }: { intensity?: number }): ReactElement {
  const a = Math.min(Math.max(intensity, 0), 1);
  return (
    <div
      {...DECORATION}
      className="gtp-motif-stadium"
      style={{
        ...DECORATION.style,
        background: `radial-gradient(60% 90% at 18% -10%, color-mix(in srgb, var(--vault-accent) ${(6 * a).toFixed(2)}%, transparent) 0%, transparent 62%),
                     radial-gradient(55% 85% at 82% -12%, color-mix(in srgb, var(--vault-accent-mint) ${(5 * a).toFixed(2)}%, transparent) 0%, transparent 60%)`,
        animation: "gtp-motif-breathe var(--motion-ambient-duration) var(--motion-ambient-easing) infinite alternate",
      }}
    />
  );
}

/* ── 2 · SCORE RIBBON ───────────────────────────────────────────────────────────────────────────
 * A thin lit band under a matchup header — the broadcast lower-third, reduced to one rule. Static
 * by default: a ribbon that sweeps forever competes with the score above it. */
export function ScoreRibbon({ tone = "accent" }: { tone?: "accent" | "crown" | "info" }): ReactElement {
  const hue = tone === "crown" ? "var(--vault-crown)" : tone === "info" ? "var(--vault-info)" : "var(--vault-accent)";
  return (
    <div
      aria-hidden
      className="gtp-motif-ribbon"
      style={{
        height: 2,
        width: "100%",
        pointerEvents: "none",
        background: `linear-gradient(90deg, transparent 0%, color-mix(in srgb, ${hue} 55%, transparent) 22%, color-mix(in srgb, ${hue} 90%, transparent) 50%, color-mix(in srgb, ${hue} 55%, transparent) 78%, transparent 100%)`,
      }}
    />
  );
}

/* ── 3 · PROBABILITY ARC ────────────────────────────────────────────────────────────────────────
 * THE ONE THAT IS DATA. A 240° arc whose sweep equals the probability it is given.
 *
 * `value` is 0..1 or null. Null renders the track with no fill and an explicit unavailable label —
 * NOT a zero-length arc, because a zero arc reads as "0% chance" and the honest statement is "we do
 * not have this". That distinction is the same one the whole programme kept finding: absent is not
 * zero.
 *
 * The draw uses the chart-draw role, which reduced motion removes — the arc is fully readable
 * without it. It draws once on mount, never on re-render: this is a published artifact, and
 * redrawing implies the number was resampled. */
export function ProbabilityArc({
  value, label, size = 72, animate = true,
}: { value: number | null; label: string; size?: number; animate?: boolean }): ReactElement {
  const SWEEP = 240;                                    // degrees; leaves a readable gap at the base
  const R = 34;
  const C = (SWEEP / 360) * 2 * Math.PI * R;            // arc length of the full track
  const clamped = value == null ? null : Math.min(Math.max(value, 0), 1);
  const filled = clamped == null ? 0 : C * clamped;
  const pct = clamped == null ? null : Math.round(clamped * 1000) / 10;

  return (
    <svg
      width={size} height={size} viewBox="0 0 80 80"
      role="img"
      aria-label={pct == null ? `${label}: not available` : `${label}: ${pct}%`}
      style={{ display: "block" }}
    >
      {/* track */}
      <path
        d={arcPath(40, 42, R, SWEEP)} fill="none" strokeLinecap="round" strokeWidth={6}
        stroke="color-mix(in srgb, var(--vault-wash-base) 8%, transparent)"
      />
      {/* fill — omitted entirely when there is no value, so nothing implies a measured zero */}
      {clamped != null ? (
        <path
          d={arcPath(40, 42, R, SWEEP)} fill="none" strokeLinecap="round" strokeWidth={6}
          stroke="var(--vault-accent)"
          strokeDasharray={`${filled} ${C}`}
          style={animate ? {
            animation: "gtp-motif-arc-draw var(--motion-chart-draw-duration) var(--motion-chart-draw-easing) both",
            ["--gtp-arc-len" as string]: `${filled}`,
            ["--gtp-arc-total" as string]: `${C}`,
          } : undefined}
        />
      ) : null}
      <text
        x="40" y="46" textAnchor="middle"
        style={{ fill: "var(--vault-text)", fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
      >
        {pct == null ? "—" : `${pct}%`}
      </text>
    </svg>
  );
}

/** SVG arc path, centred and opening downward. Pure geometry — no data, no rounding surprises. */
function arcPath(cx: number, cy: number, r: number, sweepDeg: number): string {
  const start = 90 + (360 - sweepDeg) / 2;
  const end = start + sweepDeg;
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(start)), y1 = cy + r * Math.sin(rad(start));
  const x2 = cx + r * Math.cos(rad(end)), y2 = cy + r * Math.sin(rad(end));
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/* ── 4 · PARTICLE / NOISE TEXTURE ───────────────────────────────────────────────────────────────
 * Film grain over a flat dark surface, so large panels do not band. feTurbulence with a FIXED SEED:
 * deterministic, identical for every reader, and generated rather than shipped as an image. */
export function NoiseTexture({ opacity = 0.035 }: { opacity?: number }): ReactElement {
  return (
    <svg {...DECORATION} style={{ ...DECORATION.style, opacity, mixBlendMode: "overlay" }}>
      <filter id="gtp-motif-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves={3} seed={7} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#gtp-motif-grain)" />
    </svg>
  );
}

/* ── 5 · DATA-GRID DEPTH ────────────────────────────────────────────────────────────────────────
 * A faint measured grid, faded out from the top-left, so a data surface reads as a plotted field
 * rather than a flat rectangle. Masked so it never reaches the content it sits behind. */
export function DataGridDepth({ cell = 28 }: { cell?: number }): ReactElement {
  const line = "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)";
  const mask = "radial-gradient(120% 100% at 0% 0%, var(--vault-ink-black) 20%, transparent 78%)";
  return (
    <div
      {...DECORATION}
      className="gtp-motif-grid"
      style={{
        ...DECORATION.style,
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: `${cell}px ${cell}px, ${cell}px ${cell}px`,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

export type MotifStyle = CSSProperties;
