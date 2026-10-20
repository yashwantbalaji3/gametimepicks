/**
 * NBA Simulation Theater · pure parts (no hooks, no browser APIs): rendered by the client island and by the tests.
 *
 * Every value is either recorded in the sample (quarter-end scores, team and player GAME totals, run index, rule) or a
 * stated derivation of one. The only interpolated values are the score and clock between quarter checkpoints and the
 * straight lines joining checkpoints on the timeline; each is marked with the shared iteration-8 pairing (INTERP from
 * ../parts): `data-st-interp` on the value, inside a `data-st-interp-scope` that holds a VISIBLE `data-st-interp-tag`
 * reading "illustrative". nba-theater.test.mjs fails if any interpolated value renders without it.
 */
import type { CSSProperties } from "react";
import { FIXTURE_BANNER, LABEL_TITLES, NBA_PRIVATE_BANNER } from "@/lib/simulation-theater/nba/labels.mjs";
import { fmtGameClock, statLeaders } from "@/lib/simulation-theater/nba/timeline.mjs";
import type { NbaCompiled, NbaFrame, NbaManifest, NbaPalette, NbaPlayerLine, NbaSample, NbaSide, NbaTeams } from "./nba-types";

export const SIDES: NbaSide[] = ["away", "home"];
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const fmtMin = (m: number) => (m === 0 ? "0" : (Math.round(m * 10) / 10).toFixed(1));
export const ILLUS_TAG = "illustrative";

export function teamStyle(palette: NbaPalette, side: NbaSide): CSSProperties {
  const p = palette[side];
  return { "--nba-fill": p.fill, "--nba-ink": p.ink, "--nba-trim": p.trim, "--nba-court": p.court, "--nba-tint": p.tint } as CSSProperties;
}

/**
 * The PRIVATE CANDIDATE banner (integration 2026-10-19). Always first in the NBA theater, in every state (fixture,
 * real dev copy, refusal), never dismissible. A hatched, dashed notice in mono capitals: nothing like the scoreboard's
 * team blocks, so it cannot be read as a live score.
 */
export function PrivateCandidateBanner() {
  return (
    <p className="nba-private" role="note" aria-label="Private experimental candidate" data-nba-private-banner="">
      {NBA_PRIVATE_BANNER}
    </p>
  );
}

/** The fixture banner. Rendered whenever the manifest is a fixture; the section refuses to render a fixture without it. */
export function FixtureBanner({ text, note }: { text: string; note: string | null }) {
  return (
    <div className="nba-fixture" role="note" aria-label="Test fixture" data-nba-fixture-banner="">
      <strong>{text}</strong>
      {note ? <span>{note.replace(text, "").replace(/^[\s.·—-]+/, "")}</span> : null}
    </div>
  );
}

