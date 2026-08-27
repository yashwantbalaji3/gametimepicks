/**
 * AwaitingSettlementTable — shows the projection-loaded slate that will
 * be graded once final box scores land.
 *
 * Source of truth: the existing board JSON (already public). For each
 * game in the slate we render a sportsbook-style player-row preview
 * with line, projection, edge, confidence and a "pending" result chip.
 * Nothing here is fabricated — every value is a real loaded model
 * output. The "result" column will populate after the box-score grading
 * runs (see pipeline/settle_results.py).
 *
 * Filtering rules:
 *   - PTS / REB / AST only (the supported settlement markets)
 *   - one row per (player, market) — best edge wins
 *   - skip "No Play" / "Pass" sides (settlement excludes them too)
 *   - leans sorted: confidence (High → Medium → Low) then |edge| desc
 */
import type { PropLean, ScheduleGame } from "@/lib/types";
import { getPlayoffContext } from "./playoff-context";
import { confidenceLabel } from "@/lib/confidence-labels";
import PlayerAvatar from "@/components/ui/player-avatar";

interface Props {
  /** Date label, e.g. "2026-05-15". */
  date: string;
  games: ScheduleGame[];
  /** All loaded model leans for this date (from board.leans). */
  leans: PropLean[];
}

const SUPPORTED_MARKETS = new Set(["PTS", "REB", "AST"]);
const PICK_SIDES = new Set(["Over", "Under"]);
const CONF_RANK: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  insufficient_data: 3,
  no_play: 4,
};

interface PreviewRow {
  playerId?: number;
  playerName: string;
  team: string;
  opponent: string;
  homeAway: string;
  gameId: string;
  market: string;
  side: string;
  line: number;
  projection: number | null;
  edgePct: number | null;
  confidence: string;
  anomaly: boolean;
}

