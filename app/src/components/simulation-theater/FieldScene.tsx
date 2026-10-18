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
 * The whole scene is aria-hidden; the HTML shell (score bug, drive card, transcript) carries every fact.
 */
import { FIELD_LEN, FIELD_WID, HASH_FROM_SIDELINE, MARGIN_X, MARGIN_Y, TOTAL_LEN, TOTAL_WID, U, ballSize, fieldMap, numberSet } from "@/lib/simulation-theater/field-geometry.mjs";

export type Side = "home" | "away";
export type TeamPaint = { fill: string; ink: string; accent: string; hatched: boolean; accentBase?: string };
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
};

const VB_W = TOTAL_LEN * U;
const VB_H = TOTAL_WID * U;
const fx = (yd: number) => (yd + MARGIN_X) * U; // field yard → static units
const fy = (yd: number) => (yd + MARGIN_Y) * U; // yards from the top sideline → static units

/** Neutral end-zone paint (D3 default): a tint of the side's token into the turf. */
const zoneFill = (p: TeamPaint, mode: string) => (mode === "neutral" ? `color-mix(in srgb, ${p.fill} 22%, var(--st-turf-b))` : p.fill);

export function StaticField({ palette, idPrefix, detail = true }: { palette: Palette; idPrefix: string; detail?: boolean }) {
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
      <rect x={fx(x0)} y={top} width={10 * U} height={FIELD_WID * U} style={{ fill: zoneFill(palette[side], mode), fillOpacity: mode === "neutral" ? 1 : 0.88 }} />
      <rect x={fx(x0)} y={top} width={10 * U} height={FIELD_WID * U} fill={`url(#${id("pin")})`} />
      {palette[side].hatched ? <rect x={fx(x0)} y={top} width={10 * U} height={FIELD_WID * U} fill={`url(#${id("hatch")})`} /> : null}
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
        <pattern id={id("hatch")} width={16} height={16} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={16} style={{ fill: "var(--bg)", fillOpacity: 0.35 }} />
        </pattern>
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
        <filter id={id("grain")} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
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
      <rect x={0} y={0} width={VB_W} height={VB_H} filter={`url(#${id("grain")})`} opacity={0.04} />
      {detail ? <rect x={fx(10)} y={0} width={100 * U} height={VB_H} fill={`url(#${id("hash")})`} /> : null}
      <path d={yard.join("")} style={{ stroke: "var(--st-line)" }} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {/* goal lines and the field boundary (a painted white border) */}
      <path d={`M${fx(10)} ${top}V${bot}M${fx(110)} ${top}V${bot}`} style={{ stroke: "var(--st-line-strong)" }} strokeWidth={2.6} vectorEffect="non-scaling-stroke" />
      {/* end-zone edge in the team ACCENT (≥3:1 on page and turf; S6) */}
      <line x1={fx(10) - 4} y1={top} x2={fx(10) - 4} y2={bot} style={{ stroke: palette.home.accent }} strokeOpacity={0.9} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <line x1={fx(110) + 4} y1={top} x2={fx(110) + 4} y2={bot} style={{ stroke: palette.away.accent }} strokeOpacity={0.9} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <rect x={fx(0)} y={top} width={FIELD_LEN * U} height={FIELD_WID * U} fill="none" style={{ stroke: "var(--st-line-strong)" }} strokeWidth={3} vectorEffect="non-scaling-stroke" />
      {post(0, -1.6 * U)}
      {post(FIELD_LEN, 1.6 * U)}
      <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#${id("depth")})`} />
      <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#${id("light")})`} />
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
  const showAbbr = W >= 300;
  const ink = (side: Side) => (palette.mode === "neutral" ? "var(--lava-text)" : palette[side].ink);
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
      <linearGradient id={`${idPrefix}-trail-l`} x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" style={{ stopColor: "var(--lava-text)", stopOpacity: 0 }} />
        <stop offset="1" style={{ stopColor: "var(--lava-text)", stopOpacity: 0.55 }} />
      </linearGradient>
    </defs>
  );
}

export type LiveRefs = {
  ball?: (el: SVGGElement | null) => void;
  ribbon?: (el: SVGRectElement | null) => void;
  ribbonHi?: (el: SVGRectElement | null) => void;
  trail?: (el: SVGRectElement | null) => void;
  ring?: (el: SVGCircleElement | null) => void;
  flash?: (el: SVGRectElement | null) => void;
};

/**
 * The moving layer. `o` is overlayFrame(frame, box) for the frame React rendered with; afterwards the island's frame
 * loop calls paintLive() directly. Markers appear only at RECORDED spots: the drive's start spot always, its end spot
 * once the drive has reached it (RESULT onward). Nothing marks any other yard line (no invented first downs).
 */
