/**
 * SettledPlayerAccordion — mobile-first player-by-player audit card
 * used on `/results/nba` and `/results/mlb`.
 *
 * Header (always visible):
 *   - PlayerAvatar + TeamLogo + player name + team
 *   - Compact result chip strip: ✅ wins · ❌ losses · — pending
 *   - Hit-rate chip when decisive > 0 (faint when small sample)
 *   - Chevron
 *
 * Body (revealed on click):
 *   - Per-market sections (PTS → REB → AST → ...)
 *   - One row per settled lean: ✅/❌/➖/— icon · market · side · line ·
 *     projection · actual · edge · confidence · book/odds
 *
 * Honesty:
 *   - Pushes excluded from hit rate (no fake denominators).
 *   - Pending / stats_unavailable rows render with "—" icon, never as
 *     a loss.
 *   - Small-sample bucket (decisive < 5) renders the rate in mute
 *     so the reader knows it isn't significant yet.
 *   - No banned betting copy.
 */
import type { ReactNode } from "react";
import type { SettledLean } from "@/lib/settlement-data";
import { getResultIcon, normalizeResult } from "@/lib/result-icons";
import {
  groupPlayerRowsByMarket,
  type PlayerResultSummary,
} from "@/lib/settled-player-summary";
import PlayerAvatar from "./player-avatar";
import TeamLogo from "./team-logo";

interface Props {
  player: PlayerResultSummary;
  sport: "nba" | "mlb";
  /** Open by default — useful for single-player pages or top picks. */
  defaultOpen?: boolean;
  /** Optional matchup label (e.g. "TOR @ DET") for the sub-line. */
  matchupLabel?: string | null;
}

function pct(p: number | null): string {
  if (p === null) return "—";
  return `${(p * 100).toFixed(0)}%`;
}

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n as number))
    return "—";
  return (n as number).toFixed(decimals);
}

function fmtOdds(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n as number)) return "";
  const v = Math.round(n as number);
  return v > 0 ? `+${v}` : `${v}`;
}

export default function SettledPlayerAccordion({
  player,
  sport,
  defaultOpen = false,
  matchupLabel,
}: Props) {
  const smallSample = player.decisive > 0 && player.decisive < 5;
  return (
    <details
      className="group rounded-[6px]"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
      }}
      open={defaultOpen}
    >
      <summary
        className="list-none cursor-pointer flex items-center gap-3 px-3 sm:px-4 py-2.5"
        style={{ borderRadius: 6 }}
        aria-label={`${player.player} audit — ${player.wins} hit, ${player.losses} miss, ${player.pending} pending`}
      >
        <PlayerAvatar
          playerId={player.playerId}
          playerName={player.player}
          team={player.team ?? undefined}
          sport={sport}
          size="sm"
          flat
        />
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="font-display tracking-tight truncate"
              style={{
                color: "var(--vault-text)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {player.player}
            </span>
          </div>
          <div
            className="font-mono flex items-center gap-1.5 min-w-0"
            style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
          >
            {player.team ? (
              <TeamLogo team={player.team} sport={sport} size="sm" />
            ) : null}
            <span className="truncate">
              {player.team ?? "—"}
              {matchupLabel ? ` · ${matchupLabel}` : ""}
            </span>
          </div>
        </div>
        <ResultChipStrip
          wins={player.wins}
          losses={player.losses}
          pending={player.pending}
          pushes={player.pushes}
        />
        <span
          className="font-display font-semibold tabular shrink-0"
          style={{
            color: smallSample
              ? "var(--vault-text-mute)"
              : player.hitRate === null
                ? "var(--vault-text-faint)"
                : "var(--vault-gold-bright)",
            fontSize: 13,
            minWidth: 42,
            textAlign: "right",
          }}
          aria-label={
            player.hitRate === null
              ? "No decisive picks yet"
              : `Hit rate ${pct(player.hitRate)}`
          }
        >
          {pct(player.hitRate)}
        </span>
        <span
          aria-hidden
          className="font-mono transition-transform group-open:rotate-180"
          style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
        >
          ▾
        </span>
      </summary>
      <PlayerAuditBody rows={player.rows} />
    </details>
  );
}

