/**
 * SpecialsLedgerSection — the durable World Cup Specials ledger summary: record, ROI, P&L, win rate,
 * today's open exposure and the count of archived slates, for the permanent 5-a-day / $20-each product.
 * Pure presentational; all aggregation lives in lib/world-cup/specials-ledger. Honest empty-record state.
 */
import type { SpecialsLedger } from "@/lib/world-cup/specials-ledger";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pnlColor = (n: number) => (n > 0 ? "var(--vault-success)" : n < 0 ? "var(--gtp-bank-heat)" : "var(--vault-text)");

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-[10px] px-3 py-2.5 min-w-0" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
      <div className="font-display tabular truncate" style={{ color: accent ?? "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{label}</div>
    </div>
  );
}

export default function SpecialsLedgerSection({ ledger }: { ledger: SpecialsLedger }) {
  const rec = `${ledger.record.wins}-${ledger.record.losses}${ledger.record.pushes ? `-${ledger.record.pushes}` : ""}`;
  return (
    <section className="flex flex-col gap-3" aria-label="World Cup Specials ledger">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>World Cup Specials ledger</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {money(ledger.stakePerCard)} × 5/day · {money(ledger.dailyAllocation)}/day · paper-only
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat label="Record" value={rec} accent="var(--vault-success)" />
        <Stat label="Win rate" value={ledger.winRate != null ? `${Math.round(ledger.winRate * 100)}%` : "—"} />
        <Stat label="P&L" value={money(ledger.pnl)} accent={pnlColor(ledger.pnl)} />
        <Stat label="ROI" value={ledger.roi != null ? `${(ledger.roi * 100).toFixed(1)}%` : "—"} accent={ledger.roi != null ? pnlColor(ledger.roi) : undefined} />
        <Stat label="Open exposure" value={money(ledger.openExposure)} accent="var(--vault-gold-bright)" />
        <Stat label="Slates archived" value={String(ledger.totalSlates)} />
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>{ledger.note}</p>
    </section>
  );
}
