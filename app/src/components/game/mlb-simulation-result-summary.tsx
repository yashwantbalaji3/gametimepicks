/**
 * MlbSimulationResultSummary — the above-the-fold "simulation result" for an MLB game report. Built ONLY
 * from the real 10,000-run artifact (`game-simulations/<date>.json`): the strongest player-prop leans
 * (model vs market probability + edge + confidence) and the plain-English recap. Honest about scope:
 *
 *   • The 10k sim is a PLAYER-PROP simulation. Its per-prop distributions are real (shown below in the
 *     advanced report). It does NOT produce a full-game score, a total-runs/margin distribution, or a
 *     scoreline — those are not generated for MLB (see the artifact's unavailableModules), so this summary
 *     never invents them.
 *   • Full-game markets (moneyline / run line / total) are the de-vigged sportsbook lines shown in the
 *     Market Snapshot below — MARKET-ANCHORED, not an independent game simulation. This summary points at
 *     them rather than restating them as a "simulated" win probability.
 *
 * Pure/presentational. No fabrication.
 */

const MARKET_LABEL: Record<string, string> = {
  batter_total_bases: "Total bases",
  batter_hits: "Hits",
  batter_hits_runs_rbis: "Hits + Runs + RBIs",
  batter_home_runs: "Home runs",
  pitcher_strikeouts: "Strikeouts",
};

export interface SummaryPick {
  player?: string;
  market: string;
  side: string;
  line: number | null;
  projection?: number | null;
  modelProbability?: number | null;
  marketProbability?: number | null;
  edgePct?: number | null;
  confidence?: number | null;
  riskTier?: string | null;
}

export interface MlbSimulationResultSummaryProps {
  headline: string | null;
  picks: readonly SummaryPick[];
  runCount: number | null;
  allowsRunCountClaim: boolean;
  isPreviousSlate: boolean;
  slateDate: string;
}

const pct = (p: number | null | undefined) => (typeof p === "number" ? `${(p * 100).toFixed(0)}%` : "—");

function LeanRow({ p, lead }: { p: SummaryPick; lead?: boolean }) {
  const label = MARKET_LABEL[p.market] ?? p.market.replace(/_/g, " ");
  return (
    <div className="flex flex-col gap-1 py-2" style={{ borderTop: lead ? "none" : "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span style={{ color: "var(--vault-text)", fontSize: lead ? 14 : 12.5, fontWeight: lead ? 700 : 600 }}>
          {p.player ?? "—"} · {label} {p.side}{p.line != null ? ` ${p.line}` : ""}
        </span>
        {typeof p.edgePct === "number" ? (
          <span className="font-mono shrink-0" style={{ color: "var(--vault-gold-bright)", fontSize: lead ? 13 : 11, fontWeight: 700 }}>
            +{p.edgePct.toFixed(1)} pt gap
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
        <span>model <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(p.modelProbability)}</span> vs market {pct(p.marketProbability)}</span>
        {typeof p.confidence === "number" ? <span>confidence {pct(p.confidence)}</span> : null}
        {p.riskTier ? <span style={{ color: "var(--vault-text-faint)" }}>{p.riskTier}</span> : null}
      </div>
    </div>
  );
}

export default function MlbSimulationResultSummary({ headline, picks, runCount, allowsRunCountClaim, isPreviousSlate, slateDate }: MlbSimulationResultSummaryProps) {
  const ranked = [...picks].filter((p) => typeof p.edgePct === "number").sort((a, b) => (b.edgePct ?? 0) - (a.edgePct ?? 0));
  const top = ranked.slice(0, 3);
  const runLabel = allowsRunCountClaim && runCount != null && runCount > 0 ? `${runCount.toLocaleString()}-run` : "deterministic";

  return (
    <section aria-label="Simulation result" className="rounded-[14px] px-4 sm:px-5 py-4 flex flex-col gap-3" style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border-strong)", borderTop: "2px solid var(--vault-gold-bright)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>Simulation result</h2>
        {isPreviousSlate ? (
          <span className="font-mono uppercase tracking-[0.1em] rounded-full px-2.5 py-1" style={{ fontSize: 9, color: "var(--vault-warn)", background: "rgba(234,88,12,0.10)", border: "1px solid rgba(234,88,12,0.35)" }}>
            Previous slate · {slateDate}
          </span>
        ) : null}
      </div>

      {headline ? <p className="text-[12.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>{headline}</p> : null}

      {top.length > 0 ? (
        <div className="flex flex-col">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Strongest simulated player-prop leans</span>
          {top.map((p, i) => <LeanRow key={`${p.player}-${p.market}-${p.line}`} p={p} lead={i === 0} />)}
        </div>
      ) : (
        <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>No qualifying model-vs-market gap in this game — the market is efficient, which is a disciplined read, not a broken report.</p>
      )}

      <p className="font-mono text-[10px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
        {runLabel} player-prop simulation ({picks.length} markets). Full-game markets (moneyline / run line /
        total) below are the de-vigged sportsbook lines — market-anchored, not an independent game simulation.
        No projected score, total-runs or margin distribution is generated for MLB. Paper-only, educational.
      </p>
    </section>
  );
}
