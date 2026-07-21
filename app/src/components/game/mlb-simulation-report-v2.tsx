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
import type { ProductTag } from "@/lib/game-detail-product-tags";
import { productTagFor } from "@/lib/game-detail-product-tags";
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
  /** The raw 10k generated picks — powers the board / watchlist / agreement / eligibility sections. */
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
      <span className="font-mono uppercase rounded-full px-1.5 py-0.5" style={{ fontSize: 8, color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)" }}>
        Watchlist only
      </span>
    );
  }
  const tone = tag.product === "moonshot" ? "#b9a8ff" : "var(--vault-gold-bright)";
  return (
    <span className="font-mono uppercase rounded-full px-1.5 py-0.5" style={{ fontSize: 8, color: tone, border: `1px solid ${tone}`, background: "rgba(255,255,255,0.04)" }} title="Paper · review · $0 exposure">
      {tag.label} · paper $0
    </span>
  );
}

export default function MlbSimulationReportV2(props: MlbSimulationReportV2Props) {
  const {
    home, away, homeCode, awayCode, date, isPreviousSlate, runLabel, resultSummary, hasTeamMarkets,
    playerProps, advanced, picks = [], distributions = null, gameCenter = null, marketSnapshotNode = null,
    productTags, runCount = null, allowsRunCountClaim = false, modelVersion = null, generatedAt = null,
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
    <div className="flex flex-col gap-3">
      {/* Report mini-nav — sticky-ish index; horizontal scroll on mobile. Anchors to the sections below. */}
      <nav aria-label="Report sections" className="flex gap-1.5 overflow-x-auto rounded-[12px] px-2 py-1.5" style={{ background: "rgba(15,10,7,0.6)", border: "1px solid var(--vault-border)" }}>
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
            <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>Player board · market agreement · product eligibility</span>
          </div>
          <div className="rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
            <span className="font-mono uppercase tracking-[0.1em] block" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>What is not shown</span>
            <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>Projected score / win probability — full-game model still validating</span>
          </div>
        </div>
      </section>

      {/* 2 — Simulation coverage */}
      <Section n={2} title="Simulation coverage" subtitle="What this report covers — and what it does not">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatTile label="Player-prop sim" value={runsPill} sub="Monte Carlo" />
          <StatTile label="Markets simulated" value={String(simMarkets.length)} sub={simMarkets.slice(0, 3).join(" · ") || "—"} />
          <StatTile label="Picks generated" value={String(picks.length)} sub={`${aboveMarket} above market`} />
          <StatTile label="Product-eligible" value={String(eligible.length)} sub="deterministic settle" />
          <StatTile label="Team markets" value={hasTeamMarkets ? "Snapshot" : "Not posted"} sub={hasTeamMarkets ? "market-implied" : "provider needed"} />
          <StatTile label="Full-game score" value="Not simulated" sub="model validating" />
        </div>
      </Section>

      {/* 3 — Simulation result (the real 10k player-prop output) */}
      <div className="flex items-baseline gap-2.5 px-1">
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>03</span>
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{runsPill} player-prop simulation result</span>
      </div>
      {resultSummary}

      {/* 4 — Player simulation board (SimTheGame-style box-score grid) */}
      <Section n={4} title="Player simulation board" subtitle="Every simulated player line · model vs market · product tag">
        <div id="mlbr-player-board" />
        {boardPicks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ fontSize: 11.5 }}>
              <thead>
                <tr style={{ color: "var(--vault-text-faint)" }}>
                  {["Player", "Market", "Line", "Proj", "Model", "Market", "Gap", "Risk", "Product"].map((h, i) => (
                    <th key={h} className="font-mono uppercase tracking-[0.06em] py-1.5 px-1.5" style={{ fontSize: 8.5, textAlign: i <= 1 || i === 8 ? "left" : "right", borderBottom: "1px solid var(--vault-border)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boardPicks.map((p, i) => {
                  const tag = tagFor(p);
                  return (
                    <tr key={p.id || i} style={{ borderBottom: "1px solid var(--vault-rule)" }}>
                      <td className="py-1.5 px-1.5" style={{ color: "var(--vault-text)", fontWeight: 600, whiteSpace: "nowrap" }}>{p.player ?? p.team ?? "—"}</td>
                      <td className="py-1.5 px-1.5 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10, whiteSpace: "nowrap" }}>{marketLabel(p.market)} {cap(p.side)} {p.line ?? ""}</td>
                      <td className="py-1.5 px-1.5 font-mono tabular text-right" style={{ color: "var(--vault-text-faint)" }}>{num1(p.projection)}</td>
                      <td className="py-1.5 px-1.5 font-mono tabular text-right" style={{ color: "var(--vault-text)", fontWeight: 700 }}>{pct(p.modelProbability)}</td>
                      <td className="py-1.5 px-1.5 font-mono tabular text-right" style={{ color: "var(--vault-text-faint)" }}>{pct(p.marketProbability)}</td>
                      <td className="py-1.5 px-1.5 font-mono tabular text-right" style={{ color: p.edgePct > 0 ? "var(--vault-gold)" : "var(--vault-text-faint)" }}>{p.edgePct > 0 ? "+" : ""}{p.edgePct.toFixed(0)}</td>
                      <td className="py-1.5 px-1.5 text-right"><span className="font-mono uppercase" style={{ fontSize: 8, color: RISK_TONE[p.riskTier] ?? "var(--vault-text-mute)" }}>{p.riskTier}</span></td>
                      <td className="py-1.5 px-1.5"><ProductChip tag={tag} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[9.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
              Proj = the model's projected stat (from the artifact) · Model / Market = probabilities to clear the line ·
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
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Agreement" value={`${agreementScore}/100`} sub="closer = higher" />
              <StatTile label="Avg gap" value={`${((meanGap ?? 0) * 100).toFixed(1)} pt`} sub={`${priced.length} priced props`} />
              <StatTile label="Widest gap" value={`${((widestGap ?? 0) * 100).toFixed(0)} pt`} sub="single largest" />
            </div>
            {byMarketGap.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                {byMarketGap.map((r) => (
                  <div key={r.market} className="flex items-center gap-2">
                    <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 10, width: 96 }}>{r.market}</span>
                    <div className="relative flex-1 rounded-full" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
                      <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${Math.min(100, r.mean * 400)}%`, background: "var(--vault-gold-bright)", opacity: 0.75 }} />
                    </div>
                    <span className="font-mono shrink-0 text-right" style={{ color: "var(--vault-text-faint)", fontSize: 9.5, width: 40 }}>{(r.mean * 100).toFixed(0)} pt</span>
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
          <StatTile label="Product-eligible" value={`${eligible.length}/${picks.length}`} sub="this game" />
          <StatTile label="In an active card" value={String(taggedCount)} sub="tagged above" />
          <StatTile label="Exposure" value="$0.00" sub="review / paper" />
        </div>
        <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
          A pick is a <strong>candidate</strong> for the Bank Builder / Moonshot paper products when the model's
          probability is above the market's implied probability <strong>and</strong> the market settles
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
