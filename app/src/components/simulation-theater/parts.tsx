/**
 * Simulation Theater V2 · pure shell parts shared by the server shell (final frame, no JS) and the client island.
 * No hooks, no browser APIs. Every value shown is a recorded field or a stated derivation of one.
 */
import type { CSSProperties } from "react";
import type { Palette, Side, Teams } from "./FieldScene";
import type { TheaterEvent, TheaterManifest, TheaterSample } from "./types";
import { LABELS, PERIOD_SHORT, fmtClock, transcriptSentence } from "@/lib/simulation-theater/format.mjs";

export function Banner({ manifest, sample }: { manifest: TheaterManifest; sample: TheaterSample | null }) {
  return (
    <div className="st-banner" role="note">
      <span>
        <b>Simulated</b> · not a real game{sample ? <> · run #{sample.runIndex.toLocaleString("en-US")} of {manifest.runCount.toLocaleString("en-US")}</> : null} · experimental engine
      </span>
      <span>{manifest.teams.away.abbr} @ {manifest.teams.home.abbr} · {LABELS.sample}</span>
    </div>
  );
}

export function SceneBadge() {
  return (
    <span className="st-badge">
      <span className="st-badge-long">{LABELS.badge}</span>
      <span className="st-badge-short">{LABELS.badgeShort}</span>
    </span>
  );
}

function BallGlyph({ on }: { on: boolean }) {
  return (
    <svg className={`st-poss${on ? " on" : ""}`} viewBox="0 0 16 10" aria-hidden="true" focusable="false">
      <ellipse cx="8" cy="5" rx="7" ry="4.2" style={{ fill: "var(--st-ball)", stroke: "var(--lava-text)" }} strokeWidth="1" />
      <path d="M5 5H11M7 3.6V6.4M9 3.6V6.4" style={{ stroke: "var(--lava-text)" }} strokeWidth="0.9" />
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
};

/** Broadcast score bug: away–home order, possession as a ball glyph (shape, never colour alone). */
export function ScoreBug({ teams, palette, score, offense, period, periodClock, clockIllustrative, stateChip, bump, illusId }: BugProps) {
  const team = (side: Side) => (
    <div className="st-team" style={{ "--st-team": palette[side].accent } as CSSProperties}>
      <span className="st-team-bar" aria-hidden="true" />
      <BallGlyph on={offense === side} />
      <span style={{ minWidth: 0 }}>
        <span className="st-team-abbr">{teams[side].abbr}</span>
        <span className="st-team-name">{teams[side].name ?? ""}</span>
      </span>
      <span key={bump ? `${side}-${bump[side]}` : side} className={`st-team-score${bump && bump[side] ? " is-bump" : ""}`}>{score[side]}</span>
    </div>
  );
  const label = `${teams.away.abbr} ${score.away}, ${teams.home.abbr} ${score.home}${offense ? `, ${teams[offense].abbr} ball` : ""}, ${PERIOD_SHORT[period as 1]} sim clock ${fmtClock(periodClock)}${stateChip ? `, ${stateChip}` : ""}`;
  return (
    <div className="st-bug" role="group" aria-label={`Score: ${label}`}>
      {team("away")}
      <span className="st-bug-sep" aria-hidden="true" />
      {team("home")}
      <div className="st-clockbox" aria-describedby={clockIllustrative ? illusId : undefined}>
        <span className="st-clockline">
          <span>{PERIOD_SHORT[period as 1]}</span>
          <span className="st-clocklabel">Sim clock</span>
          <span>{fmtClock(periodClock)}</span>
        </span>
        <span className="st-illus" title={clockIllustrative ? LABELS.clockIllustrative : undefined}>{clockIllustrative ? "clock illustrative" : ""}</span>
        <span id={illusId} className="st-sr">{LABELS.clockIllustrative}</span>
      </div>
      <div className={`st-statechip${stateChip ? " on" : ""}`} aria-hidden="true">{stateChip ?? "SIM"}</div>
    </div>
  );
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
