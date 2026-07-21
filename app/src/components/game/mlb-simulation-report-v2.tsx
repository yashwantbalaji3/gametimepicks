/**
 * MlbSimulationReportV2 — the SINGLE primary MLB game report (SimTheGame-style), on the shared V2 shell.
 * This is the whole report: the runner reveals it right after the "Simulation complete" confirmation, and the
 * old dense dashboard is demoted into one collapsed "Advanced simulation detail" block below. Section order:
 *
 *   nav  (Summary · Player board · Agreement · Distributions · Products · Methodology)
 *   1  Matchup header + status
 *   2  Simulation coverage
 *   3  Simulation result (10,000-run leans)
 *   4  Player simulation board (SimTheGame-style box-score grid, product-tagged)
 *   5  Biggest model leads (watchlist)
 *   6  Market agreement (a sanity-check score — NOT calibration)
 *   7  Outcome distributions (PLAYER-PROP bins only — never a full-game score/run/margin distribution)
 *   8  Settlement support (deterministic official box score)
 *   9  Bank Builder / Moonshot eligibility
 *   10 Market snapshot (de-vigged team markets, MARKET-ANCHORED)
 *   11 Full-game model status — INTERNAL, VALIDATING (no numbers) + why no projected score / win probability
 *   12 Methodology & data freshness  →  Advanced simulation detail (collapsed)
 *
 * Honesty: the 10k sim is a PLAYER-PROP sim (no game score). Full-game markets are the de-vigged sportsbook
 * lines — market-anchored, NOT an independent game simulation. No projected score / win probability / run or
 * margin distribution, and no best-bet / lock / EV / edge / market-beating language. "Model lead" / "model gap"
 * = model probability minus market-implied probability (display only). Paper-only, review, $0 exposure.
 */
import type { PublicProjection } from "@/lib/normalize";
import type { SimGeneratedPick, SimDistributions } from "@/lib/game-simulations/types";
import type { MlbGameCenter } from "@/lib/mlb-team-markets";
import type { MlbGameLabView, MlbLeanRow } from "@/lib/game-lab/mlb-report";
import type { ProductTag } from "@/lib/game-detail-product-tags";
import { productTagFor } from "@/lib/game-detail-product-tags";
import { MLB_CALIBRATION_DISCLOSURE, isCalibrationFailed, anyModeledMarketBeatsMarket } from "@/lib/mlb/model-calibration-status";
import { Section, StatTile, Monogram, AdvancedDisclosure } from "@/components/game/report-v2-shell";

export interface MlbSimulationReportV2Props {
  home: string;
  away: string;
  homeCode?: string | null;
  awayCode?: string | null;
  date: string;
  isPreviousSlate: boolean;
  runLabel: string;
  /** The strongest-lean result summary (MlbSimulationResultSummary). */
  resultSummary: React.ReactNode;
  hasTeamMarkets: boolean;
  playerProps: PublicProjection[];
  /** The FULL un-capped board-lean set (all simulated player lines, all 4 modeled markets) — powers the
   *  grouped model board + the by-stat agreement. Null when the board carries no leans for this game. */
  gameLab?: MlbGameLabView | null;
  /** The raw 10k generated picks — powers the watchlist / eligibility sections. */
  picks?: SimGeneratedPick[];
  /** Player-prop outcome distributions (bins) keyed by prop; null when none. */
  distributions?: SimDistributions;
  /** Raw team-market snapshot (compact stats). */
  gameCenter?: MlbGameCenter | null;
  /** The full market-snapshot panel node (MlbGameCenter) — rendered once, in section 10. */
  marketSnapshotNode?: React.ReactNode;
  /** Active-product leg → tag map (Bank Builder Lane A/B, Moonshot). */
  productTags?: Map<string, ProductTag>;
  runCount?: number | null;
  allowsRunCountClaim?: boolean;
  modelVersion?: string | null;
  generatedAt?: string | null;
  /** The old dense dashboard, demoted into a collapsed block. */
  advanced?: React.ReactNode;
}

const MLB_MARKET_ORDER = ["Strikeouts", "Total bases", "Hits", "Hits + Runs + RBIs", "Home runs"];

const MARKET_LABEL: Record<string, string> = {
  pitcher_strikeouts: "Strikeouts",
  batter_total_bases: "Total bases",
  batter_hits: "Hits",
  batter_hits_runs_rbis: "Hits + Runs + RBIs",
  batter_home_runs: "Home runs",
  batter_runs_scored: "Runs",
  batter_rbis: "RBIs",
  batter_singles: "Singles",
  batter_doubles: "Doubles",
  batter_stolen_bases: "Stolen bases",
};
const marketLabel = (m: string) => MARKET_LABEL[m] ?? m.replace(/^batter_|^pitcher_/, "").replace(/_/g, " ");
const DETERMINISTIC_SETTLE = new Set(Object.keys(MARKET_LABEL));

const RISK_TONE: Record<string, string> = {
  anchor: "var(--vault-success)",
  core: "var(--vault-gold)",
  value: "var(--vault-gold-bright)",
  longshot: "var(--gtp-bank-heat)",
};

