/**
 * Mr. Dub MASTER LEDGER section — the authoritative cross-product paper track record. Per-product
 * record / ROI / P&L / open exposure + overall totals. Stale products are clearly flagged and contribute
 * no exposure. Read-only reporting layer; SEPARATE from the canonical Bank Builder seed-model bankroll.
 */
import SectionHeader from "@/components/section-header";
import type { MasterLedger } from "@/lib/mr-dub/master-ledger";

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const plColor = (n: number) => (n > 0 ? "var(--vault-success)" : n < 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)");

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl px-3 py-3" style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-border)" }}>
      <div className="font-display tracking-tight" style={{ color: accent ?? "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{label}</div>
    </div>
  );
}

export default function MasterLedgerSection({ ledger }: { ledger: MasterLedger }) {
  const a = ledger.aggregate;
  return (
    <section className="mt-8">
      <SectionHeader
        eyebrow="Authoritative · all products"
        title="Mr. Dub master ledger"
        sub="Every product's settled paper track record in one place — record, ROI, P&L, open exposure and lifetime profit. Stale products (no current-slate card) are flagged and contribute no exposure. Paper-only; separate from the Bank Builder seed-model bankroll."
      />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
        <Tile label="Overall record" value={`${a.wins}–${a.losses}`} />
        <Tile label="Bank Builder realized" value={usd(a.bankBuilderProfit ?? a.profit)} accent="var(--vault-gold-bright)" />
        <Tile label="Side-lane net" value={usd(a.sideLaneNet ?? 0)} accent={plColor(a.sideLaneNet ?? 0)} />
        <Tile label="All-products net" value={usd(a.lifetimeProfit ?? a.profit)} accent={plColor(a.lifetimeProfit ?? a.profit)} />
        <Tile label="Open exposure" value={usd(a.openExposure ?? a.exposure)} />
      </div>
      <p className="mt-1.5 px-0.5 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
        Bank Builder realized {usd(a.bankBuilderProfit ?? a.profit)} (the canonical $100→bankroll growth) {(a.sideLaneNet ?? 0) >= 0 ? "+" : "−"} side lanes {usd(Math.abs(a.sideLaneNet ?? 0))} = {usd(a.lifetimeProfit ?? a.profit)} net across all paper products.
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: "1px solid var(--vault-border)" }}>
        <table className="w-full text-left" style={{ borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
              {["Product", "Record", "ROI", "P&L", "Exposure", "Status"].map((h) => (
                <th key={h} className="px-3 py-2" style={{ borderBottom: "1px solid var(--vault-border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ledger.products.map((p) => (
              <tr key={p.productId} style={{ borderBottom: "1px solid var(--vault-border)" }}>
                <td className="px-3 py-2 font-display" style={{ fontWeight: 700, color: "var(--vault-text)", fontSize: 13 }}>{p.label}</td>
                <td className="px-3 py-2 font-mono" style={{ fontSize: 12.5 }}>{p.record.wins}–{p.record.losses}{p.record.voids ? ` (${p.record.voids}V)` : ""}</td>
                <td className="px-3 py-2 font-mono" style={{ fontSize: 12.5, color: plColor(p.profit) }}>{p.canonical && p.roiMultiple != null ? `${p.roiMultiple}×` : p.bets ? pct(p.roi) : "—"}</td>
                <td className="px-3 py-2 font-mono" style={{ fontSize: 12.5, color: plColor(p.profit) }}>{p.bets ? usd(p.profit) : "—"}</td>
                <td className="px-3 py-2 font-mono" style={{ fontSize: 12.5 }}>{usd(p.exposure)}</td>
                <td className="px-3 py-2">
                  <span className="font-mono uppercase tracking-[0.08em] rounded px-1.5 py-0.5" style={{
                    fontSize: 9,
                    color: p.stale ? "var(--gtp-bank-heat)" : "var(--vault-success)",
                    background: p.stale ? "rgba(255,90,90,0.08)" : "rgba(90,255,160,0.07)",
                    border: `1px solid ${p.stale ? "rgba(255,90,90,0.25)" : "rgba(90,255,160,0.2)"}`,
                  }}>{p.stale ? "Stale" : p.exposure > 0 ? "Active" : "Settled"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
        Bank Builder is the canonical compounding bankroll ($100 → today) — the SAME figure shown in the hero
        above, sourced from the one ledger. The side lanes (Moonshot, WC Specials, Homer Nukes) are independent
        flat-stake paper experiments. Every row traces to an official settlement.
      </p>
    </section>
  );
}
