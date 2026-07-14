/**
 * MlbSimulationReportV2 — the clean, SimTheGame-style MLB game report, using the SAME shell as soccer V2 but
 * with MLB's honest data:
 *
 *   1 Match header (10,000-run PLAYER-PROP simulation label + previous-slate badge)
 *   2 Simulation result — the strongest 10k player-prop leans (the real sim output)
 *   3 Market snapshot — de-vigged full-game lines (moneyline / run line / total), MARKET-ANCHORED
 *   4 Full-game simulation — INTERNAL, VALIDATING (no numbers shown; the internal full-game engine is not
 *     public-ready, so we never surface a win probability / projected score / run distribution here)
 *   5 Player props — fixture-specific batter/pitcher props
 *   6 Coming soon — team totals / F5 / alt lines / pitcher-market settlement
 *   7 Methodology
 *   → then the old accordions, collapsed at the very bottom.
 *
 * Honesty: the 10k sim is a PLAYER-PROP sim (no game score). Full-game markets are the de-vigged sportsbook
 * lines — market-anchored, NOT an independent game simulation. No internal full-game numbers, no best-bet/lock/
 * EV/edge language. Paper-only.
 */
import type { PublicProjection } from "@/lib/normalize";
import { Section, Monogram, AdvancedDisclosure } from "@/components/game/report-v2-shell";

export interface MlbSimulationReportV2Props {
  home: string;
  away: string;
  homeCode?: string | null;
  awayCode?: string | null;
  date: string;
  isPreviousSlate: boolean;
  runLabel: string; // e.g. "10,000-run" or "deterministic" — computed by the caller from the artifact
  /** The strongest-lean result summary (MlbSimulationResultSummary) — already honest + tested. */
  resultSummary: React.ReactNode;
  /** True when the game has de-vigged team markets (the market snapshot is shown in the runner dashboard above). */
  hasTeamMarkets: boolean;
  playerProps: PublicProjection[];
  /** The old dense report + spotlight + legacy tabs, demoted into a collapsed block. */
  advanced?: React.ReactNode;
}

const MLB_MARKET_ORDER = ["Strikeouts", "Total bases", "Hits", "Hits + Runs + RBIs", "Home runs"];

