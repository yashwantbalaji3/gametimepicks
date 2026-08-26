/**
 * ADOPTION PANEL — the internal read of the public-beta adoption aggregate. Colocated with /ops, which is
 * deleted from the public static export by `scripts/prune-internal-routes.mjs` (INTERNAL_ROUTES) and 404s
 * in production via `guardInternalRoute`, so this is an operator-only surface.
 *
 * Rendering rules this component exists to enforce:
 *   • It renders AGGREGATES only. No raw event payload, no capture file contents, no per-event row —
 *     the aggregate is the entire public API of the measurement layer, even internally.
 *   • An unmeasured figure renders the single NOT YET MEASURED token. It never renders 0 for "unknown",
 *     and it never renders a rate whose denominator was zero.
 *   • Sport demand is shown but explicitly NOT interpreted until the window clears the ≥ 4-week bar under
 *     LIVE measurement — the panel says so on the surface, not in a doc.
 */
import { NOT_YET_MEASURED, formatMeasure, isMeasured, type AdoptionReport, type Measure } from "@/lib/analytics/adoption";

const MODE_TONE: Record<AdoptionReport["mode"], string> = {
  off: "var(--vault-text-faint)",
  staging: "var(--vault-gold)",
  live: "var(--vault-success)",
};

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  const unmeasured = value === NOT_YET_MEASURED;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span style={{ color: "var(--vault-text-mute)" }}>
        {label}
        {note ? <span className="ml-1 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>{note}</span> : null}
      </span>
      <span className="font-mono text-[10.5px] tabular" style={{ color: unmeasured ? "var(--vault-text-faint)" : "var(--vault-text)" }}>{value}</span>
    </div>
  );
}

