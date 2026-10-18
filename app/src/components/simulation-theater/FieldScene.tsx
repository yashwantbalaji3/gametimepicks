/**
 * Simulation Theater V2 · field scene. Pure presentational SVG, usable on the server (final frame) and in the island.
 *
 * TWO LAYERS (spec §2.2, §2.5, S8, S10):
 *   StaticField   turf stripes, depth gradient, yard lines, hash marks, end zones, grain. Drawn in YARD units and
 *                 stretched to the box (preserveAspectRatio="none"): the y-axis carries no data, so a mild vertical
 *                 stretch is allowed. Its grain filter sits on one rect that nothing animated descends from.
 *   FieldOverlay  numbers, end-zone abbreviations, ribbon, start ring, ball, possession arrow, score flash. Drawn in
 *                 SCREEN pixels (viewBox = measured box), so the ball never becomes an oval and text never stretches.
 * The whole scene is aria-hidden; the HTML shell (score bug, drive card, transcript) carries every fact.
 */
import type { CSSProperties } from "react";

export type Side = "home" | "away";
export type TeamPaint = { fill: string; ink: string; accent: string; hatched: boolean };
export type Palette = { mode: string; validated: boolean; home: TeamPaint; away: TeamPaint };
export type Teams = { home: { abbr: string; name: string | null }; away: { abbr: string; name: string | null } };
export type Frame = {
  phase: string;
  offense: Side;
  ballFieldX: number;
  ballOpacity: number;
  startFieldX: number;
  startRingScale: number;
  lane: number;
  ribbon: { fromX: number; toX: number } | null;
  flash: { side: Side; p: number } | null;
  winner: Side | null;
  dimmed: boolean;
};

const U = 10; // static layer: 10 units per yard → viewBox 1200 × 533
const VB_W = 120 * U;
const VB_H = 533;
const YD_H = VB_H / 53.3;

const neutralZone = (token: string) => `color-mix(in srgb, ${token} 24%, var(--st-turf-a))`;

/** End-zone paint: team primary at 85% when team colours are on, otherwise a neutral tint of the side's token. */
function zoneFill(p: TeamPaint, mode: string) {
  return mode === "neutral" ? neutralZone(p.fill) : p.fill;
}

