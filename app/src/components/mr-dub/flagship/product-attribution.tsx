"use client";
/**
 * Product attribution (Phase 6) — every settled paper wager tagged with the flagship product that
 * generated it (Bank Builder / Moonshot / World Cup Specials), filterable. Bank Builder rows carry their
 * real legs; the side lanes carry the settled date + outcome from their product ledger. Pure display.
 */
import { useMemo, useState } from "react";
import type { WagerRow } from "@/lib/mr-dub/flagship";

const usd = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}`; };
const outcomeTone = (o: string) => o === "won" ? "var(--vault-success)" : o === "lost" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)";

export default function ProductAttribution({ wagers }: { wagers: WagerRow[] }) {
  const products = useMemo(() => {
    const map = new Map<string, { id: string; label: string; glyph: string; w: number; l: number }>();
    for (const r of wagers) {
      const e = map.get(r.productId) ?? { id: r.productId, label: r.productLabel, glyph: r.glyph, w: 0, l: 0 };
      if (r.outcome === "won") e.w++; else if (r.outcome === "lost") e.l++;
      map.set(r.productId, e);
    }
    return [...map.values()];
  }, [wagers]);
  const [filter, setFilter] = useState<string>("all");
  const rows = filter === "all" ? wagers : wagers.filter((r) => r.productId === filter);

  return (
    <div className="rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--vault-border)", background: "var(--gtp-card, var(--vault-wash-faint))" }}>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilter("all")} className="gtp-pressable rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ cursor: "pointer", color: filter === "all" ? "var(--vault-bg)" : "var(--vault-text-mute)", background: filter === "all" ? "var(--vault-gold)" : "transparent", border: `1px solid ${filter === "all" ? "var(--vault-gold)" : "var(--vault-rule)"}` }}>All · {wagers.length}</button>
        {products.map((p) => (
          <button key={p.id} onClick={() => setFilter(p.id)} className="gtp-pressable rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ cursor: "pointer", color: filter === p.id ? "var(--vault-bg)" : "var(--vault-text-mute)", background: filter === p.id ? "var(--vault-gold)" : "transparent", border: `1px solid ${filter === p.id ? "var(--vault-gold)" : "var(--vault-rule)"}` }}>
            <span aria-hidden>{p.glyph}</span> {p.label.replace(" Nukes", "")} · {p.w}-{p.l}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5" style={{ border: "1px solid var(--vault-rule)", background: "color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent)", borderLeft: `2px solid ${outcomeTone(r.outcome)}` }}>
            <span className="w-11 shrink-0 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{md(r.date)}</span>
            <span aria-hidden className="shrink-0 text-[12px]">{r.glyph}</span>
            <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{r.detail ?? r.productLabel}</span>
            <span className="shrink-0 font-mono text-[9px] uppercase" style={{ color: outcomeTone(r.outcome) }}>{r.outcome}</span>
            <span className="w-[74px] shrink-0 text-right font-mono text-[11px] tabular" style={{ color: r.profit > 0 ? "var(--vault-success)" : r.profit < 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)" }}>{r.outcome === "won" && r.profit === 0 ? "rolls" : signed(r.profit)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>Bank Builder is the canonical bankroll (won steps roll — $0 realized until a ladder banks or stops). Moonshot &amp; World Cup Specials are separate flat-stake paper lanes, settled from official results.</p>
    </div>
  );
}
