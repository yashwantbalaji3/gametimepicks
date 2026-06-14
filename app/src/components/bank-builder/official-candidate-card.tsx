/**
 * OfficialCandidateCard — the PUBLISHED official Bank Builder candidate (any step,
 * may mix sports: e.g. one World Cup leg + one MLB leg). PENDING result: the ladder
 * bankroll/ledger are NOT mutated until official settlement. Real data only — flags
 * from real ISO codes, MLB portrait from the official MLB Static CDN via the real
 * playerId, bookmaker badges only from artifact fields.
 */
import { formatAmerican } from "@/lib/odds-math";
import { getSportIdentity } from "@/lib/sport-identity";
import { BANK_BUILDER_STEP_COUNT } from "@/lib/bank-builder-ladder";
import FlagBadge from "@/components/flag-badge";
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import type { OfficialCandidate, OfficialCandidateLeg } from "@/lib/bank-builder-official-candidate";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Player portrait + team logo (NBA/MLB), country flags (World Cup), or a sport orb. */
function LegVisual({ leg }: { leg: OfficialCandidateLeg }) {
  if (leg.sport === "world_cup" && (leg.homeCode || leg.awayCode)) {
    return (
      <span className="inline-flex items-center gap-1.5 shrink-0" aria-label={`${leg.homeTeam} versus ${leg.awayTeam}`}>
        <FlagBadge code={leg.homeCode || (leg.homeTeam ?? "").slice(0, 2)} size="md" ariaLabel={leg.homeTeam} />
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>v</span>
        <FlagBadge code={leg.awayCode || (leg.awayTeam ?? "").slice(0, 2)} size="md" ariaLabel={leg.awayTeam} />
      </span>
    );
  }
  if ((leg.sport === "nba" || leg.sport === "mlb") && leg.playerId != null) {
    const pid = typeof leg.playerId === "string" ? Number(leg.playerId) : leg.playerId;
    return (
      <span className="flex shrink-0 items-center gap-2">
        <PlayerAvatar playerId={pid} playerName={leg.playerName ?? "Player"} team={leg.team} sport={leg.sport} size="md" />
        {leg.team ? <TeamLogo team={leg.team} sport={leg.sport} size="sm" ariaLabel={`${leg.team} logo`} /> : null}
      </span>
    );
  }
  const id = getSportIdentity(leg.sport);
  return (
    <span className="gtp-sport-orb shrink-0" style={{ width: 32, height: 32, fontSize: 16, ["--orb-grad" as string]: id.gradient }} role="img" aria-label={id.ballLabel}>
      {id.icon}
    </span>
  );
}

