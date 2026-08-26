/**
 * WcParlayCard — a suggested World Cup paper parlay built ONLY from real model projections.
 * Shows the legs, combined odds, default paper stake → projected paper return, and the
 * correlation/data caveats. 90-minute regulation only. Educational / paper, not betting advice.
 */
import type { WcParlayCard as Card } from "@/lib/world-cup/projections";
import { fmtAmerican } from "@/lib/world-cup/projections";

const TIER_ACCENT: Record<string, string> = {
  Low: "var(--vault-success)",
  Medium: "var(--vault-gold-bright)",
  High: "var(--vault-warn)",
  Longshot: "var(--vault-text-mute)",
};

export default function WcParlayCard({ card }: { card: Card }) {
  const accent = TIER_ACCENT[card.riskTier] ?? "var(--vault-text)";
  return (
    <article
      className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px] shrink-0"
          style={{ color: accent, border: `1px solid ${accent}`, fontSize: 10 }}
        >
          {card.riskTier} · {card.legCount} legs
        </span>
        <span className="font-display tabular shrink-0" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 700 }}>
          {fmtAmerican(card.combinedAmericanOdds)}
        </span>
      </div>

      <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
        {card.title}
      </span>

      {/* Legs */}
      <div className="flex flex-col gap-1.5">
        {card.legs.map((l, i) => (
          <div
            key={i}
            className="rounded-[6px] px-3 py-2 flex flex-col gap-0.5"
            style={{ background: "color-mix(in srgb, var(--vault-ink-black) 30%, transparent)", border: "1px solid var(--vault-rule)" }}
          >
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>
                {l.pick}
              </span>
              <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                {fmtAmerican(l.americanOdds)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                {l.match}
              </span>
              <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                model {Math.round(l.modelProbability * 100)}% · +{l.edgePct.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Stake → projected return (paper) */}
      <div
        className="flex items-center justify-between gap-2 pt-2"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <span className="font-mono uppercase tracking-[0.10em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          Paper ${card.defaultStake} →
        </span>
        <span className="font-display tabular" style={{ color: accent, fontSize: 15, fontWeight: 700 }}>
          ${card.projectedReturn.toFixed(2)}
        </span>
      </div>

      {/* Why + caveats */}
      {card.whyThisCard.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {card.whyThisCard.map((w, i) => (
            <li key={i} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: "var(--vault-text-mute)" }}>
              <span aria-hidden style={{ color: accent }}>·</span>
              <span className="min-w-0">{w}</span>
            </li>
          ))}
        </ul>
      )}
      <p style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.4 }}>
        {card.correlationNotes.join(" · ")}. 90-minute regulation only. Educational / paper — not betting advice.
      </p>
    </article>
  );
}
