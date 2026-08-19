/**
 * SPORT MOTIFS — Program 185, Release B4.
 *
 * The charter, in order: "Build code-native shared motifs … THEN define sport motifs: MLB
 * diamond/pitch trail, NFL yard-line/drive path, NBA court/shot arc, EPL pitch/three-way
 * composition, UFC octagon/tale-of-the-tape, and restrained NHL/rink treatment."
 *
 * Same three rules as the shared layer, for the same reason — decoration is where the system leaks:
 * SVG only, semantic tokens only, motion roles only. Each motif reads its own `--sport-*` accent, so
 * a sport hub gets native character without any file inventing a colour.
 *
 * ── ALL SIX ARE DECORATION, AND ALL SIX SAY SO ─────────────────────────────────────────────────
 * A field diagram is not data. None of these takes a score, a probability or a player; they are
 * geometry. The one in the shared layer that DOES take a number (ProbabilityArc) is labelled and
 * behaves differently, and keeping that line bright is the point.
 *
 * The NHL treatment is deliberately the plainest of the six. The charter asks for "restrained
 * NHL/rink" because the sport is off-season with no live board — a motif richer than the product
 * behind it is the visual polish this programme spent nine releases removing.
 */
import type { ReactElement } from "react";

const DECOR = { "aria-hidden": true as const, focusable: "false" as const };
/** One faint stroke weight and one alpha ladder, so the six read as one family. */
const line = (accent: string, pct: number) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`;

type MotifProps = { className?: string; opacity?: number };
const wrap = (opacity?: number) => ({
  style: { position: "absolute" as const, inset: 0, pointerEvents: "none" as const, opacity: opacity ?? 1 },
});

/* ── MLB · diamond + pitch trail ────────────────────────────────────────────────────────────── */
export function MlbDiamond({ className, opacity }: MotifProps): ReactElement {
  const a = "var(--sport-mlb)";
  return (
    <svg {...DECOR} {...wrap(opacity)} className={className} viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
      {/* infield diamond, seen at an angle */}
      <path d="M100 22 L156 62 L100 102 L44 62 Z" fill="none" stroke={line(a, 22)} strokeWidth="1.2" />
      <path d="M100 38 L136 62 L100 86 L64 62 Z" fill="none" stroke={line(a, 12)} strokeWidth="1" />
      {/* pitch trail — a released ball's path toward the plate, drawn once, going nowhere */}
      <path d="M100 62 C 96 74, 98 86, 100 100" fill="none" stroke={line(a, 34)} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 5" />
      <circle cx="100" cy="62" r="2.2" fill={line(a, 46)} />
    </svg>
  );
}

/* ── NFL · yard lines + drive path ─────────────────────────────────────────────────────────── */
export function NflGridiron({ className, opacity }: MotifProps): ReactElement {
  const a = "var(--sport-nfl)";
  const yards = [20, 40, 60, 80, 100, 120, 140, 160, 180];
  return (
    <svg {...DECOR} {...wrap(opacity)} className={className} viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
      {yards.map((x, i) => (
        <line key={x} x1={x} y1="8" x2={x} y2="112" stroke={line(a, i === 4 ? 24 : 12)} strokeWidth={i === 4 ? 1.4 : 1} />
      ))}
      {/* drive path — downfield with the lateral movement a drive actually has */}
      <path d="M22 88 C 62 84, 78 44, 118 48 S 168 34, 186 30" fill="none" stroke={line(a, 38)} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ── NBA · court + shot arc ────────────────────────────────────────────────────────────────── */
export function NbaCourt({ className, opacity }: MotifProps): ReactElement {
  const a = "var(--sport-nba)";
  return (
    <svg {...DECOR} {...wrap(opacity)} className={className} viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
      <path d="M60 8 A 58 58 0 0 1 60 112" fill="none" stroke={line(a, 18)} strokeWidth="1.2" />
      <rect x="8" y="42" width="42" height="36" fill="none" stroke={line(a, 14)} strokeWidth="1" />
      <circle cx="50" cy="60" r="12" fill="none" stroke={line(a, 12)} strokeWidth="1" />
      {/* shot arc — the trajectory, not a made basket; no outcome is implied */}
      <path d="M132 96 Q 96 14, 34 58" fill="none" stroke={line(a, 36)} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 6" />
    </svg>
  );
}

/* ── EPL · pitch + three-way composition ───────────────────────────────────────────────────── */
export function EplPitch({ className, opacity }: MotifProps): ReactElement {
  const a = "var(--sport-soccer)";
  return (
    <svg {...DECOR} {...wrap(opacity)} className={className} viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
      <rect x="10" y="10" width="180" height="100" fill="none" stroke={line(a, 16)} strokeWidth="1.1" />
      <line x1="100" y1="10" x2="100" y2="110" stroke={line(a, 16)} strokeWidth="1.1" />
      <circle cx="100" cy="60" r="20" fill="none" stroke={line(a, 14)} strokeWidth="1" />
      <rect x="10" y="36" width="26" height="48" fill="none" stroke={line(a, 12)} strokeWidth="1" />
      <rect x="164" y="36" width="26" height="48" fill="none" stroke={line(a, 12)} strokeWidth="1" />
      {/* three-way: home | draw | away, the shape a 1X2 market actually has */}
      <g stroke={line(a, 30)} strokeWidth="2.4" strokeLinecap="round">
        <line x1="46" y1="112" x2="82" y2="112" />
        <line x1="90" y1="112" x2="110" y2="112" />
        <line x1="118" y1="112" x2="154" y2="112" />
      </g>
    </svg>
  );
}

/* ── UFC · octagon + tale-of-the-tape rules ────────────────────────────────────────────────── */
export function UfcOctagon({ className, opacity }: MotifProps): ReactElement {
  const a = "var(--sport-ufc)";
  const oct = (r: number) =>
    Array.from({ length: 8 }, (_, i) => {
      const t = (Math.PI / 4) * i + Math.PI / 8;
      return `${(100 + r * Math.cos(t)).toFixed(1)},${(60 + r * 0.62 * Math.sin(t)).toFixed(1)}`;
    }).join(" ");
  return (
    <svg {...DECOR} {...wrap(opacity)} className={className} viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
      <polygon points={oct(72)} fill="none" stroke={line(a, 20)} strokeWidth="1.3" />
      <polygon points={oct(52)} fill="none" stroke={line(a, 11)} strokeWidth="1" />
      {/* tale of the tape — paired rules facing a centre line, the comparison's own shape */}
      <g stroke={line(a, 26)} strokeWidth="1.6" strokeLinecap="round">
        {[42, 54, 66, 78].map((y, i) => (
          <g key={y}>
            <line x1={96 - (18 + i * 6)} y1={y} x2="96" y2={y} />
            <line x1="104" y1={y} x2={104 + (16 + i * 5)} y2={y} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ── NHL · rink, deliberately restrained ───────────────────────────────────────────────────── */
export function NhlRink({ className, opacity }: MotifProps): ReactElement {
  const a = "var(--sport-nhl)";
  return (
    <svg {...DECOR} {...wrap(opacity)} className={className} viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
      <rect x="12" y="14" width="176" height="92" rx="34" fill="none" stroke={line(a, 14)} strokeWidth="1.1" />
      <line x1="100" y1="14" x2="100" y2="106" stroke={line(a, 14)} strokeWidth="1.1" />
      <circle cx="100" cy="60" r="14" fill="none" stroke={line(a, 11)} strokeWidth="1" />
    </svg>
  );
}

/** One lookup, so a hub picks a motif by sport key rather than importing six components. */
export const SPORT_MOTIF: Record<string, (p: MotifProps) => ReactElement> = {
  mlb: MlbDiamond, nfl: NflGridiron, nba: NbaCourt,
  epl: EplPitch, soccer: EplPitch, ufc: UfcOctagon, nhl: NhlRink,
};
