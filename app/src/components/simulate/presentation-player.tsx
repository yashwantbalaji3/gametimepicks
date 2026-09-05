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

function DetailRows({ rows }: { rows: PresentationChapter["rows"] }) {
  if (!rows.length) return null;
  return (
    <ul className="flex flex-col gap-1.5 m-0 p-0" style={{ listStyle: "none" }}>
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

function ChapterBody({ chapter, accent, accentSoft, sport, run }: {
  chapter: PresentationChapter; accent: string; accentSoft: string; sport: string; run: number;
}) {
  const theme = themeFor(sport);
  switch (chapter.kind) {
    case "event":
    case "closing":
      return (
        <div className="flex flex-col gap-3">
          {/* The scene is decorative and aria-hidden; it is keyed on `run` so a replay redraws it. */}
          <div key={`scene-${run}`}><SimulationScene scene={theme.scene} accent={accent} accentSoft={accentSoft} phase="SUMMARIZING" /></div>
          <DetailRows rows={chapter.rows} />
        </div>
      );
    case "distribution":
      return (
        <div className="flex flex-col gap-3">
          <StatRow stats={chapter.stats} />
          <Histogram bars={chapter.bars} accent={accent} caption="Total runs · share of simulated games" />
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
      return <DetailRows rows={chapter.rows} />;
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
  const frameAspect = RATIO_CSS[ratio];

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
        className={`flex flex-col rounded-[14px] overflow-hidden w-full ${hidden ? "gtp-sim-paused" : ""}`}
        style={{
          maxWidth: ratio === "portrait" ? 420 : ratio === "feed" ? 520 : 680,
          maxHeight: "94vh",
          aspectRatio: frameAspect,
          background: "var(--vault-panel-elevated)",
          border: `1px solid ${theme.accent}`,
        }}
      >
        {/* ── header: identity is never hidden, in any frame ── */}
        <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
          <div className="min-w-0 flex flex-col">
            <span className="font-mono uppercase tracking-[0.14em] truncate" style={{ color: theme.accent, fontSize: 9.5 }}>
              {theme.label} · simulation presentation
            </span>
            <span className="font-display truncate" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 800 }}>{title}</span>
            {manifest ? (
              <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                {manifest.displayDate}
                {manifest.venue ? ` · ${manifest.venue}` : ""}
                {manifest.readiness === "degraded" ? " · degraded run" : ""}
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
            <>
              <div className="shrink-0 flex flex-col gap-1">
                <span className="font-mono uppercase tracking-[0.14em]" style={{ color: theme.accent, fontSize: 9.5 }}>
                  Chapter {ctx.index + 1} of {chapters.length} · {chapter.title}
                </span>
                {/* THE TRUTH CARRIER. Colour and motion decorate; this line states. */}
                <p role="status" aria-live="polite" className="m-0" style={{ color: "var(--vault-text)", fontSize: 13.5, lineHeight: 1.5, fontWeight: 550 }}>
                  {chapter.line}
                </p>
              </div>
              <div className="flex-1 min-h-0 flex flex-col justify-center gap-3">
                <ChapterBody chapter={chapter} accent={theme.accent} accentSoft={theme.accentSoft} sport={presentation.sport} run={ctx.run} />
              </div>
            </>
          ) : null}
        </div>

        {/* ── controls: outside the story, always reachable ── */}
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--vault-border)" }}>
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
      </div>
    </div>
  );

  /* Before hydration there is no document to portal into; the frame appears on mount. */
  return mounted ? createPortal(frame, document.body) : null;
}
