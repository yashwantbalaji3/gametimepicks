/** ProjectionCard — shared model-projection card (model vs market, edge, status). */
import type { PublicProjection } from "@/lib/normalize";
import { formatAmerican } from "@/lib/odds-math";
import StatusChip from "@/components/ui/status-chip";

function pct(p?: number | null) { return p == null ? "—" : `${Math.round(p * 100)}%`; }

export default function ProjectionCard({ p }: { p: PublicProjection }) {
  const edgePos = (p.edgePct ?? 0) >= 0;
  return (
    <article className="rounded-[8px] px-3.5 py-3 flex flex-col gap-2"
             style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="font-mono uppercase tracking-[0.1em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          {p.sportLabel} · {p.marketLabel}
        </span>
        <StatusChip label={p.parlayEligible ? "Card eligible" : "Projection view"} />
      </div>
      <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>{p.gameLabel}</span>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          {p.pickLabel} · {formatAmerican(p.americanOdds ?? null)}
        </span>
        <span className="font-mono tabular" style={{ color: edgePos ? "var(--vault-success)" : "var(--vault-text-faint)", fontSize: 11, fontWeight: 600 }}>
          {edgePos ? "+" : ""}{(p.edgePct ?? 0).toFixed(1)}%
        </span>
      </div>
      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
        Model {pct(p.modelProbability)} · Market {pct(p.marketProbability)}
      </span>
    </article>
  );
}
