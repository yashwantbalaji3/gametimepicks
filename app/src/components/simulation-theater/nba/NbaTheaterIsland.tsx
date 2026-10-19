"use client";
/**
 * NBA Simulation Theater · client island (development prototype; mounted only by the GTP_DEV_ROUTES=1 dev route).
 *
 * Plays ONE representative sample of ONE nba-sim-v1 game: the court (no players, ball or shots: not modelled), the
 * scoreboard, quarter checkpoints, halftime and final cards, the sample's final player lines, and the total-points
 * distribution. Frames come from lib/simulation-theater/nba/timeline.mjs stateAt(compiled, t), a pure function of t; the
 * transport (play / pause / restart / seek / speed / previous–next period) is the shared transport-machine.mjs, with the
 * period starts in the slot the NFL theater uses for drive starts. Playback never starts by itself.
 *
 * REFUSAL: a fixture manifest renders only with its exact FIXTURE_BANNER text (the section checks too).
 *
 * DEV HOOK (dev route only, `devHooks`): `?run=<runIndex>` or `?label=<typical|close|high|low|upset>`, and `?t=<seconds>`
 * open that sample paused at that playback second (deterministic), for screenshots.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import BottomSheet from "../BottomSheet";
import NbaCourt from "./NbaCourt";
import { NBA_THEATER_VARS } from "./nba-theater-css";
import {
  BreakCard, DiffTimeline, DisclosureBanner, FIXTURE_BANNER, FixtureBanner, Linescore, ModelFacts, NbaUnavailable, OutcomeChips, PlayerPanel,
  Scoreboard, SelectionRules, TotalHistogram,
} from "./nba-parts";
import type { NbaCompiled, NbaFrame, NbaLoad, NbaManifest, NbaPalette } from "./nba-types";
import { SPEEDS, createTransport, transport } from "@/lib/simulation-theater/transport-machine.mjs";
import { compileTimeline, fmtGameClock, stateAt } from "@/lib/simulation-theater/nba/timeline.mjs";
import { defaultSampleIndex } from "@/lib/simulation-theater/nba/adapter-nba-sim-v1.mjs";

type Tp = { state: string; t: number; tEnd: number; speed: number; driveStarts: number[]; reason: string | null };

const COMPACT_QUERY = "(max-width: 719px)";

function useMedia(query: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const f = () => setOn(mq.matches);
    f();
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, [query]);
  return on;
}

function useWidth(fallback: number) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    const measure = () => setW(Math.round(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [w, setEl] as const;
}

const fmtPlay = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const ICON = {
  play: "M8 5v14l11-7z", pause: "M7 5h4v14H7zM13 5h4v14h-4z", prev: "M6 6h2v12H6zM9.5 12L18 6v12z", next: "M16 6h2v12h-2zM6 6l8.5 6L6 18z",
  restart: "M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z",
};
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="nba-icon"><path d={d} /></svg>;

export default function NbaTheaterIsland({ manifest, palettes, fixtureBanner, devHooks = false }: {
  manifest: NbaManifest; palettes: NonNullable<NbaLoad["palettes"]>; fixtureBanner: string | null; devHooks?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const first = defaultSampleIndex(manifest) ?? 0;
  const [sampleIndex, setSampleIndex] = useState(first);
  const sample = manifest.samples[sampleIndex];
  const compiled = useMemo(() => (sample?.validation.ok ? (compileTimeline(sample) as NbaCompiled) : null), [sample]);
  const [tp, setTp] = useState<Tp | null>(() => (compiled ? (createTransport({ tEnd: compiled.tEnd, driveStarts: compiled.periodStarts }) as Tp) : null));
  const tpRef = useRef(tp);
  tpRef.current = tp;
  const compact = useMedia(COMPACT_QUERY);
  const [neutral, setNeutral] = useState(false);
  const palette: NbaPalette = neutral ? palettes.neutral : palettes.team;
  const [sheet, setSheet] = useState<null | "outcomes">(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [tlW, tlRef] = useWidth(640);
  const [histW, histRef] = useWidth(320);

  // rebuild the transport when the sample changes (keeps the speed; restarts at tip-off)
  const lastCompiled = useRef(compiled);
  useEffect(() => {
    if (lastCompiled.current === compiled) return;
    lastCompiled.current = compiled;
    if (!compiled) { setTp(null); return; }
    let m = createTransport({ tEnd: compiled.tEnd, driveStarts: compiled.periodStarts }) as Tp;
    if (tpRef.current) m = transport(m, "SPEED", { speed: tpRef.current.speed }) as Tp;
    setTp(m);
  }, [compiled]);

  // dev hook: ?run= / ?label= and ?t= (seconds), applied once after mount
  const hookDone = useRef(false);
  const hookT = useRef<number | null>(null);
  useEffect(() => {
    if (!devHooks || hookDone.current || typeof window === "undefined") return;
    hookDone.current = true;
    const q = new URLSearchParams(window.location.search);
    const run = q.get("run");
    const label = q.get("label");
    const i = manifest.samples.findIndex((s) => s.validation.ok && ((run != null && String(s.runIndex) === run) || (label != null && s.label === label)));
    if (i >= 0) setSampleIndex(i);
    const t = Number(q.get("t"));
    if (Number.isFinite(t) && t > 0) hookT.current = t * 1000;
  }, [devHooks, manifest.samples]);
  useEffect(() => {
    if (hookT.current == null || !tp || !compiled || tp.tEnd !== compiled.tEnd) return;
    const t = hookT.current;
    hookT.current = null;
    setTp(transport(tp, "SEEK", { t }) as Tp);
  }, [tp, compiled]);

  const act = useCallback((action: string, arg: Record<string, unknown> = {}) => {
    setTp((cur) => (cur ? (transport(cur, action, arg) as Tp) : cur));
  }, []);

  // the frame loop: only while PLAYING
  const playing = tp?.state === "PLAYING";
  useEffect(() => {
    if (!playing) return;
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
  }, [playing]);

  const frame: NbaFrame | null = compiled && tp ? (stateAt(compiled, tp.t) as NbaFrame) : null;
  const cardKind = frame?.card ?? null;
  const cardKey = cardKind ? `${sampleIndex}-${cardKind}` : null;
  const cardShown = cardKind && dismissed !== cardKey ? cardKind : null;
  useEffect(() => { if (!cardKey && dismissed) setDismissed(null); }, [cardKey, dismissed]);
  const dismiss = useCallback(() => { if (cardKey) setDismissed(cardKey); }, [cardKey]);
  useEffect(() => {
    if (!cardShown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sheet) dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cardShown, dismiss, sheet]);

  // announce recorded checkpoints (never per frame)
  const lastAnn = useRef("");
  useEffect(() => {
    if (!frame || !tp || tp.state === "IDLE") return;
    if (frame.phase === "LIVE") return;
    const key = `${sampleIndex}-${frame.phase}-${frame.period}`;
    if (lastAnn.current === key) return;
    lastAnn.current = key;
    const t = manifest.teams;
    const word = frame.phase === "FINAL" ? "Final" : frame.breakKind === "HALFTIME" ? "Halftime" : `End of ${frame.period}`;
    setAnnounce(`${word}, recorded: ${t.away.abbr} ${frame.score.away}, ${t.home.abbr} ${frame.score.home}.`);
  }, [frame, tp, sampleIndex, manifest.teams]);

  const selectSample = useCallback((i: number) => {
    const s = manifest.samples[i];
    if (!s?.validation.ok) return;
    setTp((cur) => (cur && cur.state === "PLAYING" ? (transport(cur, "PAUSE") as Tp) : cur));
    setSampleIndex(i);
    setSheet(null);
  }, [manifest.samples]);

  if (manifest.fixture && fixtureBanner !== FIXTURE_BANNER) {
    return <NbaUnavailable title="Refused: test fixture without its banner" reason={`This data is a test fixture. It renders only under the banner "${FIXTURE_BANNER}".`} />;
  }

  const teams = manifest.teams;
  const rootStyle = NBA_THEATER_VARS as CSSProperties;
  return (
    <div className="st-root nba-root" style={rootStyle} data-st-colors={palette.mode} data-nba-theater="">
      {manifest.fixture ? <FixtureBanner text={FIXTURE_BANNER} note={manifest.fixtureNote} /> : null}
      <DisclosureBanner manifest={manifest} sample={sample} />
      {devHooks ? (
        <div className="st-devbar nba-devbar">
          <span className="st-devtag">dev prototype</span>
          <label><input type="checkbox" checked={neutral} onChange={(e) => setNeutral(e.target.checked)} /> Neutral colours</label>
          {palette.mode === "team" ? <span className="nba-devnote">Team colours: {palettes.team.status === "single-source-unvalidated" ? "one non-official source, unvalidated" : palettes.team.status}{palettes.team.clash ? ` · ${teams.away.abbr} patterned (colours clash)` : ""}</span> : null}
        </div>
      ) : null}

      <section className="nba-outcomes" aria-label="Representative outcomes">
        <div className="nba-outcomes-head">
          <span className="nba-eyebrow">Representative outcomes · real draws from this run</span>
          {compact ? null : (
            <button type="button" className="nba-linkbtn" aria-expanded={rulesOpen} aria-controls={`${uid}-rules`} onClick={() => setRulesOpen((v) => !v)}>
              {rulesOpen ? "Hide" : "Show"} run numbers and selection rules
            </button>
          )}
        </div>
        {compact ? (
          <button type="button" className="st-samplebtn nba-samplebtn" aria-haspopup="dialog" onClick={() => { act("PAUSE"); setSheet("outcomes"); }}>
            <span className="st-samplebtn-k">{sample?.title ?? "—"}{sample?.validation.ok ? ` · ${teams.away.abbr} ${sample.final.away}–${sample.final.home} ${teams.home.abbr}` : ""}</span>
            <span className="st-samplebtn-run">#{sample?.runIndex}</span>
            <span className="st-caret" aria-hidden="true">▾</span>
          </button>
        ) : (
          <OutcomeChips manifest={manifest} selected={sampleIndex} onSelect={selectSample} idBase={uid} />
        )}
        {!compact && rulesOpen ? <div id={`${uid}-rules`} className="nba-rules-box"><SelectionRules manifest={manifest} /></div> : null}
      </section>

      {!compiled || !frame || !tp || !sample ? (
        <NbaUnavailable title="Playback unavailable" reason={sample ? `Sample failed validation: ${sample.validation.errors.map((e) => `${e.code} (${e.detail})`).join("; ")}` : "No sample."} />
      ) : (
        <>
          <div className="nba-grid">
            <div className="nba-stage">
              <div className="st-broadcast nba-broadcast">
                <Scoreboard teams={teams} palette={palette} frame={frame} fixture={manifest.fixture} />
                <div className="nba-courtwrap">
                  <NbaCourt palette={palette} teams={teams} idPrefix={`${uid}-court`} />
                  <p className="nba-court-note">Quarter-level simulation · no players, ball or shots modelled</p>
                  {cardShown && !compact ? <div className="nba-card-layer"><BreakCard kind={cardShown} manifest={manifest} sample={sample} palette={palette} onDismiss={dismiss} variant="overlay" idBase={uid} /></div> : null}
                </div>
                {cardShown && compact ? <BreakCard kind={cardShown} manifest={manifest} sample={sample} palette={palette} onDismiss={dismiss} variant="sheet" idBase={uid} /> : null}

                <div className="st-transport nba-transport" role="group" aria-label="Playback controls">
                  <div className="st-transport-btns">
                    <button type="button" className="st-btn" aria-label="Previous period" onClick={() => act("PREV_DRIVE")}><Icon d={ICON.prev} /></button>
                    <button type="button" className="st-btn st-play" aria-label={playing ? "Pause" : "Play"} onClick={() => act("TOGGLE")}><Icon d={playing ? ICON.pause : ICON.play} /></button>
                    <button type="button" className="st-btn" aria-label="Next period" onClick={() => act("NEXT_DRIVE")}><Icon d={ICON.next} /></button>
                    <button type="button" className="st-btn" aria-label="Restart from tip-off" onClick={() => act("RESTART")}><Icon d={ICON.restart} /></button>
                    <div className="st-speeds" role="radiogroup" aria-label="Playback speed">
                      {SPEEDS.map((s: number) => (
                        <button key={s} type="button" role="radio" aria-checked={tp.speed === s} className="st-speed" onClick={() => act("SPEED", { speed: s })}>{s}×</button>
                      ))}
                    </div>
                  </div>
                  <div className="st-seekrow">
                    <input className="st-seek" type="range" min={0} max={compiled.tEnd} step={100} value={Math.round(tp.t)} aria-label={`Seek playback of run #${sample.runIndex}`} aria-valuetext={`${frame.periodDisplay} ${frame.phase === "LIVE" ? fmtGameClock(frame.clockSec) : ""}`} onChange={(e) => act("SEEK", { t: Number(e.target.value) })} />
                    <span className="st-ptime"><span className="st-ptime-l">Playback</span> {fmtPlay(tp.t)} / {fmtPlay(compiled.tEnd)}</span>
                  </div>
                </div>
                <div ref={tlRef} className="nba-tl-wrap">
                  <DiffTimeline compiled={compiled} teams={teams} palette={palette} t={tp.t} width={tlW} onSeek={(t) => act("SEEK", { t })} />
                </div>
              </div>
            </div>
            <aside className="nba-side">
              <section className="st-box nba-box" aria-label="Total points distribution">
                <h2>Total points · all {manifest.simulations?.toLocaleString("en-US")} draws</h2>
                <div ref={histRef}><TotalHistogram manifest={manifest} sample={sample} width={histW} /></div>
              </section>
              <section className="st-box nba-box" aria-label="Linescore">
                <h2>Quarter checkpoints · run #{sample.runIndex.toLocaleString("en-US")}</h2>
                <Linescore sample={sample} teams={teams} palette={palette} />
              </section>
            </aside>
          </div>

          <div className="nba-below">
            <section className="st-box nba-box nba-players-box" aria-label="Player lines">
              <div className="nba-box-head">
                <h2>Player lines · this sample&apos;s final</h2>
                {compact ? (
                  <button type="button" className="st-btn nba-expand" aria-expanded={playersOpen} aria-controls={`${uid}-players`} onClick={() => setPlayersOpen((v) => !v)}>
                    {playersOpen ? "Hide" : "Show"}
                  </button>
                ) : null}
              </div>
              {!compact || playersOpen ? (
                <div id={`${uid}-players`}>
                  <PlayerPanel sample={sample} teams={teams} palette={palette} playing={frame.phase !== "FINAL"} />
                </div>
              ) : (
                <p className="nba-fine">Game totals for {sample.players.away.length + sample.players.home.length} players in run #{sample.runIndex}. Per-quarter splits are not modelled.</p>
              )}
            </section>
            <section className="st-box nba-box" aria-label="Evidence">
              <h2>Evidence and limits</h2>
              <ModelFacts manifest={manifest} sample={sample} />
              <ul className="nba-limits">
                {manifest.notModelled.map((x) => <li key={x}>{x}</li>)}
                <li>The score ticks and the game clock between quarter-end checkpoints are illustrative (tagged on screen).</li>
                <li>This sample passed every contract invariant re-checked here (period sums, player points, 3PM ≤ 3PA, minutes = {240 + 25 * sample.overtimePeriods}).</li>
              </ul>
              {compact ? <><h3 className="nba-h3">Selection rules</h3><SelectionRules manifest={manifest} /></> : null}
            </section>
          </div>
        </>
      )}

      <BottomSheet open={sheet === "outcomes"} title="Representative outcomes" onClose={() => setSheet(null)}>
        <p className="nba-fine" style={{ margin: "0 0 8px" }}>Each is one real draw from this run, picked by the rule shown.</p>
        <OutcomeChips manifest={manifest} selected={sampleIndex} onSelect={selectSample} idBase={`${uid}-s`} vertical />
      </BottomSheet>
      <div className="st-sr" aria-live="polite" aria-atomic="true">{announce}</div>
    </div>
  );
}
