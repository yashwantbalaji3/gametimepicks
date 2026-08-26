"use client";
/**
 * NbaFinalsStakeRow — paper stake input + live projected payout for an NBA Finals
 * same-game card. Paper only; payout = stake × combined decimal (exact). No real
 * money, no fabricated odds.
 */
import { useState } from "react";

const DEFAULT_STAKE = 10;
const MIN_STAKE = 1;
const MAX_STAKE = 10000;

export default function NbaFinalsStakeRow({ decimal }: { decimal: number }) {
  const [stake, setStake] = useState<number>(DEFAULT_STAKE);
  const payout = Number.isFinite(stake) && stake > 0 ? Math.round(stake * decimal) : 0;

  return (
    <div
      className="flex items-center justify-between gap-2 pt-1"
      style={{ borderTop: "1px solid var(--vault-rule)" }}
    >
      <label className="flex items-center gap-1.5" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
        <span className="font-mono uppercase tracking-[0.1em]">Paper $</span>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_STAKE}
          max={MAX_STAKE}
          value={Number.isFinite(stake) ? stake : ""}
          onChange={(e) => {
            const v = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Math.round(Number(e.target.value) || 0)));
            setStake(v);
          }}
          aria-label="Paper stake"
          className="font-display tabular rounded-[4px] px-1.5 py-0.5"
          style={{
            width: 64,
            background: "color-mix(in srgb, var(--vault-ink-black) 35%, transparent)",
            border: "1px solid var(--vault-rule)",
            color: "var(--vault-text)",
            fontSize: 13,
          }}
        />
      </label>
      <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
        →{" "}
        <span className="font-display" style={{ color: "var(--vault-success)", fontWeight: 700, fontSize: 14 }}>
          ${payout.toLocaleString("en-US")}
        </span>{" "}
        <span style={{ color: "var(--vault-text-faint)" }}>({decimal.toFixed(2)}×)</span>
      </span>
    </div>
  );
}
