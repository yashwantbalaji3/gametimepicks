/**
 * PerGameScorecard — sportsbook-style scoreboard summary for each
 * graded game. Reads only audited settled rows; never fabricates.
 *
 * For each game:
 *   - Playoff context (round + game number)
 *   - Friendly matchup label
 *   - Decisive / W-L / Hit rate
 *   - Best call (highest-edge win) and worst miss (largest |proj err|)
 */
import type { SettledLean } from "@/lib/settlement-data";
import type { ScheduleGame } from "@/lib/types";
import { getPlayoffContext } from "./playoff-context";

export interface PerGameRow {
  gameId: string;
  matchup: string;
  tipoff?: string;
  decisive: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  bestCall?: SettledLean | null;
  worstMiss?: SettledLean | null;
}

function groupSettledByGame(rows: SettledLean[]): PerGameRow[] {
  const buckets = new Map<string, SettledLean[]>();
  for (const r of rows) {
    const gid = r.gameId ?? "";
    if (!gid) continue;
    if (!buckets.has(gid)) buckets.set(gid, []);
    buckets.get(gid)!.push(r);
  }
  const out: PerGameRow[] = [];
  for (const [gid, arr] of buckets.entries()) {
    const wins = arr.filter((r) => r.result === "win").length;
    const losses = arr.filter((r) => r.result === "loss").length;
    const pushes = arr.filter((r) => r.result === "push").length;
    const decisive = wins + losses;
    const hitRate = decisive > 0 ? wins / decisive : null;

    // Highest-edge winning row in this game
    let bestCall: SettledLean | null = null;
    for (const r of arr) {
      if (r.result !== "win") continue;
      const e = Math.abs(r.edgePct ?? 0);
      if (!bestCall || e > Math.abs(bestCall.edgePct ?? 0)) bestCall = r;
    }

    // Largest |projection error| (any result, including losses)
    let worstMiss: SettledLean | null = null;
    for (const r of arr) {
      const e = r.absoluteProjectionError;
      if (typeof e !== "number") continue;
      if (
        !worstMiss ||
        (worstMiss.absoluteProjectionError ?? 0) < e
      ) {
        worstMiss = r;
      }
    }

    const sample = arr[0];
    const matchup =
      sample?.team && sample?.opponent
        ? `${sample.team} vs ${sample.opponent}` // perspective-free fallback
        : "Game";
    out.push({
      gameId: gid,
      matchup,
      decisive,
      wins,
      losses,
      pushes,
      hitRate,
      bestCall,
      worstMiss,
    });
  }
  // Sort by total picks desc
  out.sort((a, b) => b.decisive - a.decisive);
  return out;
}

interface Props {
  rows: SettledLean[];
  /** Optional schedule games for friendly matchup + tipoff labels. */
  games?: ScheduleGame[];
}

function formatStat(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function PerGameScorecard({ rows, games }: Props) {
  const grouped = groupSettledByGame(rows);
  if (grouped.length === 0) return null;

  // Index supplied games for the friendly matchup + tipoff
  const gameMeta = new Map<string, ScheduleGame>();
  for (const g of games ?? []) {
    if (g.gameId) gameMeta.set(g.gameId, g);
  }

  return (
    <section className="mt-10 reveal" aria-label="Per-game scorecard">
      <div className="flex items-center gap-2 mb-4">
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
          Per-game scorecard · graded vs final box score
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {grouped.map((g) => {
          const meta = gameMeta.get(g.gameId);
          const ctx = getPlayoffContext(
            g.gameId,
            meta?.awayTeamAbbr,
            meta?.homeTeamAbbr,
          );
          const matchup =
            meta && meta.awayTeamAbbr && meta.homeTeamAbbr
              ? `${meta.awayTeamAbbr} @ ${meta.homeTeamAbbr}`
              : g.matchup;
          return (
            <div key={g.gameId} className="gtp-game-scorecard">
              <header className="mb-3">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {ctx.isPlayoffs && ctx.roundLabel && (
                    <span
                      className="font-mono uppercase tracking-[0.16em]"
                      style={{
                        fontSize: 10,
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
                </div>
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h3
                    className="font-display font-semibold tracking-tight"
                    style={{
                      color: "var(--vault-text)",
                      fontSize: 22,
                      lineHeight: 1.1,
                    }}
                  >
                    {matchup}
                  </h3>
                  {meta?.tipoff && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 11,
                        color: "var(--vault-gold-bright)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {meta.tipoff}
                    </span>
                  )}
                </div>
              </header>

              <div className="gtp-scorecard-stats">
                <Stat
                  label="hit rate"
                  value={
                    g.hitRate !== null
                      ? `${(g.hitRate * 100).toFixed(1)}%`
                      : "—"
                  }
                  accent="gold"
                />
                <Stat
                  label="decisive"
                  value={String(g.decisive)}
                  sub={`${g.wins}–${g.losses}${g.pushes ? `–${g.pushes}p` : ""}`}
                />
                <Stat
                  label="wins"
                  value={String(g.wins)}
                  accent="success"
                />
                <Stat
                  label="losses"
                  value={String(g.losses)}
                  accent="danger"
                />
              </div>

              {g.bestCall && (
                <div
                  className="mt-3 gtp-scorecard-row"
                  data-tone="win"
                >
                  <span className="gtp-scorecard-row-label">best call</span>
                  <span className="gtp-scorecard-row-body">
                    <strong style={{ color: "var(--vault-text)" }}>
                      {g.bestCall.playerName}
                    </strong>{" "}
                    {g.bestCall.market} {g.bestCall.side}{" "}
                    {formatStat(g.bestCall.line)} →{" "}
                    <span style={{ color: "var(--vault-gold-bright)" }}>
                      actual {formatStat(g.bestCall.finalStat)}
                    </span>
                  </span>
                  {typeof g.bestCall.edgePct === "number" && (
                    <span
                      className="gtp-scorecard-row-tag"
                      style={{ color: "var(--vault-gold-bright)" }}
                    >
                      +{g.bestCall.edgePct.toFixed(1)}% edge
                    </span>
                  )}
                </div>
              )}
              {g.worstMiss && (
                <div
                  className="mt-2 gtp-scorecard-row"
                  data-tone="miss"
                >
                  <span className="gtp-scorecard-row-label">biggest miss</span>
                  <span className="gtp-scorecard-row-body">
                    <strong style={{ color: "var(--vault-text)" }}>
                      {g.worstMiss.playerName}
                    </strong>{" "}
                    {g.worstMiss.market} {g.worstMiss.side}{" "}
                    {formatStat(g.worstMiss.line)} · proj{" "}
                    {formatStat(g.worstMiss.modelProjection)} → actual{" "}
                    {formatStat(g.worstMiss.finalStat)}
                  </span>
                  {typeof g.worstMiss.absoluteProjectionError === "number" && (
                    <span
                      className="gtp-scorecard-row-tag"
                      style={{ color: "var(--vault-danger)" }}
                    >
                      ±{formatStat(g.worstMiss.absoluteProjectionError)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "gold" | "success" | "danger";
}) {
  const color =
    accent === "gold"
      ? "var(--vault-gold-bright)"
      : accent === "success"
        ? "var(--vault-success)"
        : accent === "danger"
          ? "var(--vault-danger)"
          : "var(--vault-text)";
  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--vault-text-faint)",
        }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 font-display font-semibold tabular tracking-tight"
        style={{ fontSize: 22, color, lineHeight: 1.05 }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="font-mono"
          style={{
            fontSize: 10,
            color: "var(--vault-text-faint)",
            letterSpacing: "0.04em",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
