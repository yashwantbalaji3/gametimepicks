/**
 * WcGameCenter — the market-implied Soccer / World Cup Game Center for a sim dashboard.
 *
 * Match Result (3-way) · Double Chance / DNB · Match Total / BTTS — all DIRECT reads of the
 * de-vigged sportsbook prices (lib/wc-game-center). Labelled "Market-implied" and "not betting
 * advice", with the 90-minute regulation caveat explicit. Unsupported soccer modules (shots,
 * corners, cards, xG, first scorer, exact score, …) are listed transparently, never fabricated.
 * This is NOT a 10,000-run simulation — no run-count is claimed.
 *
 * Presentational; receives a resolved WcGameCenter.
 */
import FlagBadge from "@/components/flag-badge";
import type { WcGameCenter } from "@/lib/wc-game-center";
import type { WcExpandedMarkets } from "@/lib/wc-expanded-markets";

const CARD: React.CSSProperties = { background: "var(--gtp-card)", border: "1px solid var(--vault-rule)" };
const SUNKEN: React.CSSProperties = { background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" };

const pct = (p: number) => `${(p * 100).toFixed(0)}%`;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
      {children}
    </span>
  );
}

export default function WcGameCenter({
  gameCenter,
  expanded,
}: {
  gameCenter: WcGameCenter;
  expanded?: WcExpandedMarkets | null;
}) {
  const { matchResult, doubleChance, drawNoBet, total, btts, homeTeam, awayTeam, homeCode, awayCode } = gameCenter;
  const ah = expanded?.asianHandicap ?? null;
  const tt = expanded?.teamTotals ?? null;

  return (
    <section aria-label="Match Result Center" className="mb-5 rounded-[12px] px-4 sm:px-5 py-4 flex flex-col gap-4" style={CARD}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-mono uppercase tracking-[0.16em] m-0 font-normal" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
          Match Result Center
        </h3>
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
          style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 9 }}
        >
          Market-implied · {gameCenter.source}
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
        Read straight from the sportsbook&rsquo;s de-vigged prices. 90-minute (regulation)
        result only — extra time and penalties do not count. A market-implied dashboard, not a
        sampled simulation and not betting advice.
      </p>

      {/* 1. Match result — 3-way */}
      {matchResult && (
        <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-2" style={SUNKEN}>
          <Eyebrow>Match result (90&rsquo;)</Eyebrow>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: homeTeam, code: homeCode, p: matchResult.home, key: "home" as const },
              { label: "Draw", code: "", p: matchResult.draw, key: "draw" as const },
              { label: awayTeam, code: awayCode, p: matchResult.away, key: "away" as const },
            ].map((c) => (
              <div key={c.key} className="flex flex-col items-center gap-1">
                <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
                  {c.code ? <FlagBadge code={c.code} size="sm" /> : null}
                  <span className="truncate" style={{ maxWidth: 90 }}>{c.label}</span>
                </span>
                <span
                  className="font-display"
                  style={{ color: c.key === matchResult.topResult ? "var(--vault-gold-bright)" : "var(--vault-text)", fontSize: 20, lineHeight: 1 }}
                >
                  {pct(c.p)}
                </span>
              </div>
            ))}
          </div>
          <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "var(--vault-rule)" }}>
            <span style={{ width: `${Math.round(matchResult.home * 100)}%`, background: "var(--vault-gold-bright)" }} />
            <span style={{ width: `${Math.round(matchResult.draw * 100)}%`, background: "var(--vault-text-faint)" }} />
            <span style={{ width: `${Math.round(matchResult.away * 100)}%`, background: "var(--vault-text-mute)" }} />
          </div>
        </div>
      )}

      {/* 2 + 3. DC / DNB / Total / BTTS grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {doubleChance && (
          <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5" style={SUNKEN}>
            <Eyebrow>Double chance</Eyebrow>
            <div className="flex flex-col gap-0.5 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              {doubleChance.homeOrDraw != null && <span>{homeTeam} or Draw · <span style={{ color: "var(--vault-text)" }}>{pct(doubleChance.homeOrDraw)}</span></span>}
              {doubleChance.awayOrDraw != null && <span>{awayTeam} or Draw · <span style={{ color: "var(--vault-text)" }}>{pct(doubleChance.awayOrDraw)}</span></span>}
              {doubleChance.homeOrAway != null && <span>Either team (no draw) · <span style={{ color: "var(--vault-text)" }}>{pct(doubleChance.homeOrAway)}</span></span>}
            </div>
          </div>
        )}
        {drawNoBet && (
          <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5" style={SUNKEN}>
            <Eyebrow>Draw no bet</Eyebrow>
            <div className="flex flex-col gap-0.5 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              <span>{homeTeam} · <span style={{ color: "var(--vault-text)" }}>{pct(drawNoBet.home)}</span></span>
              <span>{awayTeam} · <span style={{ color: "var(--vault-text)" }}>{pct(drawNoBet.away)}</span></span>
            </div>
          </div>
        )}
        {total && (
          <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5" style={SUNKEN}>
            <Eyebrow>Match total (goals)</Eyebrow>
            <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 18, lineHeight: 1 }}>{total.line}</span>
            <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
              {total.lean === "balanced" ? `Balanced (O ${pct(total.over)})` : `${total.lean === "over" ? "Over" : "Under"} lean · ${pct(total.lean === "over" ? total.over : total.under)}`}
            </span>
          </div>
        )}
        {btts && (
          <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5" style={SUNKEN}>
            <Eyebrow>Both teams to score</Eyebrow>
            <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              Yes <span style={{ color: "var(--vault-text)" }}>{pct(btts.yes)}</span> · No <span style={{ color: "var(--vault-text)" }}>{pct(btts.no)}</span>
            </span>
            <span className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
              {btts.lean === "balanced" ? "Balanced" : `${btts.lean === "yes" ? "Yes" : "No"} lean`}
            </span>
          </div>
        )}
      </div>

      {/* Expanded markets (odds-ingest ready): Asian handicap + team totals, de-vigged. */}
      {(ah || tt) && (
        <div className="flex flex-col gap-2">
          <Eyebrow>Expanded markets · de-vigged</Eyebrow>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ah && ah.home.noVigProb != null && ah.away.noVigProb != null && (
              <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5" style={SUNKEN}>
                <Eyebrow>Asian handicap</Eyebrow>
                <div className="flex flex-col gap-0.5 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
                  {(() => {
                    const homeLine = ah.line;
                    const awayLine = ah.away.line ?? -ah.line;
                    const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
                    return (
                      <>
                        <span>{homeTeam} {fmt(homeLine)} · <span style={{ color: "var(--vault-text)" }}>{pct(ah.home.noVigProb!)}</span></span>
                        <span>{awayTeam} {fmt(awayLine)} · <span style={{ color: "var(--vault-text)" }}>{pct(ah.away.noVigProb!)}</span></span>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            {tt && (
              <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5" style={SUNKEN}>
                <Eyebrow>Team goal totals</Eyebrow>
                <div className="flex flex-col gap-0.5 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
                  {tt.home.over.noVigProb != null && <span>{tt.home.team} Over {tt.home.line} · <span style={{ color: "var(--vault-text)" }}>{pct(tt.home.over.noVigProb)}</span></span>}
                  {tt.away.over.noVigProb != null && <span>{tt.away.team} Over {tt.away.line} · <span style={{ color: "var(--vault-text)" }}>{pct(tt.away.over.noVigProb)}</span></span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unavailable modules — transparent, not buried */}
      {gameCenter.unavailable.length > 0 && (
        <div className="rounded-[8px] px-3 py-2 flex flex-col gap-1" style={{ background: "color-mix(in srgb, var(--vault-accent) 5%, transparent)", border: "1px solid var(--vault-rule)" }}>
          <Eyebrow>Not available for this slate</Eyebrow>
          <p className="text-[10.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
            {gameCenter.unavailable.map((u) => u.module.replace(/_/g, " ")).join(" · ")} — these markets aren&rsquo;t
            ingested, so they are not shown (never estimated from team names).
          </p>
        </div>
      )}

      {/* Recap */}
      <p className="text-[11px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
        The market makes {matchResult ? `${matchResult.topResult === "home" ? homeTeam : matchResult.topResult === "away" ? awayTeam : "a draw"} the likeliest 90-minute result` : "no clear favorite"}
        {total ? `, with a ${total.lean === "balanced" ? "balanced" : total.lean} total around ${total.line} goals` : ""}. Paper-only,
        educational — a transparency read of the priced market, not a prediction or a wager.
      </p>
    </section>
  );
}
