/**
 * MoneyPath — large, high-contrast stake → return display for Bank Builder lanes and Mr. Dub cards.
 * Readable on mobile and in the dark/lava theme. Color is used only where meaningful (green settled
 * win, amber projected/open, red loss). Pure presentational; never fabricates amounts.
 */
function fmt(n: number | null | undefined): string {
  return n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MoneyPath({
  stake, ret, kind = "projected", step, totalSteps = 5, profit,
}: {
  stake: number | null;
  ret: number | null;
  kind?: "projected" | "settled" | "lost" | "starting";
  step?: number;
  totalSteps?: number;
  profit?: number | null;
}) {
  const retColor = kind === "settled" ? "var(--vault-success)" : kind === "lost" ? "var(--gtp-bank-heat)" : "var(--vault-gold-bright)";
  const retLabel = kind === "settled" ? "settled" : kind === "lost" ? "" : kind === "starting" ? "" : "projected";
  const computedProfit = profit ?? (ret != null && stake != null ? ret - stake : null);

  if (kind === "starting") {
    return (
      <div className="rounded-xl px-3.5 py-3" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)", border: "1px solid var(--vault-border)" }}>
        <div className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
          {fmt(stake)} <span style={{ color: "var(--vault-text-faint)", fontSize: 14, fontWeight: 600 }}>starting path</span>
        </div>
        {ret != null ? <div className="mt-1 font-mono text-[12px]" style={{ color: "var(--vault-gold-bright)" }}>Target: {fmt(ret)}+</div> : null}
        {step ? <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>Step {step} of {totalSteps}</div> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl px-3.5 py-3" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-display tabular tracking-tight" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{fmt(stake)}</span>
        <span aria-hidden style={{ color: "var(--vault-text-faint)", fontSize: 18 }}>→</span>
        <span className="font-display tabular tracking-tight" style={{ color: retColor, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{fmt(ret)}</span>
        {retLabel ? <span className="font-mono uppercase tracking-wide" style={{ color: retColor, fontSize: 10, opacity: 0.85 }}>{retLabel}</span> : null}
      </div>
      {computedProfit != null ? (
        <div className="mt-1 font-mono text-[12px]" style={{ color: computedProfit >= 0 ? "var(--vault-success)" : "var(--gtp-bank-heat)" }}>
          {computedProfit >= 0 ? "+" : ""}{fmt(computedProfit)} paper {computedProfit >= 0 ? "profit" : "result"}
        </div>
      ) : null}
      {step ? <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>Step {step} of {totalSteps}</div> : null}
    </div>
  );
}
