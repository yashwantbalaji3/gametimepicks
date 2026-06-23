/**
 * DailyPortfolioSection — Mr. Dub's "Today's paper portfolio": the day's four model-built CANDIDATE
 * lanes (Bank Builder A/B + Moonshot A/B) plus a summary stat row.
 *
 * Honest by construction: candidates place NO exposure ($0 placed · not activated) — open exposure,
 * available bankroll, and active bankroll are all unchanged until a separate, gated activation step.
 * Crown is the historical completed ladder and is reported separately, never blended with the active
 * bankroll. Pure presentational; all derivation lives in lib/mr-dub/daily-portfolio.
 *
 * Desktop: a 2×2 grid of lane cards. Mobile: a single column — no horizontal overflow at 375px.
 */
import OddsPill from "@/components/tickets/odds-pill";
import type { DailyPortfolio, DailyPortfolioCard } from "@/lib/mr-dub/daily-portfolio";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatChip({ label, value, accent, faint }: { label: string; value: string; accent?: string; faint?: boolean }) {
  return (
    <div
      className="rounded-[8px] px-3 py-2.5 min-w-0"
      style={{
        background: faint ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.02)",
        border: faint ? "1px dashed var(--vault-rule)" : "1px solid var(--vault-border)",
      }}
    >
      <div className="font-display tabular truncate" style={{ color: accent ?? (faint ? "var(--vault-text-faint)" : "var(--vault-text)"), fontSize: 17, fontWeight: 800 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: DailyPortfolioCard["status"] }) {
  const candidate = status === "candidate";
  const color = candidate ? "var(--vault-gold-bright)" : "var(--vault-text-mute)";
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em]"
      style={{ fontSize: 8.5, color, background: candidate ? "rgba(217,164,65,0.12)" : "rgba(255,255,255,0.05)", border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      {status}
    </span>
  );
}

function LaneCard({ card }: { card: DailyPortfolioCard }) {
  const moonshot = card.product === "moonshot";
  return (
    <div className="rounded-[12px] overflow-hidden flex flex-col" style={{ border: "1px solid var(--vault-rule)", background: "rgba(12,8,6,0.4)", borderLeft: `2px solid ${moonshot ? "#8b7bf0" : "var(--vault-gold-bright)"}` }}>
      <div className="px-3.5 py-3 flex flex-col gap-2" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-semibold truncate" style={{ color: "var(--vault-text)", fontSize: 13 }}>
            {card.productLabel} <span style={{ color: "var(--vault-text-faint)" }}>· Lane {card.lane}</span>
          </span>
          <StatusPill status={card.status} />
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
            {money(card.stake)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> <span style={{ color: "var(--vault-text)" }}>{money(card.potentialReturn)}</span>
          </span>
          <OddsPill odds={card.combinedOdds} size="sm" tone={moonshot ? "violet" : "gold"} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>$0 placed · not activated</span>
          {card.legCount < card.targetLegs ? (
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "#e7b15a", fontSize: 8.5 }}>{card.legCount}/{card.targetLegs} legs</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col flex-1">
        {card.legs.length ? (
          card.legs.map((leg, i) => (
            <div key={i} className="px-3.5 py-2 flex flex-col gap-0.5 min-w-0" style={{ borderTop: i ? "1px solid var(--vault-rule)" : "none" }}>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 11.5, fontWeight: 600 }}>{leg.selection}</span>
                <OddsPill odds={leg.odds} size="sm" tone={moonshot ? "violet" : "gold"} />
              </div>
              <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{leg.matchup} · {leg.marketLabel}</span>
            </div>
          ))
        ) : (
          <div className="px-3.5 py-3">
            <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>No model-qualified legs available</span>
          </div>
        )}
      </div>

      {(card.correlationNote || card.shortfallNote) ? (
        <div className="px-3.5 py-2.5 flex flex-col gap-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
          {card.correlationNote ? (
            <span className="text-[10px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
              <span aria-hidden style={{ color: "#e7b15a" }}>⚠ </span>{card.correlationNote}
            </span>
          ) : null}
          {card.shortfallNote ? (
            <span className="text-[10px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>{card.shortfallNote}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function DailyPortfolioSection({ portfolio }: { portfolio: DailyPortfolio }) {
  return (
    <section className="flex flex-col gap-3 overflow-x-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>Today&rsquo;s paper portfolio</h2>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{portfolio.date}</span>
      </div>

      {/* Summary stat chips — active bankroll + exposure unchanged while candidates; Crown separate. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatChip label="Active bankroll" value={money(portfolio.activeBankroll)} accent="var(--vault-gold-bright)" />
        <StatChip label="Open exposure" value={money(portfolio.openExposure)} />
        <StatChip label="Available" value={money(portfolio.availableBankroll)} />
        <StatChip label="Potential return" value={money(portfolio.potentialReturn)} accent="var(--vault-success)" />
        <StatChip label="Crown (historical)" value={money(portfolio.crownBankroll)} faint />
      </div>

      {/* Four lane cards — 2×2 on desktop, single column on mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {portfolio.cards.map((card) => <LaneCard key={card.id} card={card} />)}
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>{portfolio.note}</p>
    </section>
  );
}