/** A small product-card tag (Bank Builder Lane A/B / Moonshot) or a "watchlist" chip. */
function ProductChip({ tag }: { tag: ProductTag | null }) {
  if (!tag) {
    return (
      <span className="inline-flex items-center font-mono uppercase tracking-[0.04em] rounded-full px-2 py-0.5" style={{ fontSize: 9, color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", whiteSpace: "nowrap" }}>
        Watchlist
      </span>
    );
  }
  const tone = tag.product === "moonshot" ? "#b9a8ff" : "var(--vault-gold-bright)";
  return (
    <span className="inline-flex items-center gap-1 font-mono uppercase tracking-[0.04em] rounded-full px-2 py-0.5" style={{ fontSize: 9, fontWeight: 700, color: tone, border: `1px solid ${tone}`, background: "color-mix(in srgb, " + (tag.product === "moonshot" ? "#b9a8ff" : "var(--vault-gold-bright)") + " 12%, transparent)", whiteSpace: "nowrap" }} title="Paper · review · $0 exposure — not a placed bet">
      {tag.label}<span style={{ opacity: 0.7, fontWeight: 400 }}>· $0</span>
    </span>
  );
}

/** Board-lean signal → the honest public legend (model lead / aligned / watchlist). We deliberately avoid
 *  "supported / opposed" (reads like betting advice). "Model lead" = model above market; "Watchlist" = model
 *  fades the posted line or the read is high-variance. */
const SIGNAL_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  supported: { label: "Model lead", color: "var(--gtp-success-on-dark, #7ee2a8)", bg: "rgba(46,160,102,0.14)" },
  neutral: { label: "Aligned", color: "var(--vault-text-mute)", bg: "rgba(255,255,255,0.04)" },
  opposed: { label: "Watchlist", color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)" },
};
function SignalCell({ signal }: { signal: string }) {
  const s = SIGNAL_DISPLAY[signal] ?? SIGNAL_DISPLAY.neutral;
  return (
    <span className="inline-flex items-center font-mono uppercase tracking-[0.04em] rounded-full px-1.5 py-0.5" style={{ fontSize: 8.5, color: s.color, background: s.bg, whiteSpace: "nowrap" }}>{s.label}</span>
  );
}
/** Compact key for the model board — what each signal / tag means. */
function SignalLegend() {
  const items: Array<[string, string, string]> = [
    ["Model lead", "model above market", "var(--gtp-success-on-dark, #7ee2a8)"],
    ["Aligned", "model ≈ market", "var(--vault-text-mute)"],
    ["Watchlist", "model fades the line / high variance", "var(--vault-gold-bright)"],
    ["Product card", "used in a paper card ($0)", "var(--vault-gold-bright)"],
    ["Unavailable", "not modeled / provider not ready", "var(--vault-text-faint)"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map(([label, note, color]) => (
        <span key={label} className="inline-flex items-center gap-1 font-mono" style={{ fontSize: 8.5, color: "var(--vault-text-faint)" }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: color, display: "inline-block" }} />
          <span style={{ color: "var(--vault-text-mute)" }}>{label}</span> — {note}
        </span>
      ))}
    </div>
  );
}

