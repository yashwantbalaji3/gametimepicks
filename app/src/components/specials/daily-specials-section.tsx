/**
 * DailySpecialsSection — renders the "2 legs from each game" Daily Structured Specials in four reliability
 * tiers (Reliable → Balanced → Aggressive → Game Script). Purely presentational: every figure is read from
 * the card the engine already built (real odds, model probability, correlation read) — nothing is computed
 * or fabricated here. Reliability = how SAFE the leg selection is; Volatility = how high-variance the parlay
 * is (more legs → higher variance), so both are shown and explained. Paper-only, educational.
 */
import type { WorldCupSpecialCard } from "@/lib/world-cup/world-cup-specials";

const american = (o: number) => `${o > 0 ? "+" : ""}${o}`;

const TIER_META: Record<string, { label: string; tone: string; bg: string; blurb: string }> = {
  reliable: { label: "Reliable", tone: "var(--vault-success)", bg: "rgba(110,231,168,0.12)", blurb: "Safest team markets only — no player props." },
  balanced: { label: "Balanced", tone: "var(--vault-gold-bright)", bg: "rgba(217,164,65,0.12)", blurb: "One safer leg + one value leg per game." },
  aggressive: { label: "Aggressive", tone: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)", blurb: "Higher-upside markets — expect real variance." },
  "game-script": { label: "Game Script", tone: "#7aa2f7", bg: "rgba(122,162,247,0.12)", blurb: "Legs aligned to each game's expected script." },
};

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono" style={{ fontSize: 10, border: `1px solid ${tone ? `color-mix(in srgb, ${tone} 45%, transparent)` : "var(--vault-rule)"}`, background: "rgba(255,255,255,0.03)" }}>
      <span style={{ color: "var(--vault-text-faint)" }}>{label}</span>
      <span style={{ color: tone ?? "var(--vault-text)", fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function LegRow({ leg }: { leg: WorldCupSpecialCard["legs"][number] }) {
  const sel = `${leg.marketLabel}${leg.side && leg.kind === "player" ? ` ${leg.side}` : leg.side && leg.kind === "team" ? ` · ${leg.side}` : ""}`;
  return (
    <li className="flex items-center justify-between gap-2 rounded-[7px] px-3 py-1.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
      <span className="min-w-0 flex items-center gap-2">
        <span aria-hidden className="shrink-0 rounded px-1 font-mono" style={{ fontSize: 8, color: leg.kind === "player" ? "var(--gtp-bank-heat)" : "var(--vault-success)", border: "1px solid var(--vault-rule)" }}>{leg.kind === "player" ? "PROP" : "TEAM"}</span>
        <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{leg.kind === "player" ? `${leg.participant} · ${sel}` : sel}</span>
      </span>
      <span className="shrink-0 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{american(leg.odds)}</span>
    </li>
  );
}

function TierCard({ card }: { card: WorldCupSpecialCard }) {
  const meta = TIER_META[card.reliabilityTier ?? "balanced"] ?? TIER_META.balanced;
  return (
    <div className="flex flex-col rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)", borderTop: `2px solid ${meta.tone}` }}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 10, fontWeight: 700, color: meta.tone, background: meta.bg, border: `1px solid ${meta.tone}` }}>{meta.label}</span>
          <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>{american(card.combinedOdds)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {card.volatility ? <Chip label="Volatility" value={String(card.volatility)} tone="var(--gtp-bank-heat)" /> : null}
          {card.confidence ? <Chip label="Confidence" value={String(card.confidence)} tone="var(--vault-gold-bright)" /> : null}
          {card.correlation ? <Chip label="Correlation" value={card.correlation.direction} tone={card.correlation.direction === "independent" ? "var(--vault-success)" : "var(--gtp-bank-heat)"} /> : null}
        </span>
      </div>
      <p className="mb-2 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>{meta.blurb} · {card.legs.length} legs across {card.games.length} game{card.games.length === 1 ? "" : "s"} · ${card.stakePreview} paper</p>

      {/* Legs grouped by game (2 from each). */}
      <div className="flex flex-col gap-2">
        {(card.legsByGame ?? []).map((g) => (
          <div key={g.game}>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-mute)", fontSize: 9.5 }}>{g.game}</span>
              {g.legs.length < (card.legsPerGameTarget ?? 2) ? <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}>· 1 leg only (limited markets)</span> : null}
            </div>
            <ul className="flex flex-col gap-1">{g.legs.map((l, i) => <LegRow key={`${g.game}:${i}`} leg={l} />)}</ul>
          </div>
        ))}
      </div>

      {/* Honesty: why it exists, why it can lose, correlation. */}
      <div className="mt-3 flex flex-col gap-1.5 rounded-[10px] px-3 py-2.5" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--vault-rule)" }}>
        {card.whyThisCard?.[0] ? <p className="text-[11px] leading-snug" style={{ color: "var(--vault-text-mute)" }}><span style={{ color: meta.tone, fontWeight: 600 }}>Why this card: </span>{card.whyThisCard[0]}</p> : null}
        {card.whyItCanFail?.length ? (
          <p className="text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            <span style={{ color: "var(--gtp-bank-heat)", fontWeight: 600 }}>Why it could lose: </span>{card.whyItCanFail.join(" ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function DailySpecialsSection({ cards }: { cards: WorldCupSpecialCard[] }) {
  if (!cards?.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="Daily structured specials">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>Daily Structured Specials</h2>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>2 legs from each game · paper-only</span>
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}>
        One slip per appetite, each taking two legs from every game on the slate. <span style={{ color: "var(--vault-text)" }}>Reliability</span> = how safe the leg
        selection is (the Reliable tier is team-markets-only — World Cup player props have hit ~8% on settled slates). <span style={{ color: "var(--vault-text)" }}>Volatility</span> = how
        high-variance the parlay is — every one of these is a multi-leg parlay, so the more legs, the lower the hit rate. Real, settleable, pre-event legs only.
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cards.map((c) => <TierCard key={c.id} card={c} />)}
      </div>
    </section>
  );
}