function ResultChipStrip({
  wins,
  losses,
  pending,
  pushes,
}: {
  wins: number;
  losses: number;
  pending: number;
  pushes: number;
}) {
  return (
    <div
      className="flex items-center gap-1 font-mono shrink-0"
      style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
    >
      <Chip
        icon={getResultIcon("win").icon}
        count={wins}
        tone={getResultIcon("win").tone}
        ariaLabel={`${wins} hit`}
      />
      <Chip
        icon={getResultIcon("loss").icon}
        count={losses}
        tone={getResultIcon("loss").tone}
        ariaLabel={`${losses} miss`}
      />
      {pushes > 0 && (
        <Chip
          icon={getResultIcon("push").icon}
          count={pushes}
          tone={getResultIcon("push").tone}
          ariaLabel={`${pushes} push`}
        />
      )}
      {pending > 0 && (
        <Chip
          icon={getResultIcon("pending").icon}
          count={pending}
          tone={getResultIcon("pending").tone}
          ariaLabel={`${pending} pending`}
        />
      )}
    </div>
  );
}

function Chip({
  icon,
  count,
  tone,
  ariaLabel,
}: {
  icon: string;
  count: number;
  tone: string;
  ariaLabel: string;
}) {
  return (
    <span
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[3px]"
      style={{
        background: "rgba(7,11,26,0.45)",
        border: "1px solid var(--vault-rule)",
        color: tone,
        minWidth: 32,
      }}
    >
      <span aria-hidden style={{ fontSize: 10 }}>
        {icon}
      </span>
      <span style={{ color: "var(--vault-text)", fontSize: 11 }}>{count}</span>
    </span>
  );
}

function PlayerAuditBody({ rows }: { rows: SettledLean[] }) {
  if (rows.length === 0) {
    return (
      <p
        className="px-4 py-3 text-[12px]"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        No graded rows yet.
      </p>
    );
  }
  const groups = groupPlayerRowsByMarket(rows);
  return (
    <div
      className="px-3 sm:px-4 py-3 flex flex-col gap-3"
      style={{ borderTop: "1px solid var(--vault-rule)" }}
    >
      {groups.map((g) => (
        <MarketGroup key={g.market} market={g.market} rows={g.rows} />
      ))}
    </div>
  );
}

function MarketGroup({ market, rows }: { market: string; rows: SettledLean[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
        >
          {market}
        </span>
        <span
          aria-hidden
          className="flex-1 h-px"
          style={{ background: "var(--vault-rule)" }}
        />
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <li key={`${r.gameId ?? "_"}-${market}-${i}`}>
            <PickRow row={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PickRow({ row }: { row: SettledLean }) {
  const meta = getResultIcon(row.result);
  const kind = normalizeResult(row.result);
  const odds = row.side === "Over" ? row.oddsOver : row.oddsUnder;
  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded-[4px]"
      style={{
        background: kind === "pending" ? "rgba(7,11,26,0.30)" : "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-rule)",
        opacity: kind === "pending" ? 0.85 : 1,
      }}
    >
      <span
        aria-label={meta.ariaLabel}
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          color: meta.tone,
          background: "rgba(7,11,26,0.45)",
          border: `1px solid ${meta.tone}`,
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        {meta.icon}
      </span>
      <div className="min-w-0">
        <div
          className="font-mono truncate"
          style={{
            color: "var(--vault-text)",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ color: "var(--vault-gold-bright)" }}>{row.side ?? "—"}</span>{" "}
          {fmt(row.line, 1)}
          {row.confidence ? (
            <span
              style={{
                marginLeft: 6,
                color: "var(--vault-text-mute)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              · {row.confidence}
            </span>
          ) : null}
        </div>
        <div
          className="font-mono truncate"
          style={{
            color: "var(--vault-text-mute)",
            fontSize: 10,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Proj {fmt(row.modelProjection ?? null, 2)} · Actual{" "}
          {fmt(typeof row.finalStat === "number" ? row.finalStat : null, 0)}
          {row.edgePct !== null && row.edgePct !== undefined ? (
            <> · Edge {row.edgePct >= 0 ? "+" : ""}{(row.edgePct as number).toFixed(1)}%</>
          ) : null}
          {row.bookmaker ? (
            <span style={{ color: "var(--vault-text-faint)" }}>
              {" "}
              · {fmtOdds(odds)} {row.bookmaker}
            </span>
          ) : null}
        </div>
      </div>
      <span
        className="font-display font-semibold tabular hidden sm:inline-block shrink-0 text-right"
        style={{
          color: meta.tone,
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {meta.label}
      </span>
      <span
        className="font-mono shrink-0 hidden sm:inline-block text-right"
        style={{
          color: "var(--vault-text-faint)",
          fontSize: 10,
        }}
      >
        {row.gameId ? row.gameId.slice(0, 6) : ""}
      </span>
    </div>
  );
}

// Re-export ReactNode unused noop so future inline JSX doesn't trip the
// unused import lint if we extend the component.
export type { ReactNode };
