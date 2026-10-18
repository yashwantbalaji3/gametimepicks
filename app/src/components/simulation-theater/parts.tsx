/**
 * Simulation Theater V2 · pure shell parts shared by the server shell (final frame, no JS) and the client island.
 * No hooks, no browser APIs. Every value shown is a recorded field or a stated derivation of one.
 */
import type { CSSProperties, Ref } from "react";
import type { Palette, Side, Teams } from "./FieldScene";
import type { TheaterEvent, TheaterManifest, TheaterSample } from "./types";
import { LABELS, PERIOD_SHORT, fieldPosition, fmtClock, fmtDuration, plural, transcriptSentence } from "@/lib/simulation-theater/format.mjs";

export function Banner({ manifest, sample }: { manifest: TheaterManifest; sample: TheaterSample | null }) {
  return (
    <div className="st-banner" role="note" aria-label="Simulation disclosure">
      <span>
        <b>Simulated</b> · not a real game{sample ? <> · run #{sample.runIndex.toLocaleString("en-US")} of {manifest.runCount.toLocaleString("en-US")}</> : null} · experimental engine
      </span>
      <span>{manifest.teams.away.abbr} @ {manifest.teams.home.abbr} · NFL drive-level simulation</span>
    </div>
  );
}

/** The persistent scene badge (spec §1.3). One exact string at every width: it wraps, it is never shortened. */
export function SceneBadge() {
  return <p className="st-badge" data-st-disclosure="">{LABELS.badge}</p>;
}

function BallGlyph() {
  return (
    <svg className="st-poss" viewBox="0 0 18 12" aria-hidden="true" focusable="false">
      <ellipse cx="9" cy="6" rx="8" ry="5" />
      <path d="M3.4 3.6V8.4M14.6 3.6V8.4M6.5 6H11.5M7.6 4.6V7.4M9 4.6V7.4M10.4 4.6V7.4" />
    </svg>
  );
}

export type BugProps = {
  teams: Teams;
  palette: Palette;
  score: { home: number; away: number };
  offense: Side | null;
  period: number;
  periodClock: number;
  clockIllustrative: boolean;
  stateChip: string | null;
  bump?: { home: number; away: number };
  illusId: string;
  clockRef?: Ref<HTMLSpanElement>;
};

/**
 * Broadcast score bug: away–home order, team blocks, large tabular score, quarter and SIM CLOCK. With team colours on
 * (palette.mode "team"), each block is filled with the team's colour, its text in the team's ink (≥4.5:1, tested) and
 * its bar in the team's trim; the clock cell stays GTP-neutral, the frame. Possession = ball glyph + an underline on the
 * team block (shape and position, never colour alone). No timeouts: the engine records none. The clock's
 * "illustrative" tag shows whenever it is interpolated between recorded instants.
 */
export function ScoreBug({ teams, palette, score, offense, period, periodClock, clockIllustrative, stateChip, bump, illusId, clockRef }: BugProps) {
  const team = (side: Side) => {
    const has = offense === side;
    const p = palette[side];
    const teamMode = palette.mode === "team";
    const vars = teamMode
      ? { "--st-team": p.accent, "--st-team-fill": p.fill, "--st-team-ink": p.ink, "--st-team-trim": p.trim }
      : { "--st-team": p.accent };
    return (
      <div className={`st-bug-team${teamMode ? " is-team" : ""}${has ? " has-ball" : ""}`} style={vars as CSSProperties} data-st-team={teams[side].abbr}>
        <span className="st-bug-bar" aria-hidden="true" />
        <span className="st-bug-abbr">{teams[side].abbr}</span>
        {has ? <><BallGlyph /><span className="st-sr"> has the ball, </span></> : <span className="st-sr">, </span>}
        <span key={bump ? `${side}-${bump[side]}` : side} className={`st-bug-score${bump && bump[side] ? " is-bump" : ""}`}>{score[side]}</span>
      </div>
    );
  };
  return (
    <div className="st-bug" role="group" aria-label="Score bug">
      <div className="st-bug-teams">
        {team("away")}
        {team("home")}
      </div>
      <div className="st-bug-clock" aria-describedby={clockIllustrative ? illusId : undefined}>
        <span className="st-bug-q">{PERIOD_SHORT[period as 1]}</span>
        <span className="st-bug-time"><span className="st-sr">sim clock </span><span ref={clockRef}>{fmtClock(periodClock)}</span></span>
        <span className="st-bug-cl" aria-hidden="true">Sim clock</span>
        <span className={`st-bug-illus${clockIllustrative ? " on" : ""}`}>{clockIllustrative ? "clock illustrative" : "at recorded instant"}</span>
        <span id={illusId} className="st-sr">{LABELS.clockIllustrative}</span>
      </div>
      {stateChip ? <div className="st-bug-state">{stateChip}</div> : null}
    </div>
  );
}

/** The recorded drive summary: plays, net yards, game-clock duration, result. Used on the field and as the mobile card. */
export function driveFacts(ev: TheaterEvent, teams: Teams) {
  const def = teams[ev.offense === "home" ? "away" : "home"].abbr;
  return {
    head: `${teams[ev.offense].abbr} ball · ${fieldPosition(ev.fieldStart, def)}`,
    plays: plural(ev.plays, "play"),
    yards: plural(ev.netYards, "yard"),
    time: fmtDuration(ev.seconds),
    result: `${ev.outcomeLabel}${ev.outcome === "OPP_TD" || ev.outcome === "SAFETY" ? ` · ${def}` : ""}`,
  };
}

export function Linescore({ sample, teams }: { sample: TheaterSample; teams: Teams }) {
  const ps = sample.periodScores;
  const fin = sample.finalScore;
  if (!ps || !fin) return null;
  const cols = fin.overtime ? [0, 1, 2, 3, 4] : [0, 1, 2, 3];
  return (
    <div className="st-scroll" role="region" aria-label="Linescore for this run" tabIndex={0}>
      <table className="st-line">
        <caption className="st-sr">Points by period in run #{sample.runIndex}; credited to the period in which each scoring drive ended</caption>
        <thead>
          <tr><th scope="col">Team</th>{cols.map((c) => <th key={c} scope="col">{c === 4 ? "OT" : `Q${c + 1}`}</th>)}<th scope="col">F</th></tr>
        </thead>
        <tbody>
          {(["away", "home"] as Side[]).map((s) => (
            <tr key={s}><th scope="row">{teams[s].abbr}</th>{cols.map((c) => <td key={c}>{ps[s][c]}</td>)}<td><b>{fin[s]}</b></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TranscriptList({ events, teams, current }: { events: TheaterEvent[]; teams: Teams; current: number | null }) {
  return (
    <ol>
      {events.map((ev) => (
        <li key={ev.index} aria-current={current === ev.index ? "true" : undefined}>{transcriptSentence(ev, teams)}</li>
      ))}
    </ol>
  );
}

export function Transcript({ sample, teams, current, open = false }: { sample: TheaterSample; teams: Teams; current: number | null; open?: boolean }) {
  return (
    <details className="st-transcript" open={open} id={`st-transcript-${sample.runIndex}`}>
      <summary>Full drive transcript · {sample.events.length} drives · run #{sample.runIndex}</summary>
      <p className="st-eyebrow" style={{ margin: "2px 0 0" }}>{LABELS.badge}</p>
      <TranscriptList events={sample.events} teams={teams} current={current} />
    </details>
  );
}

/** Fail-closed state (spec §4.3 rule 7): readable reasons, never a guessed scene, never another run in its place. */
export function Unavailable({ title, reason, items }: { title: string; reason: string; items?: { code: string; detail: string }[] }) {
  return (
    <div className="st-unavail" role="status">
      <h2>{title}</h2>
      <p style={{ margin: 0 }}>{reason}</p>
      {items && items.length ? (
        <ul>{items.slice(0, 8).map((e, i) => <li key={i}>{e.code}: {e.detail}</li>)}</ul>
      ) : null}
    </div>
  );
}

/** The always-visible limitations line under the field (spec §1.2/§1.3). */
export function FieldLegend({ homeAbbr }: { homeAbbr: string }) {
  return (
    <ul className="st-legend" aria-label="How to read the field">
      <li><span className="st-key st-key-start" aria-hidden="true" />start and end spots: recorded</li>
      <li><span className="st-key st-key-ball" aria-hidden="true" />ball path between them: illustrative</li>
      <li>sim clock exact at drive start/end, illustrative between</li>
      <li>fixed orientation: {homeAbbr} (home) defends the left end zone all game</li>
    </ul>
  );
}
