/**
 * BankBuilderLadderV2 — the PROMINENT, always-visible 7-step profit-locking ladder for /bank-builder
 * (and a compact preview variant for Home / Today). Renders straight from the pure
 * `bankBuilderV2StepPolicy` spec, so it can never drift. Every figure (roll → target, lock, roll-forward,
 * cumulative locked profit, multiplier, max legs, market family) is spec-derived — nothing is fabricated
 * and no money is computed here.
 *
 * Honesty: the LIVE settlement engine runs v1 (full roll). This ladder is the v2 profit-locking preview
 * whose partial-cash-out settlement is documented + gate-pending (docs/METHODOLOGY_V2_LADDER.md). The
 * header states that plainly; `liveStep` marks where today's live run sits. CSS-only, reduced-motion-safe.
 */
import { bankBuilderV2StepPolicy } from "@/lib/methodology/ladder-policy";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Plain-English name for each allowed market family (no slugs, no jargon). */
const MARKET_PLAIN: Record<string, string> = {
  double_chance: "Double chance",
  draw_no_bet: "Draw-no-bet",
  moneyline_90: "Match result",
  match_total_goals: "Totals",
  btts: "Both teams to score",
};
function marketFamily(markets: string[]): string {
  if (markets.length <= 2) return markets.map((m) => MARKET_PLAIN[m] ?? m).join(" / ");
  // Wider families → summarise so the row stays readable.
  return markets.includes("btts") || markets.includes("match_total_goals") ? "Team & goal markets" : "Draw-protected markets";
}

