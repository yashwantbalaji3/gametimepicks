/**
 * OfficialCandidateCard — the PUBLISHED official Bank Builder candidate (any step,
 * may mix sports: e.g. one World Cup leg + one MLB leg). PENDING result: the ladder
 * bankroll/ledger are NOT mutated until official settlement. Real data only — flags
 * from real ISO codes, MLB portrait from the official MLB Static CDN via the real
 * playerId, bookmaker badges only from artifact fields.
 */
import { formatAmerican } from "@/lib/odds-math";
import { getSportIdentity } from "@/lib/sport-identity";
import { mlbHeadshotUrl } from "@/lib/player-headshots";
import FlagBadge from "@/components/flag-badge";
import PlayerAvatar from "@/components/ui/player-avatar";
import type { OfficialCandidate, OfficialCandidateLeg } from "@/lib/bank-builder-official-candidate";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LegVisual({ leg }: { leg: OfficialCandidateLeg }) {
  if (leg.sport === "world_cup" && (leg.homeCode || leg.awayCode)) {
    return (
      <span className="inline-flex items-center gap-1.5 shrink-0" aria-label={`${leg.homeTeam} versus ${leg.awayTeam}`}>
        <FlagBadge code={leg.homeCode || (leg.homeTeam ?? "").slice(0, 2)} size="sm" ariaLabel={leg.homeTeam} />
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>v</span>
        <FlagBadge code={leg.awayCode || (leg.awayTeam ?? "").slice(0, 2)} size="sm" ariaLabel={leg.awayTeam} />
      </span>
    );
  }
  if (leg.sport === "mlb" && leg.playerId != null) {
    return <PlayerAvatar name={leg.playerName ?? "Player"} photo={mlbHeadshotUrl(leg.playerId)} size={26} />;
  }
  const id = getSportIdentity(leg.sport);
  return (
    <span className="gtp-sport-orb shrink-0" style={{ width: 24, height: 24, fontSize: 13, ["--orb-grad" as string]: id.gradient }} role="img" aria-label={id.ballLabel}>
      {id.icon}
    </span>
  );
}

export default function OfficialCandidateCard({ candidate }: { candidate: OfficialCandidate }) {
  const c = candidate;
  const sportLabels = Array.from(new Set(c.legs.map((l) => getSportIdentity(l.sport).label))).join(" + ");
  return (
    <section
      className="gtp-fade-up mt-5 overflow-hidden rounded-2xl"
      style={{ border: "1px solid rgba(240,199,94,0.45)", background: "rgba(240,199,94,0.05)", boxShadow: "var(--vault-shadow-elevated)" }}
      aria-label={`Official Bank Builder Step ${c.step} candidate`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid rgba(240,199,94,0.30)", background: "rgba(240,199,94,0.09)" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex shrink-0 -space-x-1.5">
            {c.legs.map((l, i) => {
              const id = getSportIdentity(l.sport);
              return (
                <span key={i} className="gtp-sport-orb" style={{ width: 30, height: 30, fontSize: 16, ["--orb-grad" as string]: id.gradient, border: "2px solid rgba(20,16,4,0.8)" }} role="img" aria-label={id.ballLabel}>
                  {id.icon}
                </span>
              );
            })}
          </span>
          <div className="flex flex-col min-w-0">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] truncate" style={{ color: "var(--vault-gold-bright)" }}>
              Official Step {c.step} candidate
            </h2>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
              {sportLabels} · paper ladder
            </span>
          </div>
        </div>
        <span className="gtp-active-glow rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: "rgba(240,199,94,0.18)", color: "var(--vault-gold-bright)" }}>
          Pending result
        </span>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
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
          Step target: {usd(c.targetMin)}+ · stake fixed at {usd(c.stake)} · combined model probability {Math.round(c.combinedModelProbability * 100)}%
        </p>

        <div className="flex flex-col gap-1.5">
          {c.legs.map((l, i) => (
            <div key={i} className="rounded-[8px] px-3.5 py-2.5" style={{ background: "rgba(7,11,26,0.45)", border: "1px solid var(--vault-rule)" }}>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <LegVisual leg={l} />
                  <span className="font-semibold truncate" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{l.label}</span>
                </div>
                <span className="font-mono tabular shrink-0" style={{ color: "var(--vault-text)", fontSize: 13 }}>{formatAmerican(l.americanOdds)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ background: "rgba(240,199,94,0.10)", color: "var(--vault-gold-bright)", border: "1px solid var(--vault-rule)" }}>
                  {l.marketLabel}{l.side ? ` ${l.side} ${l.line ?? ""}` : ""}
                </span>
                {l.regulationOnly && (
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ background: "rgba(7,11,26,0.6)", color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>
                    90′ regulation
                  </span>
                )}
                {l.lineupBasis && (
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ background: "rgba(7,11,26,0.6)", color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>
                    {l.lineupBasis}
                  </span>
                )}
                <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
                  {l.gameLabel}{l.bookmaker ? ` · ${l.bookmaker}` : ""} · model {Math.round(l.modelProbability * 100)}% · market {Math.round(l.marketProbability * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        <ul className="flex flex-col gap-1">
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Cross-sport legs from different games — no correlation. Every leg is model-supported and market-supported.
          </li>
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Combined model probability is {Math.round(c.combinedModelProbability * 100)}% — a two-leg parlay is closer to a coin flip than either single leg. Outcomes are uncertain.
          </li>
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Paper-only Bank Builder review. Soccer settles on 90-minute regulation (a draw is a real outcome); the MLB leg settles on the official box score. The ladder bankroll only changes after official settlement.
          </li>
        </ul>
      </div>
    </section>
  );
}
