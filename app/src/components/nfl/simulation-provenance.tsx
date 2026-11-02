/**
 * What a simulation was built on, and whether that is still the current Official Forecast (founder rule, 2026-11-02).
 * Server component; every value comes from lib/simulation-theater/sim-input-provenance.mjs. Inline tokens only, because
 * it renders on the page with the Theater flag OFF, where no Theater stylesheet loads.
 */
import { formatUpdatedEt } from "@/lib/format";
import { HYPOTHETICAL_LABEL } from "@/lib/simulation-theater/sim-input-provenance.mjs";

export interface SimProvenance {
  schema: string; eventId: string; state: "CURRENT" | "EARLIER_FORECAST" | "UNVERIFIED"; current: boolean; label: string; role: string;
  simulation: { receiptId: string | null; engine: string | null; engineVersion: string | null; promotionState: string | null; runCount: number | null; baseSeed: string | null; generatedAt: string | null; eventStart: string | null };
  input: { forecastRevision: string | null; forecastGeneratedAt: string | null; forecastInputHash: string | null; forecastModel: string | null; anchors: { home: number | null; away: number | null }; roleSharesAsOf: string | null; injuriesAsOf: string | null; rostersAsOf: string | null; paramsSha256: string | null };
  official: { forecastRevision: string | null; generatedAt: string | null; inputHash: string | null; modelVersion: string | null } | null;
  assumptions: string[];
}

const when = (iso: string | null | undefined) => (iso ? formatUpdatedEt(iso) : "not recorded");

const summary = (p: SimProvenance) => {
  if (p.current) return `It was built on the current Official Forecast, published ${when(p.official?.generatedAt)}. It is still a hypothetical simulation, not the forecast.`;
  if (p.state === "EARLIER_FORECAST") return `This simulation was built on an earlier forecast, published ${when(p.input.forecastGeneratedAt)}. The current Official Forecast was published ${when(p.official?.generatedAt)}. Nothing in this simulation is current or official.`;
  return `This simulation could not be matched to the current Official Forecast, so nothing in it is current or official. Its input was published ${when(p.input.forecastGeneratedAt)}.`;
};

export default function SimulationProvenance({ p, compact = false }: { p: SimProvenance; compact?: boolean }) {
  const warn = p.current ? "var(--vault-border-strong)" : "var(--vault-warn)";
  return (
    <section
      aria-label="What this simulation was built on"
      data-sim-provenance={p.state}
      data-sim-input-revision={p.input.forecastRevision ?? ""}
      data-sim-official-revision={p.official?.forecastRevision ?? ""}
      data-sim-generated-at={p.simulation.generatedAt ?? ""}
      style={{ border: "1px solid var(--vault-border-strong)", borderLeft: `3px solid ${warn}`, borderRadius: 12, padding: "10px 14px", margin: "12px 0 0", background: "var(--gtp-card)", minWidth: 0 }}
    >
      <p className="font-mono" style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: p.current ? "var(--vault-text-faint)" : "var(--vault-warn)" }}>
        {HYPOTHETICAL_LABEL} · {p.label}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--vault-text)" }}>{summary(p)}</p>
      {compact ? null : (
        <>
          <dl style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", display: "grid", gridTemplateColumns: "minmax(0,max-content) minmax(0,1fr)", gap: "2px 12px" }}>
            <dt>Simulation run</dt><dd style={{ margin: 0 }}>{when(p.simulation.generatedAt)}</dd>
            <dt>Input forecast</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }} data-sim-input-version="">{p.input.forecastModel ?? "not recorded"} · revision {p.input.forecastRevision ?? "not recorded"}</dd>
            <dt>Injuries as of</dt><dd style={{ margin: 0 }}>{when(p.input.injuriesAsOf)}</dd>
            <dt>Rosters as of</dt><dd style={{ margin: 0 }}>{when(p.input.rostersAsOf)}</dd>
            <dt>Player roles as of</dt><dd style={{ margin: 0 }}>{when(p.input.roleSharesAsOf)}</dd>
          </dl>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)" }} data-sim-assumptions="">
            {p.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