function pickRows(leans: PropLean[]): PreviewRow[] {
  // (playerId|name + market) → best by |edge|
  const best = new Map<string, PreviewRow>();
  for (const l of leans) {
    const market = l.market;
    const side = l.lean;
    if (!market || !SUPPORTED_MARKETS.has(market)) continue;
    if (!side || !PICK_SIDES.has(side)) continue;
    if (typeof l.line !== "number" || !Number.isFinite(l.line)) continue;
    const key = `${l.playerId ?? l.playerName ?? "?"}|${market}`;
    const row: PreviewRow = {
      playerId: l.playerId ?? undefined,
      playerName: l.playerName ?? "",
      team: l.team ?? "",
      opponent: l.opponent ?? "",
      homeAway: l.homeAway ?? "",
      gameId: l.gameId ?? "",
      market,
      side,
      line: l.line as number,
      projection:
        typeof l.projection === "number" && Number.isFinite(l.projection)
          ? (l.projection as number)
          : null,
      edgePct:
        typeof l.edgePct === "number" && Number.isFinite(l.edgePct)
          ? (l.edgePct as number)
          : null,
      confidence: l.confidence ?? "Low",
      anomaly: (l.riskFlags ?? []).includes("suspicious_edge"),
    };
    const existing = best.get(key);
    if (
      !existing ||
      Math.abs(row.edgePct ?? 0) > Math.abs(existing.edgePct ?? 0)
    ) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

function formatStat(n: number | null): string {
  if (n === null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function avatarUrl(playerId?: number): string | null {
  if (!playerId || playerId <= 0) return null;
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
}

export default function AwaitingSettlementTable({
  date,
  games,
  leans,
}: Props) {
  const allRows = pickRows(leans);
  const totalAwaiting = allRows.length;

  // Group by game for the per-game tables. Sort games by tipoff.
  const rowsByGame = new Map<string, PreviewRow[]>();
  for (const r of allRows) {
    if (!rowsByGame.has(r.gameId)) rowsByGame.set(r.gameId, []);
    rowsByGame.get(r.gameId)!.push(r);
  }
  // Sort rows within each game.
  for (const arr of rowsByGame.values()) {
    arr.sort((a, b) => {
      const ra = CONF_RANK[a.confidence] ?? 99;
      const rb = CONF_RANK[b.confidence] ?? 99;
      if (ra !== rb) return ra - rb;
      return Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0);
    });
  }

  // Stable game order: match the supplied `games` list order, then any
  // game IDs that appear in leans but not in games.
  const orderedGameIds: string[] = [];
  const seenGames = new Set<string>();
  for (const g of games) {
    if (g.gameId) {
      orderedGameIds.push(g.gameId);
      seenGames.add(g.gameId);
    }
  }
  for (const gid of rowsByGame.keys()) {
    if (!seenGames.has(gid)) orderedGameIds.push(gid);
  }

  if (totalAwaiting === 0) return null;

  return (
    <section className="mt-10 reveal">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px color-mix(in srgb, var(--vault-accent) 60%, transparent)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Slate awaiting box scores · what will be graded
          </span>
        </div>
        <span
          className="font-mono"
          style={{
            color: "var(--vault-text-faint)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {date} · {totalAwaiting} pending props
        </span>
      </div>

      <div className="space-y-6">
        {orderedGameIds.map((gid) => {
          const game = games.find((g) => g.gameId === gid);
          const rows = rowsByGame.get(gid) ?? [];
          if (rows.length === 0) return null;
          const ctx = getPlayoffContext(
            gid,
            game?.awayTeamAbbr,
            game?.homeTeamAbbr,
          );
          const matchup =
            game && game.awayTeamAbbr && game.homeTeamAbbr
              ? `${game.awayTeamAbbr} @ ${game.homeTeamAbbr}`
              : rows[0]?.team && rows[0]?.opponent
                ? rows[0].homeAway === "Home"
                  ? `${rows[0].opponent} @ ${rows[0].team}`
                  : `${rows[0].team} @ ${rows[0].opponent}`
                : "Game";
          return (
            <div key={gid} className="gtp-awaiting-game">
              <header className="gtp-awaiting-game-header">
                <div className="flex items-center gap-2 flex-wrap">
                  {ctx.isPlayoffs && ctx.roundLabel && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--vault-gold)",
                      }}
                    >
                      {ctx.roundLabel}
                    </span>
                  )}
                  {ctx.gameLabel && (
                    <span className="gtp-game-chip gtp-game-chip-strong">
                      {ctx.gameLabel}
                    </span>
                  )}
                  <span
                    className="font-display font-semibold tracking-tight"
                    style={{
                      color: "var(--vault-text)",
                      fontSize: 18,
                      lineHeight: 1.15,
                    }}
                  >
                    {matchup}
                  </span>
                  {game?.tipoff && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 11,
                        color: "var(--vault-gold-bright)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {game.tipoff}
                    </span>
                  )}
                </div>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--vault-text-faint)",
                  }}
                >
                  {rows.length} loaded leans
                </span>
              </header>

              {/* Header row */}
              <div className="gtp-awaiting-table">
                <div className="gtp-awaiting-row gtp-awaiting-row-head">
                  <span className="col-player">Player</span>
                  <span className="col-market">Market</span>
                  <span className="col-line">Line</span>
                  <span className="col-proj">Projection</span>
                  <span className="col-edge">Edge</span>
                  <span className="col-conf">Conf</span>
                  <span className="col-result">Result</span>
                </div>
                {rows.map((r, i) => {
                  const photo = avatarUrl(r.playerId);
                  return (
                    <div
                      key={`${r.playerId ?? r.playerName}-${r.market}-${i}`}
                      className="gtp-awaiting-row"
                    >
                      <span className="col-player">
                        <span className="gtp-awaiting-avatar">
                          {photo ? (
                            <PlayerAvatar name={r.playerName} photo={photo} size={28} />
                          ) : (
                            <span
                              aria-hidden
                              className="gtp-awaiting-avatar-fallback"
                            >
                              {r.playerName
                                .split(/\s+/)
                                .map((p) => p[0])
                                .slice(0, 2)
                                .join("")
                                .toUpperCase() || "?"}
                            </span>
                          )}
                        </span>
                        <span className="gtp-awaiting-player-meta">
                          <span className="gtp-awaiting-player-name">
                            {r.playerName}
                          </span>
                          <span className="gtp-awaiting-player-team">
                            {r.team} {r.homeAway === "Home" ? "vs" : "at"}{" "}
                            {r.opponent}
                          </span>
                        </span>
                      </span>
                      <span className="col-market">
                        <span className="gtp-awaiting-market-pill">
                          {r.market}
                        </span>
                      </span>
                      <span className="col-line">
                        <span className="gtp-awaiting-side">{r.side}</span>{" "}
                        <span className="gtp-awaiting-line">
                          {formatStat(r.line)}
                        </span>
                      </span>
                      <span className="col-proj">
                        {formatStat(r.projection)}
                      </span>
                      <span
                        className="col-edge"
                        data-tone={r.anomaly ? "warn" : "gold"}
                      >
                        {r.edgePct === null
                          ? "—"
                          : `${r.edgePct > 0 ? "+" : ""}${r.edgePct.toFixed(1)}%`}
                      </span>
                      <span className="col-conf">
                        <span
                          className="gtp-awaiting-conf-pill"
                          data-tone={
                            r.confidence === "High"
                              ? "high"
                              : r.confidence === "Medium"
                                ? "med"
                                : "low"
                          }
                        >
                          {confidenceLabel(r.confidence)}
                        </span>
                      </span>
                      <span className="col-result">
                        <span className="gtp-awaiting-result-pill">
                          <span
                            aria-hidden
                            className="gtp-awaiting-result-dot"
                          />
                          awaits box score
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p
        className="mt-5 text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Result column populates after the games finalize and the model is
        graded against verified box scores. Over wins when actual {">"} line;
        Under wins when actual {"<"} line; equal is a push. No Play leans
        are tracked separately and excluded from the hit-rate denominator.
      </p>
    </section>
  );
}
