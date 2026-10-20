/**
 * Simulation Theater V2 · analysis panels (Drive · Distribution · Evidence). Pure: rendered in the desktop side panel's
 * tabs and, below 720 px, inside bottom sheets (spec §2.2). Recorded fields and stated derivations only.
 */
import type { Teams } from "./FieldScene";
import type { TheaterEvent, TheaterManifest, TheaterSample } from "./types";
import {
  KIND_LABEL, LABELS, PERIOD_LONG, RUNOFF_NOTE_TEXT, fieldPosition, fmtDuration, fmtPeriodClock, plural,
} from "@/lib/simulation-theater/format.mjs";
import { SCENE_POLICY } from "@/lib/simulation-theater/timeline.mjs";
import { OfficialForecastCard } from "./RepresentativeParts";

function Hist({ hist, mark, label }: { hist: { value: number; probability: number }[]; mark: number; label: string }) {
  const max = Math.max(...hist.map((h) => h.probability), 1e-6);
  return (
    <div className="st-hist" role="img" aria-label={label}>
      {hist.map((h) => (
        <span key={h.value} className={h.value === mark ? "is-run" : undefined} style={{ height: `${Math.max(2, (h.probability / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function DrivePanel({ sample, ev, teams, current, onSeekDrive }: {
  sample: TheaterSample; ev: TheaterEvent; teams: Teams; current: number; onSeekDrive: (i: number) => void;
}) {
  const def = teams[ev.offense === "home" ? "away" : "home"].abbr;
  return (
    <>
      <div className="st-eyebrow">Drive {ev.index + 1} of {sample.events.length} · {PERIOD_LONG[ev.period as 1]}</div>
      <h3 className="st-panel-h">{teams[ev.offense].abbr} ball · {fieldPosition(ev.fieldStart, def)}</h3>
      <dl className="st-kv">
        <dt>Started</dt><dd>{fmtPeriodClock(ev.period, ev.periodClockStart)}</dd>
        <dt>Ended</dt><dd>{fmtPeriodClock(ev.periodEnd, ev.periodClockEnd)}</dd>
        <dt>Plays</dt><dd>{plural(ev.plays, "play")}</dd>
        <dt>Net yards</dt><dd>{plural(ev.netYards, "yard")}</dd>
        <dt>Duration</dt><dd>{fmtDuration(ev.seconds)}</dd>
        <dt>Result</dt><dd>{ev.outcomeLabel}{ev.outcome === "OPP_TD" || ev.outcome === "SAFETY" ? ` · ${def}` : ""}</dd>
        <dt>Score after</dt><dd>{teams.home.abbr} {ev.scoreAfter.home} – {teams.away.abbr} {ev.scoreAfter.away}</dd>
      </dl>
      {ev.notes.filter((n) => n.code === "ENGINE_CLOCK_RUNOFF").map((n, i) => <p key={i} className="st-note">{RUNOFF_NOTE_TEXT}. Recorded: {plural(ev.plays, "play")} over {fmtDuration(ev.seconds)} of game clock.</p>)}
      <p className="st-eyebrow" style={{ margin: "14px 0 0" }}>This period · select a drive to jump to it</p>
      <ul className="st-qlist">
        {sample.events.filter((x) => x.period === ev.period).map((x) => (
          <li key={x.index}>
            <button type="button" aria-current={x.index === current ? "true" : undefined} onClick={() => onSeekDrive(x.index)}>
              <span>{fmtPeriodClock(x.period, x.periodClockStart)}</span>
              <span>{teams[x.offense].abbr}</span>
              <span>{x.outcomeLabel}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="st-eyebrow" style={{ margin: "12px 0 0" }}>Plays, players and down-and-distance are not recorded for this engine; the numbers above are the recorded drive summary.</p>
    </>
  );
}

export function DistributionPanel({ manifest, sample }: { manifest: TheaterManifest; sample: TheaterSample }) {
  const teams = manifest.teams;
  const fin = sample.finalScore!;
  const b = manifest.batch;
  // The OFFICIAL forecast comes first (Cross-Product Prediction Consistency, 2026-10-20): the drive engine's batch below
  // disagrees with it, so its win shares are labelled as the engine's own counts, never as the forecast.
  return (
    <>
      <OfficialForecastCard manifest={manifest} teams={teams} />
      <p className="st-eyebrow" style={{ margin: "12px 0 0" }}>Drive-engine batch · {b.runCount.toLocaleString("en-US")} runs · this receipt · experimental engine · not the forecast</p>
      <p style={{ margin: "10px 0 0" }}>Total points (this run: <b>{fin.home + fin.away}</b>, highlighted)</p>
      <Hist hist={b.totalHistogram} mark={fin.home + fin.away} label={`Total points over ${b.runCount} runs; this run ${fin.home + fin.away}`} />
      <p style={{ margin: "12px 0 0" }}>Home margin, {teams.home.abbr} minus {teams.away.abbr} (this run: <b>{fin.home - fin.away}</b>)</p>
      <Hist hist={b.marginHistogram} mark={fin.home - fin.away} label={`Home margin over ${b.runCount} runs; this run ${fin.home - fin.away}`} />
      {b.winProbability ? (
        <dl className="st-kv">
          <dt>{teams.home.abbr} won (engine batch, not the forecast)</dt><dd>{(b.winProbability.home * 100).toFixed(1)}% of runs</dd>
          <dt>{teams.away.abbr} won (engine batch, not the forecast)</dt><dd>{(b.winProbability.away * 100).toFixed(1)}% of runs</dd>
          <dt>Overtime</dt><dd>{b.overtimeProbability == null ? "—" : `${(b.overtimeProbability * 100).toFixed(1)}% of runs`}</dd>
        </dl>
      ) : null}
    </>
  );
}

export function EvidencePanel({ manifest, sample }: { manifest: TheaterManifest; sample: TheaterSample }) {
  const runoffs = sample.events.filter((x) => x.notes.some((n) => n.code === "ENGINE_CLOCK_RUNOFF"));
  return (
    <>
      <dl className="st-ev">
        <dt>Receipt</dt><dd>{manifest.receiptId}</dd>
        <dt>Artifact hash</dt><dd data-st-receipt-hash="">{manifest.receiptHash ?? "not stored"}</dd>
        <dt>Receipt file (read only)</dt><dd>{manifest.file ?? "—"}</dd>
        <dt>Engine</dt><dd>{manifest.engine} @ {manifest.engineVersion} · {manifest.promotionState} (experimental, not promoted)</dd>
        <dt>Schemas</dt><dd>{manifest.receiptSchema} · {manifest.runSchema}</dd>
        <dt>Run</dt><dd>#{sample.runIndex} of {manifest.runCount.toLocaleString("en-US")} · {sample.kinds.map((k) => KIND_LABEL[k as "UPSET"] ?? k).join(" = ")}</dd>
        <dt>Selection rule</dt><dd>{sample.selectionRules.map((r) => r.text).join(" Also: ")}</dd>
        <dt>Seed</dt><dd>baseSeed {manifest.seed.baseSeed} · {manifest.seed.seedStrategy}</dd>
        <dt>Input cutoff (availability snapshot)</dt><dd>{manifest.inputCutoff ?? "not stored"}</dd>
        <dt>Params sha256</dt><dd>{manifest.paramsSha256 ?? "—"}</dd>
        <dt>Forecast receipt (input reference)</dt><dd>{manifest.forecastRef ?? "—"} · hash not stored</dd>
        <dt>Official forecast (default-run target)</dt><dd data-st-official-source="">{manifest.representative?.official ? `${manifest.representative.official.source ?? "—"} · snapshot ${manifest.representative.snapshotId?.slice(0, 12) ?? "—"}…` : `none (${manifest.representative?.refusal?.code ?? "NO_OFFICIAL"})`}</dd>
        <dt>Default-run rule</dt><dd>{manifest.representative ? `${manifest.representative.rule}: the stored run closest to the official forecast; every other run is a hypothetical what-if` : "—"}</dd>
        <dt>Generated · kickoff</dt><dd>{manifest.generatedAt} · {manifest.eventStart}</dd>
        <dt>Scene</dt><dd>{SCENE_POLICY.version} · scene seed {sample.scene.sceneSeed} (cosmetic lane only; outcomes never depend on it)</dd>
        <dt>Orientation</dt><dd style={{ fontFamily: "var(--font-display)" }}>{LABELS.orientation}</dd>
      </dl>
      <p className="st-eyebrow" style={{ margin: "14px 0 0" }}>Limitations</p>
      <ul className="st-limits">
        <li>Drive-level engine: no plays, downs and distance, penalties, timeouts or players are recorded or modelled per drive.</li>
        <li>Ball movement within a drive is illustrative; only the start and end spots are recorded. The field marks only those two spots.</li>
        <li>The game clock between a drive&apos;s recorded start and end is a linear interpolation (illustrative).</li>
        <li>A turnover or defensive touchdown does not record whether it was an interception or a fumble.</li>
        <li>Kicks, punts and returns are not events: a possession change is a card, not a flight.</li>
        <li>The engine under-produces 3-point margins and overtime (docs/SIMULATION_ENGINE_V2.md, as cited by the spec).</li>
        <li>Overtime&apos;s first period is 600 s even in the postseason (engine rule).</li>
        {runoffs.length ? runoffs.map((x) => (
          <li key={x.index}>Drive {x.index + 1}: {RUNOFF_NOTE_TEXT}: {plural(x.plays, "play")} over {fmtDuration(x.seconds)}.</li>
        )) : <li>No engine clock run-off drive in this run.</li>}
      </ul>
      <p className="st-eyebrow" style={{ margin: "14px 0 0" }}>Not recorded (shown as absent, never zero)</p>
      <ul className="st-limits">
        {manifest.unavailableFields.map((u) => <li key={u.field}>{u.field}: {u.reason}</li>)}
      </ul>
      {manifest.sharedRuns.length ? (
        <p className="st-note">Shared run: {manifest.sharedRuns.map((s) => `${s.kinds.map((k) => KIND_LABEL[k as "UPSET"] ?? k).join(" = ")} = run #${s.runIndex}`).join("; ")}. One chip plays it.</p>
      ) : null}
    </>
  );
}
