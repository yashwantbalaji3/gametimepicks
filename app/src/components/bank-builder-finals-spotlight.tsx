/**
 * BankBuilderFeaturedCard — a FEATURED special-event paper card (e.g. NBA Finals
 * same-game) shown on /bank-builder, SETTLED from official box-score data.
 *
 * Honest accounting: this is NOT part of the tracked $100→$3,000 ladder — that
 * rung settles separately on the official MLB Builder pick. This card is featured,
 * paper-only, and its result is graded from the official game box score
 * (`officialResultConfirmed`). Never implies real money.
 */
import type { FeaturedBuilderCard } from "@/lib/data-bank-builder";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtAmerican(o: number | null | undefined): string {
  if (o == null) return "—";
  return o > 0 ? `+${o}` : `${o}`;
}

export default function BankBuilderFeaturedCard({ card }: { card: FeaturedBuilderCard | null }) {
  if (!card) return null;
  const hit = card.result === "win";
  const resultColor = hit ? "var(--vault-success)" : card.result === "loss" ? "var(--vault-warn)" : "var(--vault-text-mute)";
  const resultLabel = hit ? "Card hit" : card.result === "loss" ? "Card missed" : "Settled";

  return (
    <section
      aria-label="Featured NBA Finals paper card"
      className="mt-6 rounded-[10px] p-4 sm:p-5 flex flex-col gap-3"
      style={{
        background: "linear-gradient(180deg, rgba(20,24,35,0.92) 0%, rgba(26, 16, 11,0.62) 100%)",
        border: `1px solid ${hit ? "var(--vault-success)" : "var(--sport-nba, var(--vault-border))"}`,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--sport-nba)", fontSize: 10 }}>
          Featured · {card.event}
        </span>
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
          style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 10 }}
        >
          Paper · not part of the tracked ladder
        </span>
      </div>

      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="font-display" style={{ color: resultColor, fontSize: 22, fontWeight: 800 }}>
          {resultLabel}
        </span>
        {hit ? (
          <span className="font-display tabular" style={{ color: "var(--vault-success)", fontSize: 16, fontWeight: 700 }}>
            {usd(card.stakeDollars)} → {usd(card.settledReturn)} (+{usd(card.profit)} paper)
          </span>
        ) : (
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 13 }}>
            {usd(card.stakeDollars)} paper stake · {fmtAmerican(card.combinedAmerican)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {card.legs.map((l, i) => (
          <div key={i} className="flex items-center justify-between gap-2 min-w-0">
            <span className="font-mono min-w-0 truncate" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>
              {l.player} · {(l.marketLabel || l.market)} {l.side} {l.line != null ? l.line.toFixed(1) : "—"}
              {l.oddsForSide != null ? ` (${fmtAmerican(l.oddsForSide)})` : ""}
            </span>
            <span className="font-mono shrink-0" style={{ fontSize: 11, color: l.result === "win" ? "var(--vault-success)" : l.result === "loss" ? "var(--vault-warn)" : "var(--vault-text-faint)" }}>
              {l.finalStat != null ? `${l.finalStat}` : "—"} · {l.result ?? "—"}
            </span>
          </div>
        ))}
      </div>

      <p style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.4 }}>
        Graded from the official game box score ({card.settlementSource}). Same-game card —
        legs are from one game. Paper only, not betting advice.
        {card.officialResultConfirmed ? " Official result confirmed." : ""}
      </p>
    </section>
  );
}
