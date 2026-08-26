/**
 * SuggestedCard — the shared betslip-style card used everywhere (today / picks / build / sport
 * pages). Renders a normalized PublicSuggestedCard: title, risk tier, sport chips, legs (player
 * photo when present), combined odds, an interactive paper stake/payout, and collapsed caveats.
 * Betslip-first, low text. Paper-only, educational.
 */
import type { PublicSuggestedCard } from "@/lib/normalize";
import { formatAmerican } from "@/lib/odds-math";
import StakePayoutInput from "@/components/ui/stake-payout-input";
import Link from "next/link";
import RiskTierBadge from "@/components/ui/risk-tier-badge";
import { getSportIdentity } from "@/lib/sport-identity";
import PlayerAvatar from "@/components/ui/player-avatar";

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/** Card-level settled chip styling. Pending/unknown renders nothing extra. */
const CARD_RESULT_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  won: { label: "WON", color: "#6EE7A8", bg: "rgba(110,231,168,0.14)" },
  lost: { label: "LOST", color: "#F08A8A", bg: "rgba(240,138,138,0.12)" },
  push: { label: "PUSH", color: "var(--vault-text-mute)", bg: "rgba(255,255,255,0.06)" },
};

/** Per-leg settled glyphs (official grading only — never model opinion). */
const LEG_RESULT_GLYPH: Record<string, { glyph: string; color: string }> = {
  win: { glyph: "✓", color: "#6EE7A8" },
  loss: { glyph: "✗", color: "#F08A8A" },
  push: { glyph: "–", color: "var(--vault-text-mute)" },
};

export default function SuggestedCard({
  card,
  lockedStake,
}: {
  card: PublicSuggestedCard;
  lockedStake?: number | null;
}) {
  return (
    <article
      className="gtp-card-hover rounded-[10px] px-4 py-4 flex flex-col gap-3"
      style={{ background: "rgba(11, 18, 14,0.55)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <RiskTierBadge tier={card.riskTier} prefix={card.sportLabels.join(" + ")} />
        {card.combinedAmericanOdds !== 0 ? (
          <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>
            {formatAmerican(card.combinedAmericanOdds)}
          </span>
        ) : (
          <span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>model</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
          {card.title}
        </span>
        {card.result && CARD_RESULT_CHIP[card.result] ? (
          <span
            className="shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.1em]"
            style={{ color: CARD_RESULT_CHIP[card.result].color, background: CARD_RESULT_CHIP[card.result].bg }}
          >
            {CARD_RESULT_CHIP[card.result].label}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        {card.legs.map((l, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 min-w-0"
            style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}
          >
            {l.photo ? (
              <PlayerAvatar name={l.label} photo={l.photo} size={26} />
            ) : card.cardType === "mixed_sport" ? (
              // Mixed-sport cards: identify each leg's sport at a glance.
              <span
                className="gtp-sport-orb shrink-0"
                style={{ width: 22, height: 22, fontSize: 12, ["--orb-grad" as string]: getSportIdentity(l.sport).gradient }}
                role="img"
                aria-label={getSportIdentity(l.sport).label}
              >
                {getSportIdentity(l.sport).icon}
              </span>
            ) : null}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{l.label}</span>
              {l.sublabel ? (
                <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{l.sublabel}</span>
              ) : null}
            </div>
            {l.americanOdds !== 0 ? (
              <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{formatAmerican(l.americanOdds)}</span>
            ) : null}
            {l.result && LEG_RESULT_GLYPH[l.result] ? (
              <span
                aria-label={`leg ${l.result}`}
                className="font-mono shrink-0 font-bold"
                style={{ color: LEG_RESULT_GLYPH[l.result].color, fontSize: 12 }}
              >
                {LEG_RESULT_GLYPH[l.result].glyph}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {card.result && CARD_RESULT_CHIP[card.result] ? (
        // Settled card — the outcome is final, so no interactive paper-stake calculator.
        <div className="rounded-[8px] px-3 py-2.5" style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            Settled from official results · 90-minute regulation for soccer legs
          </span>
        </div>
      ) : card.combinedAmericanOdds !== 0 ? (
        <StakePayoutInput combinedAmerican={card.combinedAmericanOdds} defaultStake={card.defaultStake} lockedStake={lockedStake} />
      ) : (
        <div className="rounded-[8px] px-3 py-2.5" style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            Model card · no market odds (no paper payout)
          </span>
        </div>
      )}

      {card.whyThisCard && card.whyThisCard.length > 0 ? (
        <p className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
          {card.whyThisCard[0]}
        </p>
      ) : null}

      {card.caveats && card.caveats.length > 0 ? (
        <details>
          <summary className="font-mono uppercase tracking-[0.12em] cursor-pointer" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            Details
          </summary>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {card.caveats.slice(0, 4).map((c, i) => (
              <li key={i} className="text-[10px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>· {c}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {/* P209 · Release F: a card whose legs ALL carry the canonical identity can seed the shared
          draft — the same engine, stake math and conflict rules as a hand-built card. A card whose
          producer does not decompose its legs says so, rather than silently looking customizable.
          Settled cards are results and offer neither. */}
      {!card.result || card.result === "pending" ? (
        card.legs.length > 0 && card.legs.every((l) => l.slipLeg) ? (
          <Link
            href={`/build/custom?card=${encodeURIComponent(card.id)}`}
            className="vault-press inline-flex items-center justify-center rounded-full px-4 no-underline self-start"
            style={{ minHeight: 44, border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", background: "var(--vault-gold-dim)", fontSize: 12.5, fontWeight: 700 }}
          >
            Customize this card →
          </Link>
        ) : (
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.5 }}>
            Browse-and-stake card — its source doesn&rsquo;t carry per-leg builder identity, so it can&rsquo;t seed the custom draft.
          </span>
        )
      ) : null}
    </article>
  );
}

export { initials };
