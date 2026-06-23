/**
 * ModelPicksTable — the World Cup MODEL-PICK board, grouped by GAME (rows) × MARKET (columns).
 *
 * This is the model-only view: each cell shows the top model-qualified picks for that game+column
 * (team market, total/BTTS, a player-prop market, or the best addable leg), or "No model-qualified
 * pick" when nothing clears the model filter. Up to MAX_PICKS_PER_MARKET picks are surfaced per cell
 * so multiple players per market are visible. Raw sportsbook inventory is NOT shown here — only picks
 * that pass the model gates (odds-backed, has a provider, pre-event, within the leg odds window, clears
 * a model floor) survive into the unified pool the table renders. The `cards` column is always empty
 * (no posted card market for the World Cup).
 *
 * Desktop: a true column grid that scrolls horizontally INSIDE its own container so columns stay
 * readable (no crushed/truncated player names) while the PAGE never overflows. Mobile: per-game cards
 * with markets stacked — no horizontal overflow at 375px. Player names always wrap, never truncate.
 * Pure presentational; all selection logic lives in the loader (buildModelPicksTable).
 */
import PlayerAvatar from "@/components/ui/player-avatar";
import FlagBadge from "@/components/flag-badge";
import OddsPill from "@/components/tickets/odds-pill";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";
import type { ModelPick, ModelPicksTable } from "@/lib/world-cup/model-qualified-picks";

/** Home/away country flags for a "Home vs Away" matchup string (FlagBadge degrades gracefully). */
function MatchupFlags({ matchup }: { matchup: string }) {
  const [home, away] = (matchup ?? "").split(/\s+vs\s+/i).map((s) => s.trim());
  const homeCode = wcTeamCodeFromName(home);
  const awayCode = wcTeamCodeFromName(away);
  if (!homeCode && !awayCode) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {homeCode ? <FlagBadge code={homeCode} size="sm" ariaLabel={home ?? ""} /> : null}
      {awayCode ? <FlagBadge code={awayCode} size="sm" ariaLabel={away ?? ""} /> : null}
    </span>
  );
}

function VolBadge({ pick }: { pick: ModelPick }) {
  const lower = pick.volatility === "lower";
  return (
    <span
      className="rounded-full px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] shrink-0"
      style={{
        fontSize: 8,
        color: lower ? "var(--vault-success)" : "#e7b15a",
        background: lower ? "rgba(110,231,168,0.12)" : "rgba(231,177,90,0.12)",
        border: `1px solid color-mix(in srgb, ${lower ? "var(--vault-success)" : "#e7b15a"} 35%, transparent)`,
      }}
    >
      {lower ? "Addable leg" : "Higher-volatility"}
    </span>
  );
}

function EmptyCell() {
  return (
    <span className="font-mono uppercase tracking-[0.08em]" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>
      No model-qualified pick
    </span>
  );
}

/** The TOP pick — player/selection on their own lines, names wrap (never truncated). */
function PickBody({ pick }: { pick: ModelPick }) {
  // Team/game markets carry no player portrait — show the team's country flag when resolvable.
  const teamCode = pick.player ? null : wcTeamCodeFromName(pick.team ?? pick.selection);
  return (
    <div className="flex flex-col gap-1">
      {pick.player ? (
        <div className="flex items-start gap-2 min-w-0">
          <PlayerAvatar name={pick.player} size={18} />
          <span
            className="font-semibold break-words leading-tight"
            style={{ color: "var(--vault-text)", fontSize: 12 }}
          >
            {pick.player}
          </span>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-start gap-1.5 min-w-0">
          {teamCode ? <span className="mt-0.5 shrink-0"><FlagBadge code={teamCode} size="sm" ariaLabel={pick.team ?? pick.selection} /></span> : null}
          <span className="break-words leading-tight" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pick.selection}</span>
        </span>
        <OddsPill odds={pick.odds} size="sm" tone="gold" className="shrink-0" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono tabular" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {Math.round(pick.modelProbability * 100)}% model-implied
        </span>
        <VolBadge pick={pick} />
      </div>
    </div>
  );
}

/** The 2nd/3rd model-qualified picks for a cell, compact (player · odds), names still wrap. */
function MorePicks({ extra }: { extra: ModelPick[] }) {
  if (extra.length === 0) return null;
  const american = (o: number) => (o > 0 ? `+${o}` : `${o}`);
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 pt-1.5" style={{ borderTop: "1px dashed var(--vault-rule)" }}>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
        +{extra.length} more
      </span>
      {extra.map((p) => (
        <div key={p.id} className="flex items-start justify-between gap-2 min-w-0">
          <span className="break-words leading-tight" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
            {p.player ?? p.selection}
          </span>
          <span className="font-mono tabular shrink-0" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>{american(p.odds)}</span>
        </div>
      ))}
    </div>
  );
}

