/**
 * Simulation Theater V2 · field scene (iteration 2: broadcast pass). Pure presentational SVG, usable on the server
 * (final frame) and in the island. Geometry comes from lib/simulation-theater/field-geometry.mjs only.
 *
 * THREE LAYERS (spec §2.2, §2.5, S8, S10):
 *   StaticField  turf (mowing stripes + cross-cut + sheen), lighting falloff, out-of-bounds margin, team areas, end
 *                zones, yard lines, hash marks, goalposts, grain. Drawn in YARD units and stretched to the box
 *                (preserveAspectRatio="none"): the y-axis carries no data. Built once per size/palette; its grain filter
 *                sits on one rect nothing animated descends from.
 *   FieldMarks   painted yard numbers with direction arrows, end-zone lettering, pylons, the midfield mark. Screen px
 *                (viewBox = measured box) so text never stretches. Built once per size/palette.
 *   FieldLive    start/end spot markers (recorded spots only), drive ribbon, trail, start ring, ball, possession
 *                chevrons and tag, score flash. Screen px. React renders it on DRIVE/PHASE changes only; the island's
 *                frame loop moves it with direct attribute writes (paintLive), so playback never re-renders React.
 *   DetachedBall the no-JavaScript final frame (iteration 3): that frame is drawn once at 1200 px and stretched to
 *                whatever box the page gives it, so its ball is NOT drawn in the stretched layer. It is its own small
 *                square SVG, placed at the same fieldMap percentages and scaled uniformly, so it keeps its drawn shape at
 *                every width (spec §2.2: "the ball never becomes an oval").
 * The whole scene is aria-hidden; the HTML shell (score bug, drive card, transcript) carries every fact.
 */
import { BALL_RX, FIELD_LEN, FIELD_WID, HASH_FROM_SIDELINE, MARGIN_X, MARGIN_Y, TOTAL_LEN, TOTAL_WID, U, ballSize, fieldMap, numberSet } from "@/lib/simulation-theater/field-geometry.mjs";

export type Side = "home" | "away";
/** One side's paint (lib/simulation-theater/nfl-team-colors.mjs theaterPalette): block fill (the primary), its ink (text,
 *  ≥4.5:1) and trim, the declared field colour `accent` (an official value as is, never swapped; in team mode every mark
 *  drawn in it carries the --st-keyline halo, the ≥3:1 boundary), its ink, and `patterned`: this side carries the clash
 *  cues (keyline stripes, abbreviation, pennant tag, square ribbon ends) because the two teams' colours are too close. */
export type TeamPaint = { fill: string; ink: string; trim: string; accent: string; accentInk?: string; patterned: boolean };
export type Palette = { mode: string; validated: boolean; clash?: string | null; home: TeamPaint; away: TeamPaint };
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
export type Overlay = {
  ballX: number;
  laneY: number;
  ballOpacity: number;
  startX: number;
  ringR: number;
  dir: number;
  travel: number;
  ribbon: { x: number; w: number } | null;
  trail: { x: number; w: number } | null;
  flashOpacity: number;
  /** iteration 7: the scoring team's end-zone glow and the light bloom (0 outside a score's RESULT) */
  glowOpacity?: number;
};

const VB_W = TOTAL_LEN * U;
const VB_H = TOTAL_WID * U;
const fx = (yd: number) => (yd + MARGIN_X) * U; // field yard → static units
const fy = (yd: number) => (yd + MARGIN_Y) * U; // yards from the top sideline → static units

/** Neutral end-zone paint (the dev bar's "Neutral colours"): a tint of the side's token into the turf. Team mode paints
 *  the team's block colour itself, opaque, so the end zone shows the official value. */
const zoneFill = (p: TeamPaint, mode: string) => (mode === "neutral" ? `color-mix(in srgb, ${p.fill} 22%, var(--st-turf-b))` : p.fill);

/** Width (yards) of the striped band along a patterned side's end line. */
const CUE_BAND_YD = 2;

/** The clash cue: diagonal stripes of the keyline with a dark hairline beside it, drawn OVER the team's own colour, so
 *  they read on light and dark team colours alike and the official colour stays visible between them. */
function CuePattern({ id, size }: { id: string; size: number }) {
  return (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={size * 0.22} height={size} style={{ fill: "var(--st-keyline)" }} />
      <rect x={size * 0.22} width={size * 0.16} height={size} style={{ fill: "var(--bg)", fillOpacity: 0.8 }} />
    </pattern>
  );
}

