/**
 * MlbSimulationReportV2 — the clean, SimTheGame-style MLB game report (V2.5), using the SAME shell as soccer
 * V2 but with MLB's honest data. Twelve explicit sections, above-and-beyond but never overclaiming:
 *
 *   1  Matchup header + status
 *   2  Simulation coverage summary (what ran for THIS game)
 *   3  10,000-run player-prop simulation result (strongest leans)
 *   4  Best player-prop watchlist (top model-vs-market gaps — a watchlist, not a bet)
 *   5  Model probability vs market probability (the read, aggregated)
 *   6  Risk & correlation notes (risk tiers + same-game correlation)
 *   7  Settlement support (deterministic official box-score settlement)
 *   8  Market snapshot for team markets (de-vigged, MARKET-ANCHORED)
 *   9  Full-game model status — INTERNAL, VALIDATING (no numbers)
 *   10 Why no projected score or win probability is shown
 *   11 Bank Builder / Moonshot eligibility notes
 *   12 Methodology & data freshness
 *   → then the old accordions, collapsed at the very bottom.
 *
 * Honesty: the 10k sim is a PLAYER-PROP sim (no game score). Full-game markets are the de-vigged sportsbook
 * lines — market-anchored, NOT an independent game simulation. No internal full-game numbers, no projected
 * score / win probability / run distribution, and no best-bet / lock / EV / edge / market-beating language.
 * "Model lead" = the model's probability minus the market's implied probability (a display-only gap). Paper-only.
 */
import type { PublicProjection } from "@/lib/normalize";
import type { SimGeneratedPick } from "@/lib/game-simulations/types";
import type { MlbGameCenter } from "@/lib/mlb-team-markets";
import { Section, StatTile, Monogram, AdvancedDisclosure } from "@/components/game/report-v2-shell";

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
  /** The raw 10k generated picks — powers the coverage / watchlist / correlation / eligibility sections. */
  picks?: SimGeneratedPick[];
  /** Raw team-market snapshot (for a compact summary line). */
  gameCenter?: MlbGameCenter | null;
  runCount?: number | null;
  allowsRunCountClaim?: boolean;
  modelVersion?: string | null;
  generatedAt?: string | null;
  /** The old dense report + spotlight + legacy tabs, demoted into a collapsed block. */
  advanced?: React.ReactNode;
}

const MLB_MARKET_ORDER = ["Strikeouts", "Total bases", "Hits", "Hits + Runs + RBIs", "Home runs"];

/** Human label for an MLB sim market key. */
const MARKET_LABEL: Record<string, string> = {
  pitcher_strikeouts: "Strikeouts",
  batter_hits: "Hits",
  batter_total_bases: "Total bases",
  batter_hits_runs_rbis: "Hits + Runs + RBIs",
  batter_home_runs: "Home runs",
  batter_runs_scored: "Runs",
  batter_rbis: "RBIs",
  batter_singles: "Singles",
  batter_doubles: "Doubles",
  batter_stolen_bases: "Stolen bases",
};
const marketLabel = (m: string) => MARKET_LABEL[m] ?? m.replace(/^batter_|^pitcher_/, "").replace(/_/g, " ");

/** Player-prop markets that settle DETERMINISTICALLY from the official MLB Stats API box score. */
const DETERMINISTIC_SETTLE = new Set(Object.keys(MARKET_LABEL));

const RISK_TONE: Record<string, string> = {
  anchor: "var(--vault-success)",
  core: "var(--vault-gold)",
  value: "var(--vault-gold-bright)",
  longshot: "var(--gtp-bank-heat)",
};

