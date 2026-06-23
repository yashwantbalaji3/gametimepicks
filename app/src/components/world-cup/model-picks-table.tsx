/**
 * ModelPicksTable — the World Cup MODEL-PICK board, grouped by GAME (rows) × MARKET (columns).
 *
 * This is the model-only view: each cell shows the ONE top model-qualified pick for that game+column
 * (team market, total/BTTS, a player-prop market, or the best addable leg), or "No model-qualified
 * pick" when nothing clears the model filter. Raw sportsbook inventory is NOT shown here — only picks
 * that pass the model gates (odds-backed, has a provider, pre-event, within the leg odds window, clears
 * a model floor) survive into the unified pool the table renders. The `cards` column is always empty
 * (no posted card market for the World Cup).
 *
 * Desktop: a true column grid. Mobile: per-game cards with markets stacked — no horizontal overflow.
 * Pure presentational; all selection logic lives in the loader (buildModelPicksTable).
 */
import PlayerAvatar from "@/components/ui/player-avatar";
import OddsPill from "@/components/tickets/odds-pill";
import type { ModelPick, ModelPicksTable } from "@/lib/world-cup/model-qualified-picks";

function VolBadge({ pick }: { pick: ModelPick }) {
  const lower = pick.volatility === "lower";
  return (
    <span
      className="rounded-full px-1.5 py-0.5 font-mono uppercase tracking-[0.08em]"
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

/** The pick content shared by desktop cells + mobile rows. */
function PickBody({ pick }: { pick: ModelPick }) {
  return (
    <div className="flex flex-col gap-1">
      {pick.player ? (
        <div className="flex items-center gap-2 min-w-0">
          <PlayerAvatar name={pick.player} size={18} />
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12 }}>{pick.player}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pick.selection}</span>
        <OddsPill odds={pick.odds} size="sm" tone="gold" />
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

export default function ModelPicksTable({ table }: { table: ModelPicksTable }) {
  if (table.rows.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--vault-text-faint)" }}>
        No model-qualified picks for this slate yet.
      </p>
    );
  }

  const cols = table.columns;
  const gridTemplate = `200px repeat(${cols.length}, minmax(0, 1fr))`;

  return (
    <div className="flex flex-col gap-3">
      {/* Honest counts: model-qualified picks vs games covered. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold" style={{ color: "var(--vault-gold-bright)", fontSize: 12.5 }}>
          {table.pickCount} model-qualified {table.pickCount === 1 ? "pick" : "picks"} across {table.rows.length} {table.rows.length === 1 ? "game" : "games"}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
        Model picks only — top model-qualified pick per game and market. Raw sportsbook inventory is not shown here.
      </p>

      {/* DESKTOP: game rows × market columns */}
      <div className="hidden lg:block overflow-hidden rounded-[12px]" style={{ border: "1px solid var(--vault-rule)" }}>
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
              <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{row.matchup}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{row.kickoffEt}</span>
            </div>
            {cols.map((c) => {
              const pick = row.cells[c.key];
              return (
                <div key={c.key} className="px-3 py-3" style={{ borderLeft: "1px solid var(--vault-rule)" }}>
                  {pick ? <PickBody pick={pick} /> : <EmptyCell />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* MOBILE: per-game cards, markets stacked */}
      <div className="lg:hidden flex flex-col gap-3">
        {table.rows.map((row) => (
          <div key={row.gameId} className="rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--vault-rule)", background: "rgba(12,8,6,0.4)" }}>
            <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
              <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>{row.matchup}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{row.kickoffEt}</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
              {cols.map((c, ci) => {
                const pick = row.cells[c.key];
                return (
                  <div key={c.key} className="px-3 py-2.5 min-w-0" style={{ borderTop: ci ? "1px solid var(--vault-rule)" : "none" }}>
                    <div className="font-mono uppercase tracking-[0.12em] mb-1.5" style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}>{c.label}</div>
                    {pick ? <PickBody pick={pick} /> : <EmptyCell />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