export function StaticField({ palette, idPrefix, detail = true, grain = true }: { palette: Palette; idPrefix: string; detail?: boolean;
  /** false: the island draws the grain in its own static layer OUTSIDE the camera wrapper (<GrainLayer>, S8) */
  grain?: boolean }) {
  const id = (s: string) => `${idPrefix}-${s}`;
  const mode = palette.mode;
  const yard: string[] = [];
  for (let y = 15; y <= 105; y += 5) yard.push(`M${fx(y)} ${fy(0)}V${fy(FIELD_WID)}`);
  const top = fy(0);
  const bot = fy(FIELD_WID);
  const hashA = fy(HASH_FROM_SIDELINE);
  const hashB = fy(FIELD_WID - HASH_FROM_SIDELINE);
  const zone = (side: Side, x0: number) => (
    <g>
      <rect x={fx(x0)} y={top} width={10 * U} height={FIELD_WID * U} style={{ fill: zoneFill(palette[side], mode) }} />
      {/* the pinstripe texture is for the neutral tint only: on a team colour it would read as the collision hatch */}
      {mode === "neutral" ? <rect x={fx(x0)} y={top} width={10 * U} height={FIELD_WID * U} fill={`url(#${id("pin")})`} /> : null}
      {/* clash cue: keyline stripes along the end line, clear of the lettering (which keeps its 4.5:1 on the plain fill) */}
      {mode === "team" && palette[side].patterned ? (
        <rect x={fx(side === "home" ? 0 : 120 - CUE_BAND_YD)} y={top} width={CUE_BAND_YD * U} height={FIELD_WID * U} fill={`url(#${id("cue")})`} data-st-cue="" />
      ) : null}
    </g>
  );
  const post = (x: number, out: number) => (
    <g style={{ stroke: "var(--st-post)" }} strokeLinecap="round" vectorEffect="non-scaling-stroke">
      <line x1={fx(x)} y1={fy(FIELD_WID / 2 - 3.08)} x2={fx(x)} y2={fy(FIELD_WID / 2 + 3.08)} strokeWidth={3} vectorEffect="non-scaling-stroke" />
      <line x1={fx(x)} y1={fy(FIELD_WID / 2)} x2={fx(x) + out} y2={fy(FIELD_WID / 2)} strokeWidth={3} vectorEffect="non-scaling-stroke" />
    </g>
  );
  return (
    <svg className="st-turf" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={id("stripes")} x={fx(0)} y={0} width={10 * U} height={VB_H} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={5 * U} height={VB_H} style={{ fill: "var(--st-turf-a)" }} />
          <rect x={5 * U} y={0} width={5 * U} height={VB_H} style={{ fill: "var(--st-turf-b)" }} />
        </pattern>
        {/* mower sheen: each 5-yard stripe lighter on one edge, darker on the other */}
        <linearGradient id={id("sheen")} gradientUnits="userSpaceOnUse" x1={fx(0)} y1={0} x2={fx(5)} y2={0} spreadMethod="reflect">
          <stop offset="0" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.05 }} />
          <stop offset="1" style={{ stopColor: "var(--bg)", stopOpacity: 0.08 }} />
        </linearGradient>
        {/* cross-cut: faint bands along the field's length */}
        <pattern id={id("cross")} x={0} y={top} width={VB_W} height={(FIELD_WID / 4) * U} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={VB_W} height={(FIELD_WID / 8) * U} style={{ fill: "var(--lava-text)", fillOpacity: 0.025 }} />
        </pattern>
        <pattern id={id("pin")} width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <rect width={3} height={14} style={{ fill: "var(--lava-text)", fillOpacity: 0.07 }} />
        </pattern>
        <CuePattern id={id("cue")} size={14} />
        {detail ? (
          <pattern id={id("hash")} x={fx(0)} y={0} width={U} height={VB_H} patternUnits="userSpaceOnUse">
            <rect x={-0.9} y={top + 0.4 * U} width={1.8} height={0.8 * U} style={{ fill: "var(--st-line-soft)" }} />
            <rect x={-0.9} y={hashA - 0.45 * U} width={1.8} height={0.9 * U} style={{ fill: "var(--st-line-soft)" }} />
            <rect x={-0.9} y={hashB - 0.45 * U} width={1.8} height={0.9 * U} style={{ fill: "var(--st-line-soft)" }} />
            <rect x={-0.9} y={bot - 1.2 * U} width={1.8} height={0.8 * U} style={{ fill: "var(--st-line-soft)" }} />
          </pattern>
        ) : null}
        {/* stadium lighting: a broad pool of light, falling off to the corners */}
        <radialGradient id={id("light")} cx="0.5" cy="0.38" r="0.7">
          <stop offset="0" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.09 }} />
          <stop offset="0.55" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.02 }} />
          <stop offset="1" style={{ stopColor: "var(--bg)", stopOpacity: 0.42 }} />
        </radialGradient>
        <linearGradient id={id("depth")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.05 }} />
          <stop offset="0.5" style={{ stopColor: "var(--bg)", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "var(--bg)", stopOpacity: 0.28 }} />
        </linearGradient>
        {grain ? <GrainFilter id={id("grain")} /> : null}
      </defs>
      {/* out-of-bounds margin, then the field of play */}
      <rect x={0} y={0} width={VB_W} height={VB_H} style={{ fill: "var(--st-turf-out)" }} />
      <rect x={fx(42)} y={top - 2.1 * U} width={36 * U} height={1.6 * U} rx={4} style={{ fill: "var(--lava-text)", fillOpacity: 0.04, stroke: "var(--st-line-soft)" }} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
      <rect x={fx(42)} y={bot + 0.5 * U} width={36 * U} height={1.6 * U} rx={4} style={{ fill: "var(--lava-text)", fillOpacity: 0.04, stroke: "var(--st-line-soft)" }} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
      <rect x={fx(10)} y={top} width={100 * U} height={FIELD_WID * U} fill={`url(#${id("stripes")})`} />
      <rect x={fx(10)} y={top} width={100 * U} height={FIELD_WID * U} fill={`url(#${id("sheen")})`} />
      <rect x={fx(10)} y={top} width={100 * U} height={FIELD_WID * U} fill={`url(#${id("cross")})`} />
      {zone("home", 0)}
      {zone("away", 110)}
      {/* grain: rendered once, never animated; nothing moving descends from it (S8) */}
      {grain ? <rect x={0} y={0} width={VB_W} height={VB_H} filter={`url(#${id("grain")})`} opacity={0.04} /> : null}
      {detail ? <rect x={fx(10)} y={0} width={100 * U} height={VB_H} fill={`url(#${id("hash")})`} /> : null}
      <path d={yard.join("")} style={{ stroke: "var(--st-line)" }} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {/* goal lines and the field boundary (a painted white border) */}
      <path d={`M${fx(10)} ${top}V${bot}M${fx(110)} ${top}V${bot}`} style={{ stroke: "var(--st-line-strong)" }} strokeWidth={2.6} vectorEffect="non-scaling-stroke" />
      {/* no separate end-zone edge line: the end zone itself is the team's official colour, bounded by the white goal
          and end lines, and its lettering carries the trim */}
      <rect x={fx(0)} y={top} width={FIELD_LEN * U} height={FIELD_WID * U} fill="none" style={{ stroke: "var(--st-line-strong)" }} strokeWidth={3} vectorEffect="non-scaling-stroke" />
      {post(0, -1.6 * U)}
      {post(FIELD_LEN, 1.6 * U)}
      <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#${id("depth")})`} />
      <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#${id("light")})`} />
    </svg>
  );
}

function GrainFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
  );
}

/**
 * The grain on its own static layer, OUTSIDE the camera wrapper (iteration 7, S8): the only SVG filter in the island is
 * here, and nothing animated is its ancestor or descendant. Screen-space grain also reads as the camera's, not the
 * turf's, so it stays put while the field moves under it.
 */
export function GrainLayer({ idPrefix }: { idPrefix: string }) {
  return (
    <svg className="st-grain" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" data-st-grain="">
      <defs><GrainFilter id={`${idPrefix}-grain`} /></defs>
      <rect x={0} y={0} width={VB_W} height={VB_H} filter={`url(#${idPrefix}-grain)`} opacity={0.04} />
    </svg>
  );
}

/** Painted marks in screen px: yard numbers + arrows, end-zone lettering, pylons, midfield mark. */
export function FieldMarks({ W, H, palette, teams }: { W: number; H: number; palette: Palette; teams: Teams }) {
  const m = fieldMap(W, H);
  const num = Math.max(10, Math.min(34, m.fieldH * 0.085));
  const botY = m.Y(1) - m.fieldH * 0.1;
  const topY = m.Y(0) + m.fieldH * 0.1;
  const zoneW = m.X(10) - m.X(0);
  const abbrSize = Math.max(10, Math.min(zoneW * 0.58, m.fieldH * 0.16));
  const showAbbr = W >= 330; // dropped at 320 px (spec §2.3), where the full-bleed field is 320 wide
  // end-zone lettering: the team's trim on its own end-zone colour (≥4.5:1, tested), e.g. gold on Saints black
  const ink = (side: Side) => (palette.mode === "neutral" ? "var(--lava-text)" : palette[side].trim);
  const pyl = Math.max(3, Math.min(7, W * 0.0045));
  const arrow = (x: number, y: number, d: number, flip: boolean) => {
    // a small triangle on the goal side of the number, pointing at the nearer goal line
    const a = num * 0.26;
    const gx = x + d * num * 1.08;
    const yy = flip ? y + num * 0.36 : y - num * 0.36;
    return <path d={`M${gx + d * a} ${yy}L${gx} ${yy - a * 0.75}L${gx} ${yy + a * 0.75}Z`} />;
  };
  return (
    <svg className="st-marks" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g className="st-num" fontSize={num} textAnchor="middle">
        {numberSet(W).map(([x, label, d]: [number, string, number]) => (
          <g key={x}>
            <text x={m.X(x)} y={botY}>{label}</text>
            <text transform={`translate(${m.X(x)} ${topY}) rotate(180)`}>{label}</text>
            {d && W >= 520 ? arrow(m.X(x), botY, d, false) : null}
            {d && W >= 520 ? arrow(m.X(x), topY, d, true) : null}
          </g>
        ))}
      </g>
      {/* midfield mark */}
      {W >= 420 ? (
        <g className="st-midmark">
          <circle cx={m.X(60)} cy={m.Y(0.5)} r={m.fieldH * 0.13} fill="none" />
          <text x={m.X(60)} y={m.Y(0.5) + m.fieldH * 0.035} fontSize={m.fieldH * 0.09} textAnchor="middle">SIM</text>
        </g>
      ) : null}
      {showAbbr ? (
        <g className="st-zone-abbr" fontSize={abbrSize} textAnchor="middle">
          <text transform={`translate(${m.X(5) + abbrSize * 0.36} ${m.Y(0.5)}) rotate(-90)`} style={{ fill: ink("home") }}>{teams.home.abbr}</text>
          <text transform={`translate(${m.X(115) - abbrSize * 0.36} ${m.Y(0.5)}) rotate(90)`} style={{ fill: ink("away") }}>{teams.away.abbr}</text>
        </g>
      ) : null}
      <g className="st-pylon">
        {[0, 10, 110, 120].flatMap((x) => [m.y0, m.y1].map((y) => (
          <rect key={`${x}-${y}`} x={m.X(x) - pyl / 2} y={y - pyl / 2} width={pyl} height={pyl} rx={1} />
        )))}
      </g>
    </svg>
  );
}

