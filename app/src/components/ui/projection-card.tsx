/** ProjectionCard — shared model-projection card (model vs market, edge, status).
 *  `hideModel` (used by /ufc while the UFC model is unvalidated) suppresses the model probability + edge
 *  and shows the MARKET-IMPLIED read only — no model number, no edge/gap language leaks. */
import type { PublicProjection } from "@/lib/normalize";
import { formatAmerican } from "@/lib/odds-math";
import StatusChip from "@/components/ui/status-chip";

function pct(p?: number | null) { return p == null ? "—" : `${Math.round(p * 100)}%`; }

export default function ProjectionCard({ p, hideModel = false }: { p: PublicProjection; hideModel?: boolean }) {
  const edgePos = (p.edgePct ?? 0) >= 0;
  return (
    <article className="rounded-[8px] px-3.5 py-3 flex flex-col gap-2"
             style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="font-mono uppercase tracking-[0.1em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {p.sportLabel} · {p.marketLabel}
        </span>
        <StatusChip label={hideModel ? "Market-implied" : p.parlayEligible ? "Card eligible" : "Projection view"} />
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {p.player?.photo ? (
          // Real league-CDN headshot (see lib/player-headshots.ts) — never a faked image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.player.photo} alt={p.player.name} width={30} height={30} loading="lazy" className="rounded-full shrink-0" style={{ objectFit: "cover", border: "1px solid var(--vault-rule)" }} />
        ) : null}
        <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>{p.gameLabel}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          {p.pickLabel} · {formatAmerican(p.americanOdds ?? null)}
        </span>
        {hideModel ? (
          <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pct(p.marketProbability)} market</span>
        ) : (
          <span className="font-mono tabular" style={{ color: edgePos ? "var(--vault-success)" : "var(--vault-text-faint)", fontSize: 11, fontWeight: 600 }}>
            {edgePos ? "+" : ""}{(p.edgePct ?? 0).toFixed(1)}%
          </span>
        )}
      </div>
      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
        {hideModel ? `Market-implied · de-vigged ${pct(p.marketProbability)}` : `Model ${pct(p.modelProbability)} · Market ${pct(p.marketProbability)}`}
      </span>
    </article>
  );
}
