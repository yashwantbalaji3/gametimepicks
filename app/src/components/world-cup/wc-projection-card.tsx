/**
 * WcProjectionCard — GameTime Picks MODEL projection views for one World Cup match (90-minute
 * regulation). Shows, per market (moneyline / total goals / total corners), the model's
 * probability for every outcome next to the market-implied probability. A market is shown as a
 * PROBABILITY VIEW even when no edge clears the suggested-card threshold; a "Suggested lean"
 * badge appears only when the projection is parlay-eligible. Ensemble = market + FIFA strength +
 * opponent-adjusted form. Draw is a real outcome; extra time/penalties excluded.
 */
import type { WcProjection } from "@/lib/world-cup/projections";
import { fmtAmerican } from "@/lib/world-cup/projections";
import FlagBadge from "@/components/flag-badge";

const MARKET_LABEL: Record<string, string> = {
  moneyline_90: "90-min result",
  double_chance: "Double chance",
  match_total_goals: "Total goals",
  match_total_corners: "Total corners",
};

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function MarketRow({ p }: { p: WcProjection }) {
  const outcomes = p.outcomes ?? [];
  // The model's preferred outcome (highest model probability) — highlighted, but only labelled a
  // "lean" when parlay-eligible.
  const top = outcomes.reduce(
    (best, o) => (o.modelProbability > (best?.modelProbability ?? -1) ? o : best),
    outcomes[0],
  );
  return (
    <div
      className="rounded-[6px] px-3 py-2.5 flex flex-col gap-2"
      style={{ background: "color-mix(in srgb, var(--vault-ink-black) 30%, transparent)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="font-mono uppercase tracking-[0.10em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {MARKET_LABEL[p.market] ?? p.market}
        </span>
        {p.parlayEligible && p.pickLabel ? (
          <span
            className="font-mono uppercase tracking-[0.08em] shrink-0 px-1.5 py-0.5 rounded-[3px]"
            style={{ color: "var(--vault-success)", border: "1px solid var(--vault-success)", fontSize: 10 }}
          >
            Lean · {p.pickLabel}
          </span>
        ) : (
          <span className="font-mono uppercase tracking-[0.08em] shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            view · {p.edgePct >= 0 ? "+" : ""}{p.edgePct.toFixed(1)}% edge
          </span>
        )}
      </div>
      <div className={`grid gap-1.5 ${outcomes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {outcomes.map((o) => {
          const isTop = top && o.side === top.side;
          return (
            <div
              key={o.side}
              className="rounded-[5px] px-1.5 py-1.5 flex flex-col items-center gap-0.5"
              style={{
                background: isTop ? "color-mix(in srgb, var(--vault-accent) 8%, transparent)" : "color-mix(in srgb, var(--vault-ink-black) 25%, transparent)",
                border: `1px solid ${isTop ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
              }}
            >
              <span className="font-mono uppercase truncate w-full text-center" style={{ color: "var(--vault-text-mute)", fontSize: 10, letterSpacing: "0.03em" }}>
                {o.label}
              </span>
              <span className="font-display tabular" style={{ color: isTop ? "var(--vault-gold-bright)" : "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>
                {pct(o.modelProbability)}
              </span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                mkt {pct(o.marketProbability)} · {fmtAmerican(o.americanOdds)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WcProjectionCard({
  projections,
  homeCode,
  awayCode,
  group,
  kickoff,
}: {
  projections: WcProjection[];
  homeCode: string;
  awayCode: string;
  group?: string | null;
  kickoff?: string | null;
}) {
  if (projections.length === 0) return null;
  // Stable market order: moneyline → goals → corners.
  const order = ["moneyline_90", "double_chance", "match_total_goals", "match_total_corners"];
  const sorted = [...projections].sort((a, b) => order.indexOf(a.market) - order.indexOf(b.market));
  const head = sorted[0];
  const anyLean = sorted.some((p) => p.parlayEligible);

  return (
    <article
      className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>
          {group ? `Group ${group}` : "World Cup"} · model
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {kickoff ?? ""}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FlagBadge code={homeCode} size="md" />
          <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>
            {head.homeTeam}
          </span>
        </div>
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>vs</span>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className="font-display tracking-tight truncate text-right" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>
            {head.awayTeam}
          </span>
          <FlagBadge code={awayCode} size="md" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((p) => (
          <MarketRow key={p.id} p={p} />
        ))}
      </div>

      <p style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.4 }}>
        GameTime Picks model — ensemble of market + FIFA-ranking strength + opponent-adjusted form.
        Bold = model&apos;s most-likely outcome. {anyLean ? "A “Lean” marks a parlay-eligible edge. " : "No market cleared the suggested-card edge threshold today — these are probability views, not picks. "}
        90-minute regulation only (Draw is a real outcome; extra time/penalties not included). Educational / paper only.
      </p>
    </article>
  );
}
