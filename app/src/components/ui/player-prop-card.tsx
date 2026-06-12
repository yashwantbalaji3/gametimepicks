/** PlayerPropCard — shared player-prop card (photo, line, model vs market, lineup status).
 *
 *  Expandable details drawer (<details>, server-safe — no client JS): tapping the row
 *  reveals the player's REAL last-5 game log for this market when the artifact carries
 *  one, plus the model read. When no log exists the drawer says so honestly — recent
 *  stats are never fabricated. */
import type { PublicProjection } from "@/lib/normalize";
import { formatAmerican } from "@/lib/odds-math";
import { friendlyStatusLabel } from "@/lib/public-visibility";
import StatusChip from "@/components/ui/status-chip";
import PlayerAvatar from "@/components/ui/player-avatar";

function pct(p?: number | null) { return p == null ? "—" : `${Math.round(p * 100)}%`; }

/** Did this game's value land on the picked side of the line? (Over/Under sides only.) */
function hitSide(value: number, line: number | string | null | undefined, pickLabel: string): boolean | null {
  const ln = typeof line === "number" ? line : Number(line);
  if (!Number.isFinite(ln)) return null;
  const lab = pickLabel.toLowerCase();
  if (lab.includes("over")) return value > ln;
  if (lab.includes("under")) return value < ln;
  return null;
}

export default function PlayerPropCard({ p }: { p: PublicProjection }) {
  const pl = p.player;
  if (!pl) return null;
  const recent = p.recentGames ?? [];
  return (
    <details className="rounded-[7px] min-w-0 group" style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}>
      <summary className="px-3 py-2.5 flex items-center gap-2.5 min-w-0 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <PlayerAvatar name={pl.name} photo={pl.photo} size={34} />
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
            <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>mdl {pct(p.modelProbability)} · mkt {pct(p.marketProbability)}</span>
          </div>
        </div>
        {p.parlayEligible
          ? <StatusChip label="Card eligible" />
          : <StatusChip label={friendlyStatusLabel(p.lineupStatus)} />}
        <span aria-hidden className="shrink-0 transition-transform group-open:rotate-180" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>▾</span>
      </summary>

      {/* Details drawer — real evidence only, never fabricated. */}
      <div className="px-3 pb-3 pt-2 flex flex-col gap-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>
          {p.marketLabel}{p.line != null ? ` · line ${p.line}` : ""}{p.projectionValue != null ? ` · model projects ${p.projectionValue}` : ""} · edge {(p.edgePct ?? 0) >= 0 ? "+" : ""}{(p.edgePct ?? 0).toFixed(1)}%
        </span>
        {recent.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-mute)" }}>
              Last {recent.length} games — {p.marketLabel}
            </span>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${recent.length}, minmax(0, 1fr))` }}>
              {recent.map((g, i) => {
                const hit = hitSide(g.value, p.line, p.pickLabel);
                return (
                  <div key={i} className="rounded-[6px] px-1.5 py-1.5 text-center" style={{ background: "rgba(26, 16, 11,0.5)", border: `1px solid ${hit == null ? "var(--vault-rule)" : hit ? "rgba(110,231,168,0.4)" : "rgba(240,138,138,0.35)"}` }}>
                    <div className="font-display tabular" style={{ color: hit == null ? "var(--vault-text)" : hit ? "#6EE7A8" : "#F08A8A", fontSize: 14, fontWeight: 700 }}>{g.value}</div>
                    <div className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{g.isHome ? "vs" : "@"}{g.opponent}</div>
                    <div className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{(g.date ?? "").slice(5)}</div>
                  </div>
                );
              })}
            </div>
            <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
              Green / red = landed on / against the picked side. Official box-score values.
            </span>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
            Recent-game log unavailable for this market — only the model/market read above is shown. Stats are never invented.
          </span>
        )}
        {(() => {
          // The page-level banner already explains lineup timing once — repeating the
          // artifact's "pre-lineup" caveat on all 200+ cards was the noise users hated.
          const caveat = (p.caveats ?? []).find((c) => !/pre-?lineup/i.test(c));
          return caveat ? (
            <span className="text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>· {caveat}</span>
          ) : null;
        })()}
      </div>
    </details>
  );
}