/** A metric block whose reason is shown whenever the figure is unmeasured — never a bare dash. */
function MetricGroup({ title, rows, unmeasuredReason }: { title: string; rows: Array<[string, string, string?]>; unmeasuredReason: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>{title}</div>
      {rows.map(([label, value, note]) => <Row key={label} label={label} value={value} note={note} />)}
      {unmeasuredReason ? <div className="mt-0.5 text-[10px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>{unmeasuredReason}</div> : null}
    </div>
  );
}

const reasonOf = <T,>(...ms: Array<Measure<T>>): string | null => {
  const first = ms.find((m) => !isMeasured(m));
  return first && !isMeasured(first) ? first.reason : null;
};

function CountTable({ counts, empty }: { counts: Record<string, number> | null; empty: string }) {
  if (!counts) return <div className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>{empty}</div>;
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return (
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between text-[11.5px]">
          <span style={{ color: v === 0 ? "var(--vault-text-faint)" : "var(--vault-text-mute)" }}>{k}</span>
          <span className="font-mono text-[10px] tabular" style={{ color: v === 0 ? "var(--vault-text-faint)" : "var(--vault-text)" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function AdoptionPanel({ report }: { report: AdoptionReport }) {
  const r = report;
  const win = isMeasured(r.window) ? r.window.value : null;
  const counts = isMeasured(r.eventCounts) ? r.eventCounts.value : null;
  const interest = isMeasured(r.sportDemand.interestBySport) ? r.sportDemand.interestBySport.value : null;
  const engagement = isMeasured(r.sportDemand.engagementBySport) ? r.sportDemand.engagementBySport.value : null;
  const cohorts = isMeasured(r.retention.cohorts) ? r.retention.cohorts.value : null;
  const byReason = isMeasured(r.dataQuality.byReason) ? r.dataQuality.byReason.value : null;

  return (
    <section className="rounded-2xl p-4 sm:p-5" style={{ border: "1px solid var(--vault-border)", background: "var(--lava-panel, var(--vault-wash-faint))" }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)" }}>Public-beta adoption (internal)</h2>
        <span className="rounded-full px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]" style={{ border: `1px solid ${MODE_TONE[r.mode]}`, color: MODE_TONE[r.mode] }}>
          measurement {r.mode}
        </span>
      </div>

      {r.warnings.length ? (
        <div className="mb-3 flex flex-col gap-1">
          {r.warnings.map((w, i) => (
            <div key={i} className="rounded px-2 py-1 text-[11px] leading-snug" style={{ background: "rgba(214,168,72,0.08)", color: "var(--vault-gold)" }}>⚠ {w}</div>
          ))}
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Window", win ? `${win.start} → ${win.end}` : NOT_YET_MEASURED],
          ["Days", win ? `${win.daysWithEvents}/${win.days} with events` : NOT_YET_MEASURED],
          ["Events accepted", win ? String(r.totals.accepted) : NOT_YET_MEASURED],
          ["Collected under", r.collectedUnder ? r.collectedUnder.toUpperCase() : NOT_YET_MEASURED],
        ] as const).map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>{k}</div>
            <div className="font-mono text-[11.5px]" style={{ color: v === NOT_YET_MEASURED ? "var(--vault-text-faint)" : "var(--vault-text)" }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricGroup
          title="Reach"
          rows={[
            ["Sessions (session_started)", formatMeasure(r.reach.sessions)],
            ["Homepage views", formatMeasure(r.reach.homepageViews)],
            ["Today-hub views", formatMeasure(r.reach.todayViews)],
          ]}
          unmeasuredReason={reasonOf(r.reach.sessions)}
        />
        <MetricGroup
          title="Activation — reached market/game detail"
          rows={[
            ["Detail events", formatMeasure(r.activation.detailEvents)],
            ["Ratio to sessions", formatMeasure(r.activation.rate, "percent")],
          ]}
          unmeasuredReason={reasonOf(r.activation.rate, r.activation.detailEvents) ?? r.activation.basis}
        />
        <MetricGroup
          title="Research depth"
          rows={[
            ["High-intent events", formatMeasure(r.researchDepth.highIntentEvents)],
            ["Ratio to today-hub views", formatMeasure(r.researchDepth.rate, "percent")],
          ]}
          unmeasuredReason={reasonOf(r.researchDepth.rate, r.researchDepth.highIntentEvents) ?? r.researchDepth.basis}
        />
        <MetricGroup
          title="Trust loop — results + brief + methodology + status"
          rows={[
            ["Trust touches", formatMeasure(r.trustLoop.touches)],
            ["Per session", formatMeasure(r.trustLoop.perSession)],
          ]}
          unmeasuredReason={reasonOf(r.trustLoop.touches, r.trustLoop.perSession)}
        />
        <MetricGroup
          title="Retention (coarse day cohorts)"
          rows={[
            ["Next-day share", formatMeasure(r.retention.nextDayShare, "percent")],
            ["Within-week share", formatMeasure(r.retention.withinWeekShare, "percent")],
            ...(cohorts ? (Object.entries(cohorts) as Array<[string, number]>).map(([k, v]) => [`· ${k}`, String(v)] as [string, string]) : []),
          ]}
          unmeasuredReason={reasonOf(r.retention.nextDayShare) ?? r.retention.basis}
        />
        <MetricGroup
          title="Data quality"
          rows={[
            ["Submitted / accepted / rejected", `${r.totals.submitted} / ${r.totals.accepted} / ${r.totals.rejected}`],
            ["Day coverage", formatMeasure(r.dataQuality.coverage, "percent")],
            ["Missing day buckets", isMeasured(r.dataQuality.missingDayBuckets) ? String(r.dataQuality.missingDayBuckets.value.length) : NOT_YET_MEASURED],
            ...(byReason ? (Object.entries(byReason) as Array<[string, number]>).filter(([, v]) => v > 0).map(([k, v]) => [`· rejected: ${k}`, String(v)] as [string, string]) : []),
          ]}
          unmeasuredReason={reasonOf(r.dataQuality.coverage)}
        />
      </div>

      <div className="mt-4 rounded-lg px-3 py-2" style={{ border: "1px solid var(--vault-rule)", background: "color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>Sport demand</span>
          <span className="font-mono text-[9px] uppercase" style={{ color: r.sportDemand.interpretable ? "var(--vault-success)" : "var(--gtp-bank-heat)" }}>
            {r.sportDemand.interpretable ? "interpretable" : "do not interpret"}
          </span>
        </div>
        {!r.sportDemand.interpretable ? (
          <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            No sport decision may cite these counts: they require ≥ {r.sportDemand.minWindowDays} days of LIVE measurement
            {win ? ` (window is ${win.days} day${win.days === 1 ? "" : "s"}, mode ${r.mode})` : ""}.
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-0.5 font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>Interest selections</div>
            <CountTable counts={interest} empty={NOT_YET_MEASURED} />
          </div>
          <div>
            <div className="mb-0.5 font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>Engagement by sport</div>
            <CountTable counts={engagement} empty={NOT_YET_MEASURED} />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>Accepted event counts</div>
        <CountTable counts={counts} empty={`${NOT_YET_MEASURED} — no validated event has been captured`} />
      </div>

      <p className="mt-3 font-mono text-[9px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Aggregates only — raw event payloads are never rendered here and never leave the internal surface. /ops is removed
        from the public export (scripts/prune-internal-routes.mjs). Activation of production measurement is BLOCKED BY FOUNDER:
        see docs/ADOPTION_DASHBOARD_CONTRACT.md and the unsigned §7 of docs/ANALYTICS_ACTIVATION_DECISION.md.
      </p>
    </section>
  );
}

export default AdoptionPanel;
