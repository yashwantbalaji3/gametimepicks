/**
 * ModelPlayerPropsMatrix — the model-only player-prop board, grouped by GAME (rows) × MARKET (columns).
 *
 * This is the honest replacement for dumping every sportsbook prop: each cell shows the ONE top
 * model-qualified pick for that game+market, or "No model-qualified pick" when nothing clears the model
 * filter. Sportsbook inventory is NOT shown here — only picks that pass odds / provider / pre-event /
 * role-quality / probability gates (see lib/world-cup/model-qualified-props).
 *
 * Desktop: a true column grid. Mobile: per-game cards with markets stacked — no horizontal overflow.
 * Pure presentational; all selection logic lives in the loader.
 */
import PlayerAvatar from "@/components/ui/player-avatar";
import OddsPill from "@/components/tickets/odds-pill";
import {
  PROP_MARKET_COLUMNS,
  type ModelQualifiedPropsResult,
  type ModelQualifiedPick,
  type PropMarketColumn,
} from "@/lib/world-cup/model-qualified-props";

const DISPLAY_COLUMNS: PropMarketColumn[] = PROP_MARKET_COLUMNS.filter((c) => c.key !== "other");

function VolBadge({ pick }: { pick: ModelQualifiedPick }) {
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
function PickBody({ pick }: { pick: ModelQualifiedPick }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 min-w-0">
        <PlayerAvatar name={pick.player} size={20} />
        <span className="break-words font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12 }}>{pick.player}</span>
      </div>
      <div className="flex items-start justify-between gap-2">
        <span className="break-words leading-tight" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pick.selection}</span>
        <OddsPill odds={pick.odds} size="sm" tone="gold" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono tabular" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {Math.round(pick.modelConfidence * 100)}% model-implied
        </span>
        <VolBadge pick={pick} />
      </div>
    </div>
  );
}

export default function ModelPlayerPropsMatrix({ data }: { data: ModelQualifiedPropsResult }) {
  if (!data.games.length) {
    return (
      <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
        No World Cup games are joinable for this slate yet — the model player-prop board publishes once the
        slate&apos;s team projections and posted markets are available.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Honest counts: inventory evaluated vs model-qualified picks shown. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold" style={{ color: "var(--vault-gold-bright)", fontSize: 12.5 }}>
          {data.qualifiedCount} model-qualified player-prop {data.qualifiedCount === 1 ? "pick" : "picks"} across {data.gameCount} games
        </span>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {data.evaluatedCount} sportsbook prop markets evaluated
        </span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
        Model picks only — sportsbook inventory is hidden unless it passes the model filter (odds-backed, pre-event,
        role-quality, market-implied threshold). {data.lineupsPosted ? "Lineups posted." : "Limited-data / market-implied: lineups not yet posted."}
      </p>

      {/* DESKTOP: game rows × market columns */}
      <div className="hidden lg:block overflow-hidden rounded-[12px]" style={{ border: "1px solid var(--vault-rule)" }}>
        <div
          className="grid items-stretch"
          style={{ gridTemplateColumns: `200px repeat(${DISPLAY_COLUMNS.length}, minmax(0, 1fr))`, background: "rgba(255,255,255,0.02)" }}
        >
          <div className="px-3 py-2.5 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Game</div>
          {DISPLAY_COLUMNS.map((c) => (
            <div key={c.key} className="px-3 py-2.5 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5, borderLeft: "1px solid var(--vault-rule)" }}>
              {c.label}
            </div>
          ))}
        </div>
        {data.games.map((g, gi) => (
          <div
            key={g.gameId}
            className="grid items-stretch"
            style={{ gridTemplateColumns: `200px repeat(${DISPLAY_COLUMNS.length}, minmax(0, 1fr))`, borderTop: "1px solid var(--vault-rule)", background: gi % 2 ? "rgba(255,255,255,0.012)" : "transparent" }}
          >
            <div className="px-3 py-3 flex flex-col gap-0.5">
              <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{g.matchup}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                {g.started ? "Game started" : g.kickoffEt}
              </span>
            </div>
            {DISPLAY_COLUMNS.map((c) => {
              const pick = g.cells[c.key];
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
        {data.games.map((g) => (
          <div key={g.gameId} className="rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--vault-rule)", background: "rgba(7, 11, 9,0.4)" }}>
            <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
              <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>{g.matchup}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                {g.started ? "Game started" : g.kickoffEt}
              </span>
            </div>
            <div className="flex flex-col">
              {DISPLAY_COLUMNS.map((c, ci) => {
                const pick = g.cells[c.key];
                return (
                  <div key={c.key} className="px-3 py-2.5" style={{ borderTop: ci ? "1px solid var(--vault-rule)" : "none" }}>
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
