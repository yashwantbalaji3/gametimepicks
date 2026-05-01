import { getHitRates } from "@/lib/data";
import { formatPercent, formatDate } from "@/lib/format";
import KpiTile from "@/components/kpi-tile";
import HitRateChart from "@/components/hit-rate-chart";
import CalibrationChart from "@/components/calibration-chart";
import StatusBadge from "@/components/status-badge";

export default function ResultsPage() {
  const hr = getHitRates();
  const o = hr.overall;

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12">
      {/* Header */}
      <div className="reveal">
        <div className="eyebrow">tracked results</div>
        <h1 className="mt-2 font-display text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          {formatPercent(o.hitRate)} hit rate
        </h1>
        <p className="mt-3 text-[var(--text-mute)] text-[14px] font-mono">
          {o.total} tracked leans · {hr.dateRange}
        </p>
      </div>

      {/* Sample-data note (only renders when present in JSON) */}
      {hr.isDemo && (
        <aside className="surface px-4 py-3 mt-5 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
          <div className="flex items-start gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--amber)] shrink-0 mt-0.5">
              sample
            </span>
            <p className="font-mono text-[12px] text-[var(--text-mute)] leading-relaxed">
              {hr.sampleNote ||
                "These are sample numbers for demonstration. Real settlement begins once live games complete and the pipeline runs in non-demo mode."}
            </p>
          </div>
        </aside>
      )}

      {/* KPI tiles */}
      <section className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="leans" value={String(o.total)} delay={1} />
        <KpiTile label="wins" value={String(o.won)} accent="lime" delay={2} />
        <KpiTile label="losses" value={String(o.lost)} accent="rose" delay={3} />
        <KpiTile label="pushes" value={String(o.push)} delay={4} />
        <KpiTile
          label="hit rate"
          value={formatPercent(o.hitRate)}
          accent={o.hitRate >= 0.524 ? "lime" : "amber"}
          sub="break-even ~52.4%"
          delay={5}
        />
      </section>

      {/* Charts */}
      <section className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="surface p-5 reveal reveal-d1">
          <div className="eyebrow mb-4">by market</div>
          <HitRateChart breakdowns={hr.byMarket} />
        </div>
        <div className="surface p-5 reveal reveal-d2">
          <div className="eyebrow mb-4">by confidence</div>
          <HitRateChart breakdowns={hr.byConfidence} />
        </div>
      </section>

      {/* Calibration chart (if we have it) */}
      {hr.calibration && hr.calibration.length > 0 && (
        <section className="mt-3 surface p-5 reveal reveal-d3">
          <div className="flex items-baseline justify-between mb-4">
            <div className="eyebrow">model calibration</div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
              predicted vs actual
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="flex justify-center">
              <CalibrationChart buckets={hr.calibration} size={280} />
            </div>
            <div className="text-[13px] text-[var(--text-mute)] leading-relaxed space-y-3">
              <p>
                Each circle is a probability bucket: x is what the model
                predicted on average, y is how often those props actually hit.
              </p>
              <p>
                A perfectly calibrated model lies on the dashed line. Buckets{" "}
                <span className="text-[var(--text)]">above</span> mean we
                under-predicted; <span className="text-[var(--text)]">below</span>{" "}
                means we over-predicted. Bucket size scales with sample count.
              </p>
              <p className="text-[var(--text-faint)] text-[12px] pt-1">
                Calibration matters more than raw hit rate. A 60% hit rate on
                props the model rated 65% likely is worse than a 55% hit rate on
                props rated 55% likely.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Recent settled */}
      <section className="mt-3 surface p-5 reveal reveal-d4">
        <div className="eyebrow mb-3">recent settled leans</div>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[13px] min-w-[640px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Player</th>
                <th className="py-2 pr-3">Lean</th>
                <th className="py-2 pr-3 text-right">Result</th>
                <th className="py-2 pl-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {hr.recentSettled.map((r, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition-colors"
                >
                  <td className="py-2.5 pr-3 text-[var(--text-faint)]">{formatDate(r.date)}</td>
                  <td className="py-2.5 pr-3">{r.playerName}</td>
                  <td className="py-2.5 pr-3 text-[var(--text-mute)]">
                    {r.lean} {r.market} {r.line}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular">{r.actualValue}</td>
                  <td className="py-2.5 pl-3 text-right">
                    <StatusBadge status={r.status} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Caveat */}
      <p className="mt-6 text-[12px] text-[var(--text-faint)] max-w-2xl leading-relaxed">
        Past performance does not guarantee future results. Hit rate alone does
        not equal profit — sportsbook vig means break-even is typically ~52.4%
        on -110 props. ROI calculations are intentionally not shown until the
        methodology supports them rigorously.
      </p>
    </div>
  );
}
