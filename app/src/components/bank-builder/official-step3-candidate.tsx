/**
 * OfficialStep3Candidate — the official Bank Builder Step-3 World Cup candidate at the lowered
 * $1,400–$1,500+ target. PENDING result: it is shown as the official candidate but the ladder
 * bankroll/ledger are NOT mutated until the games settle. Real data only; clear paper-only caveats.
 *
 * Visual: elevated gold card with a World Cup identity orb, a per-leg flag matchup (real ISO
 * codes from teams.json), market tags (90′ regulation / double chance), and a subtle entrance.
 * Flags are decorative; an unknown country degrades to a monogram via FlagBadge. No fabrication.
 */
import { formatAmerican } from "@/lib/odds-math";
import { getSportIdentity } from "@/lib/sport-identity";
import FlagBadge from "@/components/flag-badge";
import type { OfficialStep3Candidate, OfficialStep3Leg } from "@/lib/world-cup-flex";

const WC = getSportIdentity("world_cup");

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Mini-fixture flag matchup for a leg, from the real match teams. */
function LegMatchup({ leg }: { leg: OfficialStep3Leg }) {
  if (!leg.homeTeam && !leg.awayTeam) return null;
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" aria-label={`${leg.homeTeam} versus ${leg.awayTeam}`}>
      <FlagBadge code={leg.homeCode || leg.homeTeam.slice(0, 2)} fallback={leg.homeTeam.slice(0, 2).toUpperCase()} size="sm" ariaLabel={leg.homeTeam} />
      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>v</span>
      <FlagBadge code={leg.awayCode || leg.awayTeam.slice(0, 2)} fallback={leg.awayTeam.slice(0, 2).toUpperCase()} size="sm" ariaLabel={leg.awayTeam} />
    </span>
  );
}

export default function OfficialStep3CandidateCard({ candidate, stepNumber = 3 }: { candidate: OfficialStep3Candidate; stepNumber?: number }) {
  const c = candidate;
  return (
    <section
      className="gtp-fade-up mt-5 overflow-hidden rounded-2xl"
      style={{ border: "1px solid rgba(240,199,94,0.45)", background: "rgba(240,199,94,0.05)", boxShadow: "var(--vault-shadow-elevated)" }}
      aria-label={`Official Bank Builder Step ${stepNumber} candidate`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid rgba(240,199,94,0.30)", background: "rgba(240,199,94,0.09)" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="gtp-sport-orb shrink-0"
            style={{ width: 32, height: 32, fontSize: 17, ["--orb-grad" as string]: WC.gradient }}
            role="img"
            aria-label={WC.ballLabel}
          >
            {WC.icon}
          </span>
          <div className="flex flex-col min-w-0">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] truncate" style={{ color: "var(--vault-gold-bright)" }}>
              Official Step {stepNumber} candidate
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
              FIFA World Cup · paper ladder
            </span>
          </div>
        </div>
        <span className="gtp-active-glow rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: "rgba(240,199,94,0.18)", color: "var(--vault-gold-bright)" }}>
          Pending result
        </span>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {/* Top-line economics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Paper stake", value: usd(c.stake) },
            { label: "Combined odds", value: formatAmerican(c.combinedAmericanOdds) },
            { label: "Projected return", value: usd(c.projectedReturn), accent: "var(--vault-success)" },
            { label: "Projected profit", value: `+${usd(c.projectedProfit)}` },
          ].map((s) => (
            <div key={s.label} className="rounded-[8px] px-3 py-2" style={{ background: "rgba(7,11,26,0.45)", border: "1px solid var(--vault-rule)" }}>
              <div className="font-display tabular" style={{ color: s.accent ?? "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{s.value}</div>
              <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          Target this step: {usd(c.targetMin)}–{usd(c.targetPreferred)}+ · stake fixed at {usd(c.stake)} · combined model probability {Math.round(c.combinedModelProbability * 100)}%
        </p>

        {/* Legs */}
        <div className="flex flex-col gap-1.5">
          {c.legs.map((l, i) => (
            <div key={i} className="rounded-[8px] px-3.5 py-2.5" style={{ background: "rgba(7,11,26,0.45)", border: "1px solid var(--vault-rule)" }}>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <LegMatchup leg={l} />
                  <span className="font-semibold truncate" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{l.label}</span>
                </div>
                <span className="font-mono tabular shrink-0" style={{ color: "var(--vault-text)", fontSize: 13 }}>{formatAmerican(l.americanOdds)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ background: "rgba(240,199,94,0.10)", color: "var(--vault-gold-bright)", border: "1px solid var(--vault-rule)" }}>
                  {l.marketLabel}
                </span>
                {l.regulationOnly && (
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ background: "rgba(7,11,26,0.6)", color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>
                    90′ regulation
                  </span>
                )}
                <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
                  {l.gameLabel}{l.bookmaker ? ` · ${l.bookmaker}` : ""} · model {Math.round(l.modelProbability * 100)}% · market {Math.round(l.marketProbability * 100)}% · edge {l.edgePct >= 0 ? "+" : ""}{l.edgePct.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Caveats — honest, paper-only */}
        <ul className="flex flex-col gap-1">
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Two legs from different matches — no same-game correlation. Both legs are model-supported and market-supported favorites.
          </li>
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Combined model probability is {Math.round(c.combinedModelProbability * 100)}% — a two-leg parlay is closer to a coin flip than either single leg. Outcomes are uncertain.
          </li>
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Paper-only Bank Builder review. 90-minute regulation only (Draw is a real outcome). The ladder bankroll only changes after the matches settle from official results.
          </li>
        </ul>
      </div>
    </section>
  );
}
