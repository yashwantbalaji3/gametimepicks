/**
 * ProductLanesLadder — the shared, product-agnostic LADDER surface for Bank Builder and Moonshot.
 *
 * Both products present identically: a product header (label + one-line descriptor), then two lane
 * cards (Lane A / Lane B) side-by-side on desktop and stacked on mobile. Each lane card carries a
 * three-step STEP RAIL — Step 1 is the current rung (highlighted + accent glow, showing today's card),
 * Steps 2-3 are muted ("awaits Step N settlement"). The current card body shows stake → potential
 * return, the combined odds pill, the per-leg list, and any correlation / shortfall notes.
 *
 * This makes Moonshot mirror Bank Builder visually: one rail, one shape, two accents. Honest by
 * construction — active lanes read "$X at risk · open exposure"; candidates read "$0 placed · not
 * activated". Pure presentational; all derivation lives in lib/mr-dub/daily-portfolio. Server
 * component (no client state). No horizontal overflow at 375px.
 */
import OddsPill from "@/components/tickets/odds-pill";
import type { DailyPortfolioCard } from "@/lib/mr-dub/daily-portfolio";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DESCRIPTOR: Record<DailyPortfolioCard["product"], string> = {
  "bank-builder": "Lower-volatility · 2 legs per lane · ladder toward higher rungs",
  moonshot: "Higher-upside · 5 legs per lane · ladder toward $3,000",
};

type Accent = "gold" | "violet";
const ACCENT_COLOR: Record<Accent, string> = { gold: "var(--vault-gold-bright)", violet: "#8b7bf0" };

function StatusPill({ status }: { status: DailyPortfolioCard["status"] }) {
  const map = {
    active: { label: "ACTIVE", color: "var(--vault-success)", bg: "rgba(110,231,168,0.12)" },
    candidate: { label: "CANDIDATE", color: "var(--vault-gold-bright)", bg: "rgba(217,164,65,0.12)" },
    awaiting: { label: "AWAITING", color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.05)" },
  } as const;
  const t = status === "active" ? map.active : status === "candidate" ? map.candidate : map.awaiting;
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em]"
      style={{ fontSize: 8.5, color: t.color, background: t.bg, border: `1px solid color-mix(in srgb, ${t.color} 35%, transparent)` }}
    >
      {t.label}
    </span>
  );
}

/** The 3-rung ladder rail. Step 1 = current (accent glow), Steps 2-3 = muted "awaits settlement". */
function StepRail({ accentColor }: { accentColor: string }) {
  const steps = [
    { n: 1, label: "Current card", active: true },
    { n: 2, label: "awaits Step 1 settlement", active: false },
    { n: 3, label: "awaits Step 2 settlement", active: false },
  ];
  return (
    <div className="flex items-stretch gap-0 min-w-0" aria-label="Ladder steps">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center min-w-0" style={{ flex: i === steps.length - 1 ? "0 1 auto" : "1 1 0" }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-full font-mono font-bold tabular"
              style={{
                width: 20,
                height: 20,
                fontSize: 10,
                color: s.active ? "#120A07" : "var(--vault-text-faint)",
                background: s.active ? accentColor : "rgba(255,255,255,0.04)",
                border: `1px solid ${s.active ? accentColor : "var(--vault-rule)"}`,
                boxShadow: s.active ? `0 0 10px color-mix(in srgb, ${accentColor} 55%, transparent)` : "none",
              }}
            >
              {s.n}
            </span>
            <span
              className="font-mono uppercase tracking-[0.08em] truncate"
              style={{ fontSize: 7.5, color: s.active ? accentColor : "var(--vault-text-faint)" }}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 ? (
            <span aria-hidden className="mx-1.5 h-px flex-1 min-w-[10px]" style={{ background: "var(--vault-rule)" }} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LaneCard({ card, accent, accentColor }: { card: DailyPortfolioCard; accent: Accent; accentColor: string }) {
  const tone = accent === "violet" ? "violet" : "gold";
  const active = card.status === "active";
  return (
    <div
      className="rounded-[12px] overflow-hidden flex flex-col min-w-0"
      style={{ border: "1px solid var(--vault-rule)", background: "rgba(12,8,6,0.4)", borderLeft: `2px solid ${accentColor}` }}
    >
      {/* Header */}
      <div className="px-3.5 py-3 flex flex-col gap-2.5" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>Lane {card.lane}</span>
          <StatusPill status={card.status} />
        </div>
        {/* Step rail — the shared ladder visual */}
        <StepRail accentColor={accentColor} />
      </div>

      {/* Current card body */}
      <div className="px-3.5 py-3 flex flex-col gap-2" style={{ borderBottom: card.legs.length ? "1px solid var(--vault-rule)" : "none" }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>
            {money(card.stake)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> <span style={{ color: "var(--vault-text)" }}>{money(card.potentialReturn)}</span>
          </span>
          <OddsPill odds={card.combinedOdds} size="sm" tone={tone} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: active ? "var(--vault-success)" : "var(--vault-text-faint)", fontSize: 8.5 }}>
            {active ? `${money(card.stake)} at risk · open exposure` : "$0 placed · not activated"}
          </span>
          {card.legCount < card.targetLegs ? (
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "#e7b15a", fontSize: 8.5 }}>{card.legCount}/{card.targetLegs} legs</span>
          ) : null}
        </div>
      </div>

      {/* Legs */}
      <div className="flex flex-col flex-1">
        {card.legs.length ? (
          card.legs.map((leg, i) => (
            <div key={i} className="px-3.5 py-2 flex flex-col gap-0.5 min-w-0" style={{ borderTop: i ? "1px solid var(--vault-rule)" : "none" }}>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 11.5, fontWeight: 600 }}>{leg.selection}</span>
                <OddsPill odds={leg.odds} size="sm" tone={tone} />
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

      {/* Notes */}
      {card.correlationNote || card.shortfallNote ? (
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

export default function ProductLanesLadder({
  productLabel,
  product,
  lanes,
  accent = "gold",
}: {
  productLabel: string;
  product: "bank-builder" | "moonshot";
  lanes: DailyPortfolioCard[];
  accent?: Accent;
}) {
  const accentColor = ACCENT_COLOR[accent];
  // Lane A then Lane B, regardless of source order.
  const ordered = [...lanes].sort((a, b) => a.lane.localeCompare(b.lane));

  return (
    <section className="flex flex-col gap-3 overflow-x-hidden">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="inline-block rounded-full shrink-0" style={{ width: 8, height: 8, background: accentColor, boxShadow: `0 0 8px color-mix(in srgb, ${accentColor} 60%, transparent)` }} />
          <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>{productLabel}</h2>
        </div>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{DESCRIPTOR[product]}</span>
      </div>

      {ordered.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {ordered.map((card) => (
            <LaneCard key={card.id} card={card} accent={accent} accentColor={accentColor} />
          ))}
        </div>
      ) : (
        <div className="rounded-[12px] px-4 py-6 text-center" style={{ border: "1px dashed var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>No {productLabel} lanes for this slate</span>
        </div>
      )}
    </section>
  );
}