export function FieldLive({
  W, H, frame, o, palette, offenseAbbr, startTag, endTag, showEnd, endX, idPrefix, reducedMotion, refs = {}, travelDir,
}: {
  W: number; H: number; frame: Frame | null; o: Overlay | null; palette: Palette; offenseAbbr: string; startTag: string; endTag: string;
  showEnd: boolean; endX: number; idPrefix: string; reducedMotion: boolean; refs?: LiveRefs; travelDir?: number;
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
  const tags = W >= 420;
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
  const posW = offenseAbbr.length * 7.4 + 14;
  return (
    <svg className="st-live" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <LiveDefs idPrefix={idPrefix} />
      {f?.flash && !reducedMotion ? (
        <rect ref={refs.flash} x={zoneX(attacked(f.flash.side))} y={m.y0} width={zoneW} height={m.fieldH} style={{ fill: palette[f.flash.side].accent, fillOpacity: o?.flashOpacity ?? 0 }} />
      ) : null}
      {f?.flash && reducedMotion ? (
        <rect x={zoneX(attacked(f.flash.side)) + 2} y={m.y0 + 2} width={zoneW - 4} height={m.fieldH - 4} fill="none" style={{ stroke: palette[f.flash.side].accent }} strokeWidth={3} />
      ) : null}
      {f?.winner ? <rect x={zoneX(f.winner) + 1.5} y={m.y0 + 1.5} width={zoneW - 3} height={m.fieldH - 3} fill="none" style={{ stroke: palette[f.winner].accent }} strokeWidth={3} /> : null}
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
          <rect ref={refs.ribbon} className="st-ribbon" x={o?.ribbon?.x ?? 0} y={(o?.laneY ?? 0) - ribbonH / 2} width={o?.ribbon?.w ?? 0} height={ribbonH} rx={ribbonH / 2}
            style={{ fill: off.accent }} />
          <rect ref={refs.ribbonHi} className="st-ribbon-hi" x={o?.ribbon?.x ?? 0} y={(o?.laneY ?? 0) - ribbonH / 2 + 1} width={o?.ribbon?.w ?? 0} height={1.5} />
          <rect ref={refs.trail} x={o?.trail?.x ?? 0} y={(o?.laneY ?? 0) - ry * 0.7} width={o?.trail?.w ?? 0} height={ry * 1.4} rx={ry * 0.7}
            fill={`url(#${idPrefix}-trail-${(travelDir ?? o?.travel ?? 1) > 0 ? "r" : "l"})`} />
          <circle ref={refs.ring} className="st-ring" cx={o?.startX ?? 0} cy={o?.laneY ?? 0} r={o?.ringR ?? 6} />
          <g ref={refs.ball} transform={`translate(${o?.ballX ?? 0} ${o?.laneY ?? 0})`} opacity={o?.ballOpacity ?? 1}>
            <circle r={rx * 2.3} fill={`url(#${idPrefix}-glow)`} />
            <ellipse cx={1.5} cy={ry + 2.5} rx={rx * 0.95} ry={ry * 0.45} className="st-ball-shadow" />
            <ellipse rx={rx} ry={ry} fill={`url(#${idPrefix}-leather)`} className="st-ball-body" />
            <path d={`M${-rx * 0.62} ${-ry * 0.55}V${ry * 0.55}M${rx * 0.62} ${-ry * 0.55}V${ry * 0.55}`} className="st-ball-stripe" />
            <path d={`M${-rx * 0.3} 0H${rx * 0.3}M${-rx * 0.18} ${-ry * 0.3}V${ry * 0.3}M0 ${-ry * 0.3}V${ry * 0.3}M${rx * 0.18} ${-ry * 0.3}V${ry * 0.3}`} className="st-ball-lace" />
            {/* possession: two chevrons ahead of the ball, pointing at the goal the offense attacks (shape, not colour) */}
            <g transform={`scale(${o?.dir ?? 1} 1)`} className="st-chev">
              <path d={`M${rx + 5} ${-ry * 0.9}L${rx + 5 + ry} 0L${rx + 5} ${ry * 0.9}`} />
              <path d={`M${rx + 5 + ry * 0.9} ${-ry * 0.9}L${rx + 5 + ry * 1.9} 0L${rx + 5 + ry * 0.9} ${ry * 0.9}`} opacity={0.55} />
            </g>
            {W >= 360 ? (
              <g className="st-postag" transform={`translate(${-posW / 2} ${-ry - 24})`}>
                <rect width={posW} height={17} rx={4} style={{ stroke: off.accent }} />
                <text x={posW / 2} y={12.5} textAnchor="middle">{offenseAbbr}</text>
              </g>
            ) : null}
          </g>
        </>
      ) : null}
    </svg>
  );
}

type LiveEls = { ball: SVGGElement | null; ribbon: SVGRectElement | null; ribbonHi: SVGRectElement | null; trail: SVGRectElement | null; ring: SVGCircleElement | null; flash: SVGRectElement | null };

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
  if (els.trail) { els.trail.setAttribute("x", String(o.trail?.x ?? 0)); els.trail.setAttribute("width", String(o.trail?.w ?? 0)); }
  if (els.ring) els.ring.setAttribute("r", String(o.ringR));
  if (els.flash) els.flash.style.fillOpacity = String(o.flashOpacity);
}