export default function MlbSimulationReportV2(props: MlbSimulationReportV2Props) {
  const {
    home, away, homeCode, awayCode, date, isPreviousSlate, runLabel, resultSummary, hasTeamMarkets,
    playerProps, advanced, picks = [], distributions = null, gameCenter = null, marketSnapshotNode = null,
    productTags, runCount = null, allowsRunCountClaim = false, modelVersion = null, generatedAt = null,
    gameLab = null,
  } = props;

  const pct = (p: number | null | undefined) => (typeof p === "number" ? `${(p * 100).toFixed(0)}%` : "—");
  const num1 = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : "—");
  const cap = (s: string) => (s === "over" ? "Over" : s === "under" ? "Under" : s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const tagFor = (p: SimGeneratedPick): ProductTag | null => (productTags ? productTagFor(productTags, p.player, p.market, p.side, p.line) : null);

  // ── Derived, honest reads from the real generated picks (no fabrication) ──
  const simMarkets = [...new Set(picks.map((p) => marketLabel(p.market)))];
  const eligible = picks.filter((p) => p.edgePct > 0 && DETERMINISTIC_SETTLE.has(p.market) && p.riskTier !== "longshot");
  const boardPicks = [...picks].sort((a, b) => b.edgePct - a.edgePct);
  const watchlist = boardPicks.filter((p) => p.edgePct > 0).slice(0, 5);
  const aboveMarket = picks.filter((p) => p.edgePct > 0).length;
  const taggedCount = picks.filter((p) => tagFor(p) !== null).length;
  const runsPill = allowsRunCountClaim && runCount ? `${runCount.toLocaleString()}-run` : runLabel;

  // Market agreement — a sanity check on how close the model sits to the book (NOT calibration, NOT a claim
  // to out-perform the market). Mean + widest |model − market| gap over priced picks, plus a per-market mean.
  const priced = picks.filter((p) => Number.isFinite(p.modelProbability) && Number.isFinite(p.marketProbability));
  const gaps = priced.map((p) => Math.abs(p.modelProbability - p.marketProbability));
  const meanGap = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null;
  const widestGap = gaps.length ? Math.max(...gaps) : null;
  const agreementScore = meanGap != null ? Math.max(0, Math.round(100 - meanGap * 400)) : null; // 0 gap → 100; 25pt gap → 0
  const byMarketGap = (() => {
    const m = new Map<string, number[]>();
    for (const p of priced) {
      const k = marketLabel(p.market);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(Math.abs(p.modelProbability - p.marketProbability));
    }
    return [...m.entries()].map(([k, arr]) => ({ market: k, mean: arr.reduce((s, g) => s + g, 0) / arr.length, count: arr.length })).sort((a, b) => b.mean - a.mean);
  })();

  // ── Full model board (ALL simulated player lines) — the un-capped board leans, not just the ~8/game top
  // picks. Each row is the model's read on the POSTED lean side, product-tagged, grouped by team. No fabrication:
  // every field traces to a real board lean. This is the SimTheGame-style box-score board breadth. ──
  type BoardRow = {
    key: string; player: string; team: string | null; market: string; line: number | null; side: "over" | "under";
    modelProb: number | null; marketProb: number | null; gap: number | null; projection: number | null;
    signal: MlbLeanRow["signal"]; confidence: string | null; tag: ProductTag | null;
  };
  const leanRows: MlbLeanRow[] = gameLab?.rows ?? [];
  const leanSide = (r: MlbLeanRow): "over" | "under" => (String(r.lean).toLowerCase() === "under" ? "under" : "over");
  const toBoardRow = (r: MlbLeanRow): BoardRow => {
    const side = leanSide(r);
    return {
      key: r.id, player: r.playerName, team: r.playerTeamAbbr, market: r.marketKey ?? "", line: r.line, side,
      modelProb: side === "under" ? r.modelProbUnder : r.modelProbOver,
      marketProb: side === "under" ? r.impliedUnder : r.impliedOver,
      gap: r.edgePct, projection: r.projection, signal: r.signal, confidence: r.confidence,
      tag: productTags ? productTagFor(productTags, r.playerName, r.marketKey, side, r.line) : null,
    };
  };
  const allBoardRows = leanRows.map(toBoardRow);
  // Group by team — away team first, then home, biggest |model gap| first within each team.
  const teamOrder = [gameLab?.awayTeamAbbr, gameLab?.homeTeamAbbr].filter(Boolean) as string[];
  const teamGroups = (() => {
    const m = new Map<string, BoardRow[]>();
    for (const r of allBoardRows) { const t = r.team ?? "—"; if (!m.has(t)) m.set(t, []); m.get(t)!.push(r); }
    for (const arr of m.values()) arr.sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));
    const ordered = [...teamOrder.filter((t) => m.has(t)), ...[...m.keys()].filter((t) => !teamOrder.includes(t))];
    return ordered.map((t) => ({ team: t, rows: m.get(t)! }));
  })();
  const modeledMarkets = [...new Set(allBoardRows.map((r) => marketLabel(r.market)))];
  const useLeanBoard = allBoardRows.length > 0;

  // By-STAT market agreement — mean |model − market| per market. Uses the full lean set when present (all 4
  // modeled markets, robust n) and falls back to the priced picks otherwise. Honest sanity check, not calibration.
  const leanStatGap = (() => {
    const m = new Map<string, number[]>();
    for (const r of allBoardRows) {
      if (!Number.isFinite(r.modelProb ?? NaN) || !Number.isFinite(r.marketProb ?? NaN)) continue;
      const k = marketLabel(r.market);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(Math.abs((r.modelProb as number) - (r.marketProb as number)));
    }
    return [...m.entries()].map(([k, a]) => ({ market: k, mean: a.reduce((s, g) => s + g, 0) / a.length, count: a.length })).sort((a, b) => b.mean - a.mean);
  })();
  const statAgreement = leanStatGap.length ? leanStatGap : byMarketGap;

  // Main takeaways (data-driven, no fabrication): the biggest model lead, the most market-aligned stat, and the
  // count of active product legs. Feeds the fast-orientation card at the top of the report.
  const takeawayLead = (() => {
    if (useLeanBoard) {
      const r = [...allBoardRows].filter((x) => (x.gap ?? 0) > 0).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0];
      return r ? { player: r.player, market: marketLabel(r.market), side: r.side, line: r.line, gap: r.gap ?? 0 } : null;
    }
    const p = watchlist[0];
    return p ? { player: p.player ?? p.team ?? "—", market: marketLabel(p.market), side: p.side, line: p.line, gap: p.edgePct } : null;
  })();
  const mostAlignedStat = statAgreement.length ? statAgreement[statAgreement.length - 1].market : null;

  // Player-prop distributions (bins) — keyed by prop; label carries player + market. Player-prop ONLY.
  const distEntries = distributions ? Object.entries(distributions).filter(([, d]) => d && Array.isArray(d.bins) && d.bins.length > 0) : [];

  // Fixture props grouped by market (for the advanced inventory).
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

  const NAV = [
    ["summary", "Summary"], ["player-board", "Player board"], ["agreement", "Agreement"],
    ["distributions", "Distributions"], ["products", "Products"], ["methodology", "Methodology"],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {/* Report mini-nav — sticky index; horizontal scroll on mobile. Anchors to the sections below. */}
      <nav aria-label="Report sections" className="flex gap-1.5 overflow-x-auto rounded-[12px] px-2 py-1.5" style={{ background: "rgba(15,10,7,0.75)", border: "1px solid var(--vault-border)", position: "sticky", top: 0, zIndex: 5, backdropFilter: "blur(6px)" }}>
        {NAV.map(([id, label]) => (
          <a key={id} href={`#mlbr-${id}`} className="shrink-0 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.06em]" style={{ fontSize: 9.5, color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", textDecoration: "none", whiteSpace: "nowrap" }}>
            {label}
          </a>
        ))}
      </nav>

      {/* 1 — Matchup header + status */}
      <section id="mlbr-summary" className="rounded-[16px] px-4 sm:px-6 py-5 flex flex-col gap-3" style={{ background: "rgba(26,16,11,0.6)", border: "1px solid var(--vault-border-strong)", borderTop: "2px solid var(--vault-gold)" }}>
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
        {/* What happened / what to look at / what is not shown — the fast orientation. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-[10px] px-3 py-2" style={{ background: "rgba(46,160,102,0.08)", border: "1px solid rgba(46,160,102,0.25)" }}>
            <span className="font-mono uppercase tracking-[0.1em] block" style={{ color: "var(--gtp-success-on-dark, #7ee2a8)", fontSize: 8.5 }}>What happened</span>
            <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{runsPill} player-prop simulation complete · {picks.length} picks</span>
          </div>
          <div className="rounded-[10px] px-3 py-2" style={{ background: "rgba(217,164,65,0.07)", border: "1px solid rgba(217,164,65,0.22)" }}>
            <span className="font-mono uppercase tracking-[0.1em] block" style={{ color: "var(--vault-gold)", fontSize: 8.5 }}>What to look at</span>
            <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              {takeawayLead
                ? <>Top model lead: <span style={{ color: "var(--vault-text)" }}>{takeawayLead.player}</span> {takeawayLead.market} +{takeawayLead.gap.toFixed(0)} pt{mostAlignedStat ? <> · most aligned: {mostAlignedStat}</> : null}{taggedCount > 0 ? <> · {taggedCount} product leg{taggedCount === 1 ? "" : "s"}</> : null}</>
                : <>Player board · market agreement · product eligibility</>}
            </span>
          </div>
          <div className="rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
            <span className="font-mono uppercase tracking-[0.1em] block" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>What is not shown</span>
            <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>Projected score / win probability — full-game model still validating</span>
          </div>
        </div>
      </section>

      {/* Calibration disclosure — the honest, audit-backed truth about the model probabilities. Prominent + high
          so nobody reads the "model %"/gap below as a proven advantage. Only hidden if a market is ever validated. */}
      {!anyModeledMarketBeatsMarket() ? (
        <div className="rounded-[12px] px-4 py-3 flex items-start gap-2.5" style={{ background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.4)" }}>
          <span aria-hidden style={{ color: "var(--vault-warn)", fontSize: 14, lineHeight: 1.2 }}>⚠</span>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-warn)", fontSize: 9.5 }}>Model calibration notice</span>
            <span className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{MLB_CALIBRATION_DISCLOSURE}</span>
          </div>
        </div>
      ) : null}

      {/* 2 — Simulation coverage */}
      <Section n={2} title="Simulation coverage" subtitle="What this report covers — and what it does not">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatTile label="Player-prop sim" value={runsPill} sub="Monte Carlo" />
          <StatTile label="Markets simulated" value={String(simMarkets.length)} sub={simMarkets.slice(0, 3).join(" · ") || "—"} />
          <StatTile label="Picks generated" value={String(picks.length)} sub={`${aboveMarket} above market`} />
          <StatTile label="Paper candidates" value={String(eligible.length)} sub="not market-proven" />
          <StatTile label="Team markets" value={hasTeamMarkets ? "Snapshot" : "Not posted"} sub={hasTeamMarkets ? "market-implied" : "provider needed"} />
          <StatTile label="Full-game score" value="Not simulated" sub="model validating" />
        </div>
        {useLeanBoard ? (
          <p className="mt-2 font-mono text-[10px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
            Model-predicted markets: <span style={{ color: "var(--vault-text-mute)" }}>{modeledMarkets.join(" · ") || "—"}</span>.
            The book also posts Home runs · RBIs · Runs · Pitcher outs · Earned runs for some players — the model does not price those yet
            (<span style={{ color: "var(--vault-text-mute)" }}>market context only</span>, not simulated, not product-eligible). See the coverage audit for why.
          </p>
        ) : null}
      </Section>

      {/* 3 — Simulation result (the real 10k player-prop output) */}
      <div className="flex items-baseline gap-2.5 px-1">
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>03</span>
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{runsPill} player-prop simulation result</span>
      </div>
      {resultSummary}

      {/* 4 — Player simulation board (SimTheGame-style box-score grid) */}
      <Section n={4} title="Player simulation board" subtitle="Every simulated player line · grouped by team · model vs market · product tag">
        <div id="mlbr-player-board" />
        {useLeanBoard ? (
          <div className="flex flex-col gap-3">
            <SignalLegend />
            <p className="font-mono text-[9.5px] m-0" style={{ color: "var(--vault-text-faint)" }}>
              All {allBoardRows.length} simulated lines across {modeledMarkets.length} market{modeledMarkets.length === 1 ? "" : "s"} ({modeledMarkets.join(" · ")}). Grouped by team, biggest model gap first.
            </p>
            {teamGroups.map((grp) => (
              <div key={grp.team} className="overflow-x-auto -mx-1">
                <div className="flex items-center gap-2 px-1.5 py-1">
                  <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 10, fontWeight: 700 }}>{grp.team}</span>
                  <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{grp.rows.length} line{grp.rows.length === 1 ? "" : "s"}</span>
                </div>
                <table className="w-full border-collapse" style={{ fontSize: 11.5 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr style={{ color: "var(--vault-text-faint)", background: "var(--gtp-card-sunken, rgba(15,10,7,0.96))" }}>
                      {([["Player", "left", true], ["Market", "left", true], ["Proj", "right", false], ["Model %", "right", true], ["Mkt %", "right", false], ["Gap", "right", true], ["Signal", "left", true], ["Product", "left", false]] as Array<[string, "left" | "right", boolean]>).map(([h, align, mobile]) => (
                        <th key={h} className={`font-mono uppercase tracking-[0.06em] py-1.5 px-1.5${mobile ? "" : " hidden sm:table-cell"}`} style={{ fontSize: 8.5, textAlign: align, borderBottom: "1px solid var(--vault-border-strong)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grp.rows.map((r, i) => (
                      <tr key={r.key || i} style={{ borderBottom: "1px solid var(--vault-rule)", background: i % 2 ? "rgba(255,255,255,0.014)" : "transparent" }}>
                        <td className="py-1.5 px-1.5" style={{ color: "var(--vault-text)", fontWeight: 600, whiteSpace: "nowrap" }}>{r.player}</td>
                        <td className="py-1.5 px-1.5 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10, whiteSpace: "nowrap" }}>{marketLabel(r.market)} {cap(r.side)} {r.line ?? ""}</td>
                        <td className="py-1.5 px-1.5 font-mono tabular text-right hidden sm:table-cell" style={{ color: "var(--vault-text-faint)" }}>{num1(r.projection)}</td>
                        <td className="py-1.5 px-1.5 font-mono tabular text-right" style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(r.modelProb)}</td>
                        <td className="py-1.5 px-1.5 font-mono tabular text-right hidden sm:table-cell" style={{ color: "var(--vault-text-faint)" }}>{pct(r.marketProb)}</td>
                        <td className="py-1.5 px-1.5 font-mono tabular text-right" style={{ color: (r.gap ?? 0) > 0 ? "var(--vault-gold)" : "var(--vault-text-faint)", fontWeight: 700 }}>{(r.gap ?? 0) > 0 ? "+" : ""}{r.gap != null ? r.gap.toFixed(0) : "—"}</td>
                        <td className="py-1.5 px-1.5"><SignalCell signal={r.signal} /></td>
                        <td className="py-1.5 px-1.5 hidden sm:table-cell">{r.tag ? <ProductChip tag={r.tag} /> : <span style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <p className="mt-1 font-mono text-[9.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
              Proj = the model&apos;s projected stat · Model % / Mkt % = probability to clear the posted line · Gap = model − market, in points. A research board, not a bet slip. Paper-only.
            </p>
          </div>
        ) : boardPicks.length > 0 ? (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full border-collapse" style={{ fontSize: 11.5 }}>
              {/* Header row is sticky so it stays visible while scanning a long board; low-priority columns
                  (Proj / Mkt % / Risk) collapse away on mobile so Player · Market · Model · Gap · Product read first. */}
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr style={{ color: "var(--vault-text-faint)", background: "var(--gtp-card-sunken, rgba(15,10,7,0.96))" }}>
                  {([
                    ["Player", "left", true], ["Market", "left", true], ["Proj", "right", false],
                    ["Model %", "right", true], ["Mkt %", "right", false], ["Gap", "right", true],
                    ["Risk", "right", false], ["Product", "left", true],
                  ] as Array<[string, "left" | "right", boolean]>).map(([h, align, mobile]) => (
                    <th key={h} className={`font-mono uppercase tracking-[0.06em] py-2 px-1.5${mobile ? "" : " hidden sm:table-cell"}`} style={{ fontSize: 8.5, textAlign: align, borderBottom: "1px solid var(--vault-border-strong)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boardPicks.map((p, i) => {
                  const tag = tagFor(p);
                  return (
                    <tr key={p.id || i} style={{ borderBottom: "1px solid var(--vault-rule)", background: i % 2 ? "rgba(255,255,255,0.014)" : "transparent" }}>
                      <td className="py-2 px-1.5" style={{ color: "var(--vault-text)", fontWeight: 600, whiteSpace: "nowrap" }}>{p.player ?? p.team ?? "—"}</td>
                      <td className="py-2 px-1.5 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10, whiteSpace: "nowrap" }}>{marketLabel(p.market)} {cap(p.side)} {p.line ?? ""}</td>
                      <td className="py-2 px-1.5 font-mono tabular text-right hidden sm:table-cell" style={{ color: "var(--vault-text-faint)" }}>{num1(p.projection)}</td>
                      <td className="py-2 px-1.5 font-mono tabular text-right" style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(p.modelProbability)}</td>
                      <td className="py-2 px-1.5 font-mono tabular text-right hidden sm:table-cell" style={{ color: "var(--vault-text-faint)" }}>{pct(p.marketProbability)}</td>
                      <td className="py-2 px-1.5 font-mono tabular text-right" style={{ color: p.edgePct > 0 ? "var(--vault-gold)" : "var(--vault-text-faint)", fontWeight: 700 }}>{p.edgePct > 0 ? "+" : ""}{p.edgePct.toFixed(0)}</td>
                      <td className="py-2 px-1.5 text-right hidden sm:table-cell"><span className="font-mono uppercase" style={{ fontSize: 8.5, color: RISK_TONE[p.riskTier] ?? "var(--vault-text-mute)" }}>{p.riskTier}</span></td>
                      <td className="py-2 px-1.5"><ProductChip tag={tag} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[9.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
              Proj = the model's projected stat (from the artifact) · Model % / Mkt % = probabilities to clear the line ·
              Gap = model − market, in points. A research board, not a bet slip. Paper-only.
            </p>
          </div>
        ) : <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>No simulated player lines for this game yet.</p>}
      </Section>

      {/* 5 — Biggest model leads (watchlist) */}
      <Section n={5} title="Biggest model leads" subtitle="Largest model-vs-market gaps · a watchlist, not a bet" tone="muted">
        {watchlist.length > 0 ? (
          <div className="flex flex-col">
            {watchlist.map((p, i) => {
              const tag = tagFor(p);
              return (
                <div key={p.id || i} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--vault-border)" }}>
                  <div className="min-w-0 flex-1 flex flex-col">
                    <span className="truncate flex items-center gap-1.5" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{p.player ?? p.team ?? "—"} <ProductChip tag={tag} /></span>
                    <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{marketLabel(p.market)} · {cap(p.side)} {p.line ?? ""}</span>
                  </div>
                  <span className="font-mono shrink-0 flex items-center gap-2" style={{ fontSize: 11 }}>
                    <span style={{ color: "var(--vault-text-mute)" }}>Model <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(p.modelProbability)}</span></span>
                    <span style={{ color: "var(--vault-text-faint)" }}>vs Mkt {pct(p.marketProbability)}</span>
                    <span className="rounded-full px-1.5 py-0.5" style={{ color: "var(--vault-gold)", background: "rgba(217,164,65,0.10)", border: "1px solid rgba(217,164,65,0.25)", fontSize: 9.5 }}>+{p.edgePct.toFixed(0)} pt lead</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>No positive model-vs-market gaps in this game's simulation.</p>}
      </Section>

      {/* 6 — Market agreement (a sanity-check score — NOT calibration, NOT a claim to out-perform the market) */}
      <Section n={6} title="Market agreement" subtitle="How close the simulation sits to the book" tone="muted">
        <div id="mlbr-agreement" />
        {agreementScore != null ? (
          <div className="flex flex-col gap-2.5">
            {/* Agreement score hero — one clean focal number + a bar, with the two gaps as compact context. */}
            <div className="rounded-[12px] px-4 py-3.5 flex items-center gap-4 flex-wrap" style={{ background: "rgba(15,10,7,0.55)", border: "1px solid var(--vault-border)" }}>
              <div className="flex items-baseline gap-1">
                <span className="font-display tabular" style={{ color: "var(--vault-gold-bright)", fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{agreementScore}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 13 }}>/100</span>
              </div>
              <div className="flex-1 min-w-[160px] flex flex-col gap-1.5">
                <div className="relative w-full rounded-full" style={{ height: 8, background: "rgba(255,255,255,0.07)" }}>
                  <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${agreementScore}%`, background: "linear-gradient(90deg, var(--vault-gold), var(--vault-gold-bright))" }} />
                </div>
                <div className="flex items-center justify-between font-mono" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>
                  <span>Avg gap <span style={{ color: "var(--vault-text-mute)" }}>{((meanGap ?? 0) * 100).toFixed(1)} pt</span> · {priced.length} priced</span>
                  <span>Widest <span style={{ color: "var(--vault-text-mute)" }}>{((widestGap ?? 0) * 100).toFixed(0)} pt</span></span>
                </div>
              </div>
            </div>
            {statAgreement.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Agreement by stat · avg model−market gap · n lines</span>
                {statAgreement.map((r) => (
                  <div key={r.market} className="flex items-center gap-2">
                    <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 10, width: 110 }}>{r.market}</span>
                    <div className="relative flex-1 rounded-full" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
                      <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${Math.min(100, r.mean * 400)}%`, background: "var(--vault-gold-bright)", opacity: 0.75 }} />
                    </div>
                    <span className="font-mono shrink-0 text-right" style={{ color: "var(--vault-text-faint)", fontSize: 9.5, width: 66 }}>{(r.mean * 100).toFixed(0)} pt · n{r.count}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
              Higher agreement means the simulation and the book are closer. This is a <strong>sanity check</strong>,
              not a calibration score and not proof of any advantage — large gaps are watchlist items, not automatic plays.
            </p>
          </div>
        ) : <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>No priced props to compare against the book for this game yet.</p>}
      </Section>

      {/* 7 — Outcome distributions (PLAYER-PROP bins only) */}
      <Section n={7} title="Outcome distributions" subtitle="Per-player prop outcome spread · player-prop only" tone="muted">
        <div id="mlbr-distributions" />
        {distEntries.length > 0 ? (
          <div className="flex flex-col gap-3">
            {distEntries.slice(0, 8).map(([key, d]) => {
              const maxP = d.bins.reduce((m, b) => (Number.isFinite(b.probability) ? Math.max(m, b.probability) : m), 0) || 1;
              return (
                <div key={key} className="flex flex-col gap-1.5 rounded-[10px] px-3 py-2.5" style={{ background: "rgba(15,10,7,0.5)", border: "1px solid var(--vault-border)" }}>
                  <span className="text-[12px]" style={{ color: "var(--vault-text)", fontWeight: 600 }}>{d.label}</span>
                  <div className="flex items-end gap-0.5" style={{ height: 42 }}>
                    {d.bins.map((b, i) => (
                      <div key={i} className="flex-1" title={`${b.label}: ${pct(b.probability)}`} style={{ height: Math.max(2, Math.round((b.probability / maxP) * 40)), background: "var(--vault-gold-bright)", opacity: 0.7, borderRadius: 2, minWidth: 2 }} />
                    ))}
                  </div>
                  {d.sampleCount != null ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{d.sampleCount.toLocaleString()} deterministic samples · player-prop outcome, not a game score</span> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text-mute)" }}>
            No outcome-distribution bins for this game's props yet. Distributions appear only when the artifact carries
            real per-prop bins — we never fabricate a spread, and no full-game run / margin distribution is shown.
          </p>
        )}
      </Section>

      {/* 8 — Settlement support (deterministic, official) */}
      <Section n={8} title="Settlement support" subtitle="How every pick here settles">
        <div className="flex flex-wrap gap-1.5 mb-1">
          {simMarkets.map((m) => (
            <span key={m} className="font-mono rounded-full px-2 py-0.5" style={{ fontSize: 9.5, color: "var(--vault-success)", background: "rgba(46,160,102,0.10)", border: "1px solid rgba(46,160,102,0.3)" }}>{m} ✓</span>
          ))}
        </div>
        <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          Every player-prop market in this report settles <strong>deterministically from the official MLB Stats API
          box score</strong> — strikeouts, hits, total bases, and the rest are read straight from the final box score
          with no human judgment. Team markets settle from the official final score and run line.
        </p>
      </Section>

      {/* 9 — Bank Builder / Moonshot eligibility */}
      <Section n={9} title="Bank Builder & Moonshot eligibility" subtitle="Which picks feed the paper products">
        <div id="mlbr-products" />
        <div className="grid grid-cols-3 gap-2 mb-1">
          <StatTile label="Paper candidates" value={`${eligible.length}/${picks.length}`} sub="not market-proven" />
          <StatTile label="In an active card" value={String(taggedCount)} sub="tagged above" />
          <StatTile label="Exposure" value="$0.00" sub="review / paper" />
        </div>
        {/* Calibration flag — honest, audit-backed. The candidate markets did NOT out-predict the market, so a
            "model above market" read is NOT a proven advantage. Only shown while no market passes the gate. */}
        {!anyModeledMarketBeatsMarket() ? (
          <p className="text-[12px] leading-relaxed m-0 mb-1.5 rounded-[8px] px-3 py-2" style={{ color: "var(--vault-text-mute)", background: "rgba(234,88,12,0.07)", border: "1px solid rgba(234,88,12,0.28)" }}>
            <span className="font-mono uppercase tracking-[0.1em] mr-1.5" style={{ color: "var(--vault-warn)", fontSize: 9.5 }}>Calibration flag</span>
            These candidate markets (Strikeouts · Hits · Total bases · H+R+RBI) did <strong>not</strong> out-predict
            the market in the settled-history audit — a &quot;model above market&quot; read is <strong>not</strong> a
            proven advantage (the model is overconfident). Any active Bank Builder / Moonshot leg uses one of these
            markets, so the products run <strong>paper / review / educational only</strong>.
          </p>
        ) : null}
        <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          A pick is a <strong>candidate</strong> for the Bank Builder / Moonshot paper products when the model&apos;s
          probability is above the market&apos;s implied probability <strong>and</strong> the market settles
          deterministically from the official box score. Picks already used in an active card are tagged on the board
          above ({taggedCount > 0 ? `${taggedCount} here` : "none in this game right now"}); the rest are
          watchlist only. Being a candidate is <strong>not</strong> a placed bet — the products run in review/paper
          mode at $0 exposure, legs are combined across different games to stay independent, and there are no World
          Cup legs and no settlement-pending props.
        </p>
      </Section>

      {/* 10 — Market snapshot for team markets (de-vigged, market-anchored) — the ONE market-snapshot block */}
      <Section n={10} title="Market snapshot" subtitle="Full-game lines · de-vigged · market-anchored" tone="muted">
        {hasTeamMarkets && marketSnapshotNode ? (
          <div className="gtp-market-snapshot">{marketSnapshotNode}</div>
        ) : hasTeamMarkets && gameCenter ? (
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Moneyline" value={gameCenter.moneyline ? `${pct(gameCenter.moneyline.homeWinProb)} / ${pct(gameCenter.moneyline.awayWinProb)}` : "—"} sub={gameCenter.moneyline ? `${home} / ${away}` : "not posted"} />
            <StatTile label="Total" value={gameCenter.total ? String(gameCenter.total.line) : "—"} sub={gameCenter.total ? `O ${pct(gameCenter.total.overProb)}` : "not posted"} />
            <StatTile label="Run line" value={gameCenter.runLine ? String(gameCenter.runLine.line) : "—"} sub={gameCenter.runLine ? gameCenter.runLine.favorite : "not posted"} />
          </div>
        ) : (
          <p className="text-[12.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>No de-vigged team markets for this game yet — provider needed.</p>
        )}
        <p className="mt-2 text-[11.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
          Moneyline, run line, and total are the de-vigged sportsbook prices — <strong>market-anchored, not an
          independent game simulation</strong>.
        </p>
      </Section>

      {/* 11 — Full-game model status (validating) + why no projected score / win probability */}
      <Section n={11} title="Full-game simulation" subtitle="Why no projected score or win probability" tone="muted">
        <div className="rounded-[10px] px-4 py-4 flex flex-col gap-1.5 mb-2" style={{ background: "rgba(15,10,7,0.5)", border: "1px dashed var(--vault-border-strong)" }}>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Full-game model · validating</span>
          <p className="text-[13px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
            The 10k simulation above is a <strong>player-prop</strong> simulation — it does not produce a game score,
            win probability, or total-runs distribution. An internal full-game model exists but is still validating
            and is not public, so no projected score or win probability is shown here.
          </p>
        </div>
        <ul className="flex flex-col gap-1 m-0 pl-4 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          <li>The public simulation is a <strong>player-prop</strong> engine — it never computes a final score or a win probability.</li>
          <li>The internal full-game model has <strong>not cleared out-of-sample validation</strong>, so we do not publish its numbers.</li>
          <li>The team snapshot above is market-implied context, clearly labelled — not a projected score and not a run / margin distribution.</li>
        </ul>
      </Section>

      {/* 12 — Methodology & data freshness */}
      <Section n={12} title="Methodology" subtitle="How to read this + data freshness" tone="muted">
        <div id="mlbr-methodology" />
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

        {/* Fixture player-prop inventory (grouped by market) — kept inside methodology, below the numbered read. */}
        {playerProps.length > 0 ? (
          <div className="flex flex-col gap-2.5 mt-3">
            <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Fixture props · {playerProps.length}</span>
            {orderedMarkets.map((market) => (
              <div key={market} className="flex flex-col gap-1">
                <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-gold)", fontSize: 9 }}>{market}</span>
                {byMarket.get(market)!.slice(0, 6).map((p, i) => (
                  <div key={p.id || `${market}-${i}`} className="flex items-center justify-between gap-3 py-1" style={{ borderTop: i === 0 ? "none" : "1px solid var(--vault-border)" }}>
                    <span className="truncate text-[12px]" style={{ color: "var(--vault-text)" }}>{p.player?.name ?? "—"}{p.player?.team ? <span style={{ color: "var(--vault-text-faint)" }}> · {p.player.team}</span> : null}</span>
                    <span className="font-mono shrink-0 flex items-center gap-2" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
                      <span>{p.pickLabel}</span>
                      {typeof p.modelProbability === "number" ? <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(p.modelProbability)}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      {/* Demoted: the old dense dashboard (runner modules) — one collapsed block at the very bottom. */}
      {advanced ? <AdvancedDisclosure label="Advanced simulation detail">{advanced}</AdvancedDisclosure> : null}
    </div>
  );
}
