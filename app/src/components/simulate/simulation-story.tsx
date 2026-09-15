"use client";
/**
 * SimulationStory (P308) — the inline simulation story on a report page.
 *
 * It plays the presentation adapters' chapters (lib/simulate/presentation/*) in place, under the report's answer,
 * never over it: no dialog, no portal, no capture frame, no autoplay audio. The first chapter is server-rendered so the
 * story reads without JavaScript; the controls step, pause, skip, restart and jump to the full report. Every number
 * is carried from the manifest — bars only reveal a value the artifact already holds.
 *
 * Reduced motion: no auto-advance and no growth animation; the reader steps through by hand. Every chart also has
 * its sentence (describeBars), so nothing is carried by a drawn shape alone.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apply, createPlayer } from "@/lib/simulate/presentation/player-machine.mjs";
import { describeBars, holdFor, narrationFor, revealDuration } from "@/lib/simulate/presentation/story-controls.mjs";
import type { PresentationBar, PresentationChapter, PresentationManifest, PresentationStat } from "@/lib/simulate/presentation/types";
import { readSinkConfig, resolveSink, track } from "@/lib/analytics/sink";
import { SCHEMA_VERSION, type Sport, type StoryChapterKind } from "@/lib/analytics/event-contract";
import { currentEtDate } from "@/lib/freshness";

/** The machine is untyped JS with an inferred literal return; the component widens it to the states it renders. */
interface PlayerCtx { state: string; eventId: string; chapterCount: number; index: number; reason: string | null; run: number }
type PlayerAction = "START" | "PAUSE" | "RESUME" | "NEXT" | "PREV" | "REPLAY" | "FAIL";
const step = (c: PlayerCtx, action: PlayerAction): PlayerCtx => apply(c as never, action) as unknown as PlayerCtx;

const SPORT_ACCENT: Record<string, string> = { mlb: "var(--sport-mlb)", nfl: "var(--sport-nfl)", epl: "var(--sport-soccer)", ufc: "var(--sport-ufc)", board: "var(--vault-accent)" };
const asPct = (p: number) => `${Math.round(p * 100)}%`;
const statText = (s: PresentationStat): string => {
  if (s.format === "text") return s.text ?? "—";
  if (s.value == null || !Number.isFinite(s.value)) return "—";
  if (s.format === "probability") return asPct(s.value);
  if (s.format === "decimal1") return s.value.toFixed(1);
  if (s.format === "decimal2") return s.value.toFixed(2);
  if (s.format === "signed") return `${s.value >= 0 ? "+" : ""}${s.value}`;
  return String(s.value);
};

function Stats({ stats }: { stats: readonly PresentationStat[] }) {
  if (!stats.length) return null;
  return (
    <dl className="m-0 flex flex-wrap gap-x-5 gap-y-2">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col min-w-0">
          <dt className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{s.label}</dt>
          <dd className="m-0 font-display tabular-nums" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{statText(s)}</dd>
          {s.note ? <dd className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.4 }}>{s.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

function Bars({ bars, accent, histogram, caption, reveal, ms }: { bars: readonly PresentationBar[]; accent: string; histogram: boolean; caption?: string; reveal: boolean; ms: number }) {
  if (!bars.length) return null;
  const max = Math.max(...bars.map((b) => b.p), 0.0001);
  const transition = ms > 0 ? `width ${ms}ms ease-out, height ${ms}ms ease-out` : "none";
  const words = describeBars(bars, histogram ? (caption?.split(" · ")[0] ?? "") : "");
  if (histogram) {
    return (
      <figure className="m-0 flex flex-col gap-1">
        <div className="flex items-end gap-[3px]" style={{ height: 84 }} aria-hidden="true">
          {bars.map((b) => (
            <span key={b.label} className="flex-1 rounded-t-[2px]" style={{ height: reveal ? `${Math.max((b.p / max) * 100, 3)}%` : "3%", transition, background: b.highlight ? accent : "color-mix(in srgb, var(--vault-text-faint) 60%, transparent)" }} />
          ))}
        </div>
        <div className="flex gap-[3px]" aria-hidden="true">
          {bars.map((b, i) => (
            <span key={b.label} className="flex-1 text-center font-mono tabular-nums truncate" style={{ color: b.highlight ? "var(--vault-text-mute)" : "var(--vault-text-faint)", fontSize: 8.5 }}>{b.highlight || i % 3 === 0 ? b.label : ""}</span>
          ))}
        </div>
        {caption ? <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }} aria-hidden="true">{caption}</span> : null}
        <figcaption className="sr-only">{words}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="truncate shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 11, width: "38%" }}>{b.label}</span>
          <span className="relative flex-1 rounded-full overflow-hidden" style={{ height: 10, background: "var(--vault-wash-soft)" }} aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: reveal ? `${(b.p / max) * 100}%` : "0%", transition, background: b.highlight ? accent : "var(--vault-text-faint)" }} />
          </span>
          <span className="font-mono tabular-nums shrink-0 text-right" style={{ color: "var(--vault-text)", fontSize: 11, width: 40 }}>{asPct(b.p)}</span>
        </div>
      ))}
      <figcaption className="sr-only">{words}</figcaption>
    </figure>
  );
}