export function StaticField({ palette, width, idPrefix }: { palette: Palette; width: number; idPrefix: string }) {
  const showHashes = width >= 400;
  const yardLines: number[] = [];
  for (let y = 15; y <= 105; y += 5) yardLines.push(y);
  let hashes = "";
  if (showHashes) {
    const rows = [[0, 0.9], [23.58 - 0.45, 23.58 + 0.45], [53.3 - 23.58 - 0.45, 53.3 - 23.58 + 0.45], [53.3 - 0.9, 53.3]];
    for (let x = 11; x <= 109; x++) {
      if (x % 5 === 0) continue;
      for (const [a, b] of rows) hashes += `M${x * U} ${(a * YD_H).toFixed(1)}V${(b * YD_H).toFixed(1)}`;
    }
  }
  const grain = `${idPrefix}-grain`;
  const stripes = `${idPrefix}-stripes`;
  const depth = `${idPrefix}-depth`;
  const hatch = `${idPrefix}-hatch`;
  const mode = palette.mode;
  const zone = (side: Side, x: number) => (
    <g>
      <rect x={x} y={0} width={10 * U} height={VB_H} style={{ fill: zoneFill(palette[side], mode), fillOpacity: mode === "neutral" ? 1 : 0.85 }} />
      {palette[side].hatched ? <rect x={x} y={0} width={10 * U} height={VB_H} fill={`url(#${hatch})`} /> : null}
    </g>
  );
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={stripes} x={10 * U} y={0} width={10 * U} height={VB_H} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={5 * U} height={VB_H} style={{ fill: "var(--st-turf-a)" }} />
          <rect x={5 * U} y={0} width={5 * U} height={VB_H} style={{ fill: "var(--st-turf-b)" }} />
        </pattern>
        <linearGradient id={depth} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.07 }} />
          <stop offset="0.35" style={{ stopColor: "var(--lava-text)", stopOpacity: 0 }} />
          <stop offset="0.7" style={{ stopColor: "var(--bg)", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "var(--bg)", stopOpacity: 0.32 }} />
        </linearGradient>
        <pattern id={hatch} width={16} height={16} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={16} style={{ fill: "var(--bg)", fillOpacity: 0.35 }} />
        </pattern>
        <filter id={grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect x={10 * U} y={0} width={100 * U} height={VB_H} fill={`url(#${stripes})`} />
      {zone("home", 0)}
      {zone("away", 110 * U)}
      {/* grain: rendered once, never animated, nothing moving descends from it (S8) */}
      <rect x={0} y={0} width={VB_W} height={VB_H} filter={`url(#${grain})`} opacity={0.035} />
      <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#${depth})`} />
      <g style={{ stroke: "var(--st-line)" }} strokeWidth={1} vectorEffect="non-scaling-stroke">
        {yardLines.map((y) => (
          <line key={y} x1={y * U} y1={0} x2={y * U} y2={VB_H} vectorEffect="non-scaling-stroke" strokeWidth={y === 60 ? 2 : 1} />
        ))}
      </g>
      {hashes ? <path d={hashes} style={{ stroke: "var(--st-line-soft)" }} strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
      <line x1={10 * U} y1={0} x2={10 * U} y2={VB_H} style={{ stroke: "var(--lava-text)" }} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <line x1={110 * U} y1={0} x2={110 * U} y2={VB_H} style={{ stroke: "var(--lava-text)" }} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      {/* end-zone edge in the team ACCENT (≥3:1 on page and turf; S6) */}
      <line x1={10 * U - 3} y1={0} x2={10 * U - 3} y2={VB_H} style={{ stroke: palette.home.accent }} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <line x1={110 * U + 3} y1={0} x2={110 * U + 3} y2={VB_H} style={{ stroke: palette.away.accent }} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="none" style={{ stroke: "var(--lava-text)" }} strokeOpacity={0.55} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Yard-number labels by available width (spec §2.2/§2.3): every 10 → every ~20 → 30/50/30. */
function numberSet(width: number): Array<[number, string]> {
  if (width < 300) return [[40, "30"], [60, "50"], [80, "30"]];
  if (width < 400) return [[30, "20"], [50, "40"], [60, "50"], [70, "40"], [90, "20"]];
  return [[20, "10"], [30, "20"], [40, "30"], [50, "40"], [60, "50"], [70, "40"], [80, "30"], [90, "20"], [100, "10"]];
}

export function FieldOverlay({
  width, height, frame, palette, teams, reducedMotion,
}: { width: number; height: number; frame: Frame | null; palette: Palette; teams: Teams; reducedMotion: boolean }) {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const X = (yd: number) => (yd / 120) * W;
  const numSize = Math.max(11, Math.min(30, H * 0.085));
  const zoneW = X(10);
  const abbrSize = Math.max(10, Math.min(zoneW * 0.62, H * 0.14));
  const showAbbr = W >= 300;
  const f = frame;
  const laneY = f ? f.lane * H : H / 2;
  const offPaint = f ? palette[f.offense] : palette.home;
  const dir = f && f.offense === "away" ? -1 : 1;
  const ribbonH = Math.max(6, Math.min(16, H * 0.055));
  const flashSide = f?.flash?.side ?? null;
  const flashStrength = f?.flash ? (reducedMotion ? 0 : 0.42 * (1 - f.flash.p)) : 0;
  const zoneX = (side: Side) => (side === "home" ? 0 : X(110));
  const ink = (side: Side) => (palette.mode === "neutral" ? "var(--lava-text)" : palette[side].ink);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" style={{ overflow: "hidden" }}>
      <g style={{ fill: "var(--st-num)", fontFamily: "var(--font-mono)", fontWeight: 600 } as CSSProperties} fontSize={numSize} textAnchor="middle">
        {numberSet(W).map(([x, label]) => (
          <g key={`n${x}`}>
            <text x={X(x)} y={H * 0.12 + numSize * 0.8}>{label}</text>
            <text x={X(x)} y={H * 0.88}>{label}</text>
          </g>
        ))}
      </g>
      {showAbbr ? (
        <g style={{ fontFamily: "var(--font-headline)", fontWeight: 700, letterSpacing: "0.12em" } as CSSProperties} fontSize={abbrSize} textAnchor="middle">
          <text transform={`translate(${X(5) + abbrSize * 0.35} ${H / 2}) rotate(-90)`} style={{ fill: ink("home"), fillOpacity: 0.9 }}>{teams.home.abbr}</text>
          <text transform={`translate(${X(115) - abbrSize * 0.35} ${H / 2}) rotate(90)`} style={{ fill: ink("away"), fillOpacity: 0.9 }}>{teams.away.abbr}</text>
        </g>
      ) : null}
      {/* score flash on the scoring team's end zone (85% → 100%); reduced motion: a static 2 px outline instead */}
      {flashSide && !reducedMotion ? (
        <rect x={zoneX(flashSide)} y={0} width={zoneW} height={H} style={{ fill: palette[flashSide].accent, fillOpacity: flashStrength }} />
      ) : null}
      {flashSide && reducedMotion ? (
        <rect x={zoneX(flashSide) + 1} y={1} width={zoneW - 2} height={H - 2} fill="none" style={{ stroke: palette[flashSide].accent }} strokeWidth={2} />
      ) : null}
      {f?.winner ? (
        <rect x={zoneX(f.winner)} y={0} width={zoneW} height={H} fill="none" style={{ stroke: palette[f.winner].accent }} strokeWidth={3} />
      ) : null}
      {f && f.ribbon ? (
        <g>
          <rect
            x={Math.min(X(f.ribbon.fromX), X(f.ribbon.toX))}
            y={laneY - ribbonH / 2}
            width={Math.abs(X(f.ribbon.toX) - X(f.ribbon.fromX))}
            height={ribbonH}
            rx={ribbonH / 2}
            style={{ fill: offPaint.accent, fillOpacity: 0.55 }}
          />
          <rect
            x={Math.min(X(f.ribbon.fromX), X(f.ribbon.toX)) + ribbonH / 2}
            y={laneY - ribbonH / 2}
            width={Math.max(0, Math.abs(X(f.ribbon.toX) - X(f.ribbon.fromX)) - ribbonH)}
            height={1.5}
            style={{ fill: "var(--lava-text)", fillOpacity: 0.55 }}
          />
        </g>
      ) : null}
      {f ? (
        <circle cx={X(f.startFieldX)} cy={laneY} r={7 * f.startRingScale} fill="none" style={{ stroke: "var(--lava-text)" }} strokeOpacity={0.85} strokeWidth={2} />
      ) : null}
      {f ? (
        <g transform={`translate(${X(f.ballFieldX).toFixed(2)} ${laneY.toFixed(2)})`} opacity={f.ballOpacity}>
          <ellipse cx={0} cy={6} rx={9} ry={3} style={{ fill: "var(--bg)" }} opacity={0.5} />
          <ellipse cx={0} cy={0} rx={9} ry={5.6} style={{ fill: "var(--st-ball)", stroke: "var(--bg)" }} strokeWidth={1} />
          <path d="M-3.5 0H3.5M-2 -1.6V1.6M0 -1.6V1.6M2 -1.6V1.6" style={{ stroke: "var(--lava-text)" }} strokeWidth={1} strokeLinecap="round" />
          {/* possession arrow: chevron above the ball, pointing at the goal the offense attacks (shape-coded, not colour-only) */}
          <path
            d={`M${-4 * dir} -20 L${4 * dir} -15 L${-4 * dir} -10`}
            fill="none"
            style={{ stroke: "var(--lava-text)" }}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : null}
    </svg>
  );
}