export default function OfficialCandidateCard({ candidate }: { candidate: OfficialCandidate }) {
  const c = candidate;
  const sportLabels = Array.from(new Set(c.legs.map((l) => getSportIdentity(l.sport).label))).join(" + ");
  const isFinalStep = c.step >= BANK_BUILDER_STEP_COUNT;
  return (
    <section
      className="gtp-fade-up relative mt-5 overflow-hidden rounded-2xl"
      style={{
        border: isFinalStep ? "1px solid var(--lava-border-strong)" : "1px solid rgba(240,199,94,0.45)",
        background: isFinalStep ? "linear-gradient(160deg, rgba(255,106,42,0.10), rgba(240,199,94,0.05) 55%, var(--lava-panel))" : "rgba(240,199,94,0.05)",
        boxShadow: "var(--vault-shadow-elevated)",
      }}
      aria-label={`Official Bank Builder Step ${c.step} candidate`}
    >
      {isFinalStep ? (
        <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-36 w-36 translate-x-10 -translate-y-12 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(10px)", opacity: 0.45 }} />
      ) : null}
      <div
        className="relative flex flex-wrap items-center justify-between gap-2 px-5 py-3.5"
        style={{
          borderBottom: isFinalStep ? "1px solid var(--lava-border-strong)" : "1px solid rgba(240,199,94,0.30)",
          background: isFinalStep ? "rgba(255,106,42,0.10)" : "rgba(240,199,94,0.09)",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex shrink-0 -space-x-1.5">
            {c.legs.map((l, i) => {
              const id = getSportIdentity(l.sport);
              return (
                <span key={i} className="gtp-sport-orb" style={{ width: 30, height: 30, fontSize: 16, ["--orb-grad" as string]: id.gradient, border: "2px solid rgba(12,8,6,0.85)" }} role="img" aria-label={id.ballLabel}>
                  {id.icon}
                </span>
              );
            })}
          </span>
          <div className="flex flex-col min-w-0">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] truncate" style={{ color: isFinalStep ? "var(--gtp-bank-heat)" : "var(--vault-gold-bright)" }}>
              {isFinalStep ? `Final step · Road to $10K` : `Official Step ${c.step} candidate`}
            </h2>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
              Official Step {c.step} candidate · {sportLabels}
            </span>
          </div>
        </div>
        <span className="gtp-active-glow rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: isFinalStep ? "var(--gtp-bank-heat-dim)" : "rgba(240,199,94,0.18)", color: isFinalStep ? "var(--gtp-bank-heat)" : "var(--vault-gold-bright)" }}>
          Pending result
        </span>
      </div>

      <div className="relative px-5 py-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Paper stake", value: usd(c.stake) },
            { label: "Combined odds", value: formatAmerican(c.combinedAmericanOdds) },
            { label: "Projected return", value: usd(c.projectedReturn), accent: "var(--vault-success)" },
            { label: "Projected profit", value: `+${usd(c.projectedProfit)}` },
          ].map((s) => (
            <div key={s.label} className="rounded-[8px] px-3 py-2" style={{ background: "rgba(26, 16, 11,0.45)", border: "1px solid var(--vault-rule)" }}>
              <div className="font-display tabular" style={{ color: s.accent ?? "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{s.value}</div>
              <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          Step target: {usd(c.targetMin)}+ · stake fixed at {usd(c.stake)} · combined model probability {Math.round(c.combinedModelProbability * 100)}%
        </p>

        <div className="flex flex-col gap-2">
          {c.legs.map((l, i) => (
            <div key={i} className="flex items-center gap-3 rounded-[10px] px-3.5 py-3" style={{ background: "rgba(12,8,6,0.55)", border: "1px solid var(--vault-rule)" }}>
              <LegVisual leg={l} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="font-semibold truncate" style={{ color: "var(--vault-text)", fontSize: 14 }}>{l.label}</span>
                  <span className="font-mono tabular shrink-0" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{formatAmerican(l.americanOdds)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: "rgba(240,199,94,0.10)", color: "var(--vault-gold-bright)", border: "1px solid var(--vault-rule)" }}>
                    {l.marketLabel}{l.side ? ` ${l.side} ${l.line ?? ""}` : ""}
                  </span>
                  {l.regulationOnly && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: "rgba(26, 16, 11,0.6)", color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>
                      90′ regulation
                    </span>
                  )}
                  {l.lineupBasis && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: "rgba(26, 16, 11,0.6)", color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>
                      {l.lineupBasis}
                    </span>
                  )}
                  <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
                    {l.gameLabel}{l.bookmaker ? ` · ${l.bookmaker}` : ""} · model {Math.round(l.modelProbability * 100)}% · market {Math.round(l.marketProbability * 100)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <ul className="flex flex-col gap-1">
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · {c.correlationNote ?? "Cross-sport legs from different games — no correlation. Every leg is model-supported and market-supported."}
          </li>
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Combined model probability is {Math.round(c.combinedModelProbability * 100)}% — a two-leg parlay is closer to a coin flip than either single leg. Outcomes are uncertain.
          </li>
          <li className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            · Paper-only Bank Builder review. Each leg settles on its official result (final score / box score). The ladder bankroll only changes after official settlement.
          </li>
        </ul>
      </div>
    </section>
  );
}