/** Pre-built gradient ids used by FieldLive (one set per island). */
function LiveDefs({ idPrefix }: { idPrefix: string }) {
  return (
    <defs>
      <radialGradient id={`${idPrefix}-leather`} cx="0.38" cy="0.32" r="0.75">
        <stop offset="0" style={{ stopColor: "var(--st-ball-hi)" }} />
        <stop offset="0.55" style={{ stopColor: "var(--st-ball)" }} />
        <stop offset="1" style={{ stopColor: "var(--st-ball-lo)" }} />
      </radialGradient>
      <radialGradient id={`${idPrefix}-glow`}>
        <stop offset="0" style={{ stopColor: "var(--st-glow)", stopOpacity: 0.55 }} />
        <stop offset="1" style={{ stopColor: "var(--st-glow)", stopOpacity: 0 }} />
      </radialGradient>
      <linearGradient id={`${idPrefix}-trail-r`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" style={{ stopColor: "var(--lava-text)", stopOpacity: 0 }} />
        <stop offset="1" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.55 }} />
      </linearGradient>
      <CuePattern id={`${idPrefix}-cue`} size={7} />
      {/* score glow (team accent, set per drive on the element) and the stadium-light bloom */}
      <radialGradient id={`${idPrefix}-ezglow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" style={{ stopColor: "currentColor", stopOpacity: 0.9 }} />
        <stop offset="0.45" style={{ stopColor: "currentColor", stopOpacity: 0.35 }} />
        <stop offset="1" style={{ stopColor: "currentColor", stopOpacity: 0 }} />
      </radialGradient>
      <radialGradient id={`${idPrefix}-bloom`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.16 }} />
        <stop offset="0.5" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.04 }} />
        <stop offset="1" style={{ stopColor: "var(--lava-text)", stopOpacity: 0 }} />
      </radialGradient>
      <linearGradient id={`${idPrefix}-trail-l`} x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" style={{ stopColor: "var(--lava-text)", stopOpacity: 0 }} />
        <stop offset="1" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.55 }} />
      </linearGradient>
    </defs>
  );
}

/** The ball itself (glow, shadow, leather, stripes, laces, possession chevrons), centred on 0,0, in screen px. */
function BallGlyph({ rx, ry, dir, idPrefix }: { rx: number; ry: number; dir: number; idPrefix: string }) {
  return (
    <>
      <circle r={rx * 2.3} fill={`url(#${idPrefix}-glow)`} className="st-ball-glow" />
      <ellipse cx={1.5} cy={ry + 2.5} rx={rx * 0.95} ry={ry * 0.45} className="st-ball-shadow" />
      <ellipse rx={rx} ry={ry} fill={`url(#${idPrefix}-leather)`} className="st-ball-body" />
      <path d={`M${-rx * 0.62} ${-ry * 0.55}V${ry * 0.55}M${rx * 0.62} ${-ry * 0.55}V${ry * 0.55}`} className="st-ball-stripe" />
      <path d={`M${-rx * 0.3} 0H${rx * 0.3}M${-rx * 0.18} ${-ry * 0.3}V${ry * 0.3}M0 ${-ry * 0.3}V${ry * 0.3}M${rx * 0.18} ${-ry * 0.3}V${ry * 0.3}`} className="st-ball-lace" />
      {/* possession: two chevrons ahead of the ball, pointing at the goal the offense attacks (shape, not colour) */}
      <g transform={`scale(${dir} 1)`} className="st-chev">
        <path d={`M${rx + 5} ${-ry * 0.9}L${rx + 5 + ry} 0L${rx + 5} ${ry * 0.9}`} />
        <path d={`M${rx + 5 + ry * 0.9} ${-ry * 0.9}L${rx + 5 + ry * 1.9} 0L${rx + 5 + ry * 0.9} ${ry * 0.9}`} opacity={0.55} />
      </g>
    </>
  );
}

/**
 * The ball of a frame drawn at W × H and stretched to an unknown box (the server-rendered final frame): a square SVG
 * centred at the ball's fieldMap position, given as percentages of the box (fieldMap is linear, so they hold at any
 * size), and sized like the island's ball at the box's width: ballSize(boxW) = clamp(min, perW · boxW, max), written
 * as a CSS clamp() of the box width. Square viewBox + square box = uniform scale: the ball keeps its drawn shape.
 */
export function DetachedBall({ W, H, o, idPrefix }: { W: number; H: number; o: Overlay | null; idPrefix: string }) {
  if (!o) return null;
  const { rx, ry } = ballSize(W);
  const half = Math.ceil(Math.max(rx * 2.3, rx + 5 + ry * 1.9, ry + 2.5 + ry * 0.45) + 2);
  const k = (2 * half) / rx; // box px per px of drawn half-length
  const size = `clamp(${(k * BALL_RX.min).toFixed(2)}px, ${(k * BALL_RX.perW * 100).toFixed(3)}%, ${(k * BALL_RX.max).toFixed(2)}px)`;
  return (
    <svg
      className="st-ball-solo"
      viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`}
      style={{ left: `${((o.ballX / W) * 100).toFixed(3)}%`, top: `${((o.laneY / H) * 100).toFixed(3)}%`, width: size }}
      aria-hidden="true"
      focusable="false"
      data-st-ball-solo=""
    >
      <LiveDefs idPrefix={idPrefix} />
      <g opacity={o.ballOpacity}>
        <BallGlyph rx={rx} ry={ry} dir={o.dir} idPrefix={idPrefix} />
      </g>
    </svg>
  );
}

export type LiveRefs = {
  ball?: (el: SVGGElement | null) => void;
  ribbon?: (el: SVGRectElement | null) => void;
  ribbonHi?: (el: SVGRectElement | null) => void;
  ribbonCue?: (el: SVGRectElement | null) => void;
  trail?: (el: SVGRectElement | null) => void;
  ring?: (el: SVGCircleElement | null) => void;
  flash?: (el: SVGRectElement | null) => void;
  glow?: (el: SVGGElement | null) => void;
};

/**
 * The moving layer. `o` is overlayFrame(frame, box) for the frame React rendered with; afterwards the island's frame
 * loop calls paintLive() directly. Markers appear only at RECORDED spots: the drive's start spot always, its end spot
 * once the drive has reached it (RESULT onward). Nothing marks any other yard line (no invented first downs).
 */
export function FieldLive({
  W, H, frame, o, palette, offenseAbbr, startTag, endTag, showEnd, endX, idPrefix, reducedMotion, refs = {}, travelDir, detachBall = false, spotTags = true,
}: {
  W: number; H: number; frame: Frame | null; o: Overlay | null; palette: Palette; offenseAbbr: string; startTag: string; endTag: string;
  showEnd: boolean; endX: number; idPrefix: string; reducedMotion: boolean; refs?: LiveRefs; travelDir?: number;
  /** true: the ball is drawn by <DetachedBall> instead (the stretched no-JavaScript frame) */
  detachBall?: boolean;
  /** false: the island draws the spot tags in screen space (<SpotTags>), so the camera never scales or crops them */
  spotTags?: boolean;
}) {
  const m = fieldMap(W, H);
  const f = frame;
  const { rx, ry } = ballSize(W);
  const ribbonH = Math.max(6, Math.min(14, m.fieldH * 0.045));
  const off = f ? palette[f.offense] : palette.home;
  const zoneX = (side: Side) => (side === "home" ? m.X(0) : m.X(110));
  // a score lights the end zone the scoring team ATTACKS (where the score happened), in the scoring team's accent
  const attacked = (side: Side): Side => (side === "home" ? "away" : "home");
  const zoneW = m.X(10) - m.X(0);
  const tags = spotTags && W >= 420;
  const team = palette.mode === "team";
  // an accent outline on an end zone (scoring flash with reduced motion, winner): in team mode drawn over a wider halo
  // in that END ZONE's ink (≥4.5:1 on its fill by construction), so the official colour keeps a contrasting boundary
  const outline = (side: Side, zone: Side, inset: number) => (
    <>
      {team ? <rect className="st-halo" x={zoneX(zone) + inset} y={m.y0 + inset} width={zoneW - 2 * inset} height={m.fieldH - 2 * inset} style={{ stroke: palette[zone].ink }} strokeWidth={6} /> : null}
      <rect x={zoneX(zone) + inset} y={m.y0 + inset} width={zoneW - 2 * inset} height={m.fieldH - 2 * inset} fill="none" style={{ stroke: palette[side].accent }} strokeWidth={3} />
    </>
  );
  const tagFs = Math.max(9, Math.min(11.5, W * 0.0095));
  const tag = (x: number, y: number, text: string, cls: string, below: boolean) => {
    const w = text.length * tagFs * 0.64 + 12;
    const tx = Math.min(Math.max(x - w / 2, m.x0 + 2), m.x1 - w - 2);
    const ty = below ? y - tagFs - 10 : y + 4;
    return (
      <g className={cls}>
        <rect x={tx} y={ty} width={w} height={tagFs + 7} rx={3} />
        <text x={tx + w / 2} y={ty + tagFs + 1.5} fontSize={tagFs} textAnchor="middle">{text}</text>
      </g>
    );
  };
  // possession tag: a miniature score-bug block; the patterned (clash) side's is a striped pennant pointing the way it attacks
  const cue = team && off.patterned;
  const textW = offenseAbbr.length * 7.4 + 14;
  const stripeW = cue ? 8 : 0;
  const point = cue ? 7 : 0;
  const bodyW = textW + stripeW;
  const posW = bodyW + point;
  const d = (o?.dir ?? 1) > 0 ? 1 : -1;
  const pennant = d > 0 ? `M0 0H${bodyW}L${posW} 8.5L${bodyW} 17H0Z` : `M${point} 0H${posW}V17H${point}L0 8.5Z`;
  const textX = cue ? (d > 0 ? stripeW + textW / 2 : point + textW / 2) : posW / 2;
  return (
    <svg className="st-live" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <LiveDefs idPrefix={idPrefix} />
      {f?.flash && !reducedMotion ? (
        /* the scoring team's glow spilling from the lit end zone onto the field, and a white light bloom over the goal
           line: both decorative, opacity from the same pure curve as the flash (overlayFrame), never on with reduced motion */
        <g ref={refs.glow} opacity={o?.glowOpacity ?? 0} className="st-ezglow" data-st-glow="" style={{ color: palette[f.flash.side].accent }}>
          <ellipse cx={attacked(f.flash.side) === "home" ? m.X(10) : m.X(110)} cy={m.Y(0.5)} rx={zoneW * 2.6} ry={m.fieldH * 0.75} fill={`url(#${idPrefix}-ezglow)`} />
          <ellipse cx={attacked(f.flash.side) === "home" ? m.X(5) : m.X(115)} cy={m.Y(0.5)} rx={zoneW * 1.6} ry={m.fieldH * 0.62} fill={`url(#${idPrefix}-bloom)`} />
        </g>
      ) : null}
      {f?.flash && !reducedMotion ? (
        <rect ref={refs.flash} x={zoneX(attacked(f.flash.side))} y={m.y0} width={zoneW} height={m.fieldH} style={{ fill: palette[f.flash.side].accent, fillOpacity: o?.flashOpacity ?? 0 }} />
      ) : null}
      {f?.flash && reducedMotion ? outline(f.flash.side, attacked(f.flash.side), team ? 4 : 2) : null}
      {f?.winner ? outline(f.winner, f.winner, team ? 4 : 1.5) : null}
      {f && o ? (
        <g className="st-spot st-spot-start">
          <line x1={o.startX} y1={m.y0} x2={o.startX} y2={m.y1} />
          {tags ? tag(o.startX, m.y0, startTag, "st-spottag st-spottag-start", false) : null}
        </g>
      ) : null}
      {f && showEnd ? (
        <g className="st-spot st-spot-end">
          <line x1={endX} y1={m.y0} x2={endX} y2={m.y1} />
          {tags ? tag(endX, m.y1, endTag, "st-spottag st-spottag-end", true) : null}
        </g>
      ) : null}
      {f ? (
        <>
          <rect ref={refs.ribbon} className="st-ribbon" x={o?.ribbon?.x ?? 0} y={(o?.laneY ?? 0) - ribbonH / 2} width={o?.ribbon?.w ?? 0} height={ribbonH} rx={cue ? 1 : ribbonH / 2}
            style={{ fill: off.accent }} />
          {cue ? (
            <rect ref={refs.ribbonCue} className="st-ribbon-cue" x={o?.ribbon?.x ?? 0} y={(o?.laneY ?? 0) - ribbonH / 2} width={o?.ribbon?.w ?? 0} height={ribbonH} rx={1}
              fill={`url(#${idPrefix}-cue)`} data-st-cue="" />
          ) : null}
          <rect ref={refs.ribbonHi} className="st-ribbon-hi" x={o?.ribbon?.x ?? 0} y={(o?.laneY ?? 0) - ribbonH / 2 + 1} width={o?.ribbon?.w ?? 0} height={1.5} />
          <rect ref={refs.trail} x={o?.trail?.x ?? 0} y={(o?.laneY ?? 0) - ry * 0.7} width={o?.trail?.w ?? 0} height={ry * 1.4} rx={ry * 0.7}
            fill={`url(#${idPrefix}-trail-${(travelDir ?? o?.travel ?? 1) > 0 ? "r" : "l"})`} />
          <circle ref={refs.ring} className="st-ring" cx={o?.startX ?? 0} cy={o?.laneY ?? 0} r={o?.ringR ?? 6} />
          {detachBall ? null : (
            <g ref={refs.ball} transform={`translate(${o?.ballX ?? 0} ${o?.laneY ?? 0})`} opacity={o?.ballOpacity ?? 1}>
              <BallGlyph rx={rx} ry={ry} dir={o?.dir ?? 1} idPrefix={idPrefix} />
              {W >= 360 ? (
                <g className="st-postag" transform={`translate(${-posW / 2} ${-ry - 24})`}>
                  {/* team mode: a miniature of the offense's score-bug block (fill, ink), keylined */}
                  {cue ? (
                    <>
                      <path d={pennant} style={{ fill: off.fill, stroke: "var(--st-keyline)" }} data-st-cue="" />
                      {/* two keyline hairlines at the tail: the pattern itself is too fine to read at tag size */}
                      <path className="st-postag-cue" d={((x) => `M${x} 14L${x + 3} 3M${x + 3} 14L${x + 6} 3`)(d > 0 ? 1.5 : posW - stripeW + 0.5)} style={{ fill: "none", stroke: "var(--st-keyline)", strokeWidth: 1.6, strokeLinecap: "round" }} />
                    </>
                  ) : (
                    <rect width={posW} height={17} rx={4} style={team ? { fill: off.fill, stroke: "var(--st-keyline)" } : { stroke: off.accent }} />
                  )}
                  <text x={textX} y={12.5} textAnchor="middle" style={team ? { fill: off.ink } : undefined}>{offenseAbbr}</text>
                </g>
              ) : null}
            </g>
          )}
        </>
      ) : null}
    </svg>
  );
}

