/**
 * SuggestedCard — the shared betslip-style card used everywhere (today / picks / build / sport
 * pages). Renders a normalized PublicSuggestedCard: title, risk tier, sport chips, legs (player
 * photo when present), combined odds, an interactive paper stake/payout, and collapsed caveats.
 * Betslip-first, low text. Paper-only, educational.
 */
import type { PublicSuggestedCard } from "@/lib/normalize";
import { formatAmerican } from "@/lib/odds-math";
import StakePayoutInput from "@/components/ui/stake-payout-input";
import RiskTierBadge from "@/components/ui/risk-tier-badge";

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function SuggestedCard({
  card,
  lockedStake,
}: {
  card: PublicSuggestedCard;
  lockedStake?: number | null;
}) {
  return (
    <article
      className="rounded-[10px] px-4 py-4 flex flex-col gap-3"
      style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <RiskTierBadge tier={card.riskTier} prefix={card.sportLabels.join(" + ")} />
        {card.combinedAmericanOdds !== 0 ? (
          <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>
            {formatAmerican(card.combinedAmericanOdds)}
          </span>
        ) : (
          <span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>model</span>
        )}
      </div>

      <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
        {card.title}
      </span>

      <div className="flex flex-col gap-1.5">
        {card.legs.map((l, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 min-w-0"
            style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}
          >
            {l.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.photo} alt="" width={26} height={26} className="rounded-full shrink-0" style={{ objectFit: "cover", border: "1px solid var(--vault-rule)" }} />
            ) : null}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{l.label}</span>
              {l.sublabel ? (
                <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{l.sublabel}</span>
              ) : null}
            </div>
            {l.americanOdds !== 0 ? (
              <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{formatAmerican(l.americanOdds)}</span>
            ) : null}
          </div>
        ))}
      </div>

      {card.combinedAmericanOdds !== 0 ? (
        <StakePayoutInput combinedAmerican={card.combinedAmericanOdds} defaultStake={card.defaultStake} lockedStake={lockedStake} />
      ) : (
        <div className="rounded-[8px] px-3 py-2.5" style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            Model card · no market odds (no paper payout)
          </span>
        </div>
      )}

      {card.caveats && card.caveats.length > 0 ? (
        <details>
          <summary className="font-mono uppercase tracking-[0.12em] cursor-pointer" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            Details
          </summary>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {card.caveats.slice(0, 4).map((c, i) => (
              <li key={i} className="text-[10px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>· {c}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

export { initials };
