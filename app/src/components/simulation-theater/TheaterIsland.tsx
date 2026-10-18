"use client";
/**
 * Simulation Theater V2 · the interactive island (spec §2, §3.5, §3.8). Loaded by TheaterLoader, never on its own.
 *
 * Every frame = stateAtCompiled(one representative run, compiled timeline, t). Playback starts ONLY on an explicit
 * Play (founder D1: no autoplay). The rAF loop runs only while PLAYING, ≥25% of the scene is on screen and the tab is
 * visible; otherwise it is cancelled, and resuming re-anchors the clock so no time jumps.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";

import { FieldOverlay, StaticField } from "./FieldScene";
import type { Frame, Palette, Side, Teams } from "./FieldScene";
import { Banner, Linescore, SceneBadge, ScoreBug, Transcript, Unavailable } from "./parts";
import { createFrameStore, useFrameValue } from "./frame-store";
import type { FrameStore } from "./frame-store";
import type { TheaterEvent, TheaterManifest, TheaterSample } from "./types";
import { THEATER_CSS, THEATER_VARS } from "./theater-css";

import {
  KIND_LABEL, LABELS, PERIOD_LONG, PERIOD_SHORT, RUNOFF_NOTE_TEXT, chipTitle, driveAccessibleName, fieldPosition, finalLine,
  fmtClock, fmtDuration, fmtPeriodClock, fmtPlayback, plural, scoreLine, transcriptSentence,
} from "@/lib/simulation-theater/format.mjs";
import { compiledFor, stateAtCompiled } from "@/lib/simulation-theater/state-at.mjs";
import { SCENE_POLICY } from "@/lib/simulation-theater/timeline.mjs";
import { SPEEDS, createTransport, transport } from "@/lib/simulation-theater/transport-machine.mjs";
import { createAnnouncer, flush, offer, SEEK_SETTLE_MS } from "@/lib/simulation-theater/announcer.mjs";
import { TEAM_COLORS_VALIDATED, theaterPalette } from "@/lib/simulation-theater/nfl-team-colors.mjs";

type Compiled = {
  keyframes: { driveIdx: number; phase: string; t0: number; dur: number; breakKind?: string }[];
  markers: { type: string; quarter: number; atT: number; driveIdx: number; exact: boolean }[];
  driveSpans: { driveIdx: number; t0: number; t1: number; startT: number }[];
  tEnd: number;
  reducedMotion: boolean;
};
type SceneState = Frame & {
  t: number;
  tEnd: number;
  driveIdx: number;
  driveCount: number;
  phaseProgress: number;
  score: { home: number; away: number };
  period: number;
  periodClock: number;
  clockIllustrative: boolean;
  chip: { kind: string; tone: string; text: string } | null;
  card: string | null;
  breakKind: string | null;
  rollover: { quarter: number; atT: number } | null;
};
type Tp = { state: string; t: number; tEnd: number; speed: number; driveStarts: number[]; reason: string | null };
type Live = { t: number; frame: SceneState | null; playState: string };

const STOPS = ["TURNOVER", "DOWNS", "FG_MISS"];

function periodWords(period: number, periodClock: number) {
  return `${PERIOD_SHORT[period as 1]} ${fmtClock(periodClock)}`;
}

// ── field (re-renders per frame) ───────────────────────────────────────────────────────────────────────────────
function useBoxSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 1200, h: 533 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function LiveField({ store, palette, teams, reduced, idle, idPrefix, stageRef }: {
  store: FrameStore<Live>; palette: Palette; teams: Teams; reduced: boolean; idle: boolean; idPrefix: string; stageRef: React.RefObject<HTMLDivElement>;
}) {
  const size = useBoxSize(stageRef);
  useFrameValue(store, (v) => v.t); // per-frame subscription for the overlay
  const live = store.get();
  const f = live.frame;
  // Pre-play (IDLE) shows the opening drive's start spot fully drawn; a display choice, not a frame of the timeline.
  const shown = f && idle ? { ...f, ballOpacity: 1, startRingScale: 1 } : f;
  // The static layer (turf, lines, grain) is built once per size/palette, never per frame.
  const staticLayer = useMemo(() => <StaticField palette={palette} width={size.w} idPrefix={idPrefix} />, [palette, size.w, idPrefix]);
  return (
    <>
      {staticLayer}
      <div className="st-vignette" aria-hidden="true" />
      <FieldOverlay width={size.w} height={size.h} frame={shown} palette={palette} teams={teams} reducedMotion={reduced} />
      <div className="st-dimmer" aria-hidden="true" />
    </>
  );
}

function LiveBug({ store, teams, palette, illusId }: { store: FrameStore<Live>; teams: Teams; palette: Palette; illusId: string }) {
  const key = useFrameValue(store, (v) => {
    const f = v.frame;
    if (!f) return "none";
    return `${f.score.home}|${f.score.away}|${f.offense}|${f.period}|${Math.ceil(f.periodClock - 1e-9)}|${f.clockIllustrative}|${f.breakKind ?? ""}|${f.rollover?.quarter ?? ""}`;
  });
  const prev = useRef<{ home: number; away: number } | null>(null);
  const f = store.get().frame;
  const bump = useMemo(() => {
    const p = prev.current;
    const now = f ? f.score : null;
    const b = p && now ? { home: now.home > p.home ? now.home : 0, away: now.away > p.away ? now.away : 0 } : { home: 0, away: 0 };
    prev.current = now;
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!f) return null;
  const stateChip = f.breakKind === "HALFTIME" ? "HALFTIME" : f.breakKind === "OT_START" ? "OT" : f.breakKind === "FINAL" ? "FINAL"
    : f.rollover ? `END Q${f.rollover.quarter}` : f.period === 5 ? "OT" : null;
  return (
    <ScoreBug
      teams={teams}
      palette={palette}
      score={f.score}
      offense={f.breakKind === "FINAL" ? null : f.offense}
      period={f.period}
      periodClock={f.periodClock}
      clockIllustrative={f.clockIllustrative}
      stateChip={stateChip}
      bump={bump}
      illusId={illusId}
    />
  );
}

// ── timeline (one tab stop, roving tabindex; spec S9) ─────────────────────────────────────────────────────────
function Cursor({ store, span }: { store: FrameStore<Live>; span: { t0: number; t1: number } }) {
  const pct = useFrameValue(store, (v) => Math.round(Math.min(1, Math.max(0, (v.t - span.t0) / Math.max(1, span.t1 - span.t0))) * 1000) / 10);
  return <span className="st-tl-cursor" style={{ left: `calc(${pct}% - 1px)` }} aria-hidden="true" />;
}

function DriveTimeline({ sample, compiled, palette, teams, current, store, onSeekDrive }: {
  sample: TheaterSample; compiled: Compiled; palette: Palette; teams: Teams; current: number; store: FrameStore<Live>; onSeekDrive: (i: number) => void;
}) {
  const [focusIdx, setFocusIdx] = useState(current);
  const within = useRef(false);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (!within.current) setFocusIdx(current); }, [current]);
  const groups = useMemo(() => {
    const g: { period: number; items: TheaterEvent[]; dur: number }[] = [];
    for (const ev of sample.events) {
      const span = compiled.driveSpans[ev.index];
      const last = g[g.length - 1];
      if (last && last.period === ev.period) { last.items.push(ev); last.dur += span.t1 - span.t0; } else g.push({ period: ev.period, items: [ev], dur: span.t1 - span.t0 });
    }
    return g;
  }, [sample, compiled]);
  const move = (i: number) => {
    const n = Math.max(0, Math.min(sample.events.length - 1, i));
    setFocusIdx(n);
    btns.current[n]?.focus();
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); move(focusIdx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); move(focusIdx - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(sample.events.length - 1); }
  };
  const icon = (ev: TheaterEvent) => (ev.scoring ? "★" : ev.outcome === "TURNOVER" || ev.outcome === "DOWNS" ? "✕" : ev.outcome === "END_HALF" ? "⏸" : "");
  return (
    <div className="st-timeline">
      <div className="st-tl-head"><span>Drive timeline</span><span>{sample.events.length} drives · width ∝ playback time</span></div>
      <div
        className="st-tl-track"
        role="toolbar"
        aria-label="Drive timeline: arrow keys move between drives, Enter seeks to the drive"
        aria-orientation="horizontal"
        data-st-timeline=""
        onKeyDown={onKey}
        onFocus={() => { within.current = true; }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) within.current = false; }}
      >
        {groups.map((g) => (
          <div key={`${g.period}-${g.items[0].index}`} className="st-tl-period" style={{ flex: `${g.dur} 1 0` }}>
            <span className="st-tl-plabel" aria-hidden="true">{PERIOD_SHORT[g.period as 1]}</span>
            <div className="st-tl-segs">
              {g.items.map((ev) => {
                const span = compiled.driveSpans[ev.index];
                const ticks = compiled.markers.filter((m) => m.driveIdx === ev.index && !m.exact);
                const cls = ev.index === current ? " is-current" : ev.index < current ? " is-done" : "";
                return (
                  <button
                    key={ev.index}
                    ref={(el) => { btns.current[ev.index] = el; }}
                    type="button"
                    className={`st-seg${cls}`}
                    tabIndex={ev.index === focusIdx ? 0 : -1}
                    aria-label={driveAccessibleName(ev, teams)}
                    aria-current={ev.index === current ? "step" : undefined}
                    style={{ flex: `${span.t1 - span.t0} 1 0`, "--st-off": palette[ev.offense].accent } as CSSProperties}
                    onClick={() => { setFocusIdx(ev.index); onSeekDrive(ev.index); }}
                  >
                    {ticks.map((m) => (
                      <span key={m.quarter} className="st-tick" aria-hidden="true" style={{ left: `${(((m.atT - span.t0) / (span.t1 - span.t0)) * 100).toFixed(2)}%` }} />
                    ))}
                    <span className="st-ico" aria-hidden="true">{icon(ev)}</span>
                    {ev.index === current ? <Cursor store={store} span={span} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="st-tl-key" aria-hidden="true">
        <span>fill = offense</span><span>★ score</span><span>✕ turnover / downs</span><span>⏸ end of half / regulation / OT</span><span>| quarter rollover</span>
      </div>
    </div>
  );
}

// ── transport ──────────────────────────────────────────────────────────────────────────────────────────────────
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d} fill="currentColor" /></svg>
);
const ICONS = {
  play: "M8 5.5v13l11-6.5z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  prev: "M6 6h2v12H6zM9.5 12 18 18V6z",
  next: "M16 6h2v12h-2zM14.5 12 6 6v12z",
  restart: "M12 5a7 7 0 1 1-6.6 9.3l1.9-.6A5 5 0 1 0 12 7v3L7.5 6 12 2z",
  list: "M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z",
};

function SeekRow({ store, compiled, sample, onSeek }: { store: FrameStore<Live>; compiled: Compiled; sample: TheaterSample; onSeek: (t: number) => void }) {
  const t = useFrameValue(store, (v) => Math.round(v.t / 100) * 100);
  const valueText = useFrameValue(store, (v) => {
    const f = v.frame;
    return f ? `${periodWords(f.period, f.periodClock)}, drive ${f.driveIdx + 1} of ${f.driveCount}` : "";
  });
  const pct = compiled.tEnd ? (t / compiled.tEnd) * 100 : 0;
  return (
    <div className="st-seekrow">
      <input
        className="st-seek"
        type="range"
        min={0}
        max={compiled.tEnd}
        step={100}
        value={Math.min(t, compiled.tEnd)}
        aria-label={`Seek playback of run #${sample.runIndex}`}
        aria-valuetext={valueText}
        style={{ "--st-pct": `${pct.toFixed(2)}%` } as CSSProperties}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span className="st-ptime" aria-hidden="true">Playback {fmtPlayback(t)} / {fmtPlayback(compiled.tEnd)}</span>
    </div>
  );
}

// ── side panel ─────────────────────────────────────────────────────────────────────────────────────────────────
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

function SidePanel({ manifest, sample, ev, onSeekDrive, current }: {
  manifest: TheaterManifest; sample: TheaterSample; ev: TheaterEvent | null; onSeekDrive: (i: number) => void; current: number;
}) {
  const tabs = ["Drive", "Distribution", "Evidence"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Drive");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const teams = manifest.teams;
  const onTabKey = (e: ReactKeyboardEvent) => {
    const i = tabs.indexOf(tab);
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i + tabs.length - 1) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[n]);
    tabRefs.current[n]?.focus();
  };
  const runoffs = sample.events.filter((x) => x.notes.some((n) => n.code === "ENGINE_CLOCK_RUNOFF"));
  const fin = sample.finalScore!;
  const b = manifest.batch;
  return (
    <aside className="st-side" aria-label="Drive details and evidence">
      <div className="st-tabs" role="tablist" aria-label="Theater panel" onKeyDown={onTabKey}>
        {tabs.map((name, i) => (
          <button
            key={name}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${name}`}
            aria-controls={`${baseId}-panel-${name}`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            className="st-tab"
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="st-tabpanel" role="tabpanel" id={`${baseId}-panel-${tab}`} aria-labelledby={`${baseId}-tab-${tab}`} tabIndex={0}>
        {tab === "Drive" && ev ? (
          <>
            <div className="st-drivehead">
              <div>
                <div className="st-eyebrow">Drive {ev.index + 1} of {sample.events.length} · {PERIOD_LONG[ev.period as 1]}</div>
                <h3>{teams[ev.offense].abbr} ball · {fieldPosition(ev.fieldStart, teams[ev.offense === "home" ? "away" : "home"].abbr)}</h3>
              </div>
            </div>
            <dl className="st-kv">
              <dt>Started</dt><dd>{fmtPeriodClock(ev.period, ev.periodClockStart)}</dd>
              <dt>Ended</dt><dd>{fmtPeriodClock(ev.periodEnd, ev.periodClockEnd)}</dd>
              <dt>Plays</dt><dd>{plural(ev.plays, "play")}</dd>
              <dt>Net yards</dt><dd>{plural(ev.netYards, "yard")}</dd>
              <dt>Duration</dt><dd>{fmtDuration(ev.seconds)}</dd>
              <dt>Result</dt><dd>{ev.outcomeLabel}{ev.outcome === "OPP_TD" || ev.outcome === "SAFETY" ? ` · ${teams[ev.offense === "home" ? "away" : "home"].abbr}` : ""}</dd>
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
            <p className="st-eyebrow" style={{ margin: "12px 0 0" }}>Plays, players and down-and-distance are not recorded for this engine; numbers above are the recorded drive summary.</p>
          </>
        ) : null}
        {tab === "Distribution" ? (
          <>
            <p className="st-eyebrow" style={{ margin: 0 }}>{b.runCount.toLocaleString("en-US")} runs · this receipt · experimental engine · not the forecast</p>
            <p style={{ margin: "10px 0 0" }}>Total points (this run: <b>{fin.home + fin.away}</b>, highlighted)</p>
            <Hist hist={b.totalHistogram} mark={fin.home + fin.away} label={`Total points over ${b.runCount} runs; this run ${fin.home + fin.away}`} />
            <p style={{ margin: "12px 0 0" }}>Home margin, {teams.home.abbr} minus {teams.away.abbr} (this run: <b>{fin.home - fin.away}</b>)</p>
            <Hist hist={b.marginHistogram} mark={fin.home - fin.away} label={`Home margin over ${b.runCount} runs; this run ${fin.home - fin.away}`} />
            {b.winProbability ? (
              <dl className="st-kv">
                <dt>{teams.home.abbr} won</dt><dd>{(b.winProbability.home * 100).toFixed(1)}% of runs</dd>
                <dt>{teams.away.abbr} won</dt><dd>{(b.winProbability.away * 100).toFixed(1)}% of runs</dd>
                <dt>Overtime</dt><dd>{b.overtimeProbability == null ? "—" : `${(b.overtimeProbability * 100).toFixed(1)}% of runs`}</dd>
              </dl>
            ) : null}
          </>
        ) : null}
        {tab === "Evidence" ? (
          <>
            <dl className="st-ev">
              <dt>Receipt</dt><dd>{manifest.receiptId}</dd>
              <dt>Artifact hash</dt><dd>{manifest.receiptHash ?? "not stored"}</dd>
              <dt>Receipt file (read only)</dt><dd>{manifest.file ?? "—"}</dd>
              <dt>Engine</dt><dd>{manifest.engine} @ {manifest.engineVersion} · {manifest.promotionState} (experimental, not promoted)</dd>
              <dt>Schemas</dt><dd>{manifest.receiptSchema} · {manifest.runSchema}</dd>
              <dt>Run</dt><dd>#{sample.runIndex} of {manifest.runCount.toLocaleString("en-US")} · {sample.kinds.map((k) => KIND_LABEL[k as "UPSET"] ?? k).join(" = ")}</dd>
              <dt>Selection rule</dt><dd>{sample.selectionRules.map((r) => r.text).join(" Also: ")}</dd>
              <dt>Seed</dt><dd>baseSeed {manifest.seed.baseSeed} · {manifest.seed.seedStrategy}</dd>
              <dt>Input cutoff (availability snapshot)</dt><dd>{manifest.inputCutoff ?? "not stored"}</dd>
              <dt>Params sha256</dt><dd>{manifest.paramsSha256 ?? "—"}</dd>
              <dt>Forecast receipt (input reference)</dt><dd>{manifest.forecastRef ?? "—"} · hash not stored</dd>
              <dt>Generated · kickoff</dt><dd>{manifest.generatedAt} · {manifest.eventStart}</dd>
              <dt>Scene</dt><dd>{SCENE_POLICY.version} · scene seed {sample.scene.sceneSeed} (cosmetic lane only; outcomes never depend on it)</dd>
              <dt>Orientation</dt><dd style={{ fontFamily: "var(--font-display)" }}>{LABELS.orientation}</dd>
            </dl>
            <p className="st-eyebrow" style={{ margin: "14px 0 0" }}>Limitations</p>
            <ul className="st-limits">
              <li>Drive-level engine: no plays, downs and distance, penalties, timeouts or players are recorded or modelled per drive.</li>
              <li>Ball movement within a drive is illustrative; only the start and end spots are recorded.</li>
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
        ) : null}
      </div>
    </aside>
  );
}

// ── the island ─────────────────────────────────────────────────────────────────────────────────────────────────
export default function TheaterIsland({ manifest }: { manifest: TheaterManifest }) {
  const teams = manifest.teams;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const firstOk = manifest.chips.find((c) => c.available)?.sampleIndex ?? 0;
  const [sampleIndex, setSampleIndex] = useState(firstOk);
  const sample = manifest.samples[sampleIndex];
  const [reduced, setReduced] = useState(false);
  const [previewColors, setPreviewColors] = useState(false);
  const palette = useMemo(
    () => theaterPalette(teams.home.abbr, teams.away.abbr, { previewUnvalidated: previewColors }) as Palette,
    [teams.home.abbr, teams.away.abbr, previewColors],
  );
  const compiled = useMemo(() => (sample?.validation.ok ? (compiledFor(sample, { reducedMotion: reduced }) as Compiled) : null), [sample, reduced]);

  const store = useMemo(() => createFrameStore<Live>({ t: 0, frame: null, playState: "IDLE" }), []);
  const tpRef = useRef<Tp | null>(null);
  const [ctl, setCtl] = useState<{ state: string; speed: number }>({ state: "IDLE", speed: 1 });
  const [coarse, setCoarse] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [docVisible, setDocVisible] = useState(true);
  const [announce, setAnnounce] = useState("");
  type AnnState = { lastAt: number; queued: { kind: string; text: string } | null; spoken: { kind: string; text: string } | null };
  const annRef = useRef<AnnState>(createAnnouncer() as AnnState);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResultDrive = useRef(-1);
  const lastBreak = useRef<string | null>(null);
  const lastRoll = useRef<number | null>(null);

  const frameAt = useCallback((t: number): SceneState | null => (compiled && sample ? (stateAtCompiled(sample, compiled, teams, t) as SceneState) : null), [compiled, sample, teams]);

  const commit = useCallback((next: Tp) => {
    tpRef.current = next;
    const frame = frameAt(next.t);
    store.set({ t: next.t, frame, playState: next.state });
    setCtl((c) => (c.state === next.state && c.speed === next.speed ? c : { state: next.state, speed: next.speed }));
    const key = frame ? `${frame.driveIdx}|${frame.phase}|${frame.score.home}-${frame.score.away}|${frame.chip?.text ?? ""}|${frame.card ?? ""}|${frame.rollover?.quarter ?? ""}|${frame.dimmed}` : "none";
    setCoarse((k) => (k === key ? k : key));
  }, [frameAt, store]);

  const say = useCallback((msg: { kind: string; text: string }) => {
    const speed = tpRef.current?.speed ?? 1;
    const r = offer(annRef.current, msg, { speed, now: performance.now() });
    annRef.current = r.state as AnnState;
    if (r.say) setAnnounce(r.say);
  }, []);

  // reduced motion: follow the OS setting (matchMedia listener)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // (re)build the transport whenever the compiled timeline changes; same run → keep the current drive
  const prevRun = useRef<{ runIndex: number; drive: number } | null>(null);
  useEffect(() => {
    if (!compiled) { tpRef.current = null; store.set({ t: 0, frame: null, playState: "UNAVAILABLE" }); return; }
    const starts = compiled.driveSpans.map((s) => s.startT);
    let m = createTransport({ tEnd: compiled.tEnd, driveStarts: starts }) as Tp;
    const p = prevRun.current;
    const prevTp = tpRef.current;
    if (p && p.runIndex === sample.runIndex && prevTp) {
      m = transport(m, "SPEED", { speed: prevTp.speed }) as Tp;
      if (prevTp.t > 0) m = transport(m, "SEEK", { t: starts[Math.min(p.drive, starts.length - 1)] }) as Tp;
    } else if (prevTp) {
      m = transport(m, "SPEED", { speed: prevTp.speed }) as Tp;
    }
    lastResultDrive.current = -1;
    lastBreak.current = null;
    lastRoll.current = null;
    commit(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled]);

  // keep track of the run and drive for the reduced-motion swap
  useEffect(() => {
    const f = store.get().frame;
    if (f && sample) prevRun.current = { runIndex: sample.runIndex, drive: f.driveIdx };
  }, [coarse, sample, store]);

  // visibility: IntersectionObserver (≥25%) and the page visibility API
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => setVisible((es[0]?.intersectionRatio ?? 0) >= 0.25), { threshold: [0, 0.25, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const on = () => setDocVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // the frame loop: exists only while PLAYING and visible; cancelled (not throttled) otherwise
  useEffect(() => {
    if (ctl.state !== "PLAYING" || !visible || !docVisible || !compiled) return;
    let raf = 0;
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last == null ? 0 : now - last;
      last = now;
      const cur = tpRef.current;
      if (!cur) return;
      const next = transport(cur, "TICK", { dt }) as Tp;
      if (next !== cur) commit(next);
      if (next.state === "PLAYING") raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ctl.state, visible, docVisible, compiled, commit]);

  // announcements on coarse changes (never per frame)
  useEffect(() => {
    const live = store.get();
    const f = live.frame;
    if (!f || !sample) return;
    const playing = live.playState === "PLAYING" || live.playState === "COMPLETED";
    const ev = sample.events[f.driveIdx];
    const afterResult = ["RESULT", "TRANSITION", "BREAK", "FINAL"].includes(f.phase);
    if (playing && afterResult && lastResultDrive.current !== f.driveIdx) {
      lastResultDrive.current = f.driveIdx;
      const who = ev.outcome === "OPP_TD" || ev.outcome === "SAFETY" ? teams[ev.offense === "home" ? "away" : "home"].abbr : teams[ev.offense].abbr;
      const kind = ev.scoring ? "SCORE" : STOPS.includes(ev.outcome) ? "STOP" : "RESULT";
      say({ kind, text: `${who} ${ev.outcomeLabel}. ${teams.home.abbr} ${ev.scoreAfter.home}, ${teams.away.abbr} ${ev.scoreAfter.away}. ${fmtPeriodClock(ev.periodEnd, ev.periodClockEnd)}` });
    }
    if (playing && f.breakKind && lastBreak.current !== `${f.driveIdx}-${f.breakKind}`) {
      lastBreak.current = `${f.driveIdx}-${f.breakKind}`;
      const word = f.breakKind === "HALFTIME" ? "Halftime" : f.breakKind === "OT_START" ? "Overtime" : "Final";
      say({ kind: "BREAK", text: `${word}. ${scoreLine(f.score, teams)}.` });
    }
    if (playing && f.rollover && lastRoll.current !== f.rollover.quarter) {
      lastRoll.current = f.rollover.quarter;
      say({ kind: "ROLLOVER", text: `End of Q${f.rollover.quarter}` });
    }
    const r = flush(annRef.current, { speed: tpRef.current?.speed ?? 1, now: performance.now() });
    annRef.current = r.state as AnnState;
    if (r.say) setAnnounce(r.say);
  }, [coarse, sample, store, teams, say]);

  const announceFull = useCallback(() => {
    const f = store.get().frame;
    if (!f || !sample) return;
    const ev = sample.events[f.driveIdx];
    say({ kind: "FULL", text: `Drive ${f.driveIdx + 1} of ${f.driveCount}. ${transcriptSentence(ev, teams)}.` });
  }, [sample, store, teams, say]);

  // controls
  const act = useCallback((action: string, arg: Record<string, unknown> = {}) => {
    const cur = tpRef.current;
    if (!cur) return;
    const next = transport(cur, action, arg) as Tp;
    if (next === cur) return;
    commit(next);
    if (action === "PAUSE" || (action === "TOGGLE" && next.state !== "PLAYING")) announceFull();
    if (["SEEK", "NEXT_DRIVE", "PREV_DRIVE", "RESTART"].includes(action)) {
      lastResultDrive.current = store.get().frame?.driveIdx ?? -1; // silent while seeking: no stale result announcement
      if (seekTimer.current) clearTimeout(seekTimer.current);
      seekTimer.current = setTimeout(() => { seekTimer.current = null; announceFull(); }, SEEK_SETTLE_MS);
    }
  }, [commit, announceFull, store]);
  useEffect(() => () => { if (seekTimer.current) clearTimeout(seekTimer.current); }, []);

  const seekDrive = useCallback((i: number) => {
    if (!compiled) return;
    act("SEEK", { t: compiled.driveSpans[i].startT });
  }, [act, compiled]);

  const selectSample = useCallback((i: number) => {
    const chip = manifest.chips.find((c) => c.sampleIndex === i);
    if (!chip || !chip.available) return;
    const cur = tpRef.current;
    if (cur && cur.state === "PLAYING") commit(transport(cur, "PAUSE") as Tp);
    prevRun.current = null;
    setSampleIndex(i);
  }, [manifest.chips, commit]);

  // focus-scoped keyboard shortcuts (spec §2.1 Keyboard, S9; WCAG 2.1.4: active only while the region has focus)
  const onRegionKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    const isRange = tag === "INPUT" && (target as HTMLInputElement).type === "range";
    const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    const isButton = tag === "BUTTON" || target.getAttribute("role") === "tab" || target.getAttribute("role") === "radio";
    const inTimeline = Boolean(target.closest("[data-st-timeline]"));
    const inTabs = Boolean(target.closest("[role=tablist]")) || Boolean(target.closest("[role=radiogroup]"));
    const arrowsFree = !isRange && !inTimeline && !inTabs;
    // Never on the seek range or any other input: those keep their native keys.
    if (isInput) return;
    if (e.key === "k" || e.key === "K") { e.preventDefault(); act("TOGGLE"); return; }
    if (e.key === " ") { if (!isButton) { e.preventDefault(); act("TOGGLE"); } return; }
    if (e.key === "1" || e.key === "2" || e.key === "4") { e.preventDefault(); act("SPEED", { speed: Number(e.key) }); return; }
    if (!arrowsFree) return;
    const t = tpRef.current?.t ?? 0;
    if (e.key === "ArrowRight") { e.preventDefault(); if (e.shiftKey) act("SEEK", { t: t + 5000 }); else act("NEXT_DRIVE"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); if (e.shiftKey) act("SEEK", { t: t - 5000 }); else act("PREV_DRIVE"); }
    else if (e.key === "Home") { e.preventDefault(); act("SEEK", { t: 0 }); }
    else if (e.key === "End") { e.preventDefault(); act("SEEK", { t: compiled?.tEnd ?? 0 }); }
  };

  const onChipKey = (e: ReactKeyboardEvent) => {
    const avail = manifest.chips.filter((c) => c.available);
    const i = avail.findIndex((c) => c.sampleIndex === sampleIndex);
    let n = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % avail.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i + avail.length - 1) % avail.length;
    else return;
    e.preventDefault();
    selectSample(avail[n].sampleIndex);
    requestAnimationFrame(() => document.getElementById(`${uid}-chip-${avail[n].sampleIndex}`)?.focus());
  };

  const f = store.get().frame;
  const ev = f && sample ? sample.events[f.driveIdx] : null;
  const playing = ctl.state === "PLAYING";
  const idle = ctl.state === "IDLE";
  const speedCycle = () => act("SPEED", { speed: SPEEDS[(SPEEDS.indexOf(ctl.speed) + 1) % SPEEDS.length] });

  return (
    <div className="st-root" style={THEATER_VARS as CSSProperties} role="region" aria-label="Simulation theater" onKeyDown={onRegionKey}>
      <style dangerouslySetInnerHTML={{ __html: THEATER_CSS }} />
      <Banner manifest={manifest} sample={sample ?? null} />
      <div className="st-devbar">
        <span className="st-devtag">Development route · unlinked · noindex</span>
        <label>
          <input type="checkbox" checked={previewColors} onChange={(e) => setPreviewColors(e.target.checked)} />
          Preview team colours (unvalidated)
        </label>
        <span>{previewColors ? "Unvalidated proposal (spec Appendix A) — not approved; for design review only." : TEAM_COLORS_VALIDATED ? "Team colours validated." : "Neutral GTP colours: the team colour map is not validated (decision D3)."}</span>
      </div>

      <div className="st-samples">
        <div className="st-samples-head"><span id={`${uid}-samples`}>Samples</span><span className="st-samplelabel">{LABELS.sample}</span></div>
        <div className="st-chips" role="radiogroup" aria-labelledby={`${uid}-samples`} onKeyDown={onChipKey}>
          {manifest.chips.map((c) => {
            const s = manifest.samples[c.sampleIndex];
            const checked = c.sampleIndex === sampleIndex;
            return (
              <button
                key={c.runIndex}
                id={`${uid}-chip-${c.sampleIndex}`}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-disabled={!c.available || undefined}
                tabIndex={checked ? 0 : -1}
                className="st-chip"
                title={c.available ? undefined : `Unavailable: ${s.validation.errors.map((x) => x.detail).join("; ")}`}
                onClick={() => selectSample(c.sampleIndex)}
              >
                <span className="st-dot" aria-hidden="true" />
                <span>{chipTitle(c.kinds)}</span>
                {s.finalScore ? <span className="st-chip-score">{finalLine(s.finalScore, teams)}</span> : null}
                {!c.available ? <span className="st-chip-score">unavailable</span> : null}
              </button>
            );
          })}
        </div>
        {sample ? (
          <p className="st-rule">
            {sample.selectionRules.map((r) => r.text).join(" Also: ")} <span className="st-mono">· run #{sample.runIndex.toLocaleString("en-US")} of {manifest.runCount.toLocaleString("en-US")}</span>
            {manifest.absentKinds.includes("OVERTIME") ? <span className="st-mono"> · No overtime run in this batch</span> : null}
          </p>
        ) : null}
      </div>

      {!sample || !sample.validation.ok || !compiled ? (
        <div style={{ marginTop: 14 }}>
          <Unavailable title="Playback unavailable for this run" reason="This representative run failed validation, so no scene is drawn for it (never a guessed one, never another run in its place)." items={sample?.validation.errors} />
        </div>
      ) : (
        <>
          <div className="st-grid">
            <div className="st-stage">
              <LiveBug store={store} teams={teams} palette={palette} illusId={`${uid}-illus`} />
              <div className="st-fieldcard">
                <SceneBadge />
                <div ref={stageRef} className={`st-fieldwrap${f?.dimmed ? " is-dim" : ""}`}>
                  <LiveField store={store} palette={palette} teams={teams} reduced={reduced} idle={idle} idPrefix={`${uid}-f`} stageRef={stageRef} />
                  <div className="st-callouts" aria-hidden="true">
                    {f?.chip ? <span key={`${f.driveIdx}-${f.chip.text}`} className={`st-callout tone-${f.chip.tone}`}>{f.chip.text}</span> : null}
                    {f?.rollover ? <span key={`r${f.rollover.quarter}`} className="st-callout tone-roll">End of Q{f.rollover.quarter}</span> : null}
                  </div>
                  {f?.card ? <span className="st-card" aria-hidden="true">{f.card}</span> : null}
                </div>
                <div className="st-caption">
                  <span><span className="st-legend-ring" aria-hidden="true" />start spot (recorded)</span>
                  <span><span className="st-legend-ball" aria-hidden="true" />ball: end spot recorded, path illustrative</span>
                  <span>home ({teams.home.abbr}) defends the left end zone all game</span>
                  {ev && ev.notes.some((n) => n.code === "ENGINE_CLOCK_RUNOFF") ? <span className="st-runoff">{RUNOFF_NOTE_TEXT}</span> : null}
                </div>
              </div>

              <DriveTimeline sample={sample} compiled={compiled} palette={palette} teams={teams} current={f?.driveIdx ?? 0} store={store} onSeekDrive={seekDrive} />

              <div className="st-transport" role="group" aria-label="Playback controls">
                <button type="button" className="st-btn" aria-label="Previous drive" onClick={() => act("PREV_DRIVE")}><Icon d={ICONS.prev} /></button>
                <button type="button" className="st-btn st-play" aria-label={playing ? "Pause" : "Play"} onClick={() => act("TOGGLE")}>
                  <Icon d={playing ? ICONS.pause : ICONS.play} />
                </button>
                <button type="button" className="st-btn" aria-label="Next drive" onClick={() => act("NEXT_DRIVE")}><Icon d={ICONS.next} /></button>
                <button type="button" className="st-btn" aria-label="Restart from kickoff" onClick={() => act("RESTART")}><Icon d={ICONS.restart} /></button>
                <div className="st-speeds" role="radiogroup" aria-label="Playback speed">
                  {SPEEDS.map((s: number) => (
                    <button key={s} type="button" role="radio" aria-checked={ctl.speed === s} className="st-speed" onClick={() => act("SPEED", { speed: s })}>{s}×</button>
                  ))}
                </div>
                <button type="button" className="st-btn st-speedcycle" aria-label={`Playback speed ${ctl.speed}×, change speed`} onClick={speedCycle}>{ctl.speed}×</button>
                <a className="st-btn" href={`#st-transcript-${sample.runIndex}`} aria-label="Go to the full drive transcript"><Icon d={ICONS.list} /></a>
                <SeekRow store={store} compiled={compiled} sample={sample} onSeek={(t) => act("SEEK", { t })} />
              </div>
              <details className="st-keys">
                <summary>Keyboard shortcuts (active while focus is inside the theater)</summary>
                <dl>
                  <dt>K</dt><dd>Play / pause (Space too, when focus is not on a button)</dd>
                  <dt>← / →</dt><dd>Previous / next drive (not on the seek bar or timeline, which use arrows themselves)</dd>
                  <dt>Shift + ← / →</dt><dd>Back / forward 5 s of playback</dd>
                  <dt>Home / End</dt><dd>Start / end of playback</dd>
                  <dt>1 / 2 / 4</dt><dd>Speed 1× / 2× / 4×</dd>
                </dl>
              </details>
            </div>
            <SidePanel manifest={manifest} sample={sample} ev={ev} onSeekDrive={seekDrive} current={f?.driveIdx ?? 0} />
          </div>

          <div className="st-below">
            <section className="st-box" aria-label="Linescore">
              <h2>Linescore · this run</h2>
              <Linescore sample={sample} teams={teams} />
              <p className="st-eyebrow" style={{ margin: "8px 0 0" }}>Team and player lines for this run: not recorded in nfl-drive-run@1</p>
            </section>
            <section className="st-box" aria-label="Transcript">
              <Transcript sample={sample} teams={teams} current={f?.driveIdx ?? null} />
            </section>
          </div>
        </>
      )}
      <div className="st-sr" aria-live="polite" aria-atomic="true">{announce}</div>
    </div>
  );
}
