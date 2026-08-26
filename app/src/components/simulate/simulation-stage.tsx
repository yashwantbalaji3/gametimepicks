"use client";
/**
 * SIMULATION STAGE (P209 · Releases B+C) — the generation moment, honest by construction.
 *
 * Drives the shared state machine (lib/simulate/state-machine) through the script the event's OWN
 * readiness allows, narrating each phase in a live region while the sport scene lights up the
 * layer that phase actually concerns. Ready states end COMPLETE and navigate to the precomputed
 * report (which the stage genuinely prefetches during LOADING_INPUTS — the loading is real work);
 * non-ready states end REFUSED in place with the event's stated reason and a next action. A
 * settled or impossible path can never visually emerge as SIMULATION_READY because the terminal
 * comes from `scriptForReadiness`, not from this component.
 *
 * Accessibility: dialog semantics, focus moves in and restores on close, Escape and backdrop
 * cancel (browser back is never trapped — no history entry is created), status text is the truth
 * carrier (colour and motion are decoration), and the phase timer pauses with the hidden tab
 * alongside the scene's animations.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createContext as createSimContext, advance, scriptForReadiness, PHASE_COPY, PHASE_DURATION_MS } from "@/lib/simulate/state-machine.mjs";
import { themeFor } from "@/lib/simulate/themes";
import SimulationScene from "@/components/simulate/scenes";
import type { SimDayEvent } from "@/lib/simulate/day-view";

/** The machine context, at the TS boundary (the .mjs module's literal inference is too narrow). */
interface SimCtx {
  phase: string;
  reason: string | null;
  artifactId: string | null;
  readiness: string;
  href: string;
}

export default function SimulationStage({ event, onClose }: { event: SimDayEvent; onClose: () => void }) {
  const router = useRouter();
  const theme = themeFor(event.sport);
  const script = scriptForReadiness(event.state, event.stateReason);
  const [ctx, setCtx] = useState<SimCtx>(() =>
    createSimContext({ sport: event.sport, eventId: event.id, productDate: null, readiness: event.state, href: event.href }) as unknown as SimCtx,
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const stepRef = useRef(0);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const close = useCallback(() => onClose(), [onClose]);

  // Focus in; Escape cancels; the opener's focus restores via the parent (it re-renders the card).
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Hidden tab ⇒ pause the narration timer AND the scene's animations.
  useEffect(() => {
    const onVis = () => { pausedRef.current = document.hidden; setPaused(document.hidden); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // The report the stage will land on is prefetched while "loading inputs" — real work, honestly named.
  useEffect(() => {
    if (ctx.phase === "LOADING_INPUTS" && script.terminal === "COMPLETE") {
      try { router.prefetch(event.href); } catch { /* prefetch is best-effort */ }
    }
  }, [ctx.phase, event.href, router, script.terminal]);

  // Drive the machine on a deterministic clock. Reduced motion keeps the same truthful phases at a
  // quicker cadence (the scene itself is static under the global guard).
  useEffect(() => {
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = reduced ? 220 : PHASE_DURATION_MS;
    const timer = window.setInterval(() => {
      if (pausedRef.current) return;
      setCtx((cur) => {
        const next = script.steps[stepRef.current + 1];
        if (next) { stepRef.current += 1; return advance(cur, next) as unknown as SimCtx; }
        // End of steps → the earned terminal (COMPLETE scripts always end on SUMMARIZING; refusal
        // scripts end on a phase whose row allows REFUSED — the machine throws if that ever drifts).
        if (cur.phase === "COMPLETE" || cur.phase === "REFUSED" || cur.phase === "FAILED") return cur;
        return (script.terminal === "COMPLETE"
          ? advance(cur, "COMPLETE", { artifactId: event.href })
          : advance(cur, "REFUSED", { reason: script.reason })) as unknown as SimCtx;
      });
    }, tick);
    return () => window.clearInterval(timer);
    // script derives from the event prop, stable for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // COMPLETE navigates (idempotent — the interval stops advancing once terminal).
  useEffect(() => {
    if (ctx.phase === "COMPLETE") {
      const t = window.setTimeout(() => router.push(event.href), 320);
      return () => window.clearTimeout(t);
    }
  }, [ctx.phase, event.href, router]);

  const terminalRefusal = ctx.phase === "REFUSED" || ctx.phase === "FAILED";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "color-mix(in srgb, var(--vault-ink-black) 72%, transparent)" }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${theme.label} simulation · ${event.matchup}`}
        className={`w-full max-w-[430px] rounded-[16px] p-4 flex flex-col gap-3 ${paused ? "gtp-sim-paused" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--vault-panel-elevated)", border: `1px solid ${theme.accent}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: theme.accent, fontSize: 10 }}>
            {theme.label} · {theme.poster}
          </span>
          <button ref={closeRef} type="button" onClick={close}
            className="font-mono uppercase tracking-[0.1em] rounded-[8px]"
            style={{ color: "var(--vault-text-mute)", fontSize: 10.5, minHeight: 44, minWidth: 44 }}>
            Cancel ✕
          </button>
        </div>

        <h2 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>
          {event.matchup}
        </h2>

        <SimulationScene scene={theme.scene} accent={theme.accent} accentSoft={theme.accentSoft} phase={ctx.phase} />

        {/* THE TRUTH CARRIER — the live region. Motion decorates; this line states. */}
        <p role="status" aria-live="polite" className="m-0" style={{ color: terminalRefusal ? "var(--vault-warn)" : "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55, minHeight: 38 }}>
          {PHASE_COPY[ctx.phase as keyof typeof PHASE_COPY]}
          {terminalRefusal && ctx.reason ? <> {ctx.reason}</> : null}
        </p>

        {/* Indeterminate by contract — no invented units. Hidden at terminals. */}
        {!terminalRefusal && ctx.phase !== "COMPLETE" ? (
          <div aria-hidden className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--vault-wash-soft)" }}>
            <div className="h-full w-1/3 gtp-sim-pulse rounded-full" style={{ background: theme.accent }} />
          </div>
        ) : null}

        {terminalRefusal ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={close}
              className="vault-press rounded-full px-4 inline-flex items-center"
              style={{ minHeight: 44, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", fontSize: 12.5, fontWeight: 700 }}>
              Back to the slate
            </button>
            <a href={event.href} className="vault-press rounded-full px-4 no-underline inline-flex items-center"
              style={{ minHeight: 44, border: `1px solid ${theme.accent}`, color: theme.accent, fontSize: 12.5, fontWeight: 700 }}>
              {event.actionLabel} →
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