export function DisclosureBanner({ manifest, sample }: { manifest: NbaManifest; sample: NbaSample | null }) {
  const t = manifest.teams;
  return (
    <div className="st-banner nba-banner" role="note" aria-label="Simulation disclosure">
      <span data-st-disclosure="">{manifest.disclosure}</span>
      <span>
        {t.away.abbr} @ {t.home.abbr}
        {sample ? <> · run #{n(sample.runIndex)} of {n(manifest.simulations)}</> : null}
      </span>
    </div>
  );
}

/**
 * The scoreboard: AWAY | period + sim clock | HOME, a SIMULATED label, and a tag strip that is "illustrative" whenever the
 * score or clock is between checkpoints and "recorded" at a checkpoint. No possession arrow (not modelled).
 */
export function Scoreboard({ teams, palette, frame, fixture }: { teams: NbaTeams; palette: NbaPalette; frame: NbaFrame; fixture: boolean }) {
  const illus = frame.scoreIllustrative || frame.clockIllustrative;
  const lead = frame.score.home === frame.score.away ? null : frame.score.home > frame.score.away ? "home" : "away";
  const clock = frame.phase === "LIVE" ? fmtGameClock(frame.clockSec) : frame.phase === "FINAL" ? "" : "0:00";
  const recorded = frame.phase === "FINAL" ? "recorded · final score"
    : frame.phase === "BREAK" ? `recorded · end of ${frame.period}`
    : frame.lastCheckpoint === "TIP" ? "tip-off · 0–0" : `recorded · end of ${frame.lastCheckpoint}`;
  const team = (side: NbaSide) => {
    const p = palette[side];
    return (
      <div className={`nba-sb-team is-${side}${p.patterned ? " is-cue" : ""}${lead === side && frame.phase === "FINAL" ? " is-winner" : ""}`} style={teamStyle(palette, side)}>
        <span className="nba-sb-bar" aria-hidden="true" />
        <span className="nba-sb-abbr">{teams[side].abbr}</span>
        <span className="nba-sb-score" data-st-interp={frame.scoreIllustrative ? "score" : undefined}>
          {frame.score[side]}
        </span>
      </div>
    );
  };
  return (
    <div className={`nba-sb${palette.mode === "team" ? " is-team" : ""}`} role="group" aria-label="Scoreboard, simulated" data-st-interp-scope="scoreboard">
      <div className="nba-sb-row">
        {team("away")}
        <div className="nba-sb-mid">
          <span className="nba-sb-period">{frame.periodDisplay}</span>
          {clock ? <span className="nba-sb-clock" data-st-interp={frame.clockIllustrative ? "clock" : undefined}><span className="st-sr">simulated clock </span>{clock}</span> : null}
        </div>
        {team("home")}
      </div>
      <div className="nba-sb-foot">
        <span className="nba-sb-sim">Simulated{fixture ? " · test fixture" : ""}</span>
        {illus ? (
          <span className="nba-sb-tag is-illustrative" data-st-interp-tag="">score &amp; clock {ILLUS_TAG} · recorded only at quarter ends</span>
        ) : (
          <span className="nba-sb-tag">{recorded}</span>
        )}
      </div>
    </div>
  );
}

/** Quarter-by-quarter table (recorded checkpoints). */
export function Linescore({ sample, teams, palette, through }: { sample: NbaSample; teams: NbaTeams; palette: NbaPalette; through?: number }) {
  const shown = through == null ? sample.periods : sample.periods.slice(0, through);
  const tot = (side: NbaSide) => shown.reduce((a, p) => a + p[side], 0);
  return (
    <table className="nba-linescore">
      <caption className="st-sr">Points by period, run #{sample.runIndex}</caption>
      <thead>
        <tr><th scope="col"><span className="st-sr">Team</span></th>{shown.map((p) => <th key={p.label} scope="col">{p.label}</th>)}<th scope="col">T</th></tr>
      </thead>
      <tbody>
        {SIDES.map((side) => (
          <tr key={side} className={tot(side) > tot(side === "home" ? "away" : "home") ? "is-leader" : undefined}>
            <th scope="row"><span className={`nba-chip-team${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>{teams[side].abbr}</span></th>
            {shown.map((p) => <td key={p.label}>{p[side]}</td>)}
            <td className="is-total">{tot(side)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlayerTable({ side, sample, teams, palette, playRates }: { side: NbaSide; sample: NbaSample; teams: NbaTeams; palette: NbaPalette; playRates?: Record<string, number> }) {
  const rows: NbaPlayerLine[] = [...sample.players[side]].sort((a, b) => b.minutes - a.minutes || b.pts - a.pts);
  const t = sample.team[side];
  const teamMin = 240 + 25 * sample.overtimePeriods;
  return (
    <table className="nba-players">
      <caption>
        <span className={`nba-chip-team${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>{teams[side].abbr}</span> {teams[side].name}
      </caption>
      <thead>
        <tr><th scope="col">Player</th><th scope="col" title="Minutes">MIN</th><th scope="col" title="Points">PTS</th><th scope="col" title="Rebounds">REB</th><th scope="col" title="Assists">AST</th><th scope="col" title="Three-pointers made and attempted">3PM-A</th></tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.providerAthleteId ?? p.name} className={p.minutes === 0 ? "is-dnp" : undefined}>
            <th scope="row">
              <span className="nba-pname">{p.name}</span>
              {playRates && p.providerAthleteId && playRates[p.providerAthleteId] != null ? (
                <span className="nba-prate" title="playRate: share of all simulated games in which this player logs minutes">plays {Math.round(playRates[p.providerAthleteId] * 100)}%</span>
              ) : null}
            </th>
            <td>{fmtMin(p.minutes)}</td><td className="is-pts">{p.pts}</td><td>{p.reb}</td><td>{p.ast}</td><td>{p.threePm}-{p.threePa}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr><th scope="row">Team</th><td>{teamMin}</td><td className="is-pts">{t.pts}</td><td>{t.reb}</td><td>{t.ast}</td><td>{t.threePm}-{t.threePa}</td></tr>
      </tfoot>
    </table>
  );
}

/**
 * The selected sample's player lines: its GAME totals, labelled as that sample's final line. During playback the panel
 * says plainly that per-quarter splits are not modelled; nothing is pro-rated to the playback position.
 */
export function PlayerPanel({ sample, teams, palette, playing, playRates }: {
  sample: NbaSample; teams: NbaTeams; palette: NbaPalette; playing: boolean; playRates?: { home: Record<string, number>; away: Record<string, number> };
}) {
  return (
    <div className="nba-playerpanel">
      <p className="nba-panel-lede">
        <b>Final line of run #{n(sample.runIndex)}</b> ({sample.title}): each player&apos;s game totals in this one simulated game.
      </p>
      {playing ? (
        <p className="nba-note" data-nba-no-splits="">Per-quarter player splits are not modelled. These are the sample&apos;s final game totals, shown whole at every point of playback, never pro-rated.</p>
      ) : null}
      <div className="nba-players-grid">
        {SIDES.map((side) => <PlayerTable key={side} side={side} sample={sample} teams={teams} palette={palette} playRates={playRates?.[side]} />)}
      </div>
      <p className="nba-fine">MIN in minutes; 0 = did not play in this sample. 3PM-A = three-pointers made-attempted.{playRates ? " “plays N%” is the model's playRate: the share of all simulated games in which the player logs minutes." : ""}</p>
    </div>
  );
}

/** Total-points distribution of all draws (sim.totalHistogram) with the selected sample's total marked. */
export function TotalHistogram({ manifest, sample, width }: { manifest: NbaManifest; sample: NbaSample; width: number }) {
  const h = manifest.sim.totalHistogram;
  if (!h) return <p className="nba-note">Total-points distribution unavailable{manifest.sim.histogramNote ? `: ${manifest.sim.histogramNote}` : ""}.</p>;
  const W = Math.max(240, Math.round(width));
  const H = 96;
  const lo = h[0].value;
  const hi = h[h.length - 1].value;
  const span = Math.max(1, hi - lo + 1);
  const maxP = Math.max(...h.map((b) => b.probability));
  const x = (v: number) => ((v - lo) / span) * W;
  const bw = Math.max(1, W / span - 0.5);
  const total = sample.final.home + sample.final.away;
  const q = manifest.sim.total;
  const mx = x(total) + bw / 2;
  const share = h.filter((b) => b.value <= total).reduce((a, b) => a + b.probability, 0);
  return (
    <figure className="nba-hist">
      <svg width={W} height={H + 4} viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label={`Distribution of total points across ${n(manifest.simulations)} simulated games, ${lo} to ${hi}. This sample's total ${total} is marked.`}>
        {h.map((b) => <rect key={b.value} className={b.value === total ? "nba-hist-bar is-sel" : "nba-hist-bar"} x={x(b.value)} y={H - (b.probability / maxP) * (H - 6)} width={bw} height={(b.probability / maxP) * (H - 6)} />)}
        <line className="nba-hist-mark" x1={mx} x2={mx} y1={0} y2={H + 4} />
      </svg>
      <div className="nba-hist-axis" aria-hidden="true"><span>{lo}</span><span>{hi}</span></div>
      <figcaption>
        <b>This sample: {total} total points</b> ({Math.round(share * 100)}% of draws total {total} or fewer).
        {q ? <> Middle 80% of draws: {n(q.p10)}–{n(q.p90)}, median {n(q.p50)}.</> : null}
      </figcaption>
    </figure>
  );
}

/**
 * The basketball timeline: quarter segments (+OT) to seek with, and the score differential (home − away) drawn ONLY
 * through the recorded quarter-end checkpoints. The straight segments between checkpoints are illustrative (dashed, and
 * tagged); the dots are the recorded values.
 */
export function DiffTimeline({ compiled, teams, palette, t, width, onSeek }: {
  compiled: NbaCompiled; teams: NbaTeams; palette: NbaPalette; t: number; width: number; onSeek?: (t: number) => void;
}) {
  const W = Math.max(240, Math.round(width));
  const H = 84;
  const pts = compiled.checkpoints.map((k) => ({ t: k.t, d: k.score.home - k.score.away, label: k.label }));
  const maxAbs = Math.max(6, ...pts.map((p) => Math.abs(p.d)));
  const X = (tt: number) => (tt / compiled.tEnd) * W;
  const Y = (d: number) => H / 2 - (d / maxAbs) * (H / 2 - 8);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.d).toFixed(1)}`).join("");
  return (
    <div className="nba-timeline" data-st-interp-scope="diff-line">
      <div className="nba-tl-head">
        <span className="nba-tl-title">Score margin at each quarter end</span>
        <span className="nba-tl-tag is-illustrative" data-st-interp-tag="">lines between checkpoints {ILLUS_TAG}</span>
      </div>
      <div className="nba-tl-chart">
        <span className="nba-tl-side is-up">{teams.home.abbr} ahead</span>
        <span className="nba-tl-side is-down">{teams.away.abbr} ahead</span>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Margin (${teams.home.abbr} minus ${teams.away.abbr}) at each recorded checkpoint: ${pts.map((p) => `${p.label} ${p.d > 0 ? "+" : ""}${p.d}`).join(", ")}.`}>
          <rect className="nba-tl-up" x={0} y={0} width={W} height={H / 2} style={{ fill: palette.home.tint }} />
          <rect className="nba-tl-down" x={0} y={H / 2} width={W} height={H / 2} style={{ fill: palette.away.tint }} />
          {compiled.segments.map((s) => <line key={s.label} className="nba-tl-grid" x1={X(s.endT)} x2={X(s.endT)} y1={0} y2={H} />)}
          <line className="nba-tl-zero" x1={0} x2={W} y1={H / 2} y2={H / 2} />
          <path className="nba-tl-line" d={path} data-st-interp="diff-line" />
          {pts.map((p) => <circle key={p.label} className="nba-tl-dot" cx={X(p.t)} cy={Y(p.d)} r={3.5} />)}
          <line className="nba-tl-cursor" x1={X(t)} x2={X(t)} y1={0} y2={H} />
        </svg>
      </div>
      <div className="nba-tl-segs" role="group" aria-label="Jump to a period">
        {compiled.segments.map((s, i) => {
          const brk = compiled.breaks.find((b) => b.afterIdx === i);
          const end = brk ? brk.endT : s.endT;
          const on = t >= s.startT && (t < end || (i === compiled.segments.length - 1 && t >= s.startT));
          return (
            <button key={s.label} type="button" className={`nba-tl-seg${on ? " is-on" : ""}${s.ot ? " is-ot" : ""}`} style={{ flexGrow: end - s.startT }} aria-pressed={on} onClick={onSeek ? () => onSeek(s.startT) : undefined}>
              <span>{s.label}</span>
              <span className="nba-tl-seg-score">{s.after.away}–{s.after.home}</span>
            </button>
          );
        })}
      </div>
      <p className="nba-fine">Dots are the recorded quarter-end margins. Segment scores read {teams.away.abbr}–{teams.home.abbr} at the end of each period.</p>
    </div>
  );
}

/** Outcome chips: only the samples present in the data; each shows its label, final, OT, and (on demand) run # and rule. */
export function OutcomeChips({ manifest, selected, onSelect, idBase, vertical = false }: {
  manifest: NbaManifest; selected: number; onSelect?: (i: number) => void; idBase: string; vertical?: boolean;
}) {
  const t = manifest.teams;
  return (
    <div className={`st-chips nba-chips${vertical ? " is-vertical" : ""}`} role="radiogroup" aria-label="Representative outcomes">
      {manifest.samples.map((s, i) => (
        <button
          key={`${s.label}-${s.runIndex}`}
          id={`${idBase}-chip-${i}`}
          type="button"
          role="radio"
          aria-checked={i === selected}
          aria-disabled={!s.validation.ok}
          className="st-chip nba-chip"
          onClick={s.validation.ok && onSelect ? () => onSelect(i) : undefined}
          title={s.validation.ok ? s.selectionRule : s.validation.errors.map((e) => e.code).join(", ")}
        >
          <span className="st-dot" aria-hidden="true" />
          <span>{s.title}</span>
          {s.validation.ok ? (
            <span className="st-chip-score">{t.away.abbr} {s.final.away}–{s.final.home} {t.home.abbr}{s.overtimePeriods ? ` · ${s.overtimePeriods > 1 ? `${s.overtimePeriods}OT` : "OT"}` : ""}</span>
          ) : (
            <span className="st-chip-score">unavailable</span>
          )}
          {vertical ? <span className="nba-chip-rule">Run #{n(s.runIndex)} · {s.validation.ok ? s.selectionRule : s.validation.errors.map((e) => `${e.code}: ${e.detail}`).join("; ")}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** The selection rules, on demand. */
export function SelectionRules({ manifest }: { manifest: NbaManifest }) {
  const absent = Object.keys(LABEL_TITLES).filter((l) => !manifest.samples.some((s) => s.label === l));
  return (
    <dl className="nba-rules">
      {manifest.samples.map((s) => (
        <div key={`${s.label}-${s.runIndex}`}>
          <dt>{s.title} · run #{n(s.runIndex)}</dt>
          <dd>{s.validation.ok ? s.selectionRule : `Unavailable: ${s.validation.errors.map((e) => `${e.code} (${e.detail})`).join("; ")}`}</dd>
        </div>
      ))}
      {absent.length ? <div><dt>Not in this run</dt><dd>{absent.map((l) => LABEL_TITLES[l as keyof typeof LABEL_TITLES]).join(", ")}: the data has no such sample, so none is offered.</dd></div> : null}
    </dl>
  );
}

export function ModelFacts({ manifest, sample }: { manifest: NbaManifest; sample: NbaSample }) {
  return (
    <dl className="nba-facts">
      <div><dt>Sample</dt><dd>Run #{n(sample.runIndex)} · {sample.title}</dd></div>
      <div><dt>Rule</dt><dd>{sample.selectionRule}</dd></div>
      <div><dt>Model</dt><dd className="st-mono">{manifest.modelVersion}{manifest.fixture ? " (fixture shape only)" : ""}</dd></div>
      <div><dt>Inputs as of</dt><dd className="st-mono">{manifest.inputAsOf ?? "—"}</dd></div>
      <div><dt>Simulations</dt><dd>{n(manifest.simulations)}</dd></div>
      <div><dt>Seed</dt><dd className="st-mono">{manifest.seed ?? "—"}</dd></div>
      <div><dt>Data</dt><dd>{manifest.fixture ? "Synthetic TEST FIXTURE (not model output)" : manifest.provenance ? `Real engine output${manifest.role ? ` (${manifest.role})` : ""}, dev copy of ${manifest.provenance.source ?? "?"}` : `Engine output${manifest.role ? ` (${manifest.role})` : ""}: ${manifest.file ?? "?"}`}</dd></div>
    </dl>
  );
}

function Leaders({ sample, teams, palette }: { sample: NbaSample; teams: NbaTeams; palette: NbaPalette }) {
  const L = statLeaders(sample) as Record<NbaSide, Record<"pts" | "reb" | "ast", NbaPlayerLine | null>>;
  const cell = (p: NbaPlayerLine | null, k: "pts" | "reb" | "ast") => (p ? <span className="nba-lead"><b>{p[k]}</b> <span className="nba-lead-name">{p.name}</span></span> : "—");
  return (
    <table className="nba-leaders">
      <caption>Stat leaders in this sample (game totals)</caption>
      <thead><tr><th scope="col"><span className="st-sr">Team</span></th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th></tr></thead>
      <tbody>
        {SIDES.map((side) => (
          <tr key={side}>
            <th scope="row"><span className={`nba-chip-team${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>{teams[side].abbr}</span></th>
            <td data-k="PTS">{cell(L[side].pts, "pts")}</td><td data-k="REB">{cell(L[side].reb, "reb")}</td><td data-k="AST">{cell(L[side].ast, "ast")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Halftime and final cards. `variant` "overlay" sits over the court on wide screens; "sheet" is the compact phone card,
 * rendered in the page flow BELOW the court, so it can never cover it. Dismissible (button; Escape in the island).
 */
export function BreakCard({ kind, manifest, sample, palette, onDismiss, variant, idBase }: {
  kind: "HALFTIME" | "FINAL"; manifest: NbaManifest; sample: NbaSample; palette: NbaPalette; onDismiss?: () => void; variant: "overlay" | "sheet"; idBase: string;
}) {
  const teams = manifest.teams;
  const final = kind === "FINAL";
  const through = final ? sample.periods.length : 2;
  const score = final ? sample.final : { home: sample.periods[0].home + sample.periods[1].home, away: sample.periods[0].away + sample.periods[1].away };
  const winner: NbaSide | null = score.home === score.away ? null : score.home > score.away ? "home" : "away";
  const title = final ? `Final${sample.overtimePeriods ? (sample.overtimePeriods > 1 ? `/${sample.overtimePeriods}OT` : "/OT") : ""}` : "Halftime";
  return (
    <section className={`nba-card is-${kind.toLowerCase()} is-${variant}`} role="region" aria-labelledby={`${idBase}-card-title`} data-st-card={kind} data-st-card-variant={variant}>
      <header className="nba-card-head">
        <div>
          <span className="nba-card-eyebrow">{manifest.fixture ? "Test fixture · " : ""}Simulated · run #{n(sample.runIndex)} · {sample.title}</span>
          <h3 id={`${idBase}-card-title`} className="nba-card-title">{title}</h3>
        </div>
        {onDismiss ? (
          <button type="button" className="nba-card-x" aria-label={`Hide the ${title.toLowerCase()} card`} aria-keyshortcuts="Escape" onClick={onDismiss}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        ) : null}
      </header>
      <div className="nba-card-score">
        {SIDES.map((side) => (
          <div key={side} className={`nba-card-team${winner === side ? " is-winner" : ""}${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>
            <span className="nba-card-abbr">{teams[side].abbr}</span>
            <span className="nba-card-pts">{score[side]}</span>
            {winner === side ? <span className="nba-card-win">{final ? "wins" : "leads"}</span> : null}
          </div>
        ))}
      </div>
      <Linescore sample={sample} teams={teams} palette={palette} through={through} />
      {final ? (
        <>
          <Leaders sample={sample} teams={teams} palette={palette} />
          {variant === "sheet" ? (
            <details className="nba-card-more">
              <summary>Sample, model and disclosure</summary>
              <ModelFacts manifest={manifest} sample={sample} />
              <p className="nba-fine">{manifest.disclosure}. One simulated game out of {n(manifest.simulations)}; not a prediction of this score.</p>
            </details>
          ) : (
            <>
              <ModelFacts manifest={manifest} sample={sample} />
              <p className="nba-fine">{manifest.disclosure}. One simulated game out of {n(manifest.simulations)}; not a prediction of this score.</p>
            </>
          )}
        </>
      ) : (
        <p className="nba-fine">Recorded halftime score of this sample. Player first-half splits are not modelled.</p>
      )}
    </section>
  );
}

export function NbaUnavailable({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="st-box nba-unavailable" role="status">
      <h2>{title}</h2>
      <p>{reason}</p>
    </div>
  );
}

export { FIXTURE_BANNER };
