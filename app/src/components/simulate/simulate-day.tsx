"use client";
/**
 * SIMULATE DAY — the date-first, sport-first selection experience (P209 · Release A).
 *
 * Server truth in, presentation out: the page passes a fully-derived SimulateDayView (one
 * selector, lib/simulate/day-view) and this component renders it. Date is a REAL route
 * (/simulate for today, /simulate/d/<date> otherwise) so refresh/share/back/forward preserve it;
 * the sport filter is a `?sport=` query read at hydration — the same static-export-safe pattern
 * /build/custom uses. Chips and counts derive from the sections actually rendered; nothing here
 * recomputes readiness.
 */
import Link from "next/link";

import DateSportControls from "@/components/nav/date-sport-controls";
import { useEffect, useMemo, useState } from "react";
import TeamMark from "@/components/ui/team-mark";
import SimulationStage from "@/components/simulate/simulation-stage";
import type { SimulateDayView, SimDayEvent, SimSport } from "@/lib/simulate/day-view";


const fmtDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Badge tone per state — colour never carries the meaning alone; the label is always printed. */
export const STATE_TONE: Record<SimDayEvent["state"], { fg: string; bg: string; label: string }> = {
  SIMULATION_READY: { fg: "var(--vault-success)", bg: "var(--vault-success-dim)", label: "Simulation ready" },
  ARTIFACT_READY: { fg: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)", label: "Artifact ready" },
  BASELINE_ONLY: { fg: "var(--vault-warn)", bg: "var(--vault-warn-dim)", label: "Baseline only" },
  MODEL_ONLY_NO_MARKET: { fg: "var(--vault-info-bright)", bg: "color-mix(in srgb, var(--vault-info) 18%, transparent)", label: "Model only · no market" },
  NO_PLAY: { fg: "var(--vault-text-mute)", bg: "var(--vault-wash-soft)", label: "No qualified play" },
  SCHEDULE_ONLY: { fg: "var(--vault-text-mute)", bg: "var(--vault-wash-soft)", label: "Schedule only" },
  SOURCE_STALE: { fg: "var(--vault-danger)", bg: "var(--vault-danger-dim)", label: "Source stale" },
  // Warn, not danger: the day is not broken, this one game is uncovered — and the label says which.
  MISSED_COVERAGE: { fg: "var(--vault-warn)", bg: "var(--vault-warn-dim)", label: "No pregame forecast" },
  SETTLED: { fg: "var(--vault-text-mute)", bg: "var(--vault-wash-soft)", label: "Settled" },
};

function EventCard({ e, onOpen }: { e: SimDayEvent; onOpen: (e: SimDayEvent) => void }) {
  const tone = STATE_TONE[e.state];
  /* SETTLED results navigate directly (nothing is "generated" for a final). MLB's ready games
     also navigate directly: their report OWNS the richer in-page generation experience (the
     GameSimulationRunner's gated reveal) — playing the stage first would stack two generation
     ceremonies on one click. Every other non-settled state opens the SimulationStage: ready
     states emerge into their report, non-ready states end in the stated refusal in place. */
  const viaStage = e.state !== "SETTLED" && !(e.sport === "mlb" && e.state === "SIMULATION_READY");
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          {e.away?.logo || e.home?.logo ? (
            <span className="inline-flex items-center gap-1 shrink-0" aria-hidden>
              <TeamMark name={e.away?.name} logoUrl={e.away?.logo} size="md" />
              <TeamMark name={e.home?.name} logoUrl={e.home?.logo} size="md" />
            </span>
          ) : null}
          <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 650 }}>{e.matchup}</span>
        </span>
        <span className="font-mono shrink-0" style={{ color: "var(--vault-gold-bright)", fontSize: 11.5 }}>{e.startLabel}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 9, color: tone.fg, background: tone.bg }}>
          {tone.label}
        </span>
        {e.markets.map((m) => (
          <span key={m} className="rounded-[4px] px-1.5 py-0.5 font-mono" style={{ fontSize: 9, color: "var(--vault-text-faint)", background: "var(--vault-wash-faint)" }}>{m}</span>
        ))}
        {e.venue ? <span style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{e.venue}</span> : null}
      </span>
      {e.stateReason ? (
        <span style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.5 }}>{e.stateReason}</span>
      ) : null}
      <span className="mt-auto font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>
        {e.actionLabel} →
      </span>
    </>
  );
  const cardStyle: React.CSSProperties = { border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", color: "inherit" };
  return viaStage ? (
    <button type="button" onClick={() => onOpen(e)}
      className="vault-glow-hover flex flex-col gap-2 rounded-[10px] p-3 text-left w-full"
      style={{ ...cardStyle, cursor: "pointer" }}>
      {body}
    </button>
  ) : (
    <Link href={e.href} className="vault-glow-hover flex flex-col gap-2 rounded-[10px] p-3 no-underline" style={cardStyle}>
      {body}
    </Link>
  );
}

