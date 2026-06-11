/**
 * NbaFinalsCardsSection — renders the EXPLICIT NBA Finals Same-Game Cards mode.
 *
 * These are single-game cards (every leg from tonight's one NBA game), tiered by
 * combined odds — a separate, clearly-labeled surface from the global multi-game
 * Suggested Parlays. Each card carries a "Single-game card" badge + correlation
 * note so users understand the legs are more connected than a multi-game parlay.
 * Nothing is fabricated: legs are real model leans, odds are real book prices,
 * combined odds are the exact product of the per-leg decimals.
 */
import type { FinalsCard, FinalsTier } from "@/lib/nba-finals-cards";
import { FINALS_TIER_ORDER, fmtAmerican } from "@/lib/nba-finals-cards";
import PlayerAvatar from "./player-avatar";

const TIER_META: Record<FinalsTier, { label: string; accent: string; blurb: string }> = {
  low: { label: "Low", accent: "var(--risk-low)", blurb: "Shorter combined odds" },
  medium: { label: "Medium", accent: "var(--risk-medium)", blurb: "Balanced combined odds" },
  high: { label: "High", accent: "var(--risk-high)", blurb: "Longer combined odds" },
  longshot: { label: "Longshot", accent: "var(--risk-longshot)", blurb: "Longest combined odds" },
};

const SAMPLE_STAKE = 10;

export default function NbaFinalsCardsSection({
  cards,
}: {
  cards: Record<FinalsTier, FinalsCard[]> | null;
}) {
  if (!cards) return null;
  const total = FINALS_TIER_ORDER.reduce((n, t) => n + cards[t].length, 0);
  if (total === 0) return null;

  return (
    <section className="mt-6" aria-label="NBA Finals same-game cards">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <h2
          className="font-display tracking-tight"
          style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 700 }}
        >
          NBA Finals · Same-Game Cards
        </h2>
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
          style={{ color: "var(--sport-nba)", border: "1px solid var(--vault-rule)", fontSize: 10 }}
        >
          {total} cards
        </span>
      </div>
      <p
        className="text-[12.5px] leading-snug mb-3"
        style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}
      >
        NBA Finals is a single-game slate, so these are same-game cards. We label them
        separately because same-game legs are more connected than multi-game cards — the
        risk tier here is driven by combined odds, not leg count.
      </p>

      {/* Count strip */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FINALS_TIER_ORDER.map((t) => (
          <span
            key={t}
            className="font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded-[4px]"
            style={{
              color: cards[t].length > 0 ? TIER_META[t].accent : "var(--vault-text-faint)",
              border: `1px solid ${cards[t].length > 0 ? TIER_META[t].accent : "var(--vault-rule)"}`,
              fontSize: 10,
            }}
          >
            {TIER_META[t].label} {cards[t].length}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {FINALS_TIER_ORDER.map((tier) =>
          cards[tier].length > 0 ? (
            <div key={tier}>
              <div className="flex items-baseline gap-2 mb-2">
                <span
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{ color: TIER_META[tier].accent, fontSize: 11 }}
                >
                  {TIER_META[tier].label} Risk
                </span>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
                  {TIER_META[tier].blurb}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {cards[tier].map((c) => (
                  <FinalsCardView key={c.cardId} card={c} accent={TIER_META[tier].accent} />
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

function FinalsCardView({ card, accent }: { card: FinalsCard; accent: string }) {
  const payout = Math.round(SAMPLE_STAKE * card.combinedDecimal);
  return (
    <div
      className="rounded-[10px] p-3.5 flex flex-col gap-3"
      style={{ background: "rgba(7,11,26,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
          style={{ color: accent, border: `1px solid ${accent}`, fontSize: 10 }}
        >
          {card.legs.length}-leg · single-game
        </span>
        <span
          className="font-display tabular"
          style={{ color: "var(--vault-gold-bright)", fontSize: 18, fontWeight: 700 }}
        >
          {fmtAmerican(card.combinedAmerican)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {card.legs.map((l, i) => {
          const isOver = (l.side || "").toLowerCase().startsWith("o");
          return (
            <div key={i} className="flex items-center gap-2.5 min-w-0">
              <PlayerAvatar
                playerId={l.playerId ?? null}
                playerName={l.playerName}
                team={l.team ?? undefined}
                sport="nba"
                size="sm"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className="font-display truncate"
                  style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}
                >
                  {l.playerName}
                </span>
                <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                  {(l.marketLabel || l.market)} {l.side}{" "}
                  {l.line != null ? l.line.toFixed(1) : "—"}
                </span>
              </div>
              <span
                className="font-mono shrink-0"
                style={{ color: isOver ? "var(--vault-success)" : "var(--vault-warn)", fontSize: 11 }}
              >
                {l.oddsForSide != null ? fmtAmerican(l.oddsForSide) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          ${SAMPLE_STAKE} paper → ${payout} ({card.combinedDecimal.toFixed(2)}×)
        </span>
        {card.volatileLegCount > 0 ? (
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            Higher-variance leg
          </span>
        ) : null}
      </div>

      <p style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.35 }}>
        {card.correlationNote}
      </p>
    </div>
  );
}
