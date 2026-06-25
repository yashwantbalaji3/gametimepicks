/**
 * ProductLanesLadder — the shared, product-agnostic LADDER surface for Bank Builder and Moonshot.
 *
 * Both products present identically: a product header (label + one-line descriptor), then two lane
 * cards (Lane A / Lane B) side-by-side on desktop and stacked on mobile. Each lane card carries a
 * STEP RAIL that reflects this lane's real progress — rungs below the current step read CLEARED (✓),
 * the current step reads "Current card" (accent glow), and rungs above await the prior step's
 * settlement. Bank Builder ladders span 5 steps, Moonshot spans 3. The current card body shows
 * stake → potential return (and the rung goal when set), the combined odds pill, the per-leg list,
 * and any correlation / shortfall notes.
 *
 * This makes Moonshot mirror Bank Builder visually: one rail, one shape, two accents. Honest by
 * construction — active lanes read "$X at risk · open exposure"; candidates read "$0 placed · not
 * activated". Pure presentational; all derivation lives in lib/mr-dub/daily-portfolio. Server
 * component (no client state). No horizontal overflow at 375px.
 */
import OddsPill from "@/components/tickets/odds-pill";
import FlagBadge from "@/components/flag-badge";
import PlayerAvatar from "@/components/ui/player-avatar";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";
import type { DailyPortfolioCard, DailyPortfolioLeg } from "@/lib/mr-dub/daily-portfolio";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DESCRIPTOR: Record<DailyPortfolioCard["product"], string> = {
  "bank-builder": "Lower-volatility · 2 legs per lane · ladder toward higher rungs",
  moonshot: "Higher-upside · independent longshot cards · maximum upside (not a ladder)",
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

type RungState = "cleared" | "current" | "future";

/**
 * The ladder rail for one lane. Renders rungs 1..totalSteps reflecting this lane's real progress:
 *   rung <  currentStep → CLEARED  (✓, success green)
 *   rung === currentStep → CURRENT (accent glow, "Current card")
 *   rung >  currentStep → FUTURE   (muted, "awaits Step N−1 settlement")
 * Compact circles + a single shared caption keep the row tight (no horizontal page scroll at 375px,
 * even at 5 rungs). The per-rung label is shown only for the current rung; future/cleared rungs use a
 * short shared caption below the row so five rungs never overflow.
 */
function StepRail({ currentStep, totalSteps, accentColor }: { currentStep: number; totalSteps: number; accentColor: string }) {
  const rungs = Array.from({ length: totalSteps }, (_, i) => {
    const n = i + 1;
    const state: RungState = n < currentStep ? "cleared" : n === currentStep ? "current" : "future";
    return { n, state };
  });
  const success = "var(--vault-success)";
  return (
    <div className="flex flex-col gap-1 min-w-0" aria-label={`Ladder · step ${currentStep} of ${totalSteps}`}>
      <div className="flex items-center min-w-0">
        {rungs.map((r, i) => {
          const isCleared = r.state === "cleared";
          const isCurrent = r.state === "current";
          const dotColor = isCleared ? success : isCurrent ? accentColor : "var(--vault-rule)";
          return (
            <div key={r.n} className="flex items-center min-w-0" style={{ flex: i === rungs.length - 1 ? "0 0 auto" : "1 1 0" }}>
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-full font-mono font-bold tabular"
                style={{
                  width: 18,
                  height: 18,
                  fontSize: 9.5,
                  color: isCleared ? success : isCurrent ? "#120A07" : "var(--vault-text-faint)",
                  background: isCleared ? "color-mix(in srgb, var(--vault-success) 16%, transparent)" : isCurrent ? accentColor : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isCleared ? "color-mix(in srgb, var(--vault-success) 45%, transparent)" : dotColor}`,
                  boxShadow: isCurrent ? `0 0 9px color-mix(in srgb, ${accentColor} 55%, transparent)` : "none",
                }}
              >
                {isCleared ? "✓" : r.n}
              </span>
              {i < rungs.length - 1 ? (
                <span aria-hidden className="mx-1 h-px flex-1 min-w-[6px]" style={{ background: r.n < currentStep ? success : "var(--vault-rule)", opacity: r.n < currentStep ? 0.6 : 1 }} />
              ) : null}
            </div>
          );
        })}
      </div>
      <span className="font-mono uppercase tracking-[0.08em] truncate" style={{ fontSize: 8, color: accentColor }}>
        Step {currentStep} of {totalSteps} · Current card
        {currentStep < totalSteps ? <span style={{ color: "var(--vault-text-faint)" }}> · Step {currentStep + 1} awaits Step {currentStep} settlement</span> : null}
      </span>
    </div>
  );
}

/** Bank Builder ladders span 5 rungs; Moonshot spans 3. */
const TOTAL_STEPS: Record<DailyPortfolioCard["product"], number> = { "bank-builder": 5, moonshot: 3 };

/** Per-leg avatar: a player portrait for prop legs, a team flag for team/game markets (mirrors the
 *  Bank Builder ladder's leg row). Both primitives degrade gracefully, so an unknown name never breaks
 *  the row — it falls back to initials (portrait) or a ⚽ chip (flag). */
function LegAvatar({ leg }: { leg: DailyPortfolioLeg }) {
  if (leg.player) return <PlayerAvatar name={leg.player} photo={leg.photoUrl ?? null} size={18} />;
  const [home, away] = (leg.matchup ?? "").split(/\s+vs\s+/i).map((s) => s.trim());
  const selCode = wcTeamCodeFromName(leg.selection);
  if (selCode) return <FlagBadge code={selCode} size="sm" ariaLabel={leg.selection} />;
  const homeCode = wcTeamCodeFromName(home);
  const awayCode = wcTeamCodeFromName(away);
  if (homeCode || awayCode) {
    return (
      <>
        {homeCode ? <FlagBadge code={homeCode} size="sm" ariaLabel={home ?? ""} /> : null}
        {awayCode ? <FlagBadge code={awayCode} size="sm" ariaLabel={away ?? ""} /> : null}
      </>
    );
  }
  return (
    <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[11px]" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-border)" }} aria-hidden>⚽</span>
  );
}

/** Per-card volatility (0–100): longer combined odds and a higher share of player-prop legs are more
 *  volatile; a card of short team/game markets is lower-volatility. Honest, derived from the card. */
function volatilityScore(card: DailyPortfolioCard): { score: number; band: "Lower" | "Medium" | "Higher" } {
  const dec = card.combinedOdds > 0 ? 1 + card.combinedOdds / 100 : 1 + 100 / Math.abs(card.combinedOdds || 100);
  const oddsVol = Math.min(70, Math.max(0, (Math.log2(Math.max(1.01, dec)) / Math.log2(31)) * 70)); // ~+3000 → 70
  const propLegs = card.legs.filter((l) => l.player).length;
  const propVol = card.legs.length ? (propLegs / card.legs.length) * 30 : 0;
  const score = Math.round(Math.min(100, oddsVol + propVol));
  return { score, band: score < 33 ? "Lower" : score < 66 ? "Medium" : "Higher" };
}

const VOL_COLOR: Record<"Lower" | "Medium" | "Higher", string> = {
  Lower: "var(--vault-success)", Medium: "#e7b15a", Higher: "var(--gtp-bank-heat)",
};

function LaneCard({ card, accent, accentColor }: { card: DailyPortfolioCard; accent: Accent; accentColor: string }) {
  const tone = accent === "violet" ? "violet" : "gold";
  const active = card.status === "active";
  const totalSteps = TOTAL_STEPS[card.product] ?? 3;
  const currentStep = Math.min(Math.max(1, card.step), totalSteps);
  const vol = volatilityScore(card);
  return (
    <div
      className="rounded-[12px] overflow-hidden flex flex-col min-w-0"
      style={{ border: "1px solid var(--vault-rule)", background: "rgba(12,8,6,0.4)", borderLeft: `2px solid ${accentColor}` }}
    >
      {/* Header */}
      <div className="px-3.5 py-3 flex flex-col gap-2.5" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>Lane {card.lane}</span>
            {card.legs.length ? (
              <span className="shrink-0 rounded-full px-1.5 py-0.5 font-mono uppercase tracking-[0.06em]" style={{ fontSize: 8, color: VOL_COLOR[vol.band], background: "rgba(255,255,255,0.05)", border: `1px solid color-mix(in srgb, ${VOL_COLOR[vol.band]} 35%, transparent)` }} title={`Volatility score ${vol.score}/100`}>
                {vol.band} vol · {vol.score}
              </span>
            ) : null}
          </span>
          <StatusPill status={card.status} />
        </div>
        {/* Step rail — the shared ladder visual, driven by this lane's real progress */}
        <StepRail currentStep={currentStep} totalSteps={totalSteps} accentColor={accentColor} />
      </div>

      {/* Current card body */}
      <div className="px-3.5 py-3 flex flex-col gap-2" style={{ borderBottom: card.legs.length ? "1px solid var(--vault-rule)" : "none" }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>
            {money(card.stake)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> <span style={{ color: "var(--vault-text)" }}>{money(card.potentialReturn)}</span>
          </span>
          <OddsPill odds={card.combinedOdds} size="sm" tone={tone} />
        </div>
        {card.targetReturn != null ? (
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: accentColor, fontSize: 8.5 }}>
            → Step {currentStep} goal {money(card.targetReturn)}
          </span>
        ) : null}
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
            <div key={i} className="px-3.5 py-2 flex items-start gap-2 min-w-0" style={{ borderTop: i ? "1px solid var(--vault-rule)" : "none" }}>
              <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
                <LegAvatar leg={leg} />
              </span>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 11.5, fontWeight: 600 }}>{leg.selection}</span>
                  <OddsPill odds={leg.odds} size="sm" tone={tone} />
                </div>
                <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{leg.matchup} · {leg.marketLabel}</span>
              </div>
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