export default function SimulateDay({ view }: { view: SimulateDayView }) {
  const [sport, setSport] = useState<SimSport | "all">("all");
  const [staged, setStaged] = useState<SimDayEvent | null>(null);

  // ?sport= deep link (chips also write it) — read at hydration, static-export-safe.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search).get("sport");
    if (sp && view.sections.some((s) => s.sport === sp)) setSport(sp as SimSport);
  }, [view.sections]);

  const visible = useMemo(
    () => view.sections.filter((s) => sport === "all" || s.sport === sport),
    [view.sections, sport],
  );
  const shownEvents = visible.flatMap((s) => s.events);

  const pick = (s: SimSport | "all") => {
    setSport(s);
    const url = new URL(window.location.href);
    if (s === "all") url.searchParams.delete("sport");
    else url.searchParams.set("sport", s);
    // History entry per selection so back/forward walk the reader's own filter steps.
    window.history.pushState(null, "", url.toString());
  };
  // Back/forward re-read the URL — the filter follows the history entry rather than dying on it.
  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search).get("sport");
      setSport(sp && view.sections.some((s) => s.sport === sp) ? (sp as SimSport) : "all");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [view.sections]);


  return (
    <div className="flex flex-col gap-4">
      {/* ── DATE + SPORT — the shared control family over the canonical URL owner (P217 WS1). ──
           This was ~55 lines of inline prev/next/picker plus a hand-rolled chip row. The sticky
           wrapper stays here because it is a /simulate layout decision, not part of the contract. */}
      <div
        className="sticky sm:static z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0"
        style={{ top: 0, background: "color-mix(in srgb, var(--vault-scrim-base) 92%, transparent)", backdropFilter: "blur(8px)" }}
      >
        <DateSportControls
          surface="simulate"
          navLabel="Simulation date"
          date={view.date}
          defaultDate={view.today}
          availableDates={view.availableDates}
          totalCount={view.totals.events}
          sports={view.sections.map((sec) => ({
            id: sec.sport,
            label: sec.label,
            icon: sec.icon,
            count: sec.events.length,
            emptyReason: sec.emptyState ? sec.emptyState.replaceAll("_", " ").toLowerCase() : null,
          }))}
        />
      </div>

      {/* ── SECTIONS ── */}
      {visible.map((s) => (
        <section key={s.sport} aria-label={`${s.label} events`} className="flex flex-col gap-2">
          <h2 className="font-display tracking-tight m-0 flex items-baseline gap-2" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 750 }}>
            <span aria-hidden>{s.icon}</span> {s.label}
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
              {s.events.length} event{s.events.length === 1 ? "" : "s"}
            </span>
          </h2>
          {s.events.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {s.events.map((e) => <EventCard key={e.id} e={e} onOpen={setStaged} />)}
            </div>
          ) : (
            <p className="m-0 rounded-[8px] px-3 py-2.5" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, border: "1px solid var(--vault-border)", background: "var(--vault-wash-faint)" }}>
              {s.note}
              {s.emptyState === "OFF_SEASON" ? " " : null}
              {s.emptyState === "OFF_SEASON" ? <Link href="/sports" style={{ color: "var(--vault-gold-bright)" }}>Browse schedules →</Link> : null}
            </p>
          )}
        </section>
      ))}

      {shownEvents.length === 0 && sport !== "all" ? (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
          Nothing for this sport on {fmtDay(view.date)} — try another date above.
        </p>
      ) : null}

      {staged ? <SimulationStage event={staged} onClose={() => setStaged(null)} /> : null}
    </div>
  );
}
