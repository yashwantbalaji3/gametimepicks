"use client";
import { etStamp } from "@/lib/et-stamp.mjs";

/**
 * PARLAY LAB V2 · ONE QUALIFIED CARD (render-only; the adapter decided everything — lib/parlays/v2/recommend.mjs).
 *
 * Shows the recorded prices and what they imply, and nothing a model has not earned: the market-implied chance is
 * labelled as arithmetic on prices (books' margin included), and the model's joint chance is stated as unavailable
 * with its reason rather than replaced by the independent product. No outbound link of any kind.
 */

export interface V2LegView {
  readonly sport: string;
  readonly eventId: string;
  readonly game: string | null;
  readonly startUtc: string | null;
  readonly selection: string;
  readonly line: number | null;
  readonly book: string | null;
  readonly price: number | null;
  readonly capturedAt: string | null;
}

export interface V2CardView {
  readonly cardId: string;
  readonly tier: string;
  readonly legs: readonly V2LegView[];
  readonly combinedAmerican: number | null;
  readonly combinedPriceText: string;
  readonly marketImpliedProbability: number | null;
  readonly marketImpliedLabel: string;
  readonly modelJointProbability: null;
  readonly modelJointProbabilityReason: string;
  readonly dependenceNote: string;
  readonly source: { readonly artifact: string | null; readonly generatedAt: string | null; readonly receipts: readonly string[] };
}

const signed = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`);
const pct = (p: number | null) => (p == null ? "—" : `${(p * 100).toFixed(1)}%`);

export default function ParlayCard({ card, tierLabel, selected, onCompare }: {
  card: V2CardView;
  tierLabel: string;
  selected: boolean;
  onCompare: (card: V2CardView) => void;
}) {
  const headingId = `v2-card-${card.cardId}`;
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-2.5 rounded-[14px] p-3.5"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: `1px solid ${selected ? "var(--vault-gold-bright)" : "var(--vault-border)"}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 id={headingId} className="m-0 font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 9.5, fontWeight: 600 }}>
          {tierLabel} · {card.legs.length} legs
        </h4>
        <span className="font-display tabular-nums" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}
          aria-label={`Combined price ${card.combinedPriceText}`}>
          {card.combinedPriceText}
        </span>
      </div>

      <ul className="flex flex-col gap-2 list-none m-0 p-0">
        {card.legs.map((l) => (
          <li key={`${l.eventId}|${l.selection}`} className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12 }}>
              {l.selection}{l.line != null ? ` ${l.line}` : ""}
            </span>
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
              {[l.sport.toUpperCase(), l.game].filter(Boolean).join(" · ")}
            </span>
            <span className="font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
              {signed(l.price)} at {l.book ?? "unknown book"}{l.capturedAt ? ` · recorded ${etStamp(l.capturedAt) ?? l.capturedAt}` : ""}
            </span>
          </li>
        ))}
      </ul>

      <dl className="m-0 grid gap-1" style={{ fontSize: 11, color: "var(--vault-text-mute)", lineHeight: 1.5 }}>
        <div>
          <dt className="inline font-semibold" style={{ color: "var(--vault-text)" }}>Market-implied chance: </dt>
          <dd className="inline m-0">{pct(card.marketImpliedProbability)} <span style={{ color: "var(--vault-text-faint)" }}>({card.marketImpliedLabel})</span></dd>
        </div>
        <div>
          <dt className="inline font-semibold" style={{ color: "var(--vault-text)" }}>Model chance: </dt>
          <dd className="inline m-0">not shown — {card.modelJointProbabilityReason}</dd>
        </div>
        <div>
          <dt className="sr-only">How the legs relate</dt>
          <dd className="m-0" style={{ color: "var(--vault-text-faint)" }}>{card.dependenceNote}</dd>
        </div>
        <div>
          <dt className="sr-only">Source</dt>
          <dd className="m-0 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            Source: {card.source.receipts.join(", ") || "unknown"}{card.source.generatedAt ? ` · ${etStamp(card.source.generatedAt) ?? card.source.generatedAt}` : ""}
          </dd>
        </div>
      </dl>

      <button type="button" onClick={() => onCompare(card)} aria-pressed={selected}
        aria-label={`Compare this ${tierLabel} card in the slip`}
        className="vault-press inline-flex items-center justify-center rounded-full px-4 self-start"
        style={{ minHeight: 44, border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", background: "var(--vault-gold-dim)", fontSize: 12.5, fontWeight: 700 }}>
        {selected ? "In the slip" : "Compare in slip"}
      </button>
    </article>
  );
}
