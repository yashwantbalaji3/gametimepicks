/**
 * PlayerResultsCards — group settled NBA rows by player and render one
 * card per player with PTS / REB / AST rows showing line, projection,
 * actual, and hit/miss color.
 *
 * Why a player-centric view: friend feedback called the per-game table
 * "messy" because identical (player, market) rows appear once per
 * bookmaker (DraftKings + FanDuel), making the page scan like
 * duplicated entries. This component de-duplicates by (player, market)
 * — picking the row with the largest |edge| as the representative
 * record. The existing per-game table still renders below for users
 * who want every bookmaker row.
 *
 * Honest:
 *   - Wins/losses/pushes here equal a player's de-duplicated rows
 *     (one per market per side). The page-wide totals still come from
 *     every bookmaker row so the global hit rate isn't double-counted
 *     against this view.
 *   - Color: green for hit, amber for miss, grey for push.
 *   - No fabricated stats. `actual` is the final box-score number;
 *     when ESPN/nba_api couldn't resolve a player we omit that row.
 */
import type { SettledLean } from "@/lib/settlement-data";
import { PlayerPortrait, TeamLogo } from "@/components/entity";

interface Props {
  rows: SettledLean[];
}

type Market = "PTS" | "REB" | "AST";
const MARKET_ORDER: Market[] = ["PTS", "REB", "AST"];

interface PlayerGroup {
  playerName: string;
  playerId: number | null;
  team: string | null;
  opponent: string | null;
  matchup: string | null;
  rowsByMarket: Map<Market, SettledLean>;
  wins: number;
  losses: number;
  pushes: number;
}

function isMarket(m: string | null | undefined): m is Market {
  return m === "PTS" || m === "REB" || m === "AST";
}

function buildPlayerGroups(rows: SettledLean[]): PlayerGroup[] {
  const groups = new Map<string, PlayerGroup>();
  for (const r of rows) {
    const name = r.playerName ?? "—";
    const market = r.market;
    if (!isMarket(market)) continue;

    let g = groups.get(name);
    if (!g) {
      g = {
        playerName: name,
        playerId:
          typeof r.playerId === "number" && r.playerId > 0
            ? r.playerId
            : null,
        team: r.team ?? null,
        opponent: r.opponent ?? null,
        matchup:
          r.team && r.opponent
            ? `${r.team} @ ${r.opponent}`
            : null,
        rowsByMarket: new Map<Market, SettledLean>(),
        wins: 0,
        losses: 0,
        pushes: 0,
      };
      groups.set(name, g);
    }

    // Pick the row with the largest |edgePct| as the representative for
    // this (player, market) pair. That naturally de-dupes the DK + FD
    // duplicate rows while preserving the most "interesting" call.
    const existing = g.rowsByMarket.get(market);
    const newEdge = Math.abs(r.edgePct ?? 0);
    const oldEdge = Math.abs(existing?.edgePct ?? 0);
    if (!existing || newEdge > oldEdge) {
      g.rowsByMarket.set(market, r);
    }
  }

  // Compute per-player record from the de-duplicated representative rows.
  for (const g of groups.values()) {
    for (const r of g.rowsByMarket.values()) {
      if (r.result === "win") g.wins++;
      else if (r.result === "loss") g.losses++;
      else if (r.result === "push") g.pushes++;
    }
  }

  // Sort: players with more markets first, then alphabetical.
  return [...groups.values()].sort((a, b) => {
    const aCount = a.rowsByMarket.size;
    const bCount = b.rowsByMarket.size;
    if (aCount !== bCount) return bCount - aCount;
    return a.playerName.localeCompare(b.playerName);
  });
}

export default function PlayerResultsCards({ rows }: Props) {
  const groups = buildPlayerGroups(rows);
  if (groups.length === 0) return null;

  return (
    <section className="mt-10" aria-label="NBA settled players">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
          style={{ color: "var(--vault-gold)" }}
        >
          NBA · per-player results · {groups.length} players
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => (
          <PlayerResultRow key={g.playerName} group={g} />
        ))}
      </div>
      <p
        className="mt-3 text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        One card per player. The per-game breakdown below carries every
        bookmaker row (DraftKings + FanDuel) for full audit detail; this
        view de-duplicates by player+market to make scanning easier.
      </p>
    </section>
  );
}

