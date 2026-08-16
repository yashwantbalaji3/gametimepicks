"use client";
/**
 * StakePayoutInput — interactive paper-stake → projected-payout control for a suggested card.
 * Editable stake + quick buttons ($10/$25/$50/$100); projected return + profit update live from
 * the card's combined American odds. Paper-only, educational — not betting advice. Reusable
 * across World Cup / MLB / NBA / mixed cards and the Build betslip.
 */
import { useState } from "react";
import { americanToDecimal, formatAmerican } from "@/lib/odds-math";
import { sanitizeStake } from "@/lib/parlay-payout";

const QUICK = [10, 25, 50, 100];

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StakePayoutInput({
  combinedAmerican,
  defaultStake = 25,
  lockedStake,
}: {
  combinedAmerican: number;
  defaultStake?: number;
  /** When set (e.g. Bank Builder), the stake is fixed and not editable. */
  lockedStake?: number | null;
}) {
  const [raw, setRaw] = useState<string>(String(lockedStake ?? defaultStake));
  const stake = lockedStake ?? sanitizeStake(raw) ?? 0;
  const dec = americanToDecimal(combinedAmerican);
  const ret = stake * dec;
  const profit = ret - stake;

  return (
    <div
      className="rounded-[8px] px-3 py-3 flex flex-col gap-2.5"
      style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          Paper stake{lockedStake ? " · locked" : ""}
        </span>
        <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          {formatAmerican(combinedAmerican)} · {dec.toFixed(2)}×
        </span>
      </div>

      {lockedStake ? (
        <div className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 700 }}>
          {money(stake)}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--vault-text-mute)", fontSize: 15, fontWeight: 600 }}>$</span>
            <input
              inputMode="decimal"
              aria-label="Paper stake"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="w-full rounded-[6px] px-2.5 py-1.5 font-display tabular"
              style={{
                background: "rgba(11, 18, 14,0.7)",
                border: "1px solid var(--vault-rule)",
                color: "var(--vault-text)",
                fontSize: 16,
                fontWeight: 700,
              }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setRaw(String(q))}
                className="flex-1 rounded-full py-1 transition-colors"
                style={{
                  background: stake === q ? "var(--vault-gold-dim)" : "transparent",
                  border: `1px solid ${stake === q ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                  color: stake === q ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                ${q}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        <div className="flex flex-col">
          <span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>To return</span>
          <span className="font-display tabular" style={{ color: "var(--vault-success)", fontSize: 16, fontWeight: 700 }}>
            {money(ret)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Profit</span>
          <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
            +{money(profit)}
          </span>
        </div>
      </div>
      <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Paper only — not betting advice.</span>
    </div>
  );
}
