/**
 * NBA Simulation Theater · POSSESSION PLAYBACK · presentational parts (pure; no hooks; server- and client-safe).
 *
 * OfficialProjectionPanel takes ONLY the official panel data (payload.official, built from the official snapshot) and
 * the team names — it has no run input at all, so no run selection can change it (tested: byte-identical markup).
 * Everything else renders one run: its event log, the fold of that log, and the reconciliation checks.
 */
import { Fragment } from "react";
import type { CSSProperties } from "react";
import type { NbaPalette, NbaSide } from "../nba-types";
import { teamStyle } from "../nba-parts";
import type { PbOfficial, PbPayload, PbRun } from "./possession-types";
import { BOX_COLUMNS, fmtMinutes } from "@/lib/simulation-theater/nba/possession/box.mjs";
import { fmtClockDs, periodLabel } from "@/lib/simulation-theater/nba/possession/playback.mjs";
import {
  DEFAULT_RUN_SUBTITLE, DEFAULT_RUN_TITLE, ENGINE_NOTE, OFFICIAL_PANEL_NOTE, OFFICIAL_PANEL_TITLE, OUTCOME_PANEL_TITLE, POSSESSION_BANNER,
  POSSESSION_NOT_MODELLED, WHAT_IF_BANNER, WHAT_IF_TAG, WHAT_IS_REAL, WITHHELD,
} from "@/lib/simulation-theater/nba/possession/labels.mjs";

type Teams = PbPayload["teams"];
const COLS = BOX_COLUMNS as unknown as [string, string][];
const SIDES: NbaSide[] = ["away", "home"];
const fmt1 = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—");
const fmtUtc = (iso: string | null) => (iso ? `${iso.replace("T", " ").replace(/\.\d+Z$/, "Z").replace(/:\d\dZ$/, "Z").replace("Z", " UTC")}` : "—");

export function PossessionBanner() {
  return <p className="nbp-banner" role="note" data-nbp-banner="">{POSSESSION_BANNER}</p>;
}

export function PossessionUnavailable({ title, reason }: { title: string; reason: string }) {
  return (
    <section className="nbp-unavailable" aria-label={title} data-nbp-unavailable="">
      <h2>{title}</h2>
      <p>{reason}</p>
    </section>
  );
}

