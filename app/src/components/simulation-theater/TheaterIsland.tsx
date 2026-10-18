"use client";
/**
 * Simulation Theater V2 · the interactive island (spec §2, §3.5, §3.8). Loaded by TheaterLoader, never on its own.
 *
 * Every frame = stateAtCompiled(one representative run, compiled timeline, t). Playback starts ONLY on an explicit
 * Play (founder D1: no autoplay). The rAF loop runs only while PLAYING, ≥25% of the scene is on screen and the tab is
 * visible; otherwise it is cancelled, and resuming re-anchors the clock so no time jumps.
 *
 * RENDERING (iteration 2). React re-renders only when a COARSE key changes (drive, phase, score, period, possession,
 * chips, cards, breaks). Everything that moves inside a phase (ball, ribbon, trail, start ring, flash, sim clock text,
 * seek position, playback time, timeline cursor) is written to the DOM directly by paintFrame, which the frame store
 * calls synchronously on every frame. The values come from the same pure functions (stateAtCompiled, overlayFrame), so
 * a seek to t paints exactly what playing to t paints.
 *
 * DATA. The island receives the compact `theater-pack@1` transport and rebuilds the adapter's manifest with
 * unpackTheater (lossless; theater-pack.test.mjs).
 *
 * DEV HOOK (dev route only, `devHooks`): `?run=<runIndex>&t=<seconds>` opens that run paused at that playback second,
 * for reproducible screenshots and demos. The public route never passes devHooks.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";

import { FieldLive, FieldMarks, StaticField, paintLive } from "./FieldScene";
import type { Frame, Palette, Side, Teams } from "./FieldScene";
import { Banner, FieldLegend, Linescore, SceneBadge, ScoreBug, Transcript, Unavailable, driveFacts } from "./parts";
import { DistributionPanel, DrivePanel, EvidencePanel } from "./panels";
import BottomSheet from "./BottomSheet";
import { createFrameStore } from "./frame-store";
import type { TheaterEvent, TheaterManifest, TheaterSample } from "./types";
import { THEATER_VARS } from "./theater-css";

import {
  LABELS, PERIOD_SHORT, RUNOFF_NOTE_TEXT, chipTitle, driveAccessibleName, fieldPosition, finalLine, fmtClock, fmtPeriodClock,
  fmtPlayback, scoreLine, transcriptSentence,
} from "@/lib/simulation-theater/format.mjs";
import { compiledFor, stateAtCompiled } from "@/lib/simulation-theater/state-at.mjs";
import { SPEEDS, createTransport, transport } from "@/lib/simulation-theater/transport-machine.mjs";
import { createAnnouncer, flush, offer, SEEK_SETTLE_MS } from "@/lib/simulation-theater/announcer.mjs";
import { TEAM_COLORS_VALIDATED, theaterPalette } from "@/lib/simulation-theater/nfl-team-colors.mjs";
import { fieldMap, overlayFrame } from "@/lib/simulation-theater/field-geometry.mjs";
import { unpackTheater } from "@/lib/simulation-theater/theater-pack.mjs";
import { timelineLayout } from "@/lib/simulation-theater/timeline-layout.mjs";

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
type SheetKind = "samples" | "drive" | "dist" | "evidence" | null;

const STOPS = ["TURNOVER", "DOWNS", "FG_MISS"];
const AFTER_RESULT = ["RESULT", "TRANSITION", "BREAK", "FINAL"];
const SCORE_HEAD: Record<string, string> = { TD: "Touchdown", FG: "Field goal", OPP_TD: "Defensive touchdown", SAFETY: "Safety" };

function useMedia(query: string) {
  const [on, setOn] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false));
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

/** Pre-play (IDLE) shows the opening drive's start spot fully drawn: a display choice, not a timeline frame. */
function shownFrame<F extends { ballOpacity: number; startRingScale: number }>(f: F | null, playState: string): F | null {
  return f && playState === "IDLE" ? { ...f, ballOpacity: 1, startRingScale: 1 } : f;
}

