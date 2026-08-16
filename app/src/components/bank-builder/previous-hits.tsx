/**
 * PreviousHits — the settled Bank Builder ladder wins, shown as rich cards that name the
 * EXACT legs that hit, with official player headshots, team logos, and country flags.
 *
 * Honesty contract:
 *   - Only entries with result === "win" render here.
 *   - Every number + the leg facts (player/selection, side, line, finalStat/finalScore,
 *     odds, bookmaker) are the real settled values from the public ledger artifact.
 *   - Portrait/logo/flag metadata comes from `historyLegVisual` — real ids/teams/codes
 *     read from the historical provider boards (see that module). A leg with no visual
 *     metadata degrades to an initials monogram, never a fabricated face.
 */
import { getSportIdentity } from "@/lib/sport-identity";
import { historyLegVisual } from "@/lib/bank-builder-history-enrichment";
import { PlayerPortrait, TeamLogo } from "@/components/entity";
import FlagBadge from "@/components/flag-badge";
import type { PublicBuilderEntry } from "@/lib/data-bank-builder";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string): string {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
}

const MARKET_LABEL: Record<string, string> = {
  REB: "rebounds", PTS: "points", AST: "assists", PRA: "pts+reb+ast", BLK: "blocks", STL: "steals",
  batter_hits: "hits", batter_total_bases: "total bases", batter_home_runs: "home runs",
  pitcher_strikeouts: "strikeouts", moneyline_90: "to win (90′)", double_chance: "double chance",
};
function humanizeMarket(m: string): string {
  return MARKET_LABEL[m] ?? m.replace(/_/g, " ");
}

type Leg = PublicBuilderEntry["legs"][number];

/** One settled leg, with its real portrait/logo/flag and official-result evidence. */
function HitLeg({ leg }: { leg: Leg }) {
  const name = leg.player ?? leg.selection ?? "—";
  const visual = historyLegVisual(name);
  const market = humanizeMarket(leg.market);

  const statNoun = leg.finalStat === 1 && market.endsWith("s") ? market.slice(0, -1) : market;
  const evidence = leg.finalScore
    ? `Final · ${leg.finalScore}`
    : typeof leg.finalStat === "number"
      ? `Official box score · ${leg.finalStat} ${statNoun}`
      : market;

  return (
    <li
      className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
      style={{ background: "rgba(7, 11, 9,0.55)", border: "1px solid var(--vault-rule)" }}
    >
      {/* Portrait / flags */}
      <span className="flex shrink-0 items-center gap-1.5">
        {visual?.kind === "player" ? (
          <PlayerPortrait playerId={visual.playerId} name={name} team={visual.team} sport={visual.sport} size="sm" />
        ) : visual?.kind === "match" ? (
          <span className="flex items-center gap-1">
            {visual.codes.map((c) => (
              <FlagBadge key={c} code={c} size="sm" ariaLabel={name} />
            ))}
          </span>
        ) : (
          <PlayerPortrait name={name} size="sm" />
        )}
        {visual?.kind === "player" && (
          <TeamLogo team={visual.team} sport={visual.sport} size="sm" />
        )}
      </span>

      {/* Name + market */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--vault-text)" }}>
          {name}
          {leg.player && (leg.line != null) ? (
            <span style={{ color: "var(--vault-text-mute)", fontWeight: 500 }}>{` · ${leg.side} ${leg.line}`}</span>
          ) : null}
        </span>
        <span className="truncate font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          {evidence}{leg.bookmaker ? ` · ${leg.bookmaker}` : ""}
        </span>
      </div>

      {/* Odds + check */}
      <span className="flex shrink-0 items-center gap-2">
        {typeof leg.oddsForSide === "number" ? (
          <span className="font-mono tabular text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
            {leg.oddsForSide >= 0 ? "+" : ""}{leg.oddsForSide}
          </span>
        ) : null}
        <span aria-hidden style={{ color: "var(--vault-success)", fontSize: 13 }}>✓</span>
      </span>
    </li>
  );
}

export default function PreviousHits({ hits, recordLabel }: { hits: PublicBuilderEntry[]; recordLabel: string }) {
  if (hits.length === 0) return null;
  const ordered = [...hits].sort((a, b) => a.step - b.step);
  return (
    <section
      className="gtp-fade-up mt-5 rounded-2xl p-5"
      style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(180deg, rgba(110,231,168,0.04), var(--lava-panel))" }}
      aria-label="Previous hits"
    >
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--vault-text)" }}>
          The road so far · every leg that hit
        </h2>
        <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          Record <strong style={{ color: "var(--vault-success)" }}>{recordLabel}</strong> · settled from official results
        </span>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2">
        {ordered.map((e, i) => {
          const id = getSportIdentity(e.sport);
          return (
            <li
              key={e.step}
              className="gtp-fade-up gtp-card-hover flex min-w-0 flex-col gap-3 rounded-xl p-3.5"
              style={{ border: "1px solid rgba(110,231,168,0.22)", background: "rgba(110,231,168,0.045)", animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="gtp-sport-orb shrink-0"
                  style={{ width: 34, height: 34, fontSize: 18, ["--orb-grad" as string]: id.gradient }}
                  role="img"
                  aria-label={`${id.label} ${id.ballLabel}`}
                >
                  {id.icon}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>
                    Step {e.step} · {id.label}
                  </span>
                  <span className="truncate font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
                    {fmtDate(e.date)}{e.event ? ` · ${e.event}` : ""}
                  </span>
                </div>
                <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em]" style={{ background: "rgba(110,231,168,0.16)", color: "var(--vault-success)" }}>
                  WON
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-display tabular text-[16px] font-bold" style={{ color: "var(--vault-text)" }}>
                  {usd(e.bankrollBefore)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> {usd(e.bankrollAfter)}
                </span>
                <span className="font-mono text-[11px]" style={{ color: "var(--vault-success)" }}>+{usd(e.profitUnits)}</span>
                {typeof e.combinedAmerican === "number" && (
                  <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
                    {e.combinedAmerican >= 0 ? "+" : ""}{e.combinedAmerican}
                  </span>
                )}
              </div>

              {e.legs?.length ? (
                <ul className="flex flex-col gap-1.5">
                  {e.legs.map((l, j) => <HitLeg key={j} leg={l} />)}
                </ul>
              ) : (
                <span className="text-[10.5px] italic" style={{ color: "var(--vault-text-faint)" }}>card details unavailable</span>
              )}

              {e.officialResultConfirmed && (
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
                  ✓ official result confirmed · paper-only tracking
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
