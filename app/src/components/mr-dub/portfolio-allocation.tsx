/**
 * PortfolioAllocation — Mr. Dub's top-level portfolio view: how the single bankroll is allocated TODAY
 * across the four products (Bank Builder · Moonshot · World Cup Specials · Homer Nukes), with each
 * product's open exposure, share of bankroll, daily allocation, status and record.
 *
 * Pure presentational; all derivation lives in lib/mr-dub/product-allocation. Honest by construction —
 * records / realized P/L only ever change on official settlement, and a product with no posted board
 * (e.g. MLB before odds post) reads $0 exposure with a data-gated note. No horizontal overflow at 375px.
 */
import Link from "next/link";
import type { PortfolioAllocation as Allocation, ProductAllocation } from "@/lib/mr-dub/product-allocation";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctLabel = (p: number) => `${Math.round(p * 100)}%`;

const STATUS_TONE: Record<ProductAllocation["status"], { color: string; bg: string }> = {
  active: { color: "var(--vault-success)", bg: "rgba(110,231,168,0.12)" },
  candidate: { color: "var(--vault-gold-bright)", bg: "rgba(217,164,65,0.12)" },
  pending: { color: "#e7b15a", bg: "rgba(231,177,90,0.12)" },
  "no-board": { color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.05)" },
};

/** A horizontal allocation bar: each product's share of total open exposure, in product accents. */
function AllocationBar({ products, total }: { products: ProductAllocation[]; total: number }) {
  const segs = products.filter((p) => p.openExposure > 0);
  if (total <= 0 || segs.length === 0) {
    return (
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }} aria-label="No open exposure allocated today" />
    );
  }
  return (
    <div className="flex h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }} aria-label="Open exposure allocation by product">
      {segs.map((p) => (
        <span key={p.key} title={`${p.label} ${pctLabel(p.openExposure / total)}`} style={{ width: `${(p.openExposure / total) * 100}%`, background: p.accent }} />
      ))}
    </div>
  );
}

function ProductRow({ p, totalExposure }: { p: ProductAllocation; totalExposure: number }) {
  const t = STATUS_TONE[p.status];
  const shareOfExposure = totalExposure > 0 ? p.openExposure / totalExposure : 0;
  const rec = `${p.record.wins}-${p.record.losses}${p.record.pushes ? `-${p.record.pushes}` : ""}`;
  const americ = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  // Analytics chips: record, win rate, avg odds, legs — only those with real data are shown.
  const analytics = [
    p.record.wins + p.record.losses + p.record.pushes > 0 ? `${rec} record` : null,
    p.winRate != null ? `${Math.round(p.winRate * 100)}% win rate` : null,
    p.avgOdds != null ? `avg ${americ(p.avgOdds)}` : null,
    p.legCount > 0 ? `${p.legCount} legs` : null,
  ].filter(Boolean) as string[];
  return (
    <Link
      href={p.href}
      className="vault-glow-hover vault-press rounded-[12px] px-3.5 py-3 flex flex-col gap-2 min-w-0"
      style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)", borderLeft: `2px solid ${p.accent}`, textDecoration: "none" }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="inline-flex items-center justify-center rounded-[5px] shrink-0 font-mono tabular" style={{ width: 16, height: 16, fontSize: 9, fontWeight: 700, color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--vault-rule)" }}>#{p.rank}</span>
          <span className="font-semibold break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{p.label}</span>
        </span>
        <span className="shrink-0 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8.5, color: t.color, background: t.bg, border: `1px solid color-mix(in srgb, ${t.color} 35%, transparent)` }}>
          {p.statusLabel}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <span className="flex flex-col">
          <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 800 }}>{money(p.openExposure)}</span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>open exposure</span>
        </span>
        <span className="flex flex-col">
          <span className="font-display tabular" style={{ color: p.accent, fontSize: 14, fontWeight: 800 }}>{pctLabel(shareOfExposure)}</span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>of allocation</span>
        </span>
        <span className="flex flex-col">
          <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 800 }}>{p.roi != null ? `${(p.roi * 100).toFixed(1)}%` : p.winRate != null ? `${Math.round(p.winRate * 100)}%` : rec}</span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>{p.roi != null ? "ROI" : p.winRate != null ? "win rate" : "record"}</span>
        </span>
      </div>
      {analytics.length ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          {analytics.map((a, i) => <span key={i}>{i > 0 ? "· " : ""}{a}</span>)}
        </span>
      ) : null}
      <span className="font-mono leading-snug" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        {money(p.dailyAllocation)}/day allocation · {p.note}
      </span>
    </Link>
  );
}

export default function PortfolioAllocationSection({ allocation }: { allocation: Allocation }) {
  return (
    <section className="flex flex-col gap-3 overflow-x-hidden" aria-label="Portfolio allocation">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>Portfolio allocation</h2>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{allocation.date} · paper-only</span>
      </div>

      {/* Top-line: bankroll, today's allocated exposure, available, crown. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-[10px] px-3 py-2.5 min-w-0" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
          <div className="font-display tabular truncate" style={{ color: "var(--vault-gold-bright)", fontSize: 16, fontWeight: 800 }}>{money(allocation.activeBankroll)}</div>
          <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Active bankroll</div>
        </div>
        <div className="rounded-[10px] px-3 py-2.5 min-w-0" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
          <div className="font-display tabular truncate" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{money(allocation.totalOpenExposure)}</div>
          <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Open exposure (today)</div>
        </div>
        <div className="rounded-[10px] px-3 py-2.5 min-w-0" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
          <div className="font-display tabular truncate" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{money(allocation.availableBankroll)}</div>
          <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Available</div>
        </div>
        <div className="rounded-[10px] px-3 py-2.5 min-w-0" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-rule)" }}>
          <div className="font-display tabular truncate" style={{ color: "var(--vault-text-faint)", fontSize: 16, fontWeight: 800 }}>{money(allocation.crownBankroll)}</div>
          <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Crown (historical)</div>
        </div>
      </div>

      <AllocationBar products={allocation.products} total={allocation.totalOpenExposure} />

      {/* Per-product rows — 2×2 on desktop, single column on mobile. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {allocation.products.map((p) => <ProductRow key={p.key} p={p} totalExposure={allocation.totalOpenExposure} />)}
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>{allocation.note}</p>
    </section>
  );
}
