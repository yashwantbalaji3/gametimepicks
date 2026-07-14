/**
 * SoccerSimulationReportV2 — a clean, scannable, SimTheGame-style simulation report for World Cup games that
 * stays HONEST about the data. It replaces the old "probability-center card stacked on top of a dense odds
 * dashboard" with a single reorganized flow:
 *
 *   1 Match header   2 Simulation result / probability center   3 Score center (scoreline model validating —
 *   never faked)   4 Team goal totals (provider/model needed)   5 Player props grid (fixture-specific,
 *   settlement-pending, product-ineligible)   6 Market watchlist (market signals, NOT model predictions)
 *   7 Market agreement (why market-implied means no advantage = valid no-play)   8 Bracket impact
 *   9 Coming soon / unsupported   10 Methodology   → then the old dashboard, collapsed at the very bottom.
 *
 * Honesty rules baked in: source is MARKET-IMPLIED (de-vigged 90' prices), never an independent/validated model,
 * no fabricated scoreline, no "10,000-run", no promotional betting language, player props are
 * labelled settlement-pending + product-ineligible, and no internal engine numbers are shown.
 */
import type { WcMatchResult, WcTotal, WcBtts, WcDoubleChance, WcDrawNoBet } from "@/lib/wc-game-center";
import type { PublicProjection } from "@/lib/normalize";
import WorldCupBracketImpactCard from "@/components/world-cup/wc-bracket-impact-card";

export interface SoccerSimulationReportV2Props {
  home: string;
  away: string;
  homeCode?: string | null;
  awayCode?: string | null;
  stage?: string | null;
  kickoffUtc?: string | null;
  matchResult: WcMatchResult | null;
  total: WcTotal | null;
  btts: WcBtts | null;
  doubleChance: WcDoubleChance | null;
  drawNoBet: WcDrawNoBet | null;
  playerProps: PublicProjection[];
  finalDateLabel?: string;
  thirdPlaceDateLabel?: string;
  /** The old market dashboard + advanced report, demoted into a collapsed block at the very bottom. */
  advanced?: React.ReactNode;
}

const pct = (p: number | null | undefined) => (typeof p === "number" ? `${(p * 100).toFixed(0)}%` : "—");

