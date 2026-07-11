/**
 * UfcPredictionTable — a scannable, honest summary of EVERY fight on the card. Desktop shows a column
 * grid; each fight is a native <details> that expands to its full market-implied report. Mobile stacks the
 * same cells with labels. Server-renderable (no hooks). Original UI — no external images.
 *
 * Honesty: moneyline is MARKET-IMPLIED (or "Odds pending"); rounds / goes-distance / method render a
 * "Provider needed" lock — never a fabricated public number, never a model edge.
 */
import type { UfcPredictionRow } from "@/lib/ufc/prediction-table";
import type { MultiSportGameReport } from "@/lib/multi-sport-report/schema";
import MultiSportReportShell from "@/components/game/multi-sport-report-shell";

const faint = "var(--vault-text-faint)";
const mute = "var(--vault-text-mute)";
const gold = "var(--vault-gold-bright)";

function american(v: number | null): string {
  return typeof v === "number" && Number.isFinite(v) ? (v > 0 ? `+${v}` : `${v}`) : "—";
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "—";
}

function Lock({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]"
          style={{ color: faint, background: "rgba(26,16,11,0.6)", border: `1px dashed var(--vault-rule)`, fontSize: 8.5 }}>
      <span aria-hidden>🔒</span> {label}
    </span>
  );
}

const COLS = "minmax(150px,1.6fr) minmax(120px,1.4fr) minmax(90px,1fr) minmax(90px,1fr) 92px 92px 92px 96px";

function HeaderRow() {
  const heads = ["Fight", "Moneyline prediction", "Win probability", "Odds", "Rounds", "Goes dist.", "Method", "Status"];
  return (
    <div className="hidden lg:grid gap-2 px-3 py-2" style={{ gridTemplateColumns: COLS }}>
      {heads.map((h) => (
        <span key={h} className="font-mono uppercase tracking-[0.1em]" style={{ color: faint, fontSize: 8.5 }}>{h}</span>
      ))}
    </div>
  );
}

function FightRow({ row, report }: { row: UfcPredictionRow; report?: MultiSportGameReport }) {
  const fav = row.winProbs ? [...row.winProbs].sort((a, b) => b.prob - a.prob)[0] : null;
  return (
    <details className="rounded-[10px]" style={{ background: "rgba(26, 16, 11,0.5)", border: `1px solid ${row.oddsBacked ? "var(--vault-border)" : "var(--vault-rule)"}` }}>
      <summary className="cursor-pointer list-none px-3 py-2.5">
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: COLS }}>
          {/* Fight */}
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="hidden sm:inline-flex shrink-0 -space-x-1">
              <span className="inline-flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: "rgba(242,54,69,0.16)", border: "1px solid var(--vault-rule)", color: "var(--gtp-bank-heat,#f23645)", fontSize: 8.5, fontWeight: 700 }} aria-hidden>{initials(row.fighterA)}</span>
              <span className="inline-flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: "rgba(46,160,102,0.14)", border: "1px solid var(--vault-rule)", color: "var(--gtp-success-on-dark,#7ee2a8)", fontSize: 8.5, fontWeight: 700 }} aria-hidden>{initials(row.fighterB)}</span>
            </span>
            <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{row.fight}</span>
          </span>
          {/* Moneyline prediction */}
          <span className="min-w-0">
            <span className="lg:hidden font-mono uppercase tracking-[0.08em] mr-1" style={{ color: faint, fontSize: 8 }}>ML:</span>
            <span className="truncate" style={{ color: row.oddsBacked ? "var(--vault-text)" : faint, fontSize: 11.5 }}>{row.moneyline}</span>
          </span>
          {/* Win probability */}
          <span className="font-mono tabular" style={{ color: row.winProbs ? mute : faint, fontSize: 11 }}>
            {row.winProbs ? row.winProbs.map((w) => `${Math.round(w.prob * 100)}%`).join(" / ") : "—"}
          </span>
          {/* Odds */}
          <span className="font-mono tabular" style={{ color: row.oddsBacked ? gold : faint, fontSize: 11 }}>
            {row.oddsBacked ? `${american(row.oddsA)} / ${american(row.oddsB)}` : "—"}
          </span>
          {/* Rounds / Goes dist / Method — provider-needed locks */}
          <span><Lock label="Provider" /></span>
          <span><Lock label="Provider" /></span>
          <span><Lock label="Provider" /></span>
          {/* Status */}
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8, color: row.oddsBacked ? "var(--gtp-success-on-dark,#7ee2a8)" : faint, background: row.oddsBacked ? "rgba(46,160,102,0.14)" : "rgba(26,16,11,0.6)", border: `1px solid ${row.oddsBacked ? "rgba(46,160,102,0.35)" : "var(--vault-rule)"}` }}>
            {row.status}
          </span>
        </div>
        <span className="mt-1 block font-mono uppercase tracking-[0.12em]" style={{ color: faint, fontSize: 8 }}>
          {report ? "▸ Open simulation" : "Odds pending — no market-implied read yet"}
        </span>
      </summary>
      {report ? <div className="px-3 pb-3 pt-1"><MultiSportReportShell report={report} /></div> : null}
    </details>
  );
}

export default function UfcPredictionTable({ rows, reports, title, subtitle }: {
  rows: UfcPredictionRow[];
  reports: MultiSportGameReport[];
  title?: string;
  subtitle?: string;
}) {
  const byId = new Map(reports.filter((r) => r.eventId).map((r) => [r.eventId, r] as const));
  const backed = rows.filter((r) => r.oddsBacked).length;
  return (
    <section className="flex flex-col gap-2.5">
      {title ? <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>{title}</h3> : null}
      {subtitle ? <p style={{ color: mute, fontSize: 12.5, lineHeight: 1.4, maxWidth: 640 }}>{subtitle}</p> : null}
      {/* Why some columns are locked — honest boundary, always shown. */}
      <p className="rounded-[8px] px-3 py-2 font-mono" style={{ color: faint, fontSize: 10, background: "rgba(26,16,11,0.55)", border: `1px solid var(--vault-rule)`, lineHeight: 1.5 }}>
        Why some columns are locked: moneyline has real two-sided odds today ({backed} of {rows.length} fights). Method, round, and distance markets are not available from the current provider feed, and the internal UFC model is still unvalidated — so those columns are provider-needed, never a fabricated prediction.
      </p>
      <div className="flex flex-col gap-1.5 overflow-x-auto">
        <HeaderRow />
        {rows.map((r) => <FightRow key={r.boutId} row={r} report={r.reportId ? byId.get(r.reportId) : undefined} />)}
      </div>
    </section>
  );
}
