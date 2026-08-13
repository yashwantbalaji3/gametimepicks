/**
 * SimulationCoverageMatrix — renders the honest per-sport-per-market coverage registry so the product
 * never hides a gap: supported markets, conditional ones, and everything blocked (provider-needed /
 * settlement-blocked / coming-soon) with a plain-English "why". Pure server component; reads the
 * `market-coverage` registry only. No fabrication.
 */
import {
  MARKET_COVERAGE,
  COVERAGE_SPORTS,
  coverageForSport,
  type MarketStatus,
  type MarketCoverage,
} from "@/lib/market-coverage";

const STATUS_META: Record<MarketStatus, { label: string; color: string; bg: string }> = {
  supported: { label: "Supported", color: "var(--vault-success)", bg: "rgba(34,197,94,0.10)" },
  conditional: { label: "Conditional", color: "var(--vault-gold)", bg: "rgba(234,179,8,0.10)" },
  experimental: { label: "Experimental", color: "var(--vault-warn)", bg: "rgba(234,88,12,0.10)" },
  provider_needed: { label: "Provider needed", color: "var(--vault-text-mute)", bg: "rgba(255,255,255,0.04)" },
  settlement_blocked: { label: "Settlement blocked", color: "var(--vault-warn)", bg: "rgba(234,88,12,0.08)" },
  coming_soon: { label: "Coming soon", color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.03)" },
};

function StatusPill({ status }: { status: MarketStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="font-mono uppercase tracking-[0.1em] rounded-full px-2 py-0.5 shrink-0"
      style={{ fontSize: 9.5, color: m.color, background: m.bg, border: `1px solid ${m.color}33` }}
    >
      {m.label}
    </span>
  );
}

function Row({ m }: { m: MarketCoverage }) {
  return (
    <div className="flex flex-col gap-1 py-2.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{m.publicLabel}</span>
        <StatusPill status={m.status} />
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{m.publicExplanation}</p>
      {m.settlementSupport !== "supported" && (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>
          Settlement: {m.settlementSupport}
          {m.requiredData.length > 0 ? ` · needs: ${m.requiredData.join(", ")}` : ""}
        </p>
      )}
    </div>
  );
}

export default function SimulationCoverageMatrix({ sport }: { sport?: "mlb" | "nfl" | "soccer" | "ufc" }) {
  const groups = sport
    ? COVERAGE_SPORTS.filter((s) => s.key === sport)
    : COVERAGE_SPORTS;

  return (
    <section aria-label="Market coverage" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>
          What we simulate — and what we don&rsquo;t (yet)
        </h2>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Every market we cover, plus the ones we don&rsquo;t — with the exact reason (provider feed, settlement,
          or validation). We never show a market we can&rsquo;t back with real data. Paper-only, educational.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {groups.map((g) => {
          const rows = coverageForSport(g.key);
          return (
            <div
              key={g.key}
              className="rounded-[12px] px-4 py-4 flex flex-col"
              style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border)" }}
            >
              <div className="flex flex-col gap-0.5 pb-1">
                <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>{g.label}</span>
                <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                  {g.note}
                </span>
              </div>
              {rows.map((m) => <Row key={`${m.sport}-${m.market}`} m={m} />)}
            </div>
          );
        })}
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>
        {MARKET_COVERAGE.filter((m) => m.status === "supported").length} supported ·{" "}
        {MARKET_COVERAGE.filter((m) => m.status === "provider_needed" || m.status === "coming_soon").length} need a provider/build ·{" "}
        settlement-blocked + experimental markets are never in Bank Builder / Moonshot.
      </p>
    </section>
  );
}
