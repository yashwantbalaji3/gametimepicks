/**
 * ResultsMarketBenchmark (Program 058) — the market comparison /results was missing. Hit rate alone is
 * technically silent and practically misleading (the Sprint 054 lesson): a 50% hit rate means nothing
 * without the sportsbook baseline on identical rows. This strip renders the canonical terminal-summary
 * numbers through the typed contract adapter — NO rate arithmetic happens here (Sprint 051 rule).
 */
import type { TerminalView } from "@/lib/research/public-contract-adapter";

const f4 = (x: number) => x.toFixed(4);

export default function ResultsMarketBenchmark({ terminal }: { terminal: TerminalView }) {
  if (!terminal.available || !terminal.calibration || !terminal.modelUniverse) return null;
  const cal = terminal.calibration;
  const mu = terminal.modelUniverse;
  return (
    <section
      aria-label="Model vs market benchmark"
      className="rounded-[10px] px-4 py-3 flex flex-col gap-2"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>
          The benchmark that matters: model vs sportsbook market
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          identical settled rows · de-vigged · Brier (lower is better)
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="font-display" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>{f4(cal.rawBrier)}</div>
          <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>raw model</div>
        </div>
        <div>
          <div className="font-display" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>{f4(cal.calibratedBrier)}</div>
          <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>calibrated model</div>
        </div>
        <div>
          <div className="font-display" style={{ color: "var(--vault-gold)", fontSize: 16, fontWeight: 700 }}>{f4(cal.marketBrier)}</div>
          <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>market (de-vigged)</div>
        </div>
      </div>
      <p className="m-0 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {cal.stillBehindMarket
          ? "The sportsbook market remains the better probability on the settled record. Every hit-rate figure below should be read against that baseline — a projection clearing 50% is not the same as out-predicting the market."
          : "Read every hit-rate figure below against this market baseline on identical rows."}
        {mu.overconfidencePp != null
          ? ` The raw model has averaged ${mu.overconfidencePp.toFixed(1)}pp more confidence than the settled outcomes justified.`
          : ""}
      </p>
    </section>
  );
}
