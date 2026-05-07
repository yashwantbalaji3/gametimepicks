/**
 * ResultsBreakdown — Phase 8.4.1.
 *
 * Renders the full comparison report for a single date:
 *   - by-market hit rate
 *   - by-confidence hit rate
 *   - by-game / by-bookmaker
 *   - largest misses (top N)
 *   - best calls (top N highest-edge wins)
 *   - average projection error stats
 *
 * Defensive design: settlement-data.ts (from Phase 8.2) types
 * `largestMisses` and `bestCalls` as `Array<Record<string, unknown>>`,
 * so this component reads each row through small `toStr` / `toNum`
 * helpers that narrow the unknowns safely. This way the file compiles
 * cleanly against the existing 8.2 settlement-data.ts without us
 * needing to modify that file.
 *
 * Honest framing: never invents data. If a bucket has zero decisive
 * picks, hit rate shows "—" rather than a misleading 0%.
 */
import type { ComparisonReport, BucketStats } from "@/lib/settlement-data";
import { formatPercent, formatStat } from "@/lib/format";

// ---------------------------------------------------------------------------
// Safe-narrowing helpers — work with both Record<string, unknown> and
// strictly-typed objects. Returns undefined when the value isn't of the
// expected primitive type.
// ---------------------------------------------------------------------------
function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNum(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

interface CallRowData {
  playerName?: string;
  market?: string;
  line?: number;
  modelProjection?: number;
  finalStat?: number;
  absoluteProjectionError?: number;
  edgePct?: number;
  result?: string;
}

function toMissRow(r: unknown): CallRowData {
  const o = (r ?? {}) as Record<string, unknown>;
  return {
    playerName: asStr(o.playerName),
    market: asStr(o.market),
    line: asNum(o.line),
    modelProjection: asNum(o.modelProjection),
    finalStat: asNum(o.finalStat),
    absoluteProjectionError: asNum(o.absoluteProjectionError),
    result: asStr(o.result),
  };
}

function toBestRow(r: unknown): CallRowData {
  const o = (r ?? {}) as Record<string, unknown>;
  return {
    playerName: asStr(o.playerName),
    market: asStr(o.market),
    line: asNum(o.line),
    finalStat: asNum(o.finalStat),
    edgePct: asNum(o.edgePct),
    result: asStr(o.result),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ResultsBreakdown({
  report,
}: {
  report: ComparisonReport;
}) {
  const misses: CallRowData[] = (report.largestMisses ?? []).map(toMissRow);
  const wins: CallRowData[] = (report.bestCalls ?? []).map(toBestRow);

  return (
    <div className="mt-4 space-y-8">
      {/* Top-level totals + projection error */}
      <section
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-[3px] p-4 sm:p-5"
        style={{
          background: "var(--vault-panel)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <Stat
          label="hit rate"
          value={
            report.hitRate !== null && report.hitRate !== undefined
              ? formatPercent(report.hitRate)
              : "—"
          }
          accent="gold"
        />
        <Stat
          label="decisive"
          value={String(report.decisive ?? 0)}
          sub={`${report.wins ?? 0}–${report.losses ?? 0}–${report.pushes ?? 0} W-L-P`}
        />
        <Stat
          label="avg |proj error|"
          value={
            report.averageAbsoluteProjectionError !== null &&
            report.averageAbsoluteProjectionError !== undefined
              ? formatStat(report.averageAbsoluteProjectionError)
              : "—"
          }
          sub="model vs final stat"
        />
        <Stat
          label="avg proj bias"
          value={
            report.averageProjectionError !== null &&
            report.averageProjectionError !== undefined
              ? `${report.averageProjectionError >= 0 ? "+" : ""}${report.averageProjectionError.toFixed(2)}`
              : "—"
          }
          sub={
            report.averageProjectionError !== null &&
            report.averageProjectionError !== undefined &&
            report.averageProjectionError !== 0
              ? report.averageProjectionError > 0
                ? "model overshot"
                : "model undershot"
              : ""
          }
        />
      </section>

      {/* Sample size warning surfaced inline */}
      {report.sampleSizeWarning && (
        <aside
          className="px-4 py-3 rounded-[3px] flex items-start gap-3"
          style={{
            background: "var(--vault-warn-dim)",
            border: "1px solid rgba(240, 199, 94, 0.30)",
          }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-wider shrink-0 mt-0.5"
            style={{ color: "var(--vault-warn)" }}
          >
            small sample
          </span>
          <p
            className="font-mono text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {report.sampleSizeWarning}
          </p>
        </aside>
      )}

      {/* Buckets — by market */}
      {report.byMarket && Object.keys(report.byMarket).length > 0 && (
        <BucketSection
          title="by market"
          buckets={report.byMarket}
          formatKey={(k) => marketLabel(k)}
        />
      )}

      {/* By confidence */}
      {report.byConfidence && Object.keys(report.byConfidence).length > 0 && (
        <BucketSection
          title="by confidence tier"
          buckets={report.byConfidence}
          formatKey={(k) => confidenceLabel(k)}
        />
      )}

      {/* By game */}
      {report.byGame && Object.keys(report.byGame).length > 0 && (
        <BucketSection
          title="by game"
          buckets={report.byGame}
          formatKey={(k) => k}
          subtle
        />
      )}

      {/* By bookmaker */}
      {report.byBookmaker && Object.keys(report.byBookmaker).length > 0 && (
        <BucketSection
          title="by bookmaker"
          buckets={report.byBookmaker}
          formatKey={(k) => k}
          subtle
        />
      )}

      {/* Largest misses */}
      {misses.length > 0 && (
        <CallList
          title="largest projection misses"
          rows={misses.map((r) => ({
            playerName: r.playerName ?? "—",
            market: r.market ?? "—",
            line: r.line,
            modelProjection: r.modelProjection,
            finalStat: r.finalStat,
            error: r.absoluteProjectionError,
            result: r.result ?? "",
            tag: "miss" as const,
          }))}
        />
      )}

      {/* Best calls */}
      {wins.length > 0 && (
        <CallList
          title="best calls (highest-edge wins)"
          rows={wins.map((r) => ({
            playerName: r.playerName ?? "—",
            market: r.market ?? "—",
            line: r.line,
            modelProjection: undefined,
            finalStat: r.finalStat,
            edgePct: r.edgePct,
            result: r.result ?? "",
            tag: "win" as const,
          }))}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------
function BucketSection({
  title,
  buckets,
  formatKey,
  subtle,
}: {
  title: string;
  buckets: Record<string, BucketStats>;
  formatKey: (k: string) => string;
  subtle?: boolean;
}) {
  const entries = Object.entries(buckets).sort(
    (a, b) => (b[1]?.total ?? 0) - (a[1]?.total ?? 0),
  );
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(([k, b]) => (
          <BucketTile
            key={k}
            label={formatKey(k)}
            bucket={b}
            subtle={subtle}
          />
        ))}
      </div>
    </section>
  );
}

function BucketTile({
  label,
  bucket,
  subtle,
}: {
  label: string;
  bucket: BucketStats;
  subtle?: boolean;
}) {
  const hr = bucket?.hitRate;
  return (
    <div
      className="rounded-[3px] p-3 sm:p-4"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.18em] uppercase truncate"
        style={{
          color: subtle ? "var(--vault-text-mute)" : "var(--vault-gold)",
        }}
      >
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="font-display font-semibold tabular tracking-tight text-[20px] sm:text-[22px]"
          style={{
            color:
              hr === null || hr === undefined
                ? "var(--vault-text-faint)"
                : "var(--vault-text)",
          }}
        >
          {hr !== null && hr !== undefined ? formatPercent(hr) : "—"}
        </span>
        <span
          className="font-mono text-[10px] tabular"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {bucket?.wins ?? 0}–{bucket?.losses ?? 0}
          {(bucket?.pushes ?? 0) > 0 ? `–${bucket.pushes}p` : ""}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Call list (largest misses / best calls)
// ---------------------------------------------------------------------------
type CallRow = {
  playerName: string;
  market: string;
  line?: number;
  modelProjection?: number;
  finalStat?: number;
  error?: number;
  edgePct?: number;
  result: string;
  tag: "miss" | "win";
};

function CallList({ title, rows }: { title: string; rows: CallRow[] }) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <div
        className="mt-3 rounded-[3px] divide-y"
        style={{
          background: "var(--vault-panel)",
          border: "1px solid var(--vault-border)",
        }}
      >
        {rows.map((r, i) => (
          <div
            key={i}
            className="px-4 py-3 flex items-center gap-3"
            style={{ borderColor: "var(--vault-rule)" }}
          >
            <ResultDot result={r.result} />
            <div className="min-w-0 flex-1">
              <div
                className="font-display text-[14px] font-semibold truncate"
                style={{ color: "var(--vault-text)" }}
              >
                {r.playerName}
              </div>
              <div
                className="mt-0.5 font-mono text-[10px] uppercase tracking-wider truncate"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {marketLabel(r.market)}
                {r.line !== undefined && (
                  <>
                    <span style={{ color: "var(--vault-text-faint)" }}> · </span>
                    <span>line {formatStat(r.line)}</span>
                  </>
                )}
                {r.finalStat !== undefined && (
                  <>
                    <span style={{ color: "var(--vault-text-faint)" }}> · </span>
                    <span style={{ color: "var(--vault-text-mute)" }}>
                      final {formatStat(r.finalStat)}
                    </span>
                  </>
                )}
                {r.modelProjection !== undefined && (
                  <>
                    <span style={{ color: "var(--vault-text-faint)" }}> · </span>
                    <span>proj {formatStat(r.modelProjection)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              {r.tag === "miss" && r.error !== undefined && (
                <div
                  className="font-mono font-semibold tabular text-[13px]"
                  style={{ color: "var(--vault-danger)" }}
                >
                  ±{formatStat(r.error)}
                </div>
              )}
              {r.tag === "win" && r.edgePct !== undefined && (
                <div
                  className="font-mono font-semibold tabular text-[13px]"
                  style={{ color: "var(--vault-gold-bright)" }}
                >
                  +{r.edgePct.toFixed(1)}%
                </div>
              )}
              <div
                className="font-mono text-[9px] uppercase tracking-wider mt-0.5"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {r.tag === "miss" ? "|proj err|" : "edge"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultDot({ result }: { result: string }) {
  let color = "var(--vault-text-faint)";
  if (result === "win") color = "var(--vault-success)";
  else if (result === "loss") color = "var(--vault-danger)";
  else if (result === "push") color = "var(--vault-warn)";
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      aria-label={result || "result"}
    />
  );
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
        style={{ color: "var(--vault-gold)" }}
      >
        {children}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "gold" | "default";
}) {
  return (
    <div>
      <div
        className="font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 font-display font-semibold tabular tracking-tight text-[20px] sm:text-[22px]"
        style={{
          color:
            accent === "gold"
              ? "var(--vault-gold-bright)"
              : "var(--vault-text)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-0.5 font-mono text-[10px] tracking-wider"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function marketLabel(m: string): string {
  if (m === "PTS") return "Points";
  if (m === "REB") return "Rebounds";
  if (m === "AST") return "Assists";
  return m;
}

function confidenceLabel(c: string): string {
  if (c === "insufficient_data") return "no data";
  if (c === "no_play") return "pass";
  return c;
}