export default function MlbSimulationReportV2(props: MlbSimulationReportV2Props) {
  const {
    home, away, homeCode, awayCode, date, isPreviousSlate, runLabel, resultSummary, hasTeamMarkets,
    playerProps, advanced, picks = [], gameCenter = null, runCount = null, allowsRunCountClaim = false,
    modelVersion = null, generatedAt = null,
  } = props;

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
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const sideLine = (p: SimGeneratedPick) => [cap(p.side), p.line != null ? String(p.line) : ""].filter(Boolean).join(" ");

  // ── Derived, honest coverage from the real generated picks (no fabrication) ──
  const simMarkets = [...new Set(picks.map((p) => marketLabel(p.market)))];
  // A pick is a product CANDIDATE when the model's probability is above the market's (positive model-vs-market
  // gap) AND the market settles deterministically from the official box score. This is a candidacy signal for
  // the paper products — NOT a placed bet and NOT a promise of profit.
  const eligible = picks.filter((p) => p.edgePct > 0 && DETERMINISTIC_SETTLE.has(p.market) && p.riskTier !== "longshot");
  const watchlist = [...picks].filter((p) => p.edgePct > 0).sort((a, b) => b.edgePct - a.edgePct).slice(0, 5);
  const avgGap = picks.length ? picks.reduce((s, p) => s + p.edgePct, 0) / picks.length : 0;
  const aboveMarket = picks.filter((p) => p.edgePct > 0).length;
  const runsPill = allowsRunCountClaim && runCount ? `${runCount.toLocaleString()}-run` : runLabel;

  return (
    <div className="flex flex-col gap-3">
      {/* 1 — Matchup header + status */}
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono uppercase tracking-[0.1em] rounded-full px-2.5 py-1" style={{ fontSize: 9, color: isPreviousSlate ? "var(--vault-warn)" : "var(--gtp-success-on-dark, #7ee2a8)", background: isPreviousSlate ? "rgba(234,88,12,0.10)" : "rgba(46,160,102,0.12)", border: `1px solid ${isPreviousSlate ? "rgba(234,88,12,0.35)" : "rgba(46,160,102,0.4)"}` }}>
              {isPreviousSlate ? `Previous slate · ${date}` : "Pregame"}
            </span>
            <span className="font-mono uppercase tracking-[0.1em] rounded-full px-3 py-1.5" style={{ fontSize: 9.5, color: "var(--vault-gold)", background: "rgba(217,164,65,0.10)", border: "1px solid rgba(217,164,65,0.35)" }}>{runLabel} · player-prop sim</span>
          </div>
        </div>
      </section>

      {/* 2 — Simulation coverage summary (what actually ran for THIS game) */}
      <Section n={2} title="Simulation coverage" subtitle="What this report covers — and what it does not">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatTile label="Player-prop sim" value={runsPill} sub="Monte Carlo" />
          <StatTile label="Markets simulated" value={String(simMarkets.length)} sub={simMarkets.slice(0, 3).join(" · ") || "—"} />
          <StatTile label="Picks generated" value={String(picks.length)} sub={`${aboveMarket} above market`} />
          <StatTile label="Product-eligible" value={String(eligible.length)} sub="deterministic settle" />
          <StatTile label="Team markets" value={hasTeamMarkets ? "Snapshot" : "Not posted"} sub={hasTeamMarkets ? "market-implied" : "provider needed"} />
          <StatTile label="Full-game score" value="Not simulated" sub="model validating" />
        </div>
        <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          This game ran a <strong>{runsPill}</strong> player-prop Monte Carlo across {simMarkets.length} market{simMarkets.length === 1 ? "" : "s"}.
          Team markets are a <strong>market-implied snapshot</strong> (below); the full-game score is <strong>not simulated</strong> here (the internal full-game model is still validating).
        </p>
      </Section>

      {/* 3 — 10,000-run simulation result (the real player-prop output) */}
      <div className="flex items-baseline gap-2.5 px-1">
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>03</span>
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{runsPill} player-prop simulation result</span>
      </div>
      {resultSummary}

      {/* 4 — Best player-prop watchlist (top model-vs-market gaps — a watchlist, never a bet) */}
      <Section n={4} title="Player-prop watchlist" subtitle="Biggest model-vs-market gaps · not a bet">
        {watchlist.length > 0 ? (
          <div className="flex flex-col">
            {watchlist.map((p, i) => (
              <div key={p.id || i} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--vault-border)" }}>
                <div className="min-w-0 flex-1 flex flex-col">
                  <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{p.player ?? p.team ?? "—"}</span>
                  <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{marketLabel(p.market)} · {sideLine(p)}</span>
                </div>
                <span className="font-mono shrink-0 flex items-center gap-2" style={{ fontSize: 11 }}>
                  <span style={{ color: "var(--vault-text-mute)" }}>Model <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(p.modelProbability)}</span></span>
                  <span style={{ color: "var(--vault-text-faint)" }}>vs Mkt {pct(p.marketProbability)}</span>
                  <span className="rounded-full px-1.5 py-0.5" style={{ color: "var(--vault-gold)", background: "rgba(217,164,65,0.10)", border: "1px solid rgba(217,164,65,0.25)", fontSize: 9.5 }}>+{p.edgePct.toFixed(0)} pt lead</span>
                  <span className="rounded-full px-1.5 py-0.5 uppercase" style={{ color: RISK_TONE[p.riskTier] ?? "var(--vault-text-mute)", fontSize: 8.5, border: `1px solid ${RISK_TONE[p.riskTier] ?? "var(--vault-rule)"}` }}>{p.riskTier}</span>
                </span>
              </div>
            ))}
            <p className="mt-2 font-mono text-[9.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
              A watchlist of the strongest model-vs-market gaps — for research, not a recommendation. Paper-only.
            </p>
          </div>
        ) : <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>No positive model-vs-market gaps in this game's simulation.</p>}
      </Section>

      {/* 5 — Model probability vs market probability (aggregated read) */}
      <Section n={5} title="Model vs market" subtitle="How the simulation reads against the book" tone="muted">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Picks above market" value={`${aboveMarket}/${picks.length}`} sub="model prob > market" />
          <StatTile label="Avg model lead" value={`${avgGap >= 0 ? "+" : ""}${avgGap.toFixed(1)} pt`} sub="mean model − market" />
          <StatTile label="Strongest gap" value={watchlist[0] ? `+${watchlist[0].edgePct.toFixed(0)} pt` : "—"} sub={watchlist[0] ? (watchlist[0].player ?? "—") : "—"} />
        </div>
        <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          Each pick's model probability comes from the {runsPill} simulation; the market probability is the de-vigged
          book price for the same outcome. A positive gap means the model reads the outcome as more likely than the
          market implies — a research signal only, never a promise of profit.
        </p>
      </Section>

      {/* 6 — Risk & correlation notes */}
      <Section n={6} title="Risk & correlation" subtitle="Tiers + why same-game legs are not independent" tone="muted">
        <div className="flex flex-wrap gap-1.5 mb-1">
          {(["anchor", "core", "value", "longshot"] as const).map((t) => (
            <span key={t} className="font-mono uppercase rounded-full px-2 py-0.5" style={{ fontSize: 8.5, color: RISK_TONE[t], border: `1px solid ${RISK_TONE[t]}` }}>{t}</span>
          ))}
        </div>
        <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          Every pick above is from <strong>this game</strong>, so the legs share game-state correlation — a starter's
          strikeouts and the opposing lineup's hits move together, weather and pace touch every prop. <strong>Never treat
          two picks from the same game as independent.</strong> The Bank Builder and Moonshot paper products deliberately
          combine legs from <strong>different games</strong> to keep the parlay legs independent.
        </p>
      </Section>

      {/* 7 — Settlement support (deterministic, official) */}
      <Section n={7} title="Settlement support" subtitle="How every pick here settles">
        <div className="flex flex-wrap gap-1.5 mb-1">
          {simMarkets.map((m) => (
            <span key={m} className="font-mono rounded-full px-2 py-0.5" style={{ fontSize: 9.5, color: "var(--vault-success)", background: "rgba(46,160,102,0.10)", border: "1px solid rgba(46,160,102,0.3)" }}>{m} ✓</span>
          ))}
        </div>
        <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          Every player-prop market in this report settles <strong>deterministically from the official MLB Stats API box
          score</strong> — strikeouts, hits, total bases, and the rest are read straight from the final box score with no
          human judgment. Team markets settle from the official final score and run line. That is why these markets can
          back a paper product: the result is unambiguous.
        </p>
      </Section>

      {/* 8 — Market snapshot for team markets (de-vigged, market-anchored) */}
      <Section n={8} title="Market snapshot" subtitle="Full-game lines · de-vigged · market-anchored" tone="muted">
        {hasTeamMarkets && gameCenter ? (
          <div className="grid grid-cols-3 gap-2 mb-1">
            <StatTile label="Moneyline" value={gameCenter.moneyline ? `${pct(gameCenter.moneyline.homeWinProb)} / ${pct(gameCenter.moneyline.awayWinProb)}` : "—"} sub={gameCenter.moneyline ? `${home} / ${away}` : "not posted"} />
            <StatTile label="Total" value={gameCenter.total ? String(gameCenter.total.line) : "—"} sub={gameCenter.total ? `O ${pct(gameCenter.total.overProb)}` : "not posted"} />
            <StatTile label="Run line" value={gameCenter.runLine ? String(gameCenter.runLine.line) : "—"} sub={gameCenter.runLine ? gameCenter.runLine.favorite : "not posted"} />
          </div>
        ) : null}
        <p className="text-[12.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          {hasTeamMarkets
            ? <>Moneyline, run line, and total are the de-vigged sportsbook prices (full panel in the dashboard above) — <strong>market-anchored, not an independent game simulation</strong>.</>
            : <>No de-vigged team markets for this game yet — provider needed.</>}
        </p>
      </Section>

      {/* 9 — Full-game model status (internal, validating — no numbers) */}
      <Section n={9} title="Full-game simulation" subtitle="Win probability · projected runs" tone="muted">
        <div className="rounded-[10px] px-4 py-4 flex flex-col gap-1.5" style={{ background: "rgba(15,10,7,0.5)", border: "1px dashed var(--vault-border-strong)" }}>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Full-game model · validating</span>
          <p className="text-[13px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
            The 10k simulation above is a <strong>player-prop</strong> simulation — it does not produce a game score,
            win probability, or total-runs distribution. An internal full-game model exists but is still validating and
            is not public, so no projected score or win probability is shown here. Full-game markets are the de-vigged
            lines in the market snapshot above.
          </p>
        </div>
      </Section>

      {/* 10 — Why no projected score or win probability is shown */}
      <Section n={10} title="No projected score or win probability" subtitle="Why this report withholds it" tone="muted">
        <ul className="flex flex-col gap-1.5 m-0 pl-4 text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          <li>The public simulation is a <strong>player-prop</strong> engine — it never computes a final score or a win probability.</li>
          <li>The internal full-game model is <strong>still validating</strong> and has not cleared out-of-sample validation, so we do not publish its numbers.</li>
          <li>We show a market-implied team snapshot as context, clearly labelled market-anchored — not a projected score and not a total-runs distribution.</li>
          <li>When a full-game model clears out-of-sample validation, it will appear here with its evidence — not before.</li>
        </ul>
      </Section>

      {/* 11 — Bank Builder / Moonshot eligibility notes */}
      <Section n={11} title="Bank Builder & Moonshot eligibility" subtitle="Which picks can feed the paper products">
        <div className="grid grid-cols-2 gap-2 mb-1">
          <StatTile label="Product-eligible" value={`${eligible.length}/${picks.length}`} sub="this game" />
          <StatTile label="Exposure" value="$0.00" sub="review / paper mode" />
        </div>
        <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          A pick becomes a <strong>candidate</strong> for the Bank Builder / Moonshot paper products when the model's
          probability is above the market's implied probability <strong>and</strong> the market settles deterministically
          from the official box score. {eligible.length > 0
            ? <>{eligible.length} of this game's {picks.length} picks meet that bar.</>
            : <>None of this game's picks meet that bar right now.</>} Being a candidate is <strong>not</strong> a placed
          bet — the products run in review/paper mode at $0 exposure, and legs are combined <strong>across different
          games</strong> to stay independent. No World Cup legs, no settlement-pending props.
        </p>
      </Section>

      {/* 12 — Methodology & data freshness */}
      <Section n={12} title="Methodology" subtitle="How to read this + data freshness" tone="muted">
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="font-mono rounded-full px-2 py-0.5" style={{ fontSize: 9, color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>slate {date}</span>
          {modelVersion ? <span className="font-mono rounded-full px-2 py-0.5" style={{ fontSize: 9, color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>model {modelVersion}</span> : null}
          {generatedAt ? <span className="font-mono rounded-full px-2 py-0.5" style={{ fontSize: 9, color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>generated {generatedAt.slice(0, 10)}</span> : null}
          {isPreviousSlate ? <span className="font-mono rounded-full px-2 py-0.5" style={{ fontSize: 9, color: "var(--vault-warn)", border: "1px solid rgba(234,88,12,0.35)" }}>previous slate</span> : null}
        </div>
        <p className="font-mono text-[10.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
          {runLabel} player-prop Monte Carlo simulation. Full-game markets (moneyline / run line / total) are the
          de-vigged sportsbook lines — market-anchored, not an independent game simulation. No projected score,
          total-runs, or margin distribution is generated for MLB. Paper-only, educational — not betting advice.
        </p>
      </Section>

      {/* Player-prop inventory (fixture-specific, grouped by market) — kept below the numbered read. */}
      <Section n={13} title="Player props" subtitle={`Fixture-specific · ${playerProps.length} props`} tone="muted">
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

      {/* Demoted: old dense report + spotlight + legacy tabs */}
      {advanced ? <AdvancedDisclosure label="Full report &amp; advanced detail">{advanced}</AdvancedDisclosure> : null}
    </div>
  );
}
