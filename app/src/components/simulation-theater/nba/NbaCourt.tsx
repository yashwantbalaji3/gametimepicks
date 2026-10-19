/**
 * NBA Simulation Theater · the court (pure SVG, no hooks; server- and client-safe).
 *
 * Geometry from lib/simulation-theater/nba/court-geometry.mjs (feet). The AWAY end is on the left, the HOME end on the
 * right (the scoreboard's order). Team treatments: the baseline band behind each basket in the team's court colour with
 * its abbreviation, the paint in the team's tint (court lines keep ≥ 3:1 on it, tested), a soft tint inside the arc.
 * A side carrying the clash cues (`patterned`) gets hatched paint and a striped band. Centre: a logo-free wordmark.
 * NO players, ball, shots or possession arrow: the simulation does not model them, so the court never shows them.
 */
import type { CSSProperties } from "react";
import { VIEWBOX, courtGeometry } from "@/lib/simulation-theater/nba/court-geometry.mjs";
import type { NbaPalette, NbaSide, NbaTeams } from "./nba-types";

const G = courtGeometry();

type End = ReturnType<typeof courtGeometry>["left"];

function CourtEnd({ end, side, palette, abbr, id }: { end: End; side: NbaSide; palette: NbaPalette; abbr: string; id: string }) {
  const p = palette[side];
  const paintFill = p.patterned ? `url(#${id}-hatch-${side})` : undefined;
  const bandFill = p.patterned ? `url(#${id}-stripe-${side})` : undefined;
  const bandMidX = end.band.x + end.band.w / 2;
  return (
    <g className={`nba-end is-${side}${p.patterned ? " is-cue" : ""}`} style={{ "--nba-court": p.court, "--nba-court-ink": p.courtInk, "--nba-tint": p.tint } as CSSProperties}>
      <rect className="nba-band" x={end.band.x} y={end.band.y} width={end.band.w} height={end.band.h} fill={bandFill} />
      <text className="nba-band-abbr" x={bandMidX} y={25} transform={`rotate(${end.side === "left" ? -90 : 90} ${bandMidX} 25)`} textAnchor="middle" dominantBaseline="central" aria-hidden="true">{abbr}</text>
      <path className="nba-zone" d={end.zone} />
      <rect className="nba-paint" x={end.lane.x} y={end.lane.y} width={end.lane.w} height={end.lane.h} fill={paintFill} />
      <path className="nba-line" d={end.three} />
      <path className="nba-line" d={end.ftOuter} />
      <path className="nba-line is-dashed" d={end.ftInner} />
      <path className="nba-line" d={end.restricted} />
      <line className="nba-backboard" x1={end.backboard.x1} y1={end.backboard.y1} x2={end.backboard.x2} y2={end.backboard.y2} />
      <line className="nba-connector" x1={end.connector.x1} y1={end.connector.y1} x2={end.connector.x2} y2={end.connector.y2} />
      <circle className="nba-rim" cx={end.rim.cx} cy={end.rim.cy} r={end.rim.r} />
    </g>
  );
}

export default function NbaCourt({ palette, teams, idPrefix }: { palette: NbaPalette; teams: NbaTeams; idPrefix: string }) {
  const id = idPrefix;
  const c = G.center;
  return (
    <svg
      className="nba-court"
      viewBox={G.viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Basketball court, ${teams.away.abbr} end on the left, ${teams.home.abbr} end on the right. No players, ball or shots are drawn: the simulation does not model them.`}
      data-st-colors={palette.mode}
    >
      <defs>
        <pattern id={`${id}-planks`} patternUnits="userSpaceOnUse" width="94" height="2.5">
          <rect className="nba-plank-a" width="94" height="1.25" />
          <rect className="nba-plank-b" y="1.25" width="94" height="1.25" />
        </pattern>
        {(["home", "away"] as const).map((s) => (
          <g key={s}>
            <pattern id={`${id}-hatch-${s}`} patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)">
              <rect width="1.6" height="1.6" style={{ fill: palette[s].tint }} />
              <rect width="0.45" height="1.6" className="nba-hatch-line" />
            </pattern>
            <pattern id={`${id}-stripe-${s}`} patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(45)">
              <rect width="2" height="2" style={{ fill: palette[s].court }} />
              <rect width="0.6" height="2" className="nba-hatch-line" />
            </pattern>
          </g>
        ))}
      </defs>
      <rect className="nba-apron" x={VIEWBOX[0]} y={VIEWBOX[1]} width={VIEWBOX[2]} height={VIEWBOX[3]} />
      <rect className="nba-floor" x={0} y={0} width={G.boundary.w} height={G.boundary.h} fill={`url(#${id}-planks)`} />
      <CourtEnd end={G.left} side="away" palette={palette} abbr={teams.away.abbr} id={id} />
      <CourtEnd end={G.right} side="home" palette={palette} abbr={teams.home.abbr} id={id} />
      <circle className="nba-center-fill" cx={c.cx} cy={c.cy} r={c.r} />
      <line className="nba-line" x1={G.halfCourt.x1} y1={G.halfCourt.y1} x2={G.halfCourt.x2} y2={G.halfCourt.y2} />
      <circle className="nba-line" cx={c.cx} cy={c.cy} r={c.r} />
      <circle className="nba-line" cx={c.cx} cy={c.cy} r={c.inner} />
      <text className="nba-wordmark" x={c.cx} y={c.cy - 3.1} textAnchor="middle" dominantBaseline="central" aria-hidden="true">GTP</text>
      <text className="nba-wordmark is-sub" x={c.cx} y={c.cy + 3.3} textAnchor="middle" dominantBaseline="central" aria-hidden="true">SIMULATED</text>
      <rect className="nba-line nba-boundary" x={0} y={0} width={G.boundary.w} height={G.boundary.h} />
    </svg>
  );
}
