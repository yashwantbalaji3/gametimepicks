"use client";
/**
 * THE PRESENTATION PLAYER — Program 234 · Release B.
 *
 * One bounded frame, one click, one complete narrative. The reader presses play and may then leave
 * the pointer alone: chapters advance on their own clock, each fitting the frame without a scrollbar
 * and without shrinking text to make it fit. Everything on screen was projected at build time by
 * `lib/simulate/presentation` from a single artifact revision, so a replay cannot show a different
 * prediction than the first play did.
 *
 * WHAT THIS IS NOT. It is not a simulator. The trials ran when the artifact was generated; this is a
 * reveal of their result, and the copy says "simulated games" only where the artifact permits the
 * claim. There is deliberately no loading phase — the data is already in the page, and making a
 * reader watch a progress bar for something already available is the ceremony this replaces.
 *
 * WHY IT REPLACES THE OLD REVEAL. The previous flow held every reader for a fixed ten seconds of
 * animation before showing a precomputed dashboard. The frame is the same idea done honestly: the
 * opening is short, every chapter is skippable, and the full report sits underneath the whole time.
 *
 * ACCESSIBILITY. Dialog semantics with an accessible name, focus moved in and restored on close,
 * Escape closes, Tab is trapped inside while open, background scroll is locked only while open and
 * restored on every exit path, arrow keys and space drive the chapters, and the chapter text is a
 * live region — motion decorates, the text states. A reader who never plays it can still read the
 * whole report; a reader on reduced motion gets the same chapters without the animation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import SimulationScene from "@/components/simulate/scenes";
import { themeFor } from "@/lib/simulate/themes";
import { createPlayer, apply, isRunning } from "@/lib/simulate/presentation/player-machine.mjs";
import type {
  PresentationBar,
  PresentationChapter,
  PresentationManifest,
  PresentationResult,
  PresentationStat,
} from "@/lib/simulate/presentation/types";
import { isPresentable } from "@/lib/simulate/presentation/types";

/** Frame shapes. `natural` is the in-page default; the rest are Release D's recording compositions. */
export type FrameRatio = "natural" | "portrait" | "landscape" | "feed";

const RATIO_CSS: Record<FrameRatio, string | undefined> = {
  natural: undefined,
  portrait: "9 / 16",
  landscape: "16 / 9",
  feed: "4 / 5",
};

/* ── formatting · ONE owner, so two chapters cannot disagree about the same number ─────────────── */
const asPct = (n: number) => `${Math.round(n * 100)}%`;
function statText(s: PresentationStat): string {
  if (s.format === "text") return s.text ?? "—";
  if (s.value == null || !Number.isFinite(s.value)) return "—";
  switch (s.format) {
    case "probability": return asPct(s.value);
    case "decimal1": return s.value.toFixed(1);
    case "decimal2": return s.value.toFixed(2);
    case "signed": return `${s.value >= 0 ? "+" : ""}${s.value}`;
    default: return String(s.value);
  }
}

interface PlayerCtx {
  state: string;
  eventId: string;
  chapterCount: number;
  index: number;
  reason: string | null;
  run: number;
}

/* ── chapter bodies ───────────────────────────────────────────────────────────────────────────── */