function Section({ n, title, subtitle, tone = "default", children }: { n: number; title: string; subtitle?: string; tone?: "default" | "muted"; children: React.ReactNode }) {
  const muted = tone === "muted";
  return (
    <section
      className="rounded-[16px] px-4 sm:px-6 py-5 flex flex-col gap-3"
      style={{ background: muted ? "rgba(20,13,9,0.4)" : "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{String(n).padStart(2, "0")}</span>
        <div className="flex flex-col gap-0.5">
          <h3 className="font-display tracking-tight m-0" style={{ color: muted ? "var(--vault-text-mute)" : "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{title}</h3>
          {subtitle ? <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{subtitle}</span> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Monogram({ code, name }: { code?: string | null; name: string }) {
  const label = (code && code.length <= 3 ? code : name.slice(0, 3)).toUpperCase();
  return (
    <div className="flex items-center justify-center rounded-[10px] shrink-0" style={{ width: 44, height: 44, background: "rgba(217,164,65,0.10)", border: "1px solid var(--vault-border-strong)" }}>
      <span className="font-display" style={{ color: "var(--vault-gold)", fontSize: 15, fontWeight: 800 }}>{label}</span>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1" style={{ background: "rgba(15,10,7,0.55)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{label}</span>
      <span style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{value}</span>
      {sub ? <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>{sub}</span> : null}
    </div>
  );
}

const MARKET_ORDER = ["Anytime goalscorer", "Shots on target", "Shots", "Assists"];

export default function SoccerSimulationReportV2(props: SoccerSimulationReportV2Props) {
  const { home, away, homeCode, awayCode, stage, kickoffUtc, matchResult, total, btts, doubleChance, drawNoBet, playerProps, finalDateLabel, thirdPlaceDateLabel, advanced } = props;

  const mr = matchResult;
  const top = mr ? (mr.home >= mr.draw && mr.home >= mr.away ? { label: home, p: mr.home } : mr.away >= mr.draw ? { label: away, p: mr.away } : { label: "Draw", p: mr.draw }) : null;
  const efficient = !top || top.p < 0.45;
  const kickoff = kickoffUtc ? new Date(kickoffUtc).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : null;

  // Group fixture player props by market (fixture-specific only — these are THIS game's props).
  const byMarket = new Map<string, PublicProjection[]>();
  for (const p of playerProps) {
    const k = p.marketLabel || "Other";
    if (!byMarket.has(k)) byMarket.set(k, []);
    byMarket.get(k)!.push(p);
  }
  const orderedMarkets = [...byMarket.keys()].sort((a, b) => {
    const ia = MARKET_ORDER.indexOf(a), ib = MARKET_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // Market watchlist: the strongest market-implied reads (highest single-side probability), NOT model predictions.
  const watch: { label: string; prob: number }[] = [];
  if (total) watch.push({ label: `Total ${total.line} — ${total.over >= total.under ? "Over" : "Under"}`, prob: Math.max(total.over, total.under) });
  if (btts) watch.push({ label: `Both teams score — ${btts.yes >= btts.no ? "Yes" : "No"}`, prob: Math.max(btts.yes, btts.no) });
  if (mr) watch.push({ label: `${top?.label} to win in 90'`, prob: top?.p ?? 0 });
  watch.sort((a, b) => b.prob - a.prob);

  return (
    <div className="flex flex-col gap-3">
      {/* 1 — Match header */}
      <section className="rounded-[16px] px-4 sm:px-6 py-5 flex flex-col gap-3" style={{ background: "rgba(26,16,11,0.6)", border: "1px solid var(--vault-border-strong)", borderTop: "2px solid var(--vault-gold)" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Monogram code={homeCode} name={home} />
            <div className="flex flex-col">
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>{home} <span style={{ color: "var(--vault-text-faint)", fontWeight: 500 }}>vs</span> {away}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>{stage || "World Cup"}{kickoff ? ` · ${kickoff}` : ""}</span>
            </div>
            <Monogram code={awayCode} name={away} />
          </div>
          <span className="font-mono uppercase tracking-[0.1em] rounded-full px-3 py-1.5" style={{ fontSize: 9.5, color: "var(--vault-gold)", background: "rgba(217,164,65,0.10)", border: "1px solid rgba(217,164,65,0.35)" }}>Simulation report · Market-implied 90′</span>
        </div>
      </section>

      {/* 2 — Simulation result / probability center */}
      <Section n={2} title="Simulation result" subtitle="Market-implied 90-minute probability center">
        {mr ? (
          <>
            <div className="flex h-9 w-full overflow-hidden rounded-[8px]" style={{ border: "1px solid var(--vault-border)" }}>
              <div style={{ width: `${mr.home * 100}%`, background: "rgba(217,164,65,0.55)" }} className="flex items-center justify-center"><span className="font-mono" style={{ fontSize: 11, color: "#1A0E06", fontWeight: 800 }}>{pct(mr.home)}</span></div>
              <div style={{ width: `${mr.draw * 100}%`, background: "rgba(150,150,160,0.35)" }} className="flex items-center justify-center"><span className="font-mono" style={{ fontSize: 11, color: "var(--vault-text)", fontWeight: 800 }}>{pct(mr.draw)}</span></div>
              <div style={{ width: `${mr.away * 100}%`, background: "rgba(120,140,180,0.4)" }} className="flex items-center justify-center"><span className="font-mono" style={{ fontSize: 11, color: "var(--vault-text)", fontWeight: 800 }}>{pct(mr.away)}</span></div>
            </div>
            <div className="flex justify-between font-mono" style={{ fontSize: 10.5, color: "var(--vault-text-mute)" }}>
              <span>{home} win</span><span>Draw</span><span>{away} win</span>
            </div>
            <p className="text-[13.5px] leading-relaxed m-0" style={{ color: "var(--vault-text)" }}>
              Most likely 90-minute result: <strong>{top?.label} ({pct(top?.p)})</strong>.
              {efficient ? <span style={{ color: "var(--vault-text-mute)" }}> No outcome clears a strong-lean threshold — the market is efficient here, which is a valid no-play read, not a broken simulation.</span> : null}
            </p>
          </>
        ) : <p className="text-[13px] m-0" style={{ color: "var(--vault-text-mute)" }}>Match-result prices not available for this fixture.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {total ? <StatTile label={`Total ${total.line}`} value={`Over ${pct(total.over)}`} sub={`Under ${pct(total.under)}`} /> : null}
          {btts ? <StatTile label="Both teams score" value={`Yes ${pct(btts.yes)}`} sub={`No ${pct(btts.no)}`} /> : null}
          {doubleChance ? <StatTile label="Double chance" value={`1X ${pct(doubleChance.homeOrDraw)}`} sub={`X2 ${pct(doubleChance.awayOrDraw)}`} /> : null}
          {drawNoBet ? <StatTile label="Draw no bet" value={`${home} ${pct(drawNoBet.home)}`} sub={`${away} ${pct(drawNoBet.away)}`} /> : null}
        </div>
      </Section>

      {/* 3 — Score center (never faked) */}
      <Section n={3} title="Score center" subtitle="Projected scoreline" tone="muted">
        <div className="rounded-[10px] px-4 py-4 flex flex-col gap-1.5" style={{ background: "rgba(15,10,7,0.5)", border: "1px dashed var(--vault-border-strong)" }}>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Scoreline model · validating</span>
          <p className="text-[13px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
            We do not show a projected scoreline. Our internal scoreline model is still validating and currently
            does not beat the closing market, so it stays internal. The most likely 90-minute <em>result</em> above
            is market-implied ({top ? `${top.label}, ${pct(top.p)}` : "n/a"}); a specific projected score is not
            published until a validated model earns it.
          </p>
        </div>
      </Section>

      {/* 4 — Team goal totals */}
      <Section n={4} title="Team goal totals" subtitle="Per-team scoring" tone="muted">
        <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>
          Per-team goal totals aren't ingested for this slate — <span style={{ color: "var(--vault-text-faint)" }}>provider needed</span>. The match total ({total ? `line ${total.line}` : "n/a"}) is shown in the probability center above.
        </p>
      </Section>

      {/* 5 — Player props grid */}
      <Section n={5} title="Player props" subtitle={`Fixture-specific · ${playerProps.length} props · settlement pending`}>
        {playerProps.length > 0 ? (
          <>
            <div className="flex flex-col gap-3">
              {orderedMarkets.map((market) => (
                <div key={market} className="flex flex-col gap-1.5">
                  <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>{market}</span>
                  <div className="flex flex-col">
                    {byMarket.get(market)!.slice(0, 6).map((p, i) => (
                      <div key={p.id || `${market}-${i}`} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--vault-border)" }}>
                        <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>
                          {p.player?.name ?? "—"}
                        </span>
                        <span className="font-mono shrink-0 flex items-center gap-2.5" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                          <span>{p.pickLabel}</span>
                          {typeof p.marketProbability === "number" ? <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(p.marketProbability)}</span> : null}
                          {p.bookmaker ? <span style={{ color: "var(--vault-text-faint)" }}>{p.bookmaker}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
              Provider-backed prices. <strong>Settlement pending</strong> (2026 player stats need a paid data plan)
              → these props are <strong>product-ineligible</strong> (never enter Bank Builder / Moonshot). Probabilities are de-vigged market prices, not a model advantage.
            </p>
          </>
        ) : <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>No fixture-specific player props posted for this match yet.</p>}
      </Section>

      {/* 6 — Market watchlist (NOT model predictions) */}
      <Section n={6} title="Market watchlist" subtitle="Strongest market signals — not model predictions">
        <div className="flex flex-col gap-1.5">
          {watch.map((w, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--vault-border)" }}>
              <span style={{ color: "var(--vault-text)", fontSize: 13 }}>{w.label}</span>
              <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 12, fontWeight: 700 }}>{pct(w.prob)}</span>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
          These are the market's own strongest reads (de-vigged prices), a watchlist — <strong>not</strong> tips, predictions, or advice. A market-implied report has no advantage over the price by construction.
        </p>
      </Section>

      {/* 7 — Market agreement */}
      <Section n={7} title="Market agreement" subtitle="Why there's nothing to fade" tone="muted">
        <p className="text-[13px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          This report is <strong>market-implied</strong>: every probability is the de-vigged sportsbook price, so
          the model and the market agree <em>by construction</em>. That's why there's no advantage to claim over
          the price. When no outcome clears a strong-lean threshold, that's the market being efficient: a
          valid <strong>no-play</strong> signal, not a broken or empty simulation.
        </p>
      </Section>

      {/* 8 — Bracket impact */}
      <WorldCupBracketImpactCard home={home} away={away} stage={stage ?? ""} finalDateLabel={finalDateLabel} thirdPlaceDateLabel={thirdPlaceDateLabel} />

      {/* 9 — Coming soon / unsupported */}
      <Section n={9} title="Coming soon" subtitle="Not ingested for this fixture" tone="muted">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ["Correct score", "model needed"],
            ["Expected goals (xG)", "provider needed"],
            ["Corners", "provider needed"],
            ["Cards", "provider needed"],
            ["Projected lineups", "provider needed"],
            ["Player-prop settlement", "2026 stats plan needed"],
          ].map(([label, why]) => (
            <div key={label} className="rounded-[8px] px-3 py-2 flex flex-col gap-0.5" style={{ background: "rgba(15,10,7,0.4)", border: "1px solid var(--vault-border)" }}>
              <span style={{ color: "var(--vault-text-mute)", fontSize: 12, fontWeight: 600 }}>{label}</span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{why}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 10 — Methodology */}
      <Section n={10} title="Methodology" subtitle="How to read this" tone="muted">
        <p className="font-mono text-[10.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
          Market-implied 90-minute report from de-vigged sportsbook prices (extra time & penalties excluded). NOT
          an independent soccer model, no xG, no projected scoreline, no run-count claim. Player props are
          provider-backed but settlement-pending and product-ineligible. Paper-only, educational — not betting advice.
        </p>
      </Section>

      {/* Demoted: the old market dashboard + advanced report, collapsed at the very bottom */}
      {advanced ? (
        <details className="rounded-[14px] px-4 sm:px-5 py-3" style={{ background: "rgba(15,10,7,0.35)", border: "1px solid var(--vault-border)" }}>
          <summary className="cursor-pointer font-mono uppercase tracking-[0.08em] select-none" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
            Full market detail &amp; advanced report ▾
          </summary>
          <div className="mt-3">{advanced}</div>
        </details>
      ) : null}
    </div>
  );
}