function PlayerResultRow({ group }: { group: PlayerGroup }) {
  const decisive = group.wins + group.losses;
  return (
    <article
      className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
      style={{
        background:
          "linear-gradient(180deg, rgba(11, 18, 14,0.85) 0%, rgba(11, 18, 14,0.55) 100%)",
        border: "1px solid var(--vault-border)",
      }}
    >
      {/* Player + team header */}
      <header className="flex items-center gap-3">
        {/* Official NBA Stats headshot via PlayerAvatar; auto-fallback
            to the gold-ring initials disc if the CDN 404s. */}
        <PlayerPortrait
          playerId={group.playerId}
          name={group.playerName}
          team={group.team ?? undefined}
          sport="nba"
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: 15,
              lineHeight: 1.15,
            }}
          >
            {group.playerName}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {group.team && <TeamLogo team={group.team} sport="nba" size="sm" />}
            <span
              className="font-mono"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              {group.matchup ?? "—"}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="font-display font-semibold tabular tracking-tight"
            style={{
              color:
                decisive > 0 && group.wins / decisive >= 0.5
                  ? "var(--vault-success)"
                  : "var(--vault-warn)",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            {group.wins}–{group.losses}
            {group.pushes > 0 ? `–${group.pushes}P` : ""}
          </div>
          <div
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            on {decisive || group.rowsByMarket.size}
          </div>
        </div>
      </header>
      {/* Per-market rows */}
      <div
        className="rounded-[5px] overflow-hidden"
        style={{ border: "1px solid var(--vault-rule)" }}
      >
        {MARKET_ORDER.map((m) => {
          const r = group.rowsByMarket.get(m);
          return (
            <MarketRow
              key={m}
              market={m}
              row={r}
            />
          );
        })}
      </div>
    </article>
  );
}

function MarketRow({
  market,
  row,
}: {
  market: Market;
  row: SettledLean | undefined;
}) {
  if (!row) {
    return (
      <div
        className="grid grid-cols-[40px_1fr_1fr_1fr_64px] gap-2 items-center px-2.5 py-1.5"
        style={{
          background: "rgba(11, 18, 14,0.55)",
          borderTop: "1px solid var(--vault-rule)",
          color: "var(--vault-text-faint)",
          fontSize: 11,
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ fontSize: 10 }}
        >
          {market}
        </span>
        <span style={{ gridColumn: "2 / -1" }} className="font-mono">
          No line on this market
        </span>
      </div>
    );
  }
  const result = row.result;
  const accent =
    result === "win"
      ? "var(--vault-success)"
      : result === "loss"
        ? "var(--vault-warn)"
        : result === "push"
          ? "var(--vault-text-mute)"
          : "var(--vault-text-faint)";
  const resultLabel =
    result === "win"
      ? "Hit"
      : result === "loss"
        ? "Miss"
        : result === "push"
          ? "Push"
          : "—";
  return (
    <div
      className="grid grid-cols-[36px_1fr_1fr_1fr_64px] gap-2 items-end px-2.5 py-2"
      style={{
        background: "rgba(11, 18, 14,0.45)",
        borderTop: "1px solid var(--vault-rule)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em] self-center"
        style={{ color: "var(--vault-gold)", fontSize: 10 }}
      >
        {market}
      </span>
      <ValueCell label="Line" value={row.line ?? null} tone="mute" />
      <ValueCell label="Proj." value={row.modelProjection ?? null} tone="mute" />
      <ValueCell
        label="Actual"
        value={typeof row.finalStat === "number" ? row.finalStat : null}
        tone="strong"
      />
      <span
        className="font-mono uppercase tracking-[0.12em] inline-flex items-center justify-end gap-1 self-center"
        style={{ color: accent, fontSize: 10 }}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: accent }}
        />
        {resultLabel}
      </span>
    </div>
  );
}

/**
 * One stacked label / value cell inside a market row. Replaces the
 * cryptic "L · P · A" shorthand with full friendly labels stacked
 * above the number, so casual readers see "Line 8.5" / "Projection
 * 9.3" / "Actual 10.0" at a glance.
 */
function ValueCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "mute" | "strong";
}) {
  return (
    <span className="flex flex-col gap-0.5 min-w-0">
      <span
        className="font-mono uppercase tracking-[0.14em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular"
        style={{
          color:
            tone === "strong"
              ? "var(--vault-text)"
              : "var(--vault-text-mute)",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {value != null ? value.toFixed(1) : "—"}
      </span>
    </span>
  );
}