/** Full per-cell content: top pick + the rest (up to MAX_PICKS_PER_MARKET). */
function CellContent({ picks }: { picks: ModelPick[] }) {
  if (picks.length === 0) return <EmptyCell />;
  return (
    <>
      <PickBody pick={picks[0]} />
      <MorePicks extra={picks.slice(1)} />
    </>
  );
}

/** Mobile: show every model-qualified pick for a market as a stacked, full-name row. */
function MobilePicks({ picks }: { picks: ModelPick[] }) {
  if (picks.length === 0) return <EmptyCell />;
  return (
    <div className="flex flex-col gap-2.5">
      {picks.map((p, i) => (
        <div key={p.id} className={i ? "pt-2.5" : ""} style={i ? { borderTop: "1px dashed var(--vault-rule)" } : undefined}>
          <PickBody pick={p} />
        </div>
      ))}
    </div>
  );
}

export default function ModelPicksTable({ table }: { table: ModelPicksTable }) {
  if (table.rows.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
        No model-qualified picks for this slate yet.
      </p>
    );
  }

  const cols = table.columns;
  // Wide Game column + roomy market columns; the grid scrolls inside its own container.
  const gridTemplate = `190px repeat(${cols.length}, minmax(150px, 1fr))`;

  return (
    <div className="flex flex-col gap-3">
      {/* Honest counts: model-qualified picks vs games covered. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold" style={{ color: "var(--vault-gold-bright)", fontSize: 12.5 }}>
          {table.pickCount} model-qualified {table.pickCount === 1 ? "pick" : "picks"} across {table.rows.length} {table.rows.length === 1 ? "game" : "games"} · model picks only — sportsbook inventory hidden.
        </span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
        Up to 3 model-qualified picks per game and market. Team Pick + Total / BTTS are the high-hit-rate team/game markets (moneyline, double chance, draw-no-bet, totals, BTTS).
      </p>

      {/* DESKTOP: game rows × market columns. Grid scrolls horizontally inside this container so
          columns keep their width and the PAGE never overflows. */}
      <div className="hidden lg:block overflow-x-auto rounded-[12px]" style={{ border: "1px solid var(--vault-rule)" }}>
        <div style={{ minWidth: 190 + cols.length * 150 }}>
          <div className="grid items-stretch" style={{ gridTemplateColumns: gridTemplate, background: "rgba(255,255,255,0.02)" }}>
            <div className="px-3 py-2.5 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Game</div>
            {cols.map((c) => (
              <div key={c.key} className="px-3 py-2.5 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5, borderLeft: "1px solid var(--vault-rule)" }}>
                {c.label}
              </div>
            ))}
          </div>
          {table.rows.map((row, ri) => (
            <div
              key={row.gameId}
              className="grid items-stretch"
              style={{ gridTemplateColumns: gridTemplate, borderTop: "1px solid var(--vault-rule)", background: ri % 2 ? "rgba(255,255,255,0.012)" : "transparent" }}
            >
              <div className="px-3 py-3 flex flex-col gap-0.5">
                <span className="flex items-start gap-1.5 min-w-0">
                  <MatchupFlags matchup={row.matchup} />
                  <span className="font-semibold break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{row.matchup}</span>
                </span>
                <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{row.kickoffEt}</span>
              </div>
              {cols.map((c) => (
                <div key={c.key} className="px-3 py-3" style={{ borderLeft: "1px solid var(--vault-rule)" }}>
                  <CellContent picks={row.cellsMulti[c.key]} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* MOBILE: per-game cards, markets stacked, up to 3 picks per market — full names, no overflow */}
      <div className="lg:hidden flex flex-col gap-3">
        {table.rows.map((row) => (
          <div key={row.gameId} className="rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--vault-rule)", background: "rgba(12,8,6,0.4)" }}>
            <div className="px-3 py-2.5 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
              <span className="flex items-center gap-1.5 min-w-0">
                <MatchupFlags matchup={row.matchup} />
                <span className="font-semibold break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 13 }}>{row.matchup}</span>
              </span>
              <span className="font-mono uppercase tracking-[0.08em] shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{row.kickoffEt}</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
              {cols.map((c, ci) => (
                <div key={c.key} className="px-3 py-2.5 min-w-0" style={{ borderTop: ci ? "1px solid var(--vault-rule)" : "none" }}>
                  <div className="font-mono uppercase tracking-[0.12em] mb-1.5" style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}>{c.label}</div>
                  <MobilePicks picks={row.cellsMulti[c.key]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