function StatRow({ stats }: { stats: readonly PresentationStat[] }) {
  if (!stats.length) return null;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col min-w-0">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{s.label}</span>
          <span className="font-display tabular-nums" style={{ color: "var(--vault-text)", fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>
            {statText(s)}
          </span>
          {s.note ? <span style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.4 }}>{s.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Horizontal comparison bars — for two-or-few outcomes where the labels are words. */
function CompareBars({ bars, accent }: { bars: readonly PresentationBar[]; accent: string }) {
  if (!bars.length) return null;
  const max = Math.max(...bars.map((b) => b.p), 0.0001);
  return (
    <div className="flex flex-col gap-1.5">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="truncate shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 11, width: "38%" }}>{b.label}</span>
          <span className="relative flex-1 rounded-full overflow-hidden" style={{ height: 10, background: "var(--vault-wash-soft)" }}>
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(b.p / max) * 100}%`, background: b.highlight ? accent : "var(--vault-text-faint)" }} />
          </span>
          <span className="font-mono tabular-nums shrink-0 text-right" style={{ color: "var(--vault-text)", fontSize: 11, width: 40 }}>{asPct(b.p)}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical histogram — for a real distribution whose x axis is a number line. */
function Histogram({ bars, accent, caption }: { bars: readonly PresentationBar[]; accent: string; caption: string }) {
  if (!bars.length) return null;
  const max = Math.max(...bars.map((b) => b.p), 0.0001);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-[3px]" style={{ height: 84 }}>
        {bars.map((b) => (
          <span key={b.label} className="flex-1 rounded-t-[2px]" title={`${b.label}: ${asPct(b.p)}`}
            style={{ height: `${Math.max((b.p / max) * 100, 3)}%`, background: b.highlight ? accent : "color-mix(in srgb, var(--vault-text-faint) 60%, transparent)" }} />
        ))}
      </div>
      {/* Every bin is DRAWN; only the axis labels thin out, and the highlighted bin always keeps
          its own. Thinning labels is a legibility choice — dropping bars would change the shape. */}
      <div className="flex gap-[3px]">
        {bars.map((b, i) => (
          <span key={b.label} className="flex-1 text-center font-mono tabular-nums truncate"
            style={{ color: b.highlight ? "var(--vault-text-mute)" : "var(--vault-text-faint)", fontSize: 8.5 }}>
            {b.highlight || i % 3 === 0 ? b.label : ""}
          </span>
        ))}
      </div>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{caption}</span>
    </div>
  );
}

/**
 * `columns: 2` is for the landscape crop, where a five-row chapter overflowed a 16:9 box and was
 * silently clipped by the frame's own `overflow-hidden` — content hidden, no scrollbar, nothing to
 * tell a reader anything was missing. Truncating the list would have been worse than the clip;
 * landscape has width nobody was using, so the rows use it.
 */
function DetailRows({ rows, columns = 1 }: { rows: PresentationChapter["rows"]; columns?: 1 | 2 }) {
  if (!rows.length) return null;
  return (
    <ul className={`m-0 p-0 gap-1.5 ${columns === 2 ? "grid grid-cols-2" : "flex flex-col"}`} style={{ listStyle: "none" }}>
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="flex items-baseline gap-2 rounded-[6px] px-2 py-1.5"
          style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-border)" }}>
          <span className="shrink-0 font-display" style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 700, maxWidth: "42%" }}>{r.label}</span>
          <span className="flex-1 min-w-0" style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.45 }}>{r.detail}</span>
          {r.value ? <span className="shrink-0 font-mono tabular-nums" style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 700 }}>{r.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ChapterBody({ chapter, accent, accentSoft, sport, run, wide }: {
  chapter: PresentationChapter; accent: string; accentSoft: string; sport: string; run: number;
  /** True in the landscape crop, where rows lay out in two columns instead of overflowing. */
  wide?: boolean;
}) {
  const theme = themeFor(sport);
  const rowColumns: 1 | 2 = wide && chapter.rows.length > 3 ? 2 : 1;
  switch (chapter.kind) {
    case "event":
    case "closing":
      /*
       * SIDE BY SIDE IN LANDSCAPE. Stacked, the scene plus three rows overflowed a 16:9 crop by
       * twelve pixels and the last row was clipped away with nothing to indicate it. A wide frame
       * has the width for both, so the shape of the crop decides the arrangement.
       */
      return (
        <div className={wide ? "flex flex-row items-center gap-4" : "flex flex-col gap-3"}>
          {/* The scene is decorative and aria-hidden; it is keyed on `run` so a replay redraws it. */}
          <div key={`scene-${run}`} className={wide ? "w-1/2 shrink-0" : ""}>
            <SimulationScene scene={theme.scene} accent={accent} accentSoft={accentSoft} phase="SUMMARIZING" />
          </div>
          <div className={wide ? "flex-1 min-w-0" : ""}>
            <DetailRows rows={chapter.rows} />
          </div>
        </div>
      );
    case "distribution":
      return (
        <div className="flex flex-col gap-3">
          <StatRow stats={chapter.stats} />
          {/* The caption is the CHAPTER's, never this component's — units belong to the sport. */}
          <Histogram bars={chapter.bars} accent={accent} caption={chapter.axisCaption ?? ""} />
        </div>
      );
    case "scores":
      return (
        <div className="flex flex-col gap-3">
          <CompareBars bars={chapter.bars} accent={accent} />
          <StatRow stats={chapter.stats} />
        </div>
      );
    case "players":
    case "limits":
      return <DetailRows rows={chapter.rows} columns={rowColumns} />;
    default:
      return (
        <div className="flex flex-col gap-3">
          <StatRow stats={chapter.stats} />
          <CompareBars bars={chapter.bars} accent={accent} />
        </div>
      );
  }
}

/* ── the player ───────────────────────────────────────────────────────────────────────────────── */

export default function PresentationPlayer({
  presentation,
  onClose,
  ratio = "natural",
  autoStart = true,
}: {
  presentation: PresentationResult;
  onClose: () => void;
  ratio?: FrameRatio;
  autoStart?: boolean;
}) {
  const manifest = isPresentable(presentation) ? presentation : null;
  const theme = themeFor(presentation.sport);
  const chapters = useMemo<readonly PresentationChapter[]>(() => manifest?.chapters ?? [], [manifest]);

  const [ctx, setCtx] = useState<PlayerCtx>(() =>
    createPlayer({
      eventId: presentation.eventId,
      chapterCount: chapters.length,
      unavailable: !manifest,
      reason: manifest ? null : (presentation as { reason?: string }).reason ?? null,
    }) as PlayerCtx,
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState(false);
  /*
   * PORTALLED TO THE BODY, and not for tidiness. Rendered in place, the frame sits inside the game
   * report's own stacking context, and `z-50` on a descendant cannot beat a sibling of its ancestor:
   * the site footer painted over the player's controls, so Skip, Back and Pause were unclickable
   * wherever the footer overlapped them. The browser suite caught it; no DOM assertion would have,
   * because the buttons were present, visible and enabled the whole time.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /*
   * RECORDING MODE (P234 · Release D). Not a second player and not a second source of predictions —
   * the same manifest, the same chapters, re-composed into a fixed crop the reader can screen-record
   * without scrolling or moving the pointer.
   *
   * `capture` is the box a recording should contain. Every control lives OUTSIDE it, so a capture of
   * that rectangle carries the presentation and none of the furniture. What never leaves the box is
   * the part a viewer needs to judge what they are seeing: the event, its date, the readiness label,
   * and the brand it came from.
   */
  const [recording, setRecording] = useState(false);
  const [chosenRatio, setChosenRatio] = useState<FrameRatio>(ratio);
  const [countdown, setCountdown] = useState<number | null>(null);

  /* The countdown is a courtesy before a recording, not a loading bar: it counts down from three,
     it is skippable, and it never appears unless the reader asked to record. */
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) { setCountdown(null); act("REPLAY"); return; }
    const t = window.setTimeout(() => setCountdown((n) => (n == null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  type PlayerAction = "START" | "PAUSE" | "RESUME" | "NEXT" | "PREV" | "REPLAY" | "FAIL";
  const act = useCallback(
    (action: PlayerAction) => setCtx((cur) => apply(cur, action, { eventId: presentation.eventId }) as PlayerCtx),
    [presentation.eventId],
  );

  /* A NEW EVENT IS A NEW PLAYER. Without this, switching games keeps the old cursor and the old
     chapter count, and the frame narrates game A's chapter 6 under game B's title. */
  useEffect(() => {
    setCtx(createPlayer({
      eventId: presentation.eventId,
      chapterCount: chapters.length,
      unavailable: !manifest,
      reason: manifest ? null : (presentation as { reason?: string }).reason ?? null,
    }) as PlayerCtx);
  }, [presentation.eventId, chapters.length, manifest, presentation]);

  /* Focus in, and back out to whatever opened this. */
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    closeRef.current?.focus();
    const opener = openerRef.current;
    return () => { try { opener?.focus?.(); } catch { /* the opener may have unmounted */ } };
  }, []);

  /* Background scroll is locked ONLY while open, and restored on every exit path including unmount. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  /* A hidden tab must not burn a timer or an animation. */
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* Autostart, once. The machine refuses a second START, so a re-render cannot open a second clock. */
  useEffect(() => { if (autoStart) act("START"); }, [autoStart, act]);

  /*
   * THE ONE CLOCK. A single timeout per chapter, cleared on every dependency change — which is what
   * keeps a paused player, a hidden tab, a chapter skip and an unmount from each leaving a timer
   * behind that later advances a cursor nobody is watching.
   */
  useEffect(() => {
    if (!isRunning(ctx) || hidden || !chapters.length) return;
    const hold = chapters[ctx.index]?.holdMs ?? 5000;
    const t = window.setTimeout(() => act("NEXT"), reduced ? Math.min(hold, 2600) : hold);
    return () => window.clearTimeout(t);
  }, [ctx, hidden, reduced, chapters, act]);

  /* Keyboard: Escape closes, Tab is trapped, arrows and space drive the chapters. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab") {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables?.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (!manifest) return;
      if (e.key === "ArrowRight") { e.preventDefault(); act("NEXT"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); act("PREV"); }
      else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        act(ctx.state === "PLAYING" ? "PAUSE" : ctx.state === "PAUSED" ? "RESUME" : ctx.state === "COMPLETED" ? "REPLAY" : "START");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, act, ctx.state, manifest]);

  const chapter = chapters[ctx.index] ?? null;
  const completed = ctx.state === "COMPLETED";
  const unavailable = ctx.state === "UNAVAILABLE" || ctx.state === "ERROR";
  /* In recording mode the crop is fixed to the chosen composition; in page mode the frame keeps its
     natural height so a chapter is never letterboxed into a shape nobody asked for. */
  const activeRatio: FrameRatio = recording ? chosenRatio : ratio;
  const frameAspect = RATIO_CSS[activeRatio];
  /* Landscape is wider because 16:9 derives its HEIGHT from its width: at 720 the box was 405px
     tall and the dense chapters did not fit. */
  const captureWidth = activeRatio === "portrait" ? 420 : activeRatio === "feed" ? 500 : activeRatio === "landscape" ? 900 : 680;

  const title = manifest ? manifest.title : "Simulation unavailable";
  const reportHref = manifest ? manifest.reportHref : (presentation as { reportHref: string }).reportHref;

  const frame = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "color-mix(in srgb, var(--vault-ink-black) 82%, transparent)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${theme.label} simulation presentation · ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center gap-2 w-full"
        style={{ maxWidth: captureWidth, maxHeight: "96vh" }}
      >
        {/* ── THE CAPTURE FRAME. Everything a recording should contain, and nothing else. ── */}
        <div
          data-capture-frame
          className={`relative flex flex-col rounded-[14px] overflow-hidden w-full ${hidden ? "gtp-sim-paused" : ""}`}
          style={{
            maxHeight: recording ? "82vh" : "88vh",
            aspectRatio: frameAspect,
            /* OPAQUE in recording mode. The in-page scrim lets the site show faintly through, which
               is fine on a screen and wrong in a captured rectangle. */
            background: recording ? "var(--vault-ink-black)" : "var(--vault-panel-elevated)",
            border: `1px solid ${theme.accent}`,
            boxShadow: recording ? `0 0 0 1px var(--vault-border), 0 0 0 5px color-mix(in srgb, ${theme.accent} 22%, transparent)` : undefined,
          }}
        >
        {/* ── the recording backdrop. A two-statistic chapter cannot fill a 9:16 crop, and the
               first portrait cut was a third empty black. This is the sport's own scene, already
               aria-hidden and already behind the global reduced-motion guard, held at low opacity
               behind the text: it fills the frame without adding a single claim to it. Landscape
               does not need it — the content already spans the width. ── */}
        {recording && chosenRatio !== "landscape" ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ opacity: 0.22 }}>
            <SimulationScene scene={theme.scene} accent={theme.accent} accentSoft={theme.accentSoft} phase="SUMMARIZING" />
          </div>
        ) : null}

        {/* ── header: identity is never hidden, in any frame ── */}
        <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
          <div className="min-w-0 flex flex-col">
            <span className="font-mono uppercase tracking-[0.14em] truncate" style={{ color: theme.accent, fontSize: 9.5 }}>
              {theme.label} · simulation presentation
            </span>
            {/* Wraps to two lines rather than truncating. "UFC Fight Night: Hooker vs. Parna…" is a
                recording with no legible event name on it, and the frame has the room. */}
            <span
              className="font-display"
              style={{
                color: "var(--vault-text)", fontSize: 15, fontWeight: 800, lineHeight: 1.25,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}
            >
              {title}
            </span>
            {manifest ? (
              <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                {manifest.displayDate}
                {manifest.venue ? ` · ${manifest.venue}` : ""}
                {manifest.readiness === "degraded" ? " · degraded run" : ""}
                {manifest.readiness === "archived" ? " · frozen pre-event forecast" : ""}
              </span>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[8px] font-mono uppercase tracking-[0.1em] inline-flex items-center justify-center"
            style={{ color: "var(--vault-text-mute)", fontSize: 10.5, minHeight: 44, minWidth: 44 }}
          >
            Close ✕
          </button>
        </div>

        {/* ── chapter progress — how far in, how much left, without a fake percentage ── */}
        {manifest ? (
          <div className="flex gap-1 px-4 pb-2 shrink-0" aria-hidden>
            {chapters.map((c, i) => (
              <span key={c.id} className="flex-1 rounded-full" style={{
                height: 3,
                background: i < ctx.index || completed ? theme.accent : i === ctx.index ? theme.accent : "var(--vault-wash-soft)",
                opacity: i <= ctx.index || completed ? 1 : 0.45,
              }} />
            ))}
          </div>
        ) : null}

        {/* ── the frame body ── */}
        <div className="flex-1 min-h-0 px-4 pb-2 flex flex-col gap-3 overflow-hidden">
          {unavailable ? (
            <div className="flex-1 flex flex-col justify-center gap-3">
              <h3 className="font-display m-0" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>
                {ctx.state === "ERROR" ? "The presentation stopped" : "No presentation for this event"}
              </h3>
              <p role="status" className="m-0" style={{ color: "var(--vault-warn)", fontSize: 12.5, lineHeight: 1.55 }}>{ctx.reason}</p>
              <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.55 }}>
                The full report is unaffected and carries whatever this game does have.
              </p>
            </div>
          ) : completed ? (
            <div className="flex-1 flex flex-col justify-center gap-3">
              <span className="font-mono uppercase tracking-[0.14em]" style={{ color: theme.accent, fontSize: 9.5 }}>End of presentation</span>
              <h3 className="font-display m-0" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{title}</h3>
              <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
                {chapters[chapters.length - 1]?.line}
              </p>
              {manifest ? (
                <p className="m-0 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5, lineHeight: 1.6 }}>
                  {manifest.provenance.modelVersion ? `${manifest.provenance.modelVersion} · ` : ""}
                  revision {manifest.provenance.artifactHash?.slice(0, 10) ?? "unknown"}
                </p>
              ) : null}
            </div>
          ) : chapter ? (
            /*
             * ONE CENTRED STACK, not a header pinned to the top with the body floating below it.
             * The first 9:16 crop put the sentence at the top, the numbers in the middle, and about
             * a third of the frame of empty black between them — a recording of mostly nothing.
             * Header and body are one block now, centred together, so a tall crop is filled rather
             * than padded.
             */
            <div className="flex-1 min-h-0 flex flex-col justify-center gap-4">
              <div className="shrink-0 flex flex-col gap-1">
                <span className="font-mono uppercase tracking-[0.14em]" style={{ color: theme.accent, fontSize: recording ? 11 : 9.5 }}>
                  Chapter {ctx.index + 1} of {chapters.length} · {chapter.title}
                </span>
                {/* THE TRUTH CARRIER. Colour and motion decorate; this line states. Larger in a
                    recording, where the frame will be watched at phone size. */}
                <p role="status" aria-live="polite" className="m-0"
                  style={{ color: "var(--vault-text)", fontSize: recording ? 16 : 13.5, lineHeight: 1.5, fontWeight: 550 }}>
                  {chapter.line}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <ChapterBody chapter={chapter} accent={theme.accent} accentSoft={theme.accentSoft} sport={presentation.sport} run={ctx.run} wide={activeRatio === "landscape"} />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── the brand strip, INSIDE the crop. A recording that does not say where it came from
               is unattributable, and a viewer cannot check a number they cannot trace. The
               paper-only disclosure rides here too, so it cannot be cropped away from the
               statistics it qualifies. ── */}
        <div
          className="shrink-0 flex items-center justify-between gap-2 px-4 py-2"
          style={{ borderTop: "1px solid var(--vault-border)", background: recording ? "color-mix(in srgb, var(--vault-ink-black) 60%, transparent)" : "transparent" }}
        >
          <span className="font-mono uppercase tracking-[0.14em] truncate" style={{ color: theme.accent, fontSize: 9 }}>
            gametimepicks.yashwantbalaji.com
          </span>
          <span className="font-mono uppercase tracking-[0.1em] shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
            Paper-only · educational
          </span>
        </div>

        {/* ── the countdown, INSIDE the crop and over everything. Skippable, and it only exists
               because a person about to hit record asked for it. ── */}
        {countdown != null && countdown > 0 ? (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--vault-ink-black) 88%, transparent)" }}>
            <span className="font-display tabular-nums" style={{ color: theme.accent, fontSize: 84, fontWeight: 800, lineHeight: 1 }}>{countdown}</span>
          </div>
        ) : null}
        </div>

        {/* ══ EVERYTHING BELOW IS OUTSIDE THE CAPTURE FRAME ══════════════════════════════════════
             Controls, the format chooser and the route out. A screen recording cropped to the
             rectangle above contains none of it — which is the whole point of the split — while
             pause and exit stay one click (or one key) away for the person recording. */}
        <div className="shrink-0 flex flex-wrap items-center gap-2 w-full px-1 py-2">
          {manifest && !unavailable ? (
            <>
              <button type="button" onClick={() => act(completed ? "REPLAY" : ctx.state === "PLAYING" ? "PAUSE" : ctx.state === "PAUSED" ? "RESUME" : "START")}
                className="vault-press rounded-full px-4 inline-flex items-center"
                style={{ minHeight: 40, border: `1px solid ${theme.accent}`, color: theme.accent, fontSize: 12, fontWeight: 700 }}>
                {completed ? "Replay" : ctx.state === "PLAYING" ? "Pause" : ctx.state === "PAUSED" ? "Resume" : "Play"}
              </button>
              <button type="button" onClick={() => act("PREV")} aria-label="Previous chapter"
                className="vault-press rounded-full px-3 inline-flex items-center"
                style={{ minHeight: 40, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text-mute)", fontSize: 12 }}>
                ← Back
              </button>
              <button type="button" onClick={() => act("NEXT")} aria-label="Next chapter" disabled={completed}
                className="vault-press rounded-full px-3 inline-flex items-center"
                style={{ minHeight: 40, border: "1px solid var(--vault-border-strong)", color: completed ? "var(--vault-text-faint)" : "var(--vault-text-mute)", fontSize: 12, opacity: completed ? 0.5 : 1 }}>
                Skip →
              </button>
            </>
          ) : null}
          <Link href={reportHref} className="vault-press rounded-full px-4 no-underline inline-flex items-center ml-auto"
            style={{ minHeight: 40, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", fontSize: 12, fontWeight: 700 }}>
            Full report →
          </Link>
        </div>

        {/* ── the recording row. Also outside the crop. ── */}
        {manifest && !unavailable ? (
          <div className="shrink-0 flex flex-wrap items-center gap-2 w-full px-1 pb-1">
            <button
              type="button"
              onClick={() => setRecording((r) => !r)}
              aria-pressed={recording}
              className="vault-press rounded-full px-3 inline-flex items-center gap-1.5"
              style={{
                minHeight: 36,
                border: `1px solid ${recording ? theme.accent : "var(--vault-border-strong)"}`,
                color: recording ? theme.accent : "var(--vault-text-mute)",
                fontSize: 11.5, fontWeight: 700,
              }}
            >
              <span aria-hidden style={{ fontSize: 9 }}>●</span>
              {recording ? "Recording layout on" : "Recording layout"}
            </button>

            {recording ? (
              <>
                <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Format</span>
                {([
                  ["portrait", "9:16"],
                  ["feed", "4:5"],
                  ["landscape", "16:9"],
                ] as Array<[FrameRatio, string]>).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setChosenRatio(id)}
                    aria-pressed={chosenRatio === id}
                    className="vault-press rounded-full px-3 inline-flex items-center font-mono"
                    style={{
                      minHeight: 36,
                      border: `1px solid ${chosenRatio === id ? theme.accent : "var(--vault-border)"}`,
                      color: chosenRatio === id ? theme.accent : "var(--vault-text-faint)",
                      fontSize: 11,
                    }}
                  >
                    {label}
                  </button>
                ))}
                {/* Start = countdown, then replay from chapter one. The reader presses record on
                    their own tool during the count, and the presentation begins at zero. */}
                <button
                  type="button"
                  onClick={() => { act("PAUSE"); setCountdown(3); }}
                  className="vault-press rounded-full px-4 inline-flex items-center ml-auto"
                  style={{ minHeight: 36, border: `1px solid ${theme.accent}`, color: theme.accent, fontSize: 11.5, fontWeight: 700 }}
                >
                  Start presentation ↻
                </button>
              </>
            ) : (
              <span style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.5 }}>
                Crops the frame to 9:16, 4:5 or 16:9 and moves these controls outside it.
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  /* Before hydration there is no document to portal into; the frame appears on mount. */
  return mounted ? createPortal(frame, document.body) : null;
}
