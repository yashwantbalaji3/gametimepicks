/**
 * PlayerPropGroup — collapses a single player's many market rows into ONE expandable
 * card, so the props view reads as "players, each with their markets" instead of a flat
 * wall of rows. The header carries the player's identity (PlayerAvatar), team, market
 * count, and their single strongest model edge; expanding reveals each market as the
 * normal PlayerPropCard (line, model-vs-market, last-5 evidence drawer).
 *
 * Honesty: no new data — purely a regrouping of the same real projections. The edge chip
 * is the max of the player's real per-market edges; nothing is invented.
 */
import type { PublicProjection } from "@/lib/normalize";
import PlayerAvatar from "@/components/ui/player-avatar";
import PlayerPropCard from "@/components/ui/player-prop-card";

/** Group the projections by player, preserving best-edge-first ordering. */
export function groupByPlayer(props: PublicProjection[]): Array<{ name: string; team?: string; photo?: string | null; bestEdge: number; items: PublicProjection[] }> {
  const map = new Map<string, { name: string; team?: string; photo?: string | null; bestEdge: number; items: PublicProjection[] }>();
  for (const p of props) {
    const name = p.player?.name;
    if (!name) continue;
    const key = `${name}__${p.player?.team ?? ""}`;
    const edge = p.edgePct ?? -99;
    const g = map.get(key);
    if (g) {
      g.items.push(p);
      if (edge > g.bestEdge) g.bestEdge = edge;
    } else {
      map.set(key, { name, team: p.player?.team ?? undefined, photo: p.player?.photo ?? null, bestEdge: edge, items: [p] });
    }
  }
  // Each player's markets strongest-edge first; players strongest-best-edge first.
  const groups = [...map.values()];
  for (const g of groups) g.items.sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99));
  groups.sort((a, b) => b.bestEdge - a.bestEdge);
  return groups;
}

export default function PlayerPropGroup({ group, defaultOpen }: { group: ReturnType<typeof groupByPlayer>[number]; defaultOpen?: boolean }) {
  const n = group.items.length;
  const edge = group.bestEdge;
  return (
    <details className="gtp-card-hover rounded-[9px] min-w-0 group" open={defaultOpen} style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
      <summary className="px-3 py-2.5 flex items-center gap-2.5 min-w-0 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <PlayerAvatar name={group.name} photo={group.photo} size={32} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{group.name}</span>
          <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
            {group.team ? `${group.team} · ` : ""}{n} market{n === 1 ? "" : "s"}
          </span>
        </div>
        {edge > -99 ? (
          <span
            className="gtp-chip-heat shrink-0 rounded-full px-2 py-0.5 font-mono"
            style={{ fontSize: 10, fontWeight: 700 }}
          >
            {edge >= 0 ? "+" : ""}{edge.toFixed(1)}% best edge
          </span>
        ) : null}
        <span aria-hidden className="shrink-0 transition-transform group-open:rotate-180" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>▾</span>
      </summary>
      <div className="px-2 pb-2 flex flex-col gap-1.5" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        <div className="pt-2 flex flex-col gap-1.5">
          {group.items.map((p) => <PlayerPropCard key={p.id} p={p} />)}
        </div>
      </div>
    </details>
  );
}
