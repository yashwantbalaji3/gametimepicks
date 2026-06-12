/** PlayerPropCard — shared player-prop card (photo, line, model vs market, lineup status). */
import type { PublicProjection } from "@/lib/normalize";
import { formatAmerican } from "@/lib/odds-math";
import { friendlyStatusLabel } from "@/lib/public-visibility";
import StatusChip from "@/components/ui/status-chip";

function pct(p?: number | null) { return p == null ? "—" : `${Math.round(p * 100)}%`; }
function initials(n: string) { return n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }

export default function PlayerPropCard({ p }: { p: PublicProjection }) {
  const pl = p.player;
  if (!pl) return null;
  return (
    <div className="rounded-[7px] px-3 py-2.5 flex items-center gap-2.5 min-w-0"
         style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}>
      {pl.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pl.photo} alt={pl.name} width={34} height={34} loading="lazy" className="rounded-full shrink-0" style={{ objectFit: "cover", border: "1px solid var(--vault-rule)" }} />
      ) : (
        <div className="rounded-full shrink-0 flex items-center justify-center"
             style={{ width: 34, height: 34, background: "rgba(240,199,94,0.12)", border: "1px solid var(--vault-rule)", color: "var(--vault-gold-bright)", fontSize: 11, fontWeight: 700 }}>
          {initials(pl.name)}
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{pl.name}</span>
          <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{formatAmerican(p.americanOdds ?? null)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
            {p.pickLabel} · {pl.team}
            {p.bookmaker ? ` · ${p.bookmaker}` : ""}
          </span>
          <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>mdl {pct(p.modelProbability)} · mkt {pct(p.marketProbability)}</span>
        </div>
      </div>
      {p.parlayEligible
        ? <StatusChip label="Card eligible" />
        : <StatusChip label={friendlyStatusLabel(p.lineupStatus)} />}
    </div>
  );
}
