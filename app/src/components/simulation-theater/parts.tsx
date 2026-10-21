/**
 * Simulation Theater V2 · pure shell parts shared by the server shell (final frame, no JS) and the client island.
 * No hooks, no browser APIs. Every value shown is a recorded field or a stated derivation of one.
 */
import type { CSSProperties, Ref } from "react";
import type { Palette, Side, Teams } from "./FieldScene";
import type { TheaterEvent, TheaterManifest, TheaterSample } from "./types";
import { LABELS, PERIOD_SHORT, fieldPosition, fmtClock, fmtDuration, plural, transcriptSentence } from "@/lib/simulation-theater/format.mjs";
import { relLuminance } from "@/lib/simulation-theater/nfl-team-colors.mjs";

/**
 * Score-bug depth (iteration 7): the official fill stays the block's colour; the gradient only ever moves AWAY from the
 * block's ink (a light lift at the top under dark ink, a shade at the bottom under light ink), so the ink's contrast can
 * only rise above the flat fill's ≥4.5:1 (theater-broadcast.test.mjs checks all 32 teams). Returns the CSS class.
 */
export function depthClass(ink: string) {
  return /^#[0-9a-f]{6}$/i.test(ink) && relLuminance(ink) < 0.18 ? "is-lift" : "is-shade";
}

export type Situation = { kind: "start" | "progress" | "recorded"; text: string; tag: string };

/**
 * ILLUSTRATIVE PAIRING (iteration 8). Every interpolated value the theater renders (the clock between a drive's recorded
 * instants, the in-drive yardage, a mid-drive quarter rollover's timing) carries `data-st-interp`, and sits inside a
 * `data-st-interp-scope` that also holds its visible `data-st-interp-tag` ("illustrative" / "clock illustrative"). The
 * value and its tag share one no-wrap unit, so no width can separate them; theater-broadcast.test.mjs and the e2e spec
 * fail if any interpolated value renders without its tag.
 */
export const INTERP = { value: "data-st-interp", scope: "data-st-interp-scope", tag: "data-st-interp-tag" } as const;

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
  /** iteration 7: the score each side rolls FROM (digit roll, only while playing); null = no roll */
  from?: { home: number | null; away: number | null };
  illusId: string;
  clockRef?: Ref<HTMLSpanElement>;
  /** iteration 7: the drive strip (lib/simulation-theater/broadcast.mjs driveSituation) and its per-frame yardage span */
  situation?: Situation | null;
  sitYardsRef?: Ref<HTMLSpanElement>;
};

/**
 * Broadcast score bug: away–home order, team blocks, large tabular score, quarter and SIM CLOCK. With team colours on
 * (palette.mode "team"), each block is filled with the team's colour, its text in the team's ink (≥4.5:1, tested) and
 * its bar in the team's trim (striped trim on the block's own fill for the side carrying the clash cues); the clock cell
 * stays GTP-neutral, the frame. Possession = ball glyph + an underline on the
 * team block (shape and position, never colour alone). No timeouts: the engine records none. The clock's
 * "illustrative" tag shows whenever it is interpolated between recorded instants.
 */
export function ScoreBug({ teams, palette, score, offense, period, periodClock, clockIllustrative, stateChip, bump, from, illusId, clockRef, situation, sitYardsRef }: BugProps) {
  const rollFrom = (side: Side) => (from && from[side] != null && from[side] !== score[side] ? from[side] : null);
  const team = (side: Side) => {
    const has = offense === side;
    const p = palette[side];
    const teamMode = palette.mode === "team";
    const vars = teamMode
      ? { "--st-team": p.accent, "--st-team-fill": p.fill, "--st-team-ink": p.ink, "--st-team-trim": p.trim }
      : { "--st-team": p.accent };
    return (
      <div className={`st-bug-team${teamMode ? ` is-team ${depthClass(p.ink)}` : ""}${teamMode && p.patterned ? " is-cue" : ""}${has ? " has-ball" : ""}`} style={vars as CSSProperties} data-st-team={teams[side].abbr}>
        <span className="st-bug-bar" aria-hidden="true" />
        <span className="st-bug-abbr">{teams[side].abbr}</span>
        {has ? <><BallGlyph /><span className="st-sr"> has the ball, </span></> : <span className="st-sr">, </span>}
        {rollFrom(side) != null ? (
          /* digit roll: the previous score (generated content with empty alt text, so it is never read) rolls up and out */
          <span key={`${side}-${score[side]}`} className="st-bug-score is-roll"><span className="st-roll" data-from={rollFrom(side) ?? undefined}>{score[side]}</span></span>
        ) : (
          <span key={bump ? `${side}-${bump[side]}` : side} className={`st-bug-score${bump && bump[side] ? " is-bump" : ""}`}>{score[side]}</span>
        )}
      </div>
    );
  };
  return (
    <div className="st-bug" role="group" aria-label="Score bug">
      <div className="st-bug-teams">
        {team("away")}
        {team("home")}
      </div>
      <div className="st-bug-clock" aria-describedby={clockIllustrative ? illusId : undefined} data-st-interp-scope={clockIllustrative ? "clock" : undefined}>
        <span className="st-bug-q" data-st-interp={clockIllustrative ? "period" : undefined}>{PERIOD_SHORT[period as 1]}</span>
        <span className="st-bug-time" data-st-interp={clockIllustrative ? "clock" : undefined}><span className="st-sr">sim clock </span><span ref={clockRef}>{fmtClock(periodClock)}</span></span>
        <span className="st-bug-cl" aria-hidden="true">Sim clock</span>
        <span className={`st-bug-illus${clockIllustrative ? " on" : ""}`} data-st-interp-tag={clockIllustrative ? "" : undefined}>{clockIllustrative ? "clock illustrative" : "at recorded instant"}</span>
        <span id={illusId} className="st-sr">{LABELS.clockIllustrative}</span>
      </div>
      {stateChip ? <div className="st-bug-state">{stateChip}</div> : null}
      {situation ? (
        <div className={`st-bug-sit is-${situation.kind}`} data-st-situation={situation.kind}>
          <span className="st-bug-sit-text">{situation.text}</span>
          {situation.kind === "progress" ? (
            /* the illustrative yardage and its tag: one unit that never wraps apart (iteration 8) */
            <span className="st-bug-sit-illus" data-st-interp-scope="yards">
              <span className="st-bug-sit-yds" ref={sitYardsRef} data-st-interp="yards" />
              <span className={`st-bug-sit-tag is-${situation.tag}`} data-st-interp-tag="">{situation.tag}</span>
            </span>
          ) : (
            <span className={`st-bug-sit-tag is-${situation.tag}`}>{situation.tag}</span>
          )}
        </div>
      ) : null}
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