/**
 * The recorded-spot tags in SCREEN space (iteration 7): pinned to the top (start) and bottom (end) sidelines of the box,
 * at the spot's camera-mapped x, which the island's painter writes each frame (translate only). Drawn outside the camera
 * wrapper, so a zoom never scales, blurs or crops them. Same copy and look as FieldLive's in-scene tags.
 */
export function SpotTags({ W, H, startTag, endTag, showEnd, startRef, endRef }: {
  W: number; H: number; startTag: string; endTag: string; showEnd: boolean;
  startRef?: (el: SVGGElement | null) => void; endRef?: (el: SVGGElement | null) => void;
}) {
  if (W < 420) return null;
  const m = fieldMap(W, H);
  const tagFs = Math.max(9, Math.min(11.5, W * 0.0095));
  const one = (text: string, cls: string, below: boolean, ref?: (el: SVGGElement | null) => void) => {
    const w = text.length * tagFs * 0.64 + 12;
    const ty = below ? m.y1 - tagFs - 10 : m.y0 + 4;
    return (
      <g ref={ref} className={`st-spottag ${cls}`} data-st-w={w.toFixed(1)}>
        <rect x={-w / 2} y={ty} width={w} height={tagFs + 7} rx={3} />
        <text x={0} y={ty + tagFs + 1.5} fontSize={tagFs} textAnchor="middle">{text}</text>
      </g>
    );
  };
  return (
    <svg className="st-hud" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {startTag ? one(startTag, "st-spottag-start", false, startRef) : null}
      {showEnd && endTag ? one(endTag, "st-spottag-end", true, endRef) : null}
    </svg>
  );
}

