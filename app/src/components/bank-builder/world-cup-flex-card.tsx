/**
 * WorldCupFlexCard — a spotlight World Cup leg shown SEPARATELY from the official Bank Builder
 * ladder. It is explicitly NOT the Step-3 candidate and never affects the ladder/ledger/nextPick.
 * Distinct teal-accented styling so it can't be confused with the amber ladder or the dashed $100
 * builder. Paper-only, educational.
 */
import { flexReturn, type WorldCupFlexLeg } from "@/lib/world-cup-flex";
import { formatAmerican } from "@/lib/odds-math";

const MARKET_LABEL: Record<string, string> = {
  double_chance: "Double chance",
  moneyline_90: "Moneyline (90′)",
  match_total_goals: "Total goals",
  match_total_corners: "Total corners",
};

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function WorldCupFlexCard({ leg, exampleStake }: { leg: WorldCupFlexLeg; exampleStake: number }) {
  const { ret, profit } = flexReturn(exampleStake, leg.americanOdds);
  return (
    <section
      className="mt-8 overflow-hidden rounded-2xl"
      style={{ border: "1px solid rgba(45,212,191,0.40)", background: "rgba(13,148,136,0.06)" }}
      aria-label="World Cup Flex Card — separate from the official Bank Builder ladder"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" style={{ borderBottom: "1px solid rgba(45,212,191,0.25)", background: "rgba(13,148,136,0.10)" }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#5eead4" }}>
          World Cup Flex Card
        </h2>
        <span className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: "rgba(45,212,191,0.15)", color: "#5eead4" }}>
          Separate from the official Bank Builder ladder
        </span>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {/* The leg */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{leg.pickLabel}</span>
            <span className="font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
              {leg.gameLabel} · {MARKET_LABEL[leg.market] ?? leg.market}{leg.bookmaker ? ` · ${leg.bookmaker}` : ""}
            </span>
          </div>
          <span className="font-mono tabular text-[16px] font-bold" style={{ color: "var(--vault-text)" }}>{formatAmerican(leg.americanOdds)}</span>
        </div>

        {/* Probabilities + risk */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Model", value: `${Math.round(leg.modelProbability * 100)}%` },
            { label: "Market", value: `${Math.round(leg.marketProbability * 100)}%` },
            { label: "Edge", value: `${leg.edgePct >= 0 ? "+" : ""}${leg.edgePct.toFixed(1)}%` },
            { label: "Risk", value: leg.riskTier },
          ].map((s) => (
            <div key={s.label} className="rounded-[8px] px-3 py-2" style={{ background: "rgba(7,11,26,0.45)", border: "1px solid var(--vault-rule)" }}>
              <div className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{s.value}</div>
              <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Stake example → return (paper, no ledger effect) */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[8px] px-4 py-3" style={{ background: "rgba(7,11,26,0.45)", border: "1px solid var(--vault-rule)" }}>
          <div className="flex flex-col"><span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Stake example</span><span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{usd(exampleStake)}</span></div>
          <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>→</span>
          <div className="flex flex-col"><span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Projected return</span><span className="font-display tabular" style={{ color: "#5eead4", fontSize: 15, fontWeight: 700 }}>{usd(ret)}</span></div>
          <div className="flex flex-col"><span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Projected profit</span><span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>+{usd(profit)}</span></div>
        </div>

        {/* Caveats */}
        <ul className="flex flex-col gap-1">
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · This does not meet the Step-3 {usd(1400)} ladder floor, so the official Bank Builder remains pending.
          </li>
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Paper-only tracking. Not betting advice. 90-minute regulation only (Draw is a real outcome).
          </li>
        </ul>
      </div>
    </section>
  );
}