function Rows({ rows }: { rows: PresentationChapter["rows"] }) {
  if (!rows.length) return null;
  return (
    <ul className="m-0 p-0 flex flex-col gap-1.5" style={{ listStyle: "none" }}>
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="flex items-baseline gap-2 rounded-[6px] px-2 py-1.5" style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-border)" }}>
          <span className="shrink-0 font-display" style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 700, maxWidth: "42%" }}>{r.label}</span>
          <span className="flex-1 min-w-0" style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.45 }}>{r.detail}</span>
          {r.value ? <span className="shrink-0 font-mono tabular-nums" style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 700 }}>{r.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* P321: 44px targets — a thumb-sized control on a phone, without shrinking the label. */
const btn = (active = false): React.CSSProperties => ({ minHeight: 44, minWidth: 44, padding: "0 12px", borderRadius: 999, border: `1px solid ${active ? "var(--vault-border-active)" : "var(--vault-rule)"}`, background: active ? "var(--vault-panel-elevated)" : "transparent", color: active ? "var(--vault-text)" : "var(--vault-text-mute)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--font-mono)", cursor: "pointer" });

export default function SimulationStory({ manifest, skipHref = "#simulation-story-end" }: { manifest: PresentationManifest; skipHref?: string }) {
  const chapters = manifest.chapters;
  const [ctx, setCtx] = useState<PlayerCtx>(() => createPlayer({ eventId: manifest.eventId, chapterCount: chapters.length }) as unknown as PlayerCtx);
  const [reduced, setReduced] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<number | null>(null);
  const accent = SPORT_ACCENT[manifest.sport] ?? "var(--vault-accent)";
  const narration = useMemo(() => narrationFor(manifest), [manifest]);
  /* Instrumentation (provider may be off — the sink resolves to a no-op): started, each chapter reached, skipped. */
  const sink = useMemo(() => resolveSink(readSinkConfig()), []);
  const sport = (manifest.sport === "board" ? "mlb" : manifest.sport) as Sport;
  const emit = (event: "simulation_story_started" | "simulation_skipped") => track({ event, schemaVersion: SCHEMA_VERSION, dayBucket: currentEtDate(), surface: "game_report", sport }, sink);
  useEffect(() => {
    if (ctx.state === "IDLE") return;
    const kind = chapters[Math.min(ctx.index, chapters.length - 1)]?.kind as StoryChapterKind | undefined;
    if (kind) track({ event: "simulation_chapter_viewed", schemaVersion: SCHEMA_VERSION, dayBucket: currentEtDate(), surface: "game_report", sport, chapterKind: kind }, sink);
  }, [ctx.index, ctx.state, chapters, sink, sport]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  /* the bars grow after mount (or on a chapter change); under reduced motion they are simply shown */
  useEffect(() => {
    setRevealed(false);
    const id = window.setTimeout(() => setRevealed(true), 30);
    return () => window.clearTimeout(id);
  }, [ctx.index, ctx.run]);

  /* auto-advance while PLAYING; never under reduced motion (holdFor returns null) */
  useEffect(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    if (ctx.state !== "PLAYING") return;
    const hold = holdFor(chapters[ctx.index], { reduced });
    if (hold == null) return;
    timer.current = window.setTimeout(() => setCtx((c) => step(c, "NEXT")), hold);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [ctx.state, ctx.index, ctx.run, chapters, reduced]);

  const act = (action: PlayerAction) => setCtx((c) => step(c, action));
  const chapter = chapters[Math.min(ctx.index, chapters.length - 1)];
  const playing = ctx.state === "PLAYING";
  const done = ctx.state === "COMPLETED";
  const idle = ctx.state === "IDLE";
  const ms = revealDuration({ reduced });
  const runs = manifest.provenance.runCount;

  return (
    <section className="gtp-story flex flex-col gap-3 rounded-[14px] px-4 py-3.5" style={{ border: "1px solid var(--vault-border)", borderTop: `2px solid ${accent}`, background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)" }} aria-labelledby="sim-story-h" data-state={ctx.state}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-col">
          <h2 id="sim-story-h" className="font-mono uppercase tracking-[0.14em] m-0" style={{ color: "var(--vault-gold)", fontSize: 11 }}>Simulation story</h2>
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{chapters.length} chapters · {manifest.readiness === "archived" ? "the forecast as it stood before the start" : "read from the published artifact"}{reduced ? " · reduced motion: step through by hand" : ""}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Simulation story controls">
          {idle ? <button type="button" style={btn(true)} onClick={() => { emit("simulation_story_started"); act("START"); }}>Play</button> : null}
          {playing ? <button type="button" style={btn(true)} onClick={() => act("PAUSE")}>Pause</button> : null}
          {ctx.state === "PAUSED" ? <button type="button" style={btn(true)} onClick={() => act("RESUME")}>Resume</button> : null}
          {!idle ? <button type="button" style={btn()} onClick={() => act("PREV")} disabled={ctx.index === 0} aria-label="Previous chapter">‹</button> : null}
          {!idle && !done ? <button type="button" style={btn()} onClick={() => act("NEXT")} aria-label="Next chapter">›</button> : null}
          {done ? <button type="button" style={btn()} onClick={() => act("REPLAY")}>Replay</button> : null}
          <a href={skipHref} onClick={() => emit("simulation_skipped")} className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5, minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 8px" }}>Skip to the report ↓</a>
        </div>
      </div>

      <ol className="m-0 p-0 flex flex-wrap gap-1" style={{ listStyle: "none" }} aria-label="Chapters">
        {chapters.map((c, i) => (
          <li key={c.id}>
            <button type="button" style={btn(i === ctx.index)} aria-current={i === ctx.index ? "step" : undefined} onClick={() => setCtx((cur) => ({ ...cur, state: cur.state === "IDLE" || cur.state === "COMPLETED" ? "PAUSED" : cur.state, index: i, run: cur.run + 1 }))}>{i + 1} · {c.title}</button>
          </li>
        ))}
      </ol>

      {idle ? (
        <div className="flex flex-col gap-1" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
          {narration.map((n) => <span key={n} className="font-mono" style={{ fontSize: 10.5 }}>› {n}</span>)}
          <span>Press Play to step through what the model expects, chapter by chapter, or read the report below.</span>
        </div>
      ) : null}

      <article key={`${ctx.index}-${ctx.run}`} className="flex flex-col gap-2.5" aria-live="polite">
        <h3 className="font-display m-0" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800, lineHeight: 1.15 }}>{chapter.title}</h3>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.5 }}>{chapter.line}</p>
        <Stats stats={chapter.stats} />
        <Bars bars={chapter.bars} accent={accent} histogram={chapter.kind === "distribution"} caption={chapter.axisCaption} reveal={revealed || idle} ms={ms} />
        <Rows rows={chapter.rows} />
      </article>

      <footer className="font-mono flex flex-wrap gap-x-3 gap-y-1" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        {manifest.provenance.modelVersion ? <span>model {manifest.provenance.modelVersion}</span> : null}
        {runs ? <span>{runs.toLocaleString()} simulated games</span> : <span>no run count recorded</span>}
        {manifest.provenance.generatedAt ? <span>produced {new Date(manifest.provenance.generatedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET</span> : null}
        {manifest.provenance.marketCapturedAt ? <span>prices captured {new Date(manifest.provenance.marketCapturedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET</span> : null}
      </footer>
    </section>
  );
}