/** THE OFFICIAL PROJECTION PANEL — the canonical forecast only (never computed from a run). */
export function OfficialProjectionPanel({ official, teams }: { official: PbOfficial | null; teams: Teams }) {
  if (!official) {
    return (
      <section className="nbp-panel is-official" aria-label={OFFICIAL_PANEL_TITLE} data-nbp-official="none">
        <h2>{OFFICIAL_PANEL_TITLE}</h2>
        <p className="nbp-note">No official forecast receipt for this game yet. Every run below is a hypothetical what-if, not the forecast.</p>
      </section>
    );
  }
  const fav = official.favouredSide === "HOME" ? teams.home : official.favouredSide === "AWAY" ? teams.away : null;
  const w = official.withheld ?? {};
  const Withheld = ({ why }: { why?: string }) => <span className="nbp-withheld" title={why}>{WITHHELD}{why ? <span className="st-sr"> · {why}</span> : null}</span>;
  const players = (side: NbaSide) => official.players.filter((p) => p.team === side);
  return (
    <section className="nbp-panel is-official" aria-label={OFFICIAL_PANEL_TITLE} data-nbp-official={official.snapshotId}>
      <h2>{OFFICIAL_PANEL_TITLE}</h2>
      <p className="nbp-note" style={{ marginTop: 0 }}>{OFFICIAL_PANEL_NOTE}</p>
      <dl className="nbp-kv">
        <dt>Favoured side</dt><dd data-nbp-official-side="">{fav ? `${fav.name} (${fav.abbr}, ${official.favouredSide === "HOME" ? "home" : "away"}) · Elo rating` : WITHHELD}</dd>
        <dt>Win probability</dt><dd><Withheld why={w.winProbability} /></dd>
        <dt>Projected score</dt><dd><Withheld why={w.teamScores} /></dd>
        <dt>Margin and total</dt><dd><Withheld why={w.teamScores} /></dd>
        <dt>Player ranges</dt><dd><Withheld why={w.playerRanges} /> · medians only</dd>
        <dt>Odds and picks</dt><dd><Withheld why={w.markets} /></dd>
        <dt>Game model</dt><dd>{official.models.game ?? "—"}</dd>
        <dt>Player model</dt><dd>{official.models.players.join(", ") || "—"}</dd>
        <dt>Frozen</dt><dd>{fmtUtc(official.frozenAt)}</dd>
        <dt>Locks at tip</dt><dd>{fmtUtc(official.lockAt)}</dd>
      </dl>
      <details className="nbp-details">
        <summary>Official player medians ({official.players.length} players)</summary>
        {SIDES.map((side) => (
          <div key={side} className="nbp-scroll">
            <table className="nbp-table" data-nbp-official-players={side}>
              <caption>{teams[side].abbr} · official medians</caption>
              <thead><tr><th scope="col">Player</th><th scope="col">MIN</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th><th scope="col">3PM</th></tr></thead>
              <tbody>
                {players(side).map((p) => (
                  <tr key={p.playerId}><td>{p.displayName ?? p.playerId}</td><td>{fmt1(p.medians.minutes)}</td><td>{fmt1(p.medians.pts)}</td><td>{fmt1(p.medians.reb)}</td><td>{fmt1(p.medians.ast)}</td><td>{fmt1(p.medians.threePm)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </details>
    </section>
  );
}

/** Run chips: a radiogroup (arrow keys move between runs, as the shared chips do). */
export function RunSelector({ runs, selected, onSelect, idBase }: { runs: PbRun[]; selected: number; onSelect: (i: number) => void; idBase: string }) {
  return (
    <div role="radiogroup" aria-label="Simulated runs" className="nbp-runs" id={`${idBase}-runs`}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const n = (selected + (e.key === "ArrowRight" ? 1 : runs.length - 1)) % runs.length;
        onSelect(n);
        (e.currentTarget.querySelectorAll("button")[n] as HTMLButtonElement | undefined)?.focus();
      }}>
      {runs.map((r, i) => (
        <button key={r.kind} type="button" role="radio" aria-checked={i === selected} tabIndex={i === selected ? 0 : -1} className="nbp-run" data-nbp-run-kind={r.kind} onClick={() => onSelect(i)}>
          <span className="nbp-run-tag">{r.hypothetical ? WHAT_IF_TAG : "Default run · supporting simulation"}</span>
          {r.title} · run {r.runIndex}
        </button>
      ))}
    </div>
  );
}

export function RunRole({ run }: { run: PbRun }) {
  if (!run.hypothetical) {
    return (
      <div className="nbp-role" role="note" data-nbp-role="default">
        <p><b>{DEFAULT_RUN_TITLE}</b> · {DEFAULT_RUN_SUBTITLE}</p>
        <p className="nbp-note">Chosen by rule, not by hand: {run.rule}{run.distance != null ? ` (distance ${run.distance.toFixed(2)})` : ""}.</p>
      </div>
    );
  }
  return (
    <div className="nbp-role is-whatif" role="note" data-nbp-role="what-if">
      <p className="nbp-whatif-banner" data-nbp-whatif-banner="">{WHAT_IF_BANNER}</p>
      <p><b>{run.title}</b> · one stored run, picked by rule: {run.rule}.</p>
    </div>
  );
}

type Frame = { phase: string; label: string; name: string; clockDs: number; score: { home: number; away: number }; possession: 0 | 1 | null; breakKind: string | null; periodScores: { q: number; label: string; home: number; away: number; started: boolean }[] };

export function PossessionScoreboard({ teams, palette, frame }: { teams: Teams; palette: NbaPalette; frame: Frame }) {
  const lead = frame.score.home === frame.score.away ? null : frame.score.home > frame.score.away ? "home" : "away";
  const has = frame.possession === 0 ? "home" : frame.possession === 1 ? "away" : null;
  const team = (side: NbaSide) => (
    <div className={`nba-sb-team is-${side}${palette[side].patterned ? " is-cue" : ""}${lead === side && frame.phase === "FINAL" ? " is-winner" : ""}`} style={teamStyle(palette, side)}>
      <span className="nba-sb-bar" aria-hidden="true" />
      <span className="nba-sb-abbr">{teams[side].abbr}{has === side ? <span aria-hidden="true"> ●</span> : null}</span>
      <span className="nba-sb-score" data-nbp-score={side}>{frame.score[side]}</span>
    </div>
  );
  const status = frame.phase === "FINAL" ? "Final" : frame.phase === "BREAK" ? (frame.breakKind === "HALFTIME" ? "Halftime" : `End of ${frame.label}`) : frame.label;
  return (
    <div className="nba-sb is-team" role="group" aria-label="Scoreboard, simulated game" data-nbp-scoreboard="">
      <div className="nba-sb-row">
        {team("away")}
        <div className="nbp-sb-mid">
          <span className="nbp-sb-period" data-nbp-period="">{status}</span>
          {frame.phase === "LIVE" ? <span className="nbp-sb-clock" data-nbp-clock=""><span className="st-sr">game clock </span>{fmtClockDs(frame.clockDs)}</span> : null}
        </div>
        {team("home")}
      </div>
      <div className="nba-sb-foot">
        <span className="nba-sb-sim">Simulated · possession-level</span>
        <span className="nba-sb-tag">score, clock and possession from the engine&apos;s event log</span>
      </div>
    </div>
  );
}

export function PossessionIndicator({ teams, frame }: { teams: Teams; frame: Frame }) {
  const has = frame.possession === 0 ? "home" : frame.possession === 1 ? "away" : null;
  return (
    <div className="nbp-poss" role="status" aria-live="off" data-nbp-possession={has ?? "none"}>
      <span>{teams.away.abbr}</span>
      <span className="nbp-poss-bar" aria-hidden="true"><span className={`nbp-poss-dot${has === "home" ? " is-home" : has === "away" ? "" : " is-none"}`} /></span>
      <span>{teams.home.abbr}</span>
      <span className="st-sr">{has ? `Possession: ${teams[has].abbr}` : "No possession (dead ball between periods)"}</span>
    </div>
  );
}

export function Linescore({ teams, frame, final }: { teams: Teams; frame: Frame; final: boolean }) {
  return (
    <div className="nbp-scroll">
      <table className="nbp-table" data-nbp-linescore="">
        <caption>Quarter-by-quarter scoring{final ? " · final" : " · so far"}</caption>
        <thead><tr><th scope="col">Team</th>{frame.periodScores.map((p) => <th key={p.q} scope="col">{p.label}</th>)}<th scope="col">T</th></tr></thead>
        <tbody>
          {SIDES.map((side) => (
            <tr key={side}><td>{teams[side].abbr}</td>{frame.periodScores.map((p) => <td key={p.q}>{p.started ? p[side] : "—"}</td>)}<td>{frame.score[side]}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Team scoring progression: each team's running score against game time, up to the current play. */
export function ScoringProgression({ compiled, k, teams, palette }: { compiled: { events: { t: number; s: [number, number] }[]; tEnd: number; periods: { startT: number; label: string }[]; final: { home: number; away: number } }; k: number; teams: Teams; palette: NbaPalette }) {
  const W = 600, H = 170, P = 28;
  const maxS = Math.max(compiled.final.home, compiled.final.away, 10);
  const x = (t: number) => P + (t / compiled.tEnd) * (W - P - 8);
  const y = (s: number) => H - 20 - (s / maxS) * (H - 34);
  const pts = (side: 0 | 1) => {
    const out: string[] = [`${x(0).toFixed(1)},${y(0).toFixed(1)}`];
    let prev = 0;
    for (let j = 0; j <= k && j < compiled.events.length; j += 1) {
      const e = compiled.events[j];
      if (e.s[side] !== prev) { out.push(`${x(e.t).toFixed(1)},${y(prev).toFixed(1)}`, `${x(e.t).toFixed(1)},${y(e.s[side]).toFixed(1)}`); prev = e.s[side]; }
    }
    const last = compiled.events[Math.min(k, compiled.events.length - 1)];
    out.push(`${x(last.t).toFixed(1)},${y(prev).toFixed(1)}`);
    return out.join(" ");
  };
  const style = { "--nbp-home": palette.home.fill, "--nbp-away": palette.away.fill } as CSSProperties;
  const cur = compiled.events[Math.min(k, compiled.events.length - 1)];
  return (
    <figure style={{ margin: 0, ...style }}>
      <svg className="nbp-prog" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Team scoring progression so far: ${teams.away.abbr} ${cur.s[1]}, ${teams.home.abbr} ${cur.s[0]}`} data-nbp-progression="">
        <line className="nbp-prog-axis" x1={P} y1={H - 20} x2={W - 8} y2={H - 20} />
        {compiled.periods.map((p) => (
          <g key={p.label}><line className="nbp-prog-axis" x1={x(p.startT)} y1={8} x2={x(p.startT)} y2={H - 20} /><text x={x(p.startT) + 3} y={H - 6}>{p.label}</text></g>
        ))}
        <polyline className="nbp-prog-away" points={pts(1)} />
        <polyline className="nbp-prog-home" points={pts(0)} />
        <text x={4} y={14}>{maxS}</text>
      </svg>
      <figcaption className="nbp-note">Solid line {teams.home.abbr} · dashed line {teams.away.abbr} · steps at every made basket and free throw of this run.</figcaption>
    </figure>
  );
}

type FeedItem = { k: number; q: number; c: number; text: string; scoring: boolean; s: [number, number] };
export function PlayByPlay({ items, teams, newest, motion }: { items: FeedItem[]; teams: Teams; newest: number; motion: boolean }) {
  return (
    <ol className="nbp-feed" reversed aria-label="Play-by-play, newest first" data-nbp-feed="">
      {items.map((it) => (
        <li key={it.k} className={`${it.scoring ? "is-scoring" : ""}${motion && it.k === newest ? " nbp-new" : ""}`} data-nbp-play={it.k}>
          <span className="nbp-feed-when">{periodLabel(it.q)} {fmtClockDs(it.c)}</span>
          <span>{it.text} <span className="nbp-feed-sim">· simulated</span></span>
          <span className="nbp-feed-score">{teams.away.abbr} {it.s[1]}–{it.s[0]} {teams.home.abbr}</span>
        </li>
      ))}
    </ol>
  );
}

type Row = { providerAthleteId: string; name: string | null; ds: number; [k: string]: number | string | null };
type Rows = { home: Row[]; away: Row[]; totals: { home: Record<string, number>; away: Record<string, number> } };
export function PossessionBoxScore({ rows, teams, final, idBase }: { rows: Rows; teams: Teams; final: boolean; idBase: string }) {
  return (
    <div data-nbp-box={final ? "final" : "live"} id={`${idBase}-box`}>
      {SIDES.map((side) => (
        <div key={side} className="nbp-scroll">
          <table className="nbp-table" data-nbp-box-team={side}>
            <caption>{teams[side].name} · {final ? "final box score of this simulated game" : "box score so far (this simulated game)"}</caption>
            <thead><tr><th scope="col">Player</th>{COLS.map(([, label]) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {rows[side].map((r) => (
                <tr key={r.providerAthleteId} data-nbp-player={r.providerAthleteId}>
                  <td>{r.name ?? r.providerAthleteId}</td>
                  {r.ds === 0 && final ? <td colSpan={COLS.length}>did not play in this run</td> : COLS.map(([key]) => <td key={key}>{key === "min" ? fmtMinutes(r.ds) : String(r[key])}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Team</td>{COLS.map(([key]) => <td key={key}>{key === "min" ? String(Math.round(rows.totals[side].ds / 600)) : String(rows.totals[side][key])}</td>)}</tr>
            </tfoot>
          </table>
          <p className="nbp-note">Team rebounds (not credited to a player): {rows.totals[side].teamRebounds}. REB = offensive + defensive player rebounds.</p>
        </div>
      ))}
    </div>
  );
}

export function ReconciliationChecks({ result }: { result: { ok: boolean; checks: { id: string; label: string; ok: boolean; detail: string }[] } }) {
  return (
    <div data-nbp-reconcile={result.ok ? "pass" : "fail"}>
      <p className="nbp-note" style={{ marginTop: 0 }}>{result.ok ? "Every check passes for this run:" : "A check failed — this run is not shown as a valid game:"}</p>
      <ul className="nbp-checks">
        {result.checks.map((c) => <li key={c.id} className={c.ok ? "" : "is-fail"} data-nbp-check={c.id}>{c.ok ? "✓" : "✗"} {c.label}{c.detail ? ` · ${c.detail}` : ""}</li>)}
      </ul>
    </div>
  );
}

type Cmp = { playerId: string; team: string | null; name: string | null; families: { family: string; label: string; official: number | null; run: number | null; diff: number | null }[] };
export function OfficialComparison({ rows, teams }: { rows: Cmp[]; teams: Teams }) {
  return (
    <div className="nbp-scroll">
      <table className="nbp-table" data-nbp-compare="">
        <caption>This run vs the official median, per player</caption>
        <thead><tr><th scope="col">Player</th>{rows[0]?.families.map((f) => <th key={f.family} scope="col">{f.label} run / official</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId}>
              <td>{r.name ?? r.playerId} <span className="nbp-feed-sim">{r.team === "home" ? teams.home.abbr : r.team === "away" ? teams.away.abbr : ""}</span></td>
              {r.families.map((f) => <td key={f.family}>{f.run == null ? "not in run" : f.label === "MIN" ? f.run.toFixed(1) : f.run} / {fmt1(f.official)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="nbp-note">Official medians are the forecast&apos;s middle outcome over many simulated games and can be fractional; this run is one game, so its numbers are whole. Neither is rounded into the other.</p>
    </div>
  );
}

export function EndCard({ run, teams, official, onReplay, boxHref }: { run: PbRun; teams: Teams; official: PbOfficial | null; onReplay: () => void; boxHref: string }) {
  const winner = run.final.home > run.final.away ? teams.home : teams.away;
  const fav = official?.favouredSide === "HOME" ? teams.home : official?.favouredSide === "AWAY" ? teams.away : null;
  return (
    <section className="nbp-card" aria-label="Final, this simulated game" data-nbp-endcard="">
      <h3>Final · this simulated game{run.overtimePeriods ? ` · ${run.overtimePeriods === 1 ? "overtime" : `${run.overtimePeriods} overtimes`}` : ""}</h3>
      <p><b>{teams.away.abbr} {run.final.away} – {run.final.home} {teams.home.abbr}</b> · {winner.name} win this run.</p>
      <p>{fav ? `The official projection favours ${fav.name}; in this run ${winner.abbr === fav.abbr ? "the favoured side won" : "the favoured side lost"}. One run is not the forecast.` : "There is no official favoured side for this game."}</p>
      {run.hypothetical ? <p className="nbp-whatif-banner">{WHAT_IF_BANNER}</p> : null}
      <div className="nbp-actions">
        <button type="button" className="nbp-ctl is-primary" onClick={onReplay}>Replay from tip-off</button>
        <a className="nbp-switch" href={boxHref}>Jump to the box score</a>
      </div>
    </section>
  );
}

export function BreakNotice({ frame, teams }: { frame: Frame; teams: Teams }) {
  if (frame.phase !== "BREAK") return null;
  const tied = frame.score.home === frame.score.away;
  const title = frame.breakKind === "HALFTIME" ? "Halftime" : frame.breakKind === "BEFORE_OT" ? (tied ? "Tied — overtime" : `End of ${frame.label}`) : `End of the ${frame.name}`;
  return (
    <section className="nbp-card" aria-label={title} data-nbp-break={frame.breakKind ?? ""}>
      <h3>{title}</h3>
      <p>{teams.away.abbr} {frame.score.away} – {frame.score.home} {teams.home.abbr}{frame.breakKind === "BEFORE_OT" && tied ? " · the game is tied, so a 5-minute overtime is played" : ""}</p>
    </section>
  );
}

export function EngineFacts({ payload }: { payload: PbPayload }) {
  const e = payload.engine;
  return (
    <>
      <p className="nbp-note" style={{ marginTop: 0 }}>{WHAT_IS_REAL}</p>
      <p className="nbp-note">{ENGINE_NOTE}</p>
      <dl className="nbp-kv" style={{ marginTop: 8 }}>
        <dt>Engine</dt><dd>{e.label}</dd>
        <dt>Inputs as of</dt><dd>{fmtUtc(e.inputAsOf)} (before tip; the same as-of inputs the supporting simulation used)</dd>
        <dt>Seed pool</dt><dd>{e.poolSize.toLocaleString("en-US")} seeded runs, {e.poolChecked?.toLocaleString("en-US") ?? "—"} checked, {e.poolViolations ?? "—"} invariant violations</dd>
        <dt>Checks</dt><dd>{e.checker}</dd>
      </dl>
      <details className="nbp-details">
        <summary>How the runs on this page were chosen</summary>
        <dl className="nbp-kv">
          {Object.entries(payload.selection.rules).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
      </details>
      <h3 className="nba-h3">Not modelled</h3>
      <ul className="nbp-limits">{POSSESSION_NOT_MODELLED.map((x: string) => <li key={x}>{x}</li>)}</ul>
    </>
  );
}

export { OUTCOME_PANEL_TITLE };