function useBoxSize(ref: React.RefObject<HTMLElement>, mounted: boolean) {
  const [size, setSize] = useState({ W: 1200, H: 561 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (s.W === Math.round(r.width) && s.H === Math.round(r.height) ? s : { W: Math.round(r.width), H: Math.round(r.height) }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, mounted]);
  return size;
}

/** Dev-only `?run=&t=` (seconds). Read once; ignored unless the route passed devHooks. */
function readDevHook(enabled: boolean): { run: number | null; t: number | null } {
  if (!enabled || typeof window === "undefined") return { run: null, t: null };
  const q = new URLSearchParams(window.location.search);
  const run = q.get("run");
  const t = q.get("t");
  const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return { run: num(run), t: num(t) };
}

// ── timeline (one tab stop, roving tabindex; spec S9). Widths: lib/simulation-theater/timeline-layout.mjs (every
//    segment ≥24 px and ∝ playback time; one row, or one row per period when one row cannot keep both) ───────────
function useWidth(ref: React.RefObject<HTMLElement>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const r = el.getBoundingClientRect().width; setW((p) => (Math.abs(p - r) < 0.5 ? p : r)); };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function DriveTimeline({ sample, compiled, palette, teams, current, onSeekDrive, cursorRef }: {
  sample: TheaterSample; compiled: Compiled; palette: Palette; teams: Teams; current: number; onSeekDrive: (i: number) => void;
  cursorRef: (el: HTMLSpanElement | null) => void;
}) {
  const [focusIdx, setFocusIdx] = useState(current);
  const within = useRef(false);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const trackW = useWidth(trackRef);
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
  const layout = useMemo(() => (trackW > 0
    ? timelineLayout(groups.map((g) => ({ period: g.period, durs: g.items.map((ev) => compiled.driveSpans[ev.index].t1 - compiled.driveSpans[ev.index].t0) })), trackW) as { mode: "row" | "rows"; widths: number[] }
    : null), [groups, compiled, trackW]);
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
  const rows = layout?.mode === "rows";
  return (
    <div className="st-timeline">
      <div className="st-tl-head"><span>Drive timeline</span><span>{sample.events.length} drives · width ∝ playback time</span></div>
      <div
        ref={trackRef}
        className={`st-tl-track${rows ? " is-rows" : ""}`}
        role="toolbar"
        aria-label="Drive timeline: arrow keys move between drives, Enter seeks to the drive"
        aria-orientation="horizontal"
        data-st-timeline=""
        data-st-tl-mode={layout?.mode ?? ""}
        onKeyDown={onKey}
        onFocus={() => { within.current = true; }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) within.current = false; }}
      >
        {groups.map((g) => (
          <div key={`${g.period}-${g.items[0].index}`} className="st-tl-period" style={layout ? undefined : { flex: `${g.dur} 1 0` }}>
            <span className="st-tl-plabel" aria-hidden="true">{PERIOD_SHORT[g.period as 1]}</span>
            <div className="st-tl-segs">
              {g.items.map((ev) => {
                const span = compiled.driveSpans[ev.index];
                const ticks = compiled.markers.filter((m) => m.driveIdx === ev.index && !m.exact);
                const cls = (ev.index === current ? " is-current" : ev.index < current ? " is-done" : "") + (palette[ev.offense].accentHatched ? " is-hatch" : "");
                const px = layout ? layout.widths[ev.index] : null;
                return (
                  <button
                    key={ev.index}
                    ref={(el) => { btns.current[ev.index] = el; }}
                    type="button"
                    className={`st-seg${cls}`}
                    tabIndex={ev.index === focusIdx ? 0 : -1}
                    aria-label={driveAccessibleName(ev, teams)}
                    aria-current={ev.index === current ? "step" : undefined}
                    data-st-ms={span.t1 - span.t0}
                    style={{ flex: px != null ? `0 0 ${px}px` : `${span.t1 - span.t0} 1 0`, width: px ?? undefined, "--st-off": palette[ev.offense].accent } as CSSProperties}
                    onClick={() => { setFocusIdx(ev.index); onSeekDrive(ev.index); }}
                  >
                    {ticks.map((m) => (
                      <span key={m.quarter} className="st-tick" aria-hidden="true" style={{ left: `${(((m.atT - span.t0) / (span.t1 - span.t0)) * 100).toFixed(2)}%` }} />
                    ))}
                    <span className="st-ico" aria-hidden="true">{icon(ev)}</span>
                    {ev.index === current ? <span ref={cursorRef} className="st-tl-cursor" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="st-tl-key" aria-hidden="true">
        <span>fill = offense{(["away", "home"] as Side[]).filter((s) => palette[s].accentHatched).map((s) => ` (${teams[s].abbr} hatched)`).join("")}</span><span>★ score</span><span>✕ turnover / downs</span><span>⏸ end of half / regulation / OT</span><span>| quarter rollover</span>
      </div>
    </div>
  );
}

// ── transport icons ────────────────────────────────────────────────────────────────────────────────────────────
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

// ── desktop side panel (tabs) ──────────────────────────────────────────────────────────────────────────────────
function SidePanel({ manifest, sample, ev, onSeekDrive, current }: {
  manifest: TheaterManifest; sample: TheaterSample; ev: TheaterEvent | null; onSeekDrive: (i: number) => void; current: number;
}) {
  const tabs = ["Drive", "Distribution", "Evidence"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Drive");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
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
            aria-controls={tab === name ? `${baseId}-panel-${name}` : undefined}
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
        {tab === "Drive" && ev ? <DrivePanel sample={sample} ev={ev} teams={manifest.teams} current={current} onSeekDrive={onSeekDrive} /> : null}
        {tab === "Distribution" ? <DistributionPanel manifest={manifest} sample={sample} /> : null}
        {tab === "Evidence" ? <EvidencePanel manifest={manifest} sample={sample} /> : null}
      </div>
    </aside>
  );
}

// ── on-field broadcast graphics (HTML over the scene; aria-hidden — the score bug, drive card and live region carry
//    every fact) ─────────────────────────────────────────────────────────────────────────────────────────────────
function Interstitial({ f, ev, teams, overtime, palette }: { f: SceneState; ev: TheaterEvent; teams: Teams; overtime: boolean; palette: Palette }) {
  let text: string | null = null;
  let sub: string | null = null;
  const major = Boolean(f.breakKind);
  if (f.breakKind === "HALFTIME") { text = "Halftime"; sub = scoreLine(f.score, teams); }
  else if (f.breakKind === "OT_START") { text = "End of regulation"; sub = `Overtime next · ${scoreLine(f.score, teams)}`; }
  else if (f.breakKind === "FINAL") { text = overtime ? "Final · OT" : "Final"; sub = scoreLine(f.score, teams); }
  else if (f.rollover) text = `End of Q${f.rollover.quarter}`;
  else if (f.phase === "RESULT" && ev.outcome === "END_HALF") text = ev.outcomeLabel.charAt(0).toUpperCase() + ev.outcomeLabel.slice(1);
  if (!text) return null;
  return (
    <div className={`st-strip${f.rollover && !f.breakKind ? " is-roll" : ""}${major ? " is-major" : ""}`} aria-hidden="true" key={`${f.driveIdx}-${text}`}>
      {major && palette.mode === "team" ? (
        /* halftime / end of regulation / final: the two teams' accents across the top, away then home (score-bug order) */
        <span className="st-strip-rule">
          <i style={{ background: palette.away.accent }} />
          <i style={{ background: palette.home.accent }} />
        </span>
      ) : null}
      <span className="st-strip-main">{text}</span>
      {sub ? <span className="st-strip-sub">{sub}</span> : null}
    </div>
  );
}

function ScoreFlash({ ev, teams, palette }: { ev: TheaterEvent; teams: Teams; palette: Palette }) {
  if (!ev.scoring || !ev.scoringSide) return null;
  const side = ev.scoringSide as Side;
  const pts = ev.delta[side];
  return (
    <div
      className={`st-scoreflash${palette.mode === "team" ? " is-team" : ""}`}
      aria-hidden="true"
      key={`sf-${ev.index}`}
      style={{ "--st-team": palette[side].accent, "--st-team-fill": palette[side].fill, "--st-team-ink": palette[side].ink, "--st-team-trim": palette[side].trim } as CSSProperties}
    >
      <span className="st-scoreflash-bar" />
      <span className="st-scoreflash-head">{SCORE_HEAD[ev.outcome] ?? ev.outcomeLabel}</span>
      <span className="st-scoreflash-sub">{teams[side].abbr} +{pts}</span>
    </div>
  );
}

function LowerThird({ f, ev, teams, sample, scoring }: { f: SceneState; ev: TheaterEvent; teams: Teams; sample: TheaterSample; scoring: boolean }) {
  const runoff = ev.notes.some((n) => n.code === "ENGINE_CLOCK_RUNOFF");
  if (f.phase === "TRANSITION" && f.card) {
    return <div className="st-lower is-card" aria-hidden="true"><span>{f.card}</span></div>;
  }
  if (f.phase === "RESULT") {
    const d = driveFacts(ev, teams);
    return (
      <div className={`st-lower${scoring ? " with-banner" : ""}`} aria-hidden="true" key={`lt-${ev.index}`}>
        <span className="st-lower-tag">Drive {ev.index + 1}/{sample.events.length}</span>
        <span className="st-lower-main">{teams[ev.offense].abbr} · {d.plays} · {d.yards} · {d.time}</span>
        <span className="st-lower-res">{d.result}</span>
      </div>
    );
  }
  if (runoff && (f.phase === "START" || f.phase === "PROGRESS")) {
    return <div className="st-lower is-note" aria-hidden="true"><span>{RUNOFF_NOTE_TEXT}</span></div>;
  }
  return null;
}

// ── the island ─────────────────────────────────────────────────────────────────────────────────────────────────
type Pack = Parameters<typeof unpackTheater>[0];

export default function TheaterIsland({ pack, devHooks = false }: { pack: Pack; devHooks?: boolean }) {
  const manifest = useMemo(() => unpackTheater(pack) as TheaterManifest, [pack]);
  const teams = manifest.teams;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hook = useMemo(() => readDevHook(devHooks), [devHooks]);
  const firstOk = manifest.chips.find((c) => c.available)?.sampleIndex ?? 0;
  const [sampleIndex, setSampleIndex] = useState(() => {
    if (hook.run != null) {
      const c = manifest.chips.find((x) => x.runIndex === hook.run && x.available);
      if (c) return c.sampleIndex;
    }
    return firstOk;
  });
  const sample = manifest.samples[sampleIndex];
  const [reduced, setReduced] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false));
  const compact = useMedia("(max-width: 719px)");
  // Team colours are ON in this dev prototype (founder D3, 2026-10-18); the dev bar's switch shows the neutral GTP frame.
  const [neutralColors, setNeutralColors] = useState(false);
  const palette = useMemo(
    () => theaterPalette(teams.home.abbr, teams.away.abbr, { neutral: neutralColors }) as Palette,
    [teams.home.abbr, teams.away.abbr, neutralColors],
  );
  const compiled = useMemo(() => (sample?.validation.ok ? (compiledFor(sample, { reducedMotion: reduced }) as Compiled) : null), [sample, reduced]);

  const store = useMemo(() => createFrameStore<Live>({ t: 0, frame: null, playState: "IDLE" }), []);
  const tpRef = useRef<Tp | null>(null);
  const [ctl, setCtl] = useState<{ state: string; speed: number }>({ state: "IDLE", speed: 1 });
  const [coarse, setCoarse] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(stageRef, Boolean(compiled));
  const boxRef = useRef(box);
  boxRef.current = box;
  const [visible, setVisible] = useState(true);
  const [docVisible, setDocVisible] = useState(true);
  const [announce, setAnnounce] = useState("");
  const [sheet, setSheet] = useState<SheetKind>(null);
  type AnnState = { lastAt: number; queued: { kind: string; text: string } | null; spoken: { kind: string; text: string } | null };
  const annRef = useRef<AnnState>(createAnnouncer() as AnnState);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResultDrive = useRef(-1);
  const lastBreak = useRef<string | null>(null);
  const lastRoll = useRef<number | null>(null);
  const hookApplied = useRef(false);

  // direct-write targets for the per-frame painter
  const els = useRef({
    ball: null as SVGGElement | null, ribbon: null as SVGRectElement | null, ribbonHi: null as SVGRectElement | null,
    trail: null as SVGRectElement | null, ring: null as SVGCircleElement | null, flash: null as SVGRectElement | null,
    clock: null as HTMLSpanElement | null, seek: null as HTMLInputElement | null, ptime: null as HTMLSpanElement | null,
    cursor: null as HTMLSpanElement | null,
  });
  const liveRefs = useMemo(() => ({
    ball: (el: SVGGElement | null) => { els.current.ball = el; },
    ribbon: (el: SVGRectElement | null) => { els.current.ribbon = el; },
    ribbonHi: (el: SVGRectElement | null) => { els.current.ribbonHi = el; },
    trail: (el: SVGRectElement | null) => { els.current.trail = el; },
    ring: (el: SVGCircleElement | null) => { els.current.ring = el; },
    flash: (el: SVGRectElement | null) => { els.current.flash = el; },
  }), []);
  const setClockEl = useCallback((el: HTMLSpanElement | null) => { els.current.clock = el; }, []);
  const setCursorEl = useCallback((el: HTMLSpanElement | null) => { els.current.cursor = el; }, []);
  const lastText = useRef({ clock: "", ptime: "", vt: "" });

  const frameAt = useCallback((t: number): SceneState | null => (compiled && sample ? (stateAtCompiled(sample, compiled, teams, t) as SceneState) : null), [compiled, sample, teams]);

  /** The per-frame painter: direct DOM writes only. */
  const paintFrame = useCallback(() => {
    const live = store.get();
    const f = shownFrame(live.frame, live.playState);
    const e = els.current;
    paintLive(e, overlayFrame(f, boxRef.current));
    if (f) {
      const c = fmtClock(f.periodClock);
      if (e.clock && lastText.current.clock !== c) { e.clock.textContent = c; lastText.current.clock = c; }
      if (compiled) {
        const span = compiled.driveSpans[f.driveIdx];
        if (e.cursor && span) e.cursor.style.left = `calc(${(Math.min(1, Math.max(0, (live.t - span.t0) / Math.max(1, span.t1 - span.t0))) * 100).toFixed(2)}% - 1px)`;
        const tv = Math.round(live.t / 100) * 100;
        if (e.seek) {
          if (Number(e.seek.value) !== tv) e.seek.value = String(tv);
          e.seek.style.setProperty("--st-pct", `${((tv / compiled.tEnd) * 100).toFixed(2)}%`);
          const vt = `${PERIOD_SHORT[f.period as 1]} ${fmtClock(f.periodClock)}, drive ${f.driveIdx + 1} of ${f.driveCount}`;
          if (lastText.current.vt !== vt) { e.seek.setAttribute("aria-valuetext", vt); lastText.current.vt = vt; }
        }
        const pt = `${fmtPlayback(tv)} / ${fmtPlayback(compiled.tEnd)}`;
        if (e.ptime && lastText.current.ptime !== pt) { e.ptime.textContent = pt; lastText.current.ptime = pt; }
      }
    }
  }, [store, compiled]);

  useEffect(() => store.subscribe(paintFrame), [store, paintFrame]);
  // after every React commit (coarse change, resize, palette), repaint so freshly mounted nodes carry the frame
  useEffect(() => { lastText.current = { clock: "", ptime: "", vt: "" }; paintFrame(); });

  const commit = useCallback((next: Tp) => {
    tpRef.current = next;
    const frame = frameAt(next.t);
    store.set({ t: next.t, frame, playState: next.state });
    setCtl((c) => (c.state === next.state && c.speed === next.speed ? c : { state: next.state, speed: next.speed }));
    const key = frame
      ? `${frame.driveIdx}|${frame.phase}|${frame.score.home}-${frame.score.away}|${frame.chip?.text ?? ""}|${frame.card ?? ""}|${frame.rollover?.quarter ?? ""}|${frame.dimmed}|${frame.period}|${frame.clockIllustrative}|${next.state === "IDLE"}`
      : "none";
    setCoarse((k) => (k === key ? k : key));
  }, [frameAt, store]);

  const say = useCallback((msg: { kind: string; text: string }) => {
    const speed = tpRef.current?.speed ?? 1;
    const r = offer(annRef.current, msg, { speed, now: performance.now() });
    annRef.current = r.state as AnnState;
    if (r.say) setAnnounce(r.say);
  }, []);

  // reduced motion: follow the OS setting
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
  useLayoutEffect(() => {
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
    if (!hookApplied.current) {
      hookApplied.current = true;
      if (hook.t != null && hook.t > 0) m = transport(m, "SEEK", { t: hook.t * 1000 }) as Tp;
    }
    lastResultDrive.current = -1;
    lastBreak.current = null;
    lastRoll.current = null;
    commit(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled]);

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
  }, [compiled]);
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
    if (playing && AFTER_RESULT.includes(f.phase) && lastResultDrive.current !== f.driveIdx) {
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

  const act = useCallback((action: string, arg: Record<string, unknown> = {}) => {
    const cur = tpRef.current;
    if (!cur) return;
    const next = transport(cur, action, arg) as Tp;
    if (next === cur) return;
    commit(next);
    if (action === "PAUSE" || (action === "TOGGLE" && next.state !== "PLAYING")) announceFull();
    if (["SEEK", "NEXT_DRIVE", "PREV_DRIVE", "RESTART"].includes(action)) {
      lastResultDrive.current = store.get().frame?.driveIdx ?? -1; // silent while seeking
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

  const openSheet = useCallback((k: SheetKind) => {
    const cur = tpRef.current;
    if (cur && cur.state === "PLAYING") act("PAUSE"); // opening a sheet pauses; only the reader resumes
    setSheet(k);
  }, [act]);

  // focus-scoped keyboard shortcuts (spec §2.1 Keyboard, S9; WCAG 2.1.4: active only while the region has focus)
  const onRegionKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.closest("[role=dialog]")) return; // sheets keep their own keys
    const tag = target.tagName;
    const isRange = tag === "INPUT" && (target as HTMLInputElement).type === "range";
    const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    const isButton = tag === "BUTTON" || tag === "SUMMARY" || target.getAttribute("role") === "tab" || target.getAttribute("role") === "radio";
    const inTimeline = Boolean(target.closest("[data-st-timeline]"));
    const inTabs = Boolean(target.closest("[role=tablist]")) || Boolean(target.closest("[role=radiogroup]"));
    const arrowsFree = !isRange && !inTimeline && !inTabs;
    if (isInput && !isRange) return;
    if (isRange && !["k", "K", "1", "2", "4"].includes(e.key)) return; // the seek range keeps its native keys
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

  const live = store.get();
  const f = live.frame;
  const shown = shownFrame(f, live.playState);
  const ev = f && sample ? sample.events[f.driveIdx] : null;
  const playing = ctl.state === "PLAYING";
  const speedCycle = () => act("SPEED", { speed: SPEEDS[(SPEEDS.indexOf(ctl.speed) + 1) % SPEEDS.length] });
  const currentChip = manifest.chips.find((c) => c.sampleIndex === sampleIndex);

  // score bug inputs
  const prevScore = useRef<{ home: number; away: number } | null>(null);
  const scoreKey = f ? `${f.score.home}-${f.score.away}` : "";
  const bump = useMemo(() => {
    const p = prevScore.current;
    const now = f ? f.score : null;
    const b = p && now ? { home: now.home > p.home ? now.home : 0, away: now.away > p.away ? now.away : 0 } : { home: 0, away: 0 };
    prevScore.current = now;
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreKey]);
  const stateChip = !f ? null : f.breakKind === "HALFTIME" ? "HALFTIME" : f.breakKind === "OT_START" ? "END REG" : f.breakKind === "FINAL" ? (sample?.finalScore?.overtime ? "FINAL/OT" : "FINAL")
    : f.rollover ? `END Q${f.rollover.quarter}` : null;

  const chipList = (vertical: boolean) => (
    <div className={`st-chips${vertical ? " is-vertical" : ""}`} role="radiogroup" aria-labelledby={`${uid}-samples`} onKeyDown={onChipKey}>
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
            data-sheet-initial={vertical && checked ? "" : undefined}
            title={c.available ? undefined : `Unavailable: ${s.validation.errors.map((x) => x.detail).join("; ")}`}
            onClick={() => { selectSample(c.sampleIndex); if (vertical) setSheet(null); }}
          >
            <span className="st-dot" aria-hidden="true" />
            <span>{chipTitle(c.kinds)}</span>
            {s.finalScore ? <span className="st-chip-score">{finalLine(s.finalScore, teams)}</span> : null}
            {!c.available ? <span className="st-chip-score">unavailable</span> : null}
          </button>
        );
      })}
    </div>
  );
  const ruleLine = sample ? (
    <p className="st-rule">
      {sample.selectionRules.map((r) => r.text).join(" Also: ")} <span className="st-mono">· run #{sample.runIndex.toLocaleString("en-US")} of {manifest.runCount.toLocaleString("en-US")}</span>
      {manifest.absentKinds.includes("OVERTIME") ? <span className="st-mono"> · No overtime run in this batch</span> : null}
    </p>
  ) : null;

  const o = overlayFrame(shown, box);
  // static layers: built once per size/palette, never per frame
  const detail = box.W >= 400;
  const staticLayer = useMemo(() => <StaticField palette={palette} idPrefix={`${uid}-f`} detail={detail} />, [palette, uid, detail]);
  const marksLayer = useMemo(() => <FieldMarks W={box.W} H={box.H} palette={palette} teams={teams} />, [box.W, box.H, palette, teams]);
  const m = fieldMap(box.W, box.H);
  const def = ev ? teams[ev.offense === "home" ? "away" : "home"].abbr : "";
  const showEnd = Boolean(f && AFTER_RESULT.includes(f.phase));
  const endFieldX = ev ? (ev.offense === "home" ? 110 - ev.fieldEnd : 10 + ev.fieldEnd) : 0;
  const scoringNow = Boolean(f && ev && f.phase === "RESULT" && ev.scoring);
  const sides = ["away", "home"] as Side[];
  const derivedAccents = sides.filter((s) => palette[s].accentBase);
  const colourNote = palette.mode !== "team"
    ? "Neutral GTP colours (team colours off)."
    : [
      "Team colours: official league and club values (evidence: nfl-team-colors-evidence.json).",
      derivedAccents.length ? `Lightened on the field for 3:1 on the turf: ${derivedAccents.map((s) => `${teams[s].abbr} ${palette[s].accentBase} → ${palette[s].accent}`).join(", ")}.` : "",
      sides.filter((s) => palette[s].accentSwap).map((s) => `${teams[s].abbr} uses ${palette[s].accentSwap} on the field (accents too close).`).join(" "),
      sides.filter((s) => palette[s].hatched).map((s) => `${teams[s].abbr} end zone hatched (colours too close).`).join(" "),
      sides.filter((s) => palette[s].accentHatched).map((s) => `${teams[s].abbr} timeline hatched (accents too close).`).join(" "),
    ].filter(Boolean).join(" ");

  return (
    <div
      className="st-root"
      style={THEATER_VARS as CSSProperties}
      role="region"
      aria-label="Simulation theater"
      onKeyDown={onRegionKey}
      data-st-ready=""
      data-st-state={ctl.state}
      data-st-phase={f?.phase ?? ""}
      data-st-drive={f ? f.driveIdx : ""}
      data-st-run={sample?.runIndex ?? ""}
      data-st-reduced={reduced ? "1" : "0"}
      data-st-colors={palette.mode}
    >
      <Banner manifest={manifest} sample={sample ?? null} />
      <div className="st-devbar">
        <span className="st-devtag">Development route · unlinked · noindex</span>
        {TEAM_COLORS_VALIDATED ? (
          <label>
            <input type="checkbox" checked={neutralColors} onChange={(e) => setNeutralColors(e.target.checked)} />
            Neutral colours
          </label>
        ) : null}
        <span className="st-devnote">{colourNote}</span>
      </div>

      <div className="st-samples">
        <div className="st-samples-head"><span id={`${uid}-samples`}>Representative runs</span><span className="st-samplelabel">{LABELS.sample}</span></div>
        {compact ? (
          <button type="button" className="st-samplebtn" aria-haspopup="dialog" onClick={() => openSheet("samples")}>
            <span className="st-samplebtn-k">{currentChip ? chipTitle(currentChip.kinds) : "Run"}</span>
            {sample?.finalScore ? <span className="st-chip-score">{finalLine(sample.finalScore, teams)}</span> : null}
            <span className="st-samplebtn-run">#{sample?.runIndex}</span>
            <span aria-hidden="true" className="st-caret">▾</span>
            <span className="st-sr">, change run</span>
          </button>
        ) : (
          <>{chipList(false)}{ruleLine}</>
        )}
      </div>

      {!sample || !sample.validation.ok || !compiled ? (
        <div style={{ marginTop: 14 }}>
          <Unavailable title="Playback unavailable for this run" reason="This representative run failed validation, so no scene is drawn for it (never a guessed one, never another run in its place)." items={sample?.validation.errors} />
        </div>
      ) : (
        <>
          <div className="st-grid">
            <div className="st-stage">
              <div className="st-broadcast">
                {f ? (
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
                    illusId={`${uid}-illus`}
                    clockRef={setClockEl}
                  />
                ) : null}
                <SceneBadge />
                <div ref={stageRef} className={`st-fieldwrap${f?.dimmed ? " is-dim" : ""}`}>
                  {staticLayer}
                  {marksLayer}
                  <div className="st-dimmer" aria-hidden="true" />
                  <FieldLive
                    W={box.W}
                    H={box.H}
                    frame={shown}
                    o={o}
                    palette={palette}
                    offenseAbbr={ev ? teams[ev.offense].abbr : ""}
                    startTag={ev ? `START · ${fieldPosition(ev.fieldStart, def).toUpperCase()}` : ""}
                    endTag={ev ? `END · ${ev.fieldEnd <= 0 ? "END ZONE" : ev.fieldEnd >= 100 ? "OWN END ZONE" : fieldPosition(ev.fieldEnd, def).toUpperCase()}` : ""}
                    showEnd={showEnd}
                    endX={m.X(endFieldX)}
                    idPrefix={`${uid}-l`}
                    reducedMotion={reduced}
                    refs={liveRefs}
                    travelDir={ev ? Math.sign(endFieldX - (ev.offense === "home" ? 110 - ev.fieldStart : 10 + ev.fieldStart)) || (ev.offense === "home" ? 1 : -1) : 1}
                  />
                  {f && ev ? <Interstitial f={f} ev={ev} teams={teams} overtime={Boolean(sample.finalScore?.overtime)} palette={palette} /> : null}
                  {scoringNow && ev ? <ScoreFlash ev={ev} teams={teams} palette={palette} /> : null}
                  {f && ev ? <LowerThird f={f} ev={ev} teams={teams} sample={sample} scoring={scoringNow} /> : null}
                </div>
                <FieldLegend homeAbbr={teams.home.abbr} />

                <div className="st-transport" role="group" aria-label="Playback controls">
                  <div className="st-transport-btns">
                    <button type="button" className="st-btn" aria-label="Previous drive" onClick={() => act("PREV_DRIVE")}><Icon d={ICONS.prev} /></button>
                    <button type="button" className="st-btn st-play" aria-label={playing ? "Pause" : "Play"} onClick={() => act("TOGGLE")}>
                      <Icon d={playing ? ICONS.pause : ICONS.play} />
                    </button>
                    <button type="button" className="st-btn" aria-label="Next drive" onClick={() => act("NEXT_DRIVE")}><Icon d={ICONS.next} /></button>
                    {compact ? null : <button type="button" className="st-btn" aria-label="Restart from kickoff" onClick={() => act("RESTART")}><Icon d={ICONS.restart} /></button>}
                    {compact ? (
                      <button type="button" className="st-btn st-speedcycle" aria-label={`Playback speed ${ctl.speed}×, change speed`} onClick={speedCycle}>{ctl.speed}×</button>
                    ) : (
                      <div className="st-speeds" role="radiogroup" aria-label="Playback speed">
                        {SPEEDS.map((s: number) => (
                          <button key={s} type="button" role="radio" aria-checked={ctl.speed === s} tabIndex={ctl.speed === s ? 0 : -1} className="st-speed" onClick={() => act("SPEED", { speed: s })}>{s}×</button>
                        ))}
                      </div>
                    )}
                    <a className="st-btn" href={`#st-transcript-${sample.runIndex}`} aria-label="Go to the full drive transcript"><Icon d={ICONS.list} /></a>
                  </div>
                  <div className="st-seekrow">
                    <input
                      ref={(el) => { els.current.seek = el; }}
                      className="st-seek"
                      type="range"
                      min={0}
                      max={compiled.tEnd}
                      step={100}
                      defaultValue={0}
                      aria-label={`Seek playback of run #${sample.runIndex}`}
                      onChange={(e) => act("SEEK", { t: Number(e.target.value) })}
                    />
                    <span className="st-ptime"><span className="st-ptime-l">Playback</span> <span ref={(el) => { els.current.ptime = el; }} /></span>
                  </div>
                </div>
                <DriveTimeline sample={sample} compiled={compiled} palette={palette} teams={teams} current={f?.driveIdx ?? 0} onSeekDrive={seekDrive} cursorRef={setCursorEl} />
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

              {compact && ev ? (
                <section className="st-drivecard" aria-label="Current drive">
                  <div className="st-eyebrow">Drive {ev.index + 1} of {sample.events.length} · {fmtPeriodClock(ev.period, ev.periodClockStart)}</div>
                  <h3 className="st-panel-h">{driveFacts(ev, teams).head}</h3>
                  <p className="st-drivecard-facts">{driveFacts(ev, teams).plays} · {driveFacts(ev, teams).yards} · {driveFacts(ev, teams).time} · {driveFacts(ev, teams).result}</p>
                  <div className="st-sheetbtns">
                    <button type="button" className="st-btn" aria-haspopup="dialog" onClick={() => openSheet("drive")}>Drive details</button>
                    <button type="button" className="st-btn" aria-haspopup="dialog" onClick={() => openSheet("dist")}>Distribution</button>
                    <button type="button" className="st-btn" aria-haspopup="dialog" onClick={() => openSheet("evidence")}>Evidence</button>
                  </div>
                </section>
              ) : null}
            </div>
            {compact ? null : <SidePanel manifest={manifest} sample={sample} ev={ev} onSeekDrive={seekDrive} current={f?.driveIdx ?? 0} />}
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

      <BottomSheet open={sheet === "samples"} title="Representative runs" onClose={() => setSheet(null)}>
        <p className="st-samplelabel" style={{ margin: "0 0 8px" }}>{LABELS.sample}</p>
        {chipList(true)}
        {ruleLine}
      </BottomSheet>
      {sample && ev ? (
        <>
          <BottomSheet open={sheet === "drive"} title="Drive details" onClose={() => setSheet(null)}>
            <DrivePanel sample={sample} ev={ev} teams={teams} current={f?.driveIdx ?? 0} onSeekDrive={(i) => { seekDrive(i); setSheet(null); }} />
          </BottomSheet>
          <BottomSheet open={sheet === "dist"} title="Distribution" onClose={() => setSheet(null)}>
            <DistributionPanel manifest={manifest} sample={sample} />
          </BottomSheet>
          <BottomSheet open={sheet === "evidence"} title="Evidence" onClose={() => setSheet(null)}>
            <EvidencePanel manifest={manifest} sample={sample} />
          </BottomSheet>
        </>
      ) : null}
      <div className="st-sr" aria-live="polite" aria-atomic="true">{announce}</div>
    </div>
  );
}