type LiveEls = { ball: SVGGElement | null; ribbon: SVGRectElement | null; ribbonHi: SVGRectElement | null; ribbonCue?: SVGRectElement | null; trail: SVGRectElement | null; ring: SVGCircleElement | null; flash: SVGRectElement | null; glow?: SVGGElement | null };

/** Per-frame paint: direct attribute writes, no React. Only values that change inside a phase are written here. */
export function paintLive(els: LiveEls, o: Overlay | null) {
  if (!o) return;
  if (els.ball) {
    els.ball.setAttribute("transform", `translate(${o.ballX} ${o.laneY})`);
    els.ball.setAttribute("opacity", String(o.ballOpacity));
  }
  const rx = o.ribbon ? String(o.ribbon.x) : "0";
  const rw = o.ribbon ? String(o.ribbon.w) : "0";
  if (els.ribbon) { els.ribbon.setAttribute("x", rx); els.ribbon.setAttribute("width", rw); }
  if (els.ribbonHi) { els.ribbonHi.setAttribute("x", rx); els.ribbonHi.setAttribute("width", rw); }
  if (els.ribbonCue) { els.ribbonCue.setAttribute("x", rx); els.ribbonCue.setAttribute("width", rw); }
  if (els.trail) { els.trail.setAttribute("x", String(o.trail?.x ?? 0)); els.trail.setAttribute("width", String(o.trail?.w ?? 0)); }
  if (els.ring) els.ring.setAttribute("r", String(o.ringR));
  if (els.flash) els.flash.style.fillOpacity = String(o.flashOpacity);
  if (els.glow) els.glow.setAttribute("opacity", String(o.glowOpacity ?? 0));
}