export default function MlbSimulationReportV2(props: MlbSimulationReportV2Props) {
  const { home, away, homeCode, awayCode, date, isPreviousSlate, runLabel, resultSummary, hasTeamMarkets, playerProps, advanced } = props;

  const byMarket = new Map<string, PublicProjection[]>();
  for (const p of playerProps) {
    const k = p.marketLabel || "Other";
    if (!byMarket.has(k)) byMarket.set(k, []);
    byMarket.get(k)!.push(p);
  }
  const orderedMarkets = [...byMarket.keys()].sort((a, b) => {
    const ia = MLB_MARKET_ORDER.indexOf(a), ib = MLB_MARKET_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const pct = (p: number | null | undefined) => (typeof p === "number" ? `${(p * 100).toFixed(0)}%` : "—");

  return (
    <div className="flex flex-col gap-3">
      {/* 1 — Match header */}
      <section className="rounded-[16px] px-4 sm:px-6 py-5 flex flex-col gap-3" style={{ background: "rgba(26,16,11,0.6)", border: "1px solid var(--vault-border-strong)", borderTop: "2px solid var(--vault-gold)" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Monogram code={awayCode} name={away} />
            <div className="flex flex-col">
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>{away} <span style={{ color: "var(--vault-text-faint)", fontWeight: 500 }}>@</span> {home}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>MLB · {date}</span>
            </div>
            <Monogram code={homeCode} name={home} />
          </div>
          <div className="flex items-center gap-2">
            {isPreviousSlate ? (
              <span className="font-mono uppercase tracking-[0.1em] rounded-full px-2.5 py-1" style={{ fontSize: 9, color: "var(--vault-warn)", background: "rgba(234,88,12,0.10)", border: "1px solid rgba(234,88,12,0.35)" }}>Previous slate · {date}</span>
            ) : null}
            <span className="font-mono uppercase tracking-[0.1em] rounded-full px-3 py-1.5" style={{ fontSize: 9.5, color: "var(--vault-gold)", background: "rgba(217,164,65,0.10)", border: "1px solid rgba(217,164,65,0.35)" }}>{runLabel} · player-prop sim</span>
          </div>
        </div>
      </section>

      {/* 2 — Simulation result (the real 10k player-prop output) */}
      {resultSummary}

      {/* 3 — Market snapshot (de-vigged full-game lines) — shown in the dashboard above; pointer here to keep
             the report honest without duplicating the panel. */}
      <Section n={3} title="Market snapshot" subtitle="Full-game lines · de-vigged · market-anchored" tone="muted">
        <p className="text-[12.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          {hasTeamMarkets
            ? <>Moneyline, run line, and total are shown in the market snapshot in the dashboard above — the de-vigged sportsbook prices, <strong>market-anchored, not an independent game simulation</strong>.</>
            : <>No de-vigged team markets for this game yet — provider needed.</>}
        </p>
      </Section>

      {/* 4 — Full-game simulation (internal, validating — no numbers) */}
      <Section n={4} title="Full-game simulation" subtitle="Win probability · projected runs" tone="muted">
        <div className="rounded-[10px] px-4 py-4 flex flex-col gap-1.5" style={{ background: "rgba(15,10,7,0.5)", border: "1px dashed var(--vault-border-strong)" }}>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Full-game model · validating</span>
          <p className="text-[13px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
            The 10k simulation above is a <strong>player-prop</strong> simulation — it does not produce a game
            score, win probability, or total-runs distribution. An internal full-game model exists but is still
            validating and is not public, so no projected score or win probability is shown here. Full-game
            markets are the de-vigged lines in the market snapshot above.
          </p>
        </div>
      </Section>

      {/* 5 — Player props grid */}
      <Section n={5} title="Player props" subtitle={`Fixture-specific · ${playerProps.length} props`}>
        {playerProps.length > 0 ? (
          <div className="flex flex-col gap-3">
            {orderedMarkets.map((market) => (
              <div key={market} className="flex flex-col gap-1.5">
                <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>{market}</span>
                <div className="flex flex-col">
                  {byMarket.get(market)!.slice(0, 6).map((p, i) => (
                    <div key={p.id || `${market}-${i}`} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--vault-border)" }}>
                      <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>
                        {p.player?.name ?? "—"}
                        {p.player?.team ? <span style={{ color: "var(--vault-text-faint)", fontWeight: 400 }}> · {p.player.team}</span> : null}
                      </span>
                      <span className="font-mono shrink-0 flex items-center gap-2.5" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                        <span>{p.pickLabel}</span>
                        {typeof p.modelProbability === "number" ? <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(p.modelProbability)}</span> : null}
                        {p.bookmaker ? <span style={{ color: "var(--vault-text-faint)" }}>{p.bookmaker}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>No fixture-specific player props for this game yet.</p>}
      </Section>

      {/* 6 — Coming soon */}
      <Section n={6} title="Coming soon" subtitle="Not ingested for this game" tone="muted">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ["Team totals", "odds + settlement needed"],
            ["First 5 innings (F5)", "odds needed"],
            ["Alternate lines", "odds needed"],
            ["Pitcher markets settlement", "join needed"],
            ["Projected score / win prob", "full-game model validating"],
          ].map(([label, why]) => (
            <div key={label} className="rounded-[8px] px-3 py-2 flex flex-col gap-0.5" style={{ background: "rgba(15,10,7,0.4)", border: "1px solid var(--vault-border)" }}>
              <span style={{ color: "var(--vault-text-mute)", fontSize: 12, fontWeight: 600 }}>{label}</span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{why}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 7 — Methodology */}
      <Section n={7} title="Methodology" subtitle="How to read this" tone="muted">
        <p className="font-mono text-[10.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
          {runLabel} player-prop Monte Carlo simulation. Full-game markets (moneyline / run line / total) are the
          de-vigged sportsbook lines — market-anchored, not an independent game simulation. No projected score,
          total-runs, or margin distribution is generated for MLB. Paper-only, educational — not betting advice.
        </p>
      </Section>

      {/* Demoted: old dense report + spotlight + legacy tabs */}
      {advanced ? <AdvancedDisclosure label="Full report &amp; advanced detail">{advanced}</AdvancedDisclosure> : null}
    </div>
  );
}