const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function BankBuilderLadderV2({ liveStep = 1, compact = false, className = "" }: { liveStep?: number; compact?: boolean; className?: string }) {
  const steps = STEPS.map((s) => bankBuilderV2StepPolicy(s));
  const totalLocked = steps[steps.length - 1].cumulativeLocked; // $2,100 through Step 6
  const finalTarget = steps[steps.length - 1].target;            // $8,280

  // Compact preview (Home / Today) — a slim always-visible strip of the 7 steps + the honesty tag.
  if (compact) {
    return (
      <div className={`bb-ladder-v2-compact rounded-xl px-3.5 py-3 ${className}`} style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-crown) 5%, transparent)" }} aria-label="Bank Builder 7-step ladder preview">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-mono uppercase tracking-[0.1em] text-[9.5px]" style={{ color: "var(--vault-gold)" }}>7-step profit-locking ladder</span>
          <span className="font-mono text-[8.5px] uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)" }}>v2 preview · live runs v1</span>
        </div>
        <div className="mt-2 flex items-center gap-1 overflow-x-auto">
          {steps.map((p, i) => (
            <div key={p.step} className="flex items-center gap-1 shrink-0">
              <span className="rounded px-1.5 py-1 font-mono text-[9px] tabular" style={{ border: `1px solid ${p.step === liveStep ? "color-mix(in srgb, var(--vault-accent) 50%, transparent)" : "var(--vault-rule)"}`, color: p.lock > 0 ? "var(--vault-success)" : "var(--vault-text-mute)", background: p.step === liveStep ? "color-mix(in srgb, var(--vault-accent) 8%, transparent)" : "transparent" }}>
                ${p.target.toLocaleString("en-US")}{p.lock > 0 ? ` ·lock $${p.lock.toLocaleString("en-US")}` : ""}
              </span>
              {i < steps.length - 1 ? <span aria-hidden style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>→</span> : null}
            </div>
          ))}
        </div>
        <p className="mt-1.5 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>$100 → ~$10,380 · we bank profit from Step&nbsp;2 so the ladder freerolls. Live settlement runs v1.</p>
      </div>
    );
  }

  return (
    <section
      className={`bb-ladder-v2 gtp-fade-up overflow-hidden rounded-2xl ${className}`}
      style={{ border: "1px solid var(--vault-border)", background: "var(--lava-panel, var(--vault-wash-faint))" }}
      aria-label="Bank Builder 7-step profit-locking ladder"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div>
          <div className="font-mono uppercase tracking-[0.14em] text-[10px]" style={{ color: "var(--vault-gold)" }}>
            The profit-locking ladder
          </div>
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(19px, 3.2vw, 26px)", fontWeight: 700 }}>
            7 steps · $100 → $10K
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em]"
            style={{ border: "1px solid color-mix(in srgb, var(--vault-crown) 45%, transparent)", color: "var(--vault-gold)", background: "color-mix(in srgb, var(--vault-crown) 8%, transparent)" }}
          >
            v2 preview · live settlement runs v1
          </span>
          <span className="font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>we lock profit as the ladder climbs</span>
        </div>
      </div>

      {/* The ladder rail */}
      <ol className="relative mt-3.5 flex flex-col gap-1.5 px-3 pb-1 sm:px-4">
        {steps.map((p, i) => {
          const isLive = p.step === liveStep;
          const locks = p.lock > 0;
          const accent = isLive ? "var(--gtp-bank-heat)" : locks ? "var(--vault-success)" : "var(--vault-text-faint)";
          return (
            <li
              key={p.step}
              className="gtp-fade-up flex items-stretch gap-3 rounded-xl px-3 py-2.5"
              style={{
                animationDelay: `${i * 55}ms`,
                border: isLive ? "1px solid color-mix(in srgb, var(--vault-accent) 45%, transparent)" : "1px solid var(--vault-rule)",
                background: isLive ? "color-mix(in srgb, var(--vault-accent) 7%, transparent)" : "color-mix(in srgb, var(--vault-scrim-base) 35%, transparent)",
              }}
            >
              {/* Step badge + rail */}
              <div className="flex flex-col items-center">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-bold"
                  style={{
                    color: isLive ? "var(--vault-bg)" : "var(--vault-text)",
                    background: isLive ? "var(--gtp-bank-heat)" : "var(--vault-wash)",
                    border: `1px solid ${accent}`,
                    boxShadow: isLive ? "0 0 12px color-mix(in srgb, var(--vault-accent) 50%, transparent)" : "none",
                  }}
                >
                  {p.step}
                </span>
                {i < steps.length - 1 ? <span aria-hidden style={{ width: 2, flex: 1, marginTop: 3, background: "linear-gradient(var(--vault-rule), transparent)" }} /> : null}
              </div>

              {/* Economics */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-display tabular font-bold" style={{ color: "var(--vault-text)", fontSize: "clamp(15px,2.6vw,18px)" }}>
                    {usd(p.roll)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> {usd(p.target)}
                  </span>
                  <span className="rounded px-1.5 py-0.5 font-mono text-[9px]" style={{ color: "var(--vault-gold)", border: "1px solid var(--vault-rule)" }}>{p.targetMultiple}×</span>
                  {isLive ? <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--gtp-bank-heat)" }}>● live now (v1)</span> : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px]">
                  {/* Profit-locking outcome */}
                  {locks ? (
                    <span style={{ color: "var(--vault-success)" }}>
                      lock <strong>{usd(p.lock)}</strong> · roll {usd(p.rollForward)}
                    </span>
                  ) : p.step === 7 ? (
                    <span style={{ color: "var(--vault-success)" }}>completes — everything realizes</span>
                  ) : (
                    <span style={{ color: "var(--vault-text-faint)" }}>full roll (growth step)</span>
                  )}
                  {p.cumulativeLocked > 0 ? (
                    <span style={{ color: "var(--vault-text-mute)" }}>locked so far <strong style={{ color: "var(--vault-success)" }}>{usd(p.cumulativeLocked)}</strong></span>
                  ) : null}
                </div>
                <div className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>
                  ≤{p.maxLegs} legs · {marketFamily(p.allowedMarkets)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Footer — the payoff + honesty */}
      <div className="mt-1 px-4 pb-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3.5 py-2.5" style={{ background: "color-mix(in srgb, var(--vault-crown) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-crown) 25%, transparent)" }}>
          <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text)" }}>
            A full run realizes <strong style={{ color: "var(--vault-success)" }}>{usd(totalLocked)} locked</strong> along the way + the <strong style={{ color: "var(--vault-gold)" }}>{usd(finalTarget)}</strong> final ≈ <strong style={{ color: "var(--vault-gold)" }}>$10,380</strong>.
          </span>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
          Win Step&nbsp;2 and the original $100 is already back in your pocket — the ladder freerolls from there.
          Later steps get <em>safer</em>, not richer (the multiple never rises after Step&nbsp;3; 2 legs max; Step&nbsp;7 is
          double-chance / draw-no-bet only). If the model can&rsquo;t find a strong card we skip — an honest under-target
          card beats weak filler. <strong style={{ color: "var(--vault-text-mute)" }}>This is the v2 preview:</strong> today&rsquo;s
          live ladder and every dollar on this page settle under v1 (full roll); v2 profit-locking activates only once its
          settlement support ships and is gate-proven. Built from the settled record — double chance 8–0 · match result 8–2 ·
          totals 10–6 · both-teams-to-score 1–3.
        </p>
      </div>
    </section>
  );
}
