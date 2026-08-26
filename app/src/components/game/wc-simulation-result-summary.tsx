/**
 * WorldCupSimulationResultSummary — the above-the-fold "simulation result" (probability center) for a World
 * Cup game report. Built ONLY from the real market-implied wcGameCenter probabilities (de-vigged 90-minute
 * prices): a 3-way win/draw/win bar, the most-likely market result, and total / BTTS / double-chance / DNB
 * snapshots — framed as a simulation result, not an odds table.
 *
 * Honest by construction:
 *   • Source is MARKET-IMPLIED (de-vigged sportsbook prices), NOT an independent soccer model, NO xG, NO
 *     projected scoreline. 90-minute regulation only (extra time / penalties excluded).
 *   • Small / no edges are EXPECTED for a market-implied read — "no strong edge = the market is efficient",
 *     a valid no-play signal, not a broken simulation.
 * Pure/presentational. No fabrication.
 */

interface ThreeWay { home: number; draw: number; away: number; topResult?: string }
interface OverUnder { line?: number | null; over?: number | null; under?: number | null; lean?: string | null }
interface Btts { yes?: number | null; no?: number | null; lean?: string | null }
interface DoubleChance { homeOrDraw?: number | null; awayOrDraw?: number | null; homeOrAway?: number | null }
interface DrawNoBet { home?: number | null; away?: number | null }

export interface WcSimulationResultSummaryProps {
  home: string;
  away: string;
  threeWay: ThreeWay | null;
  total: OverUnder | null;
  btts: Btts | null;
  doubleChance: DoubleChance | null;
  drawNoBet: DrawNoBet | null;
  propCount: number;
}

const pct = (p: number | null | undefined) => (typeof p === "number" ? `${(p * 100).toFixed(0)}%` : "—");

function Snap({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[8px] px-3 py-2 flex flex-col gap-0.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{label}</span>
      <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>{value}</span>
      {sub ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{sub}</span> : null}
    </div>
  );
}

export default function WorldCupSimulationResultSummary({ home, away, threeWay, total, btts, doubleChance, drawNoBet, propCount }: WcSimulationResultSummaryProps) {
  const tw = threeWay;
  const top = tw ? (tw.home >= tw.draw && tw.home >= tw.away ? { label: home, p: tw.home } : tw.away >= tw.draw ? { label: away, p: tw.away } : { label: "Draw", p: tw.draw }) : null;
  // "Strong edge" only when the top outcome is meaningfully clear of a coin-flip; else it's a no-play read.
  const efficient = !top || top.p < 0.45;

  return (
    <section aria-label="Simulation result" className="rounded-[14px] px-4 sm:px-5 py-4 flex flex-col gap-3" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-border-strong)", borderTop: "2px solid var(--vault-gold-bright)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>Simulation result</h2>
        <span className="font-mono uppercase tracking-[0.1em] rounded-full px-2.5 py-1" style={{ fontSize: 9, color: "var(--vault-gold)", background: "color-mix(in srgb, var(--vault-pending) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-pending) 35%, transparent)" }}>Market-implied · 90′</span>
      </div>

      {/* 3-way probability bar */}
      {tw ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex h-7 w-full overflow-hidden rounded-[6px]" style={{ border: "1px solid var(--vault-border)" }}>
            <div style={{ width: `${tw.home * 100}%`, background: "color-mix(in srgb, var(--vault-accent) 55%, transparent)" }} className="flex items-center justify-center" title={`${home} ${pct(tw.home)}`}><span className="font-mono" style={{ fontSize: 9.5, color: "var(--vault-wash-base)", fontWeight: 700 }}>{pct(tw.home)}</span></div>
            <div style={{ width: `${tw.draw * 100}%`, background: "rgba(180,180,190,0.35)" }} className="flex items-center justify-center" title={`Draw ${pct(tw.draw)}`}><span className="font-mono" style={{ fontSize: 9.5, color: "var(--vault-text)", fontWeight: 700 }}>{pct(tw.draw)}</span></div>
            <div style={{ width: `${tw.away * 100}%`, background: "color-mix(in srgb, var(--vault-crown) 50%, transparent)" }} className="flex items-center justify-center" title={`${away} ${pct(tw.away)}`}><span className="font-mono" style={{ fontSize: 9.5, color: "var(--vault-on-accent-deep)", fontWeight: 700 }}>{pct(tw.away)}</span></div>
          </div>
          <div className="flex justify-between font-mono" style={{ fontSize: 10, color: "var(--vault-text-mute)" }}>
            <span>{home} win</span><span>Draw</span><span>{away} win</span>
          </div>
          <p className="text-[12.5px] m-0" style={{ color: "var(--vault-text)" }}>
            Most likely 90′ result: <strong>{top?.label} ({pct(top?.p)})</strong>.{" "}
            {efficient ? <span style={{ color: "var(--vault-text-mute)" }}>No strong edge — the market is efficient here, a valid no-play read, not a broken simulation.</span> : null}
          </p>
        </div>
      ) : null}

      {/* Market snapshots */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {total ? <Snap label={`Total ${total.line ?? ""}`} value={`Over ${pct(total.over)}`} sub={`Under ${pct(total.under)}`} /> : null}
        {btts ? <Snap label="Both teams score" value={`Yes ${pct(btts.yes)}`} sub={`No ${pct(btts.no)}`} /> : null}
        {doubleChance ? <Snap label="Double chance" value={`1X ${pct(doubleChance.homeOrDraw)}`} sub={`X2 ${pct(doubleChance.awayOrDraw)}`} /> : null}
        {drawNoBet ? <Snap label="Draw no bet" value={`${home} ${pct(drawNoBet.home)}`} sub={`${away} ${pct(drawNoBet.away)}`} /> : null}
      </div>

      <p className="font-mono text-[10px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
        A market-implied 90-minute simulation from de-vigged sportsbook prices — NOT an independent soccer model,
        no xG, no projected scoreline. Extra time and penalties are excluded. {propCount > 0 ? `${propCount} provider-backed player props below (settlement pending).` : ""} Paper-only, educational.
      </p>
    </section>
  );
}
