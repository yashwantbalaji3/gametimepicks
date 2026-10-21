"use client";
/**
 * NBA Simulation Theater · POSSESSION PLAYBACK · client island.
 *
 * Plays ONE stored run of the possession-level research engine (nba-possession-sim-v0) from its event log: running game
 * clock, scoreboard, possession indicator, play-by-play, quarter breaks, overtime, team scoring progression, the live
 * and final box score (the fold of the log), the reconciliation checks, the comparison with the official forecast and
 * an end-of-game card. Beside it, the OFFICIAL PROJECTION PANEL, built once from payload.official — it takes no run
 * input, so switching runs (default ↔ what-ifs) can never change it.
 *
 * Transport: the shared transport-machine (never autoplays) with speeds 1× / 2× / 4× / 8×, play / pause, previous /
 * next play, previous / next quarter, skip to final, restart and a seek bar. Keyboard: every control is a native
 * button / radio / range; plus Space or K, "," / ".", "[" / "]", Home / End on the theater (not inside a field).
 * prefers-reduced-motion: no CSS motion, and playback advances in instant play-by-play steps (the clock shows each
 * play's own clock instead of ticking).
 *
 * The island receives only the build-time payload (payload.mjs). It never fetches and never reads the private research tree.
 * `data-nbp-ready` marks hydration for the e2e spec. Dev hook (`devHooks`): `?run=<kind>` and `?t=<seconds>`.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import NbaCourt from "../NbaCourt";
import { NBA_THEATER_VARS } from "../nba-theater-css";
import type { NbaPalette } from "../nba-types";
import type { PbLoad, PbPayload } from "./possession-types";
import {
  BreakNotice, EndCard, EngineFacts, Linescore, OfficialComparison, OfficialProjectionPanel, OUTCOME_PANEL_TITLE, PlayByPlay, PossessionBanner,
  PossessionBoxScore, PossessionIndicator, PossessionScoreboard, PossessionUnavailable, ReconciliationChecks, RunRole, RunSelector, ScoringProgression,
} from "./possession-parts";
import { createTransport, transport } from "@/lib/simulation-theater/transport-machine.mjs";
import { POSSESSION_SPEEDS, compilePossessionTimeline, frameAt, nextPlayT, possessionTransport, prevPlayT } from "@/lib/simulation-theater/nba/possession/playback.mjs";
import { boxRows, compareWithOfficial, foldRun, reconcileBox } from "@/lib/simulation-theater/nba/possession/box.mjs";
import { playLine } from "@/lib/simulation-theater/nba/possession/play-text.mjs";
import { KEYBOARD_HELP } from "@/lib/simulation-theater/nba/possession/labels.mjs";

type Tp = { state: string; t: number; tEnd: number; speed: number; driveStarts: number[]; reason: string | null };
const FEED_ITEMS = 14;
const STEP_MS = 700; // reduced motion: one play per STEP_MS ÷ speed

function useMedia(query: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const f = () => setOn(mq.matches);
    f();
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, [query]);
  return on;
}

const fmtPlay = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export default function NbaPossessionTheater({ payload, palettes, devHooks = false, initialKind = null, switchHref = null, switchLabel = null }: {
  payload: PbPayload; palettes: NonNullable<PbLoad["palettes"]>; devHooks?: boolean; initialKind?: string | null; switchHref?: string | null; switchLabel?: string | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const teams = payload.teams;
  const palette: NbaPalette = palettes.team;
  const first = Math.max(0, payload.runs.findIndex((r) => r.kind === (initialKind ?? payload.selection.defaultKind)));
  const [runIdx, setRunIdx] = useState(first);
  const run = payload.runs[runIdx];
  const rosters = useMemo(() => [payload.rosters.home.map((p) => p.id), payload.rosters.away.map((p) => p.id)], [payload.rosters]);
  const names = useMemo(() => new Map([...payload.rosters.home, ...payload.rosters.away].map((p) => [p.id, p.name ?? null] as [string, string | null])), [payload.rosters]);
  const compiled = useMemo(() => (run ? compilePossessionTimeline(run) : null), [run]);
  const [tp, setTp] = useState<Tp | null>(() => (compiled ? (createTransport({ tEnd: compiled.tEnd, driveStarts: compiled.periodStarts }) as Tp) : null));
  const tpRef = useRef(tp);
  tpRef.current = tp;
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [announce, setAnnounce] = useState("");

  // rebuild the transport when the run changes (keeps the speed; back to tip-off, or a pending dev-hook seek)
  const lastCompiled = useRef(compiled);
  const hookT = useRef<number | null>(null);
  useEffect(() => {
    if (lastCompiled.current === compiled) return;
    lastCompiled.current = compiled;
    if (!compiled) { setTp(null); return; }
    let m = createTransport({ tEnd: compiled.tEnd, driveStarts: compiled.periodStarts }) as Tp;
    if (tpRef.current) m = possessionTransport(transport, m, "SPEED", { speed: tpRef.current.speed }) as Tp;
    if (hookT.current != null) { m = transport(m, "SEEK", { t: hookT.current }) as Tp; hookT.current = null; }
    setTp(m);
  }, [compiled]);

  const hookDone = useRef(false);
  useEffect(() => {
    if (!devHooks || hookDone.current || typeof window === "undefined") return;
    hookDone.current = true;
    const q = new URLSearchParams(window.location.search);
    const kind = q.get("run");
    const t = Number(q.get("t"));
    const seek = Number.isFinite(t) && t > 0 ? t * 1000 : null;
    const i = kind ? payload.runs.findIndex((r) => r.kind === kind) : -1;
    if (i >= 0 && i !== runIdx) { hookT.current = seek; setRunIdx(i); }
    else if (seek != null) setTp((cur) => (cur ? (transport(cur, "SEEK", { t: seek }) as Tp) : cur));
  }, [devHooks, payload.runs, runIdx]);

  const act = useCallback((action: string, arg: Record<string, unknown> = {}) => {
    setTp((cur) => (cur ? (possessionTransport(transport, cur, action, arg) as Tp) : cur));
  }, []);
  const seekTo = useCallback((t: number) => act("SEEK", { t }), [act]);

  const playing = tp?.state === "PLAYING";
  // continuous playback (rAF) — or, under reduced motion, instant play-by-play steps
  useEffect(() => {
    if (!playing || !compiled) return;
    if (reduced) {
      const id = window.setInterval(() => {
        setTp((cur) => {
          if (!cur || cur.state !== "PLAYING") return cur;
          const nt = nextPlayT(compiled, cur.t);
          const m = transport(cur, "SEEK", { t: nt }) as Tp;
          return nt >= compiled.tEnd ? (Object.freeze({ ...m, state: "COMPLETED", t: compiled.tEnd }) as Tp) : m;
        });
      }, STEP_MS / (tpRef.current?.speed ?? 1));
      return () => window.clearInterval(id);
    }
    let raf = 0;
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last == null ? 0 : now - last;
      last = now;
      setTp((cur) => (cur ? (transport(cur, "TICK", { dt }) as Tp) : cur));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, compiled, tp?.speed]);

  const frame = compiled && tp ? frameAt(compiled, tp.t, { step: reduced }) : null;
  const k = frame?.k ?? 0;
  const isFinal = frame?.phase === "FINAL";
  // the live box: the fold of the events played so far (the final box is the same fold over the whole log)
  const fold = useMemo(() => (run ? foldRun(run.events, rosters, k + 1) : null), [run, rosters, k]);
  const rows = useMemo(() => (fold ? boxRows(fold, rosters, names) : null), [fold, rosters, names]);
  const finalFold = useMemo(() => (run ? foldRun(run.events, rosters) : null), [run, rosters]);
  const reconcile = useMemo(() => (finalFold && run ? reconcileBox(finalFold, { final: [run.final.home, run.final.away], overtimePeriods: run.overtimePeriods }) : null), [finalFold, run]);
  const compare = useMemo(() => (finalFold ? compareWithOfficial(boxRows(finalFold, rosters, names), payload.official) : []), [finalFold, rosters, names, payload.official]);
  const abbr = useMemo(() => [teams.home.abbr, teams.away.abbr], [teams]);
  const feed = useMemo(() => {
    if (!run) return [];
    const out = [];
    for (let j = k; j >= 0 && out.length < FEED_ITEMS; j -= 1) {
      const e = run.events[j];
      if (e.type === "period_start" && j > 0) continue;
      const line = playLine(e, names, abbr);
      out.push({ k: j, q: e.q, c: e.c, text: line.text, scoring: line.scoring, s: e.s });
    }
    return out;
  }, [run, k, names, abbr]);

  // announce quarter breaks and the final (never per play)
  const lastAnn = useRef("");
  useEffect(() => {
    if (!frame || !tp || tp.state === "IDLE" || frame.phase === "LIVE") return;
    const key = `${runIdx}-${frame.phase}-${frame.label}`;
    if (lastAnn.current === key) return;
    lastAnn.current = key;
    const word = frame.phase === "FINAL" ? "Final" : frame.breakKind === "HALFTIME" ? "Halftime" : `End of ${frame.label}`;
    setAnnounce(`${word}: ${teams.away.abbr} ${frame.score.away}, ${teams.home.abbr} ${frame.score.home}. Simulated.`);
  }, [frame, tp, runIdx, teams]);

  const selectRun = useCallback((i: number) => {
    if (!payload.runs[i]) return;
    setTp((cur) => (cur && cur.state === "PLAYING" ? (transport(cur, "PAUSE") as Tp) : cur));
    setRunIdx(i);
  }, [payload.runs]);

  const onKey = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!compiled || !tp) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.altKey || e.ctrlKey || e.metaKey) return;
    const onButton = tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
    if ((e.key === " " && !onButton) || e.key === "k" || e.key === "K") { e.preventDefault(); act("TOGGLE"); }
    else if (e.key === ".") { e.preventDefault(); seekTo(nextPlayT(compiled, tp.t)); }
    else if (e.key === ",") { e.preventDefault(); seekTo(prevPlayT(compiled, tp.t)); }
    else if (e.key === "]") { e.preventDefault(); act("NEXT_DRIVE"); }
    else if (e.key === "[") { e.preventDefault(); act("PREV_DRIVE"); }
    else if (e.key === "Home" && !onButton) { e.preventDefault(); act("RESTART"); }
    else if (e.key === "End" && !onButton) { e.preventDefault(); seekTo(compiled.tEnd); }
  }, [compiled, tp, act, seekTo]);

  const rootStyle = NBA_THEATER_VARS as CSSProperties;
  const head = (
    <header className="nbp-head">
      <h2>{teams.away.name} at {teams.home.name}</h2>
      <p className="nbp-engine" data-nbp-engine="">{payload.engine.label}</p>
      <p className="nbp-sub">{payload.venue ? `${payload.venue} · ` : ""}Simulated game · inputs frozen before tip{switchHref ? " · " : ""}{switchHref ? <a className="nbp-switch" href={switchHref}>{switchLabel ?? "Other mode"}</a> : null}</p>
    </header>
  );
  if (!run || !compiled || !frame || !tp || !rows || !reconcile) {
    return (
      <div className="st-root nba-root nbp-root" style={rootStyle} data-nbp-theater="">
        <PossessionBanner />
        {head}
        <OfficialProjectionPanel official={payload.official} teams={teams} />
        <PossessionUnavailable title="Playback unavailable" reason="No stored run of this game passed its checks." />
      </div>
    );
  }

  return (
    <div className={`st-root nba-root nbp-root${reduced ? " is-motion-off" : ""}`} style={rootStyle} data-nbp-theater="" data-nbp-ready={ready ? "" : undefined} data-nbp-run={run.kind} data-nbp-motion={reduced ? "off" : "on"} data-nbp-phase={frame.phase} onKeyDown={onKey} tabIndex={-1}>
      <PossessionBanner />
      {head}

      <div className="nbp-panels">
        <OfficialProjectionPanel official={payload.official} teams={teams} />
        <section className="nbp-panel is-outcome" aria-label={OUTCOME_PANEL_TITLE} data-nbp-outcome={run.kind}>
          <h2>{OUTCOME_PANEL_TITLE}</h2>
          <RunSelector runs={payload.runs} selected={runIdx} onSelect={selectRun} idBase={uid} />
          <RunRole run={run} />
          <Linescore teams={teams} frame={frame} final={isFinal} />
          <p className="nbp-note">{isFinal ? `Final of run ${run.runIndex}: ${teams.away.abbr} ${run.final.away} – ${run.final.home} ${teams.home.abbr}${run.overtimePeriods ? ` (${run.overtimePeriods} OT)` : ""}.` : "The outcome fills in as the game plays; skip to the final at any time."}</p>
        </section>
      </div>

      <section className="nbp-stage" aria-label="Simulated game playback">
        <PossessionScoreboard teams={teams} palette={palette} frame={frame} />
        <PossessionIndicator teams={teams} frame={frame} />
        <div className="nbp-court">
          <NbaCourt palette={palette} teams={{ home: { ...teams.home, providerTeamId: null }, away: { ...teams.away, providerTeamId: null } }} idPrefix={`${uid}-court`} />
          <p className="nbp-court-note">Decorative court · player positions and shot locations are not modelled</p>
        </div>
        <BreakNotice frame={frame} teams={teams} />
        {isFinal ? <EndCard run={run} teams={teams} official={payload.official} onReplay={() => act("RESTART")} boxHref={`#${uid}-box`} /> : null}
        <div className="nbp-transport" role="group" aria-label="Playback controls">
          <button type="button" className="nbp-ctl" onClick={() => act("PREV_DRIVE")} aria-label="Previous quarter">⏮ Qtr</button>
          <button type="button" className="nbp-ctl" onClick={() => seekTo(prevPlayT(compiled, tp.t))} aria-label="Previous play">‹ Play</button>
          <button type="button" className="nbp-ctl is-primary" onClick={() => act("TOGGLE")} aria-label={playing ? "Pause" : tp.state === "COMPLETED" ? "Replay" : "Play"} data-nbp-play-toggle="">{playing ? "Pause" : tp.state === "COMPLETED" ? "Replay" : "Play"}</button>
          <button type="button" className="nbp-ctl" onClick={() => seekTo(nextPlayT(compiled, tp.t))} aria-label="Next play">Play ›</button>
          <button type="button" className="nbp-ctl" onClick={() => act("NEXT_DRIVE")} aria-label="Fast-forward to the next quarter">Qtr ⏭</button>
          <button type="button" className="nbp-ctl" onClick={() => seekTo(compiled.tEnd)} aria-label="Skip to the final">Final</button>
          <button type="button" className="nbp-ctl" onClick={() => act("RESTART")} aria-label="Restart from tip-off">Restart</button>
          <div className="nbp-speeds" role="radiogroup" aria-label="Playback speed">
            {POSSESSION_SPEEDS.map((s: number) => (
              <button key={s} type="button" role="radio" aria-checked={tp.speed === s} className="nbp-speed" onClick={() => act("SPEED", { speed: s })} data-nbp-speed={s}>{s}×</button>
            ))}
          </div>
          <div className="nbp-seekrow">
            <input className="nbp-seek" type="range" min={0} max={compiled.tEnd} step={250} value={Math.round(tp.t)} aria-label={`Seek within run ${run.runIndex}`} aria-valuetext={`${frame.label} ${frame.phase === "LIVE" ? frame.clockDs >= 600 ? `${Math.floor(frame.clockDs / 600)} minutes ${Math.floor((frame.clockDs % 600) / 10)} seconds` : `${(frame.clockDs / 10).toFixed(1)} seconds` : frame.phase.toLowerCase()}`} onChange={(e) => seekTo(Number(e.target.value))} />
            <span className="nbp-ptime">Playback {fmtPlay(tp.t)} / {fmtPlay(compiled.tEnd)}</span>
          </div>
        </div>
        <p className="nbp-keys">{KEYBOARD_HELP}{reduced ? " · Reduced motion: playback steps one play at a time" : ""}</p>
      </section>

      <div className="nbp-grid">
        <section className="nbp-panel" aria-label="Play-by-play">
          <h2>Play-by-play · simulated</h2>
          <PlayByPlay items={feed} teams={teams} newest={k} motion={!reduced} />
        </section>
        <section className="nbp-panel" aria-label="Team scoring progression">
          <h2>Team scoring progression</h2>
          <ScoringProgression compiled={compiled as unknown as Parameters<typeof ScoringProgression>[0]["compiled"]} k={k} teams={teams} palette={palette} />
        </section>
      </div>

      <section className="nbp-panel is-outcome" style={{ marginTop: 12 }} aria-label="Simulation outcome box score" data-nbp-outcome-box={run.kind}>
        <h2>{OUTCOME_PANEL_TITLE} · box score</h2>
        <PossessionBoxScore rows={isFinal ? boxRows(finalFold!, rosters, names) : rows} teams={teams} final={isFinal} idBase={uid} />
        <h3 className="nba-h3">Reconciliation</h3>
        <ReconciliationChecks result={reconcile} />
        <h3 className="nba-h3">Compared with the official projection</h3>
        <OfficialComparison rows={compare} teams={teams} />
      </section>

      <section className="nbp-panel" style={{ marginTop: 12 }} aria-label="About this simulation">
        <h2>About this simulation</h2>
        <EngineFacts payload={payload} />
      </section>
      <div className="st-sr" aria-live="polite" aria-atomic="true">{announce}</div>
    </div>
  );
}
