"use client";
/**
 * StakePayoutInput — interactive paper-stake → projected-payout control for a suggested card.
 * Editable stake + quick buttons ($10/$25/$50/$100); projected return + profit update live from
 * the card's combined American odds. Paper-only, educational — not betting advice. Reusable
 * across World Cup / MLB / NBA / mixed cards and the Build betslip.
 */
import { useState } from "react";
import AnimatedNumber from "@/components/ui/animated-number";
import { formatAmerican } from "@/lib/odds-math";
import { STAKE_STATE, payoutFromDecimal, validateStake } from "@/lib/parlay-payout";

const QUICK = [10, 25, 50, 100];

/** States where the input itself is wrong, not merely adjusted — these colour the field. */
const HARD_INVALID: ReadonlySet<string> = new Set([STAKE_STATE.NEGATIVE, STAKE_STATE.ZERO, STAKE_STATE.NOT_A_NUMBER]);

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StakePayoutInput({
  combinedAmerican,
  combinedDecimal,
  defaultStake = null,
  lockedStake,
}: {
  /**
   * DISPLAY ONLY (§13). American format cannot represent 4.1223 — it quantises to +312 — so a
   * payout derived from this value loses money the slip is actually worth. This component used to
   * take only this prop and call `americanToDecimal` on it, which is exactly how a +133/-130 slip
   * on $100 displayed $412.00 instead of $412.23.
   */
  combinedAmerican: number;
  /** The full-precision multiplier, and the ONLY input to the payout. Required, so a caller cannot
   *  silently fall back to the lossy round-trip. */
  combinedDecimal: number;
  /*
   * NULL BY DEFAULT (P241 · A14). The surface promises "no stake is ever filled in for you", the
   * tier-grid doctrine says a default stake is a recommendation nobody asked for — and this input
   * rendered pre-filled with $25 anyway, so the page's example returns quietly assumed a stake
   * the reader never entered. The field now starts empty; returns render once a stake is typed
   * (or a quick button pressed), exactly as the copy says.
   */
  defaultStake?: number | null;
  /** When set (e.g. Bank Builder), the stake is fixed and not editable. */
  lockedStake?: number | null;
}) {
  const [raw, setRaw] = useState<string>(lockedStake != null ? String(lockedStake) : defaultStake != null ? String(defaultStake) : "");
  const v = lockedStake != null ? validateStake(lockedStake) : validateStake(raw);
  /*
   * ⚠ NO `?? 0`. That is what turned a rejected stake into a confident "To return $0.00 · Profit
   * +$0.00" with nothing telling the reader their input was refused. An invalid stake yields NO
   * payout and a message instead.
   */
  const payout = v.stake != null ? payoutFromDecimal(combinedDecimal, v.stake) : null;
  const stake = v.stake ?? 0;
  const dec = combinedDecimal;

  return (
    <div
      className="rounded-[8px] px-3 py-3 flex flex-col gap-2.5"
      style={{ background: "color-mix(in srgb, var(--vault-ink-black) 30%, transparent)", border: "1px solid var(--vault-rule)" }}
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
                background: "color-mix(in srgb, var(--vault-scrim-base) 70%, transparent)",
                border: `1px solid ${HARD_INVALID.has(v.state) ? "var(--vault-danger-soft)" : "var(--vault-rule)"}`,
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

      {/* An explicit reason, whenever the number used is not the number typed (§13). A clamp is
          reported too: silently computing $1.00 for a typed $0.50 is a different answer to a
          different question, and the reader cannot see which one they got. */}
      {v.message ? (
        <div
          role="status"
          className="font-mono"
          style={{ color: HARD_INVALID.has(v.state) ? "var(--vault-danger-soft)" : "var(--vault-text-mute)", fontSize: 10, lineHeight: 1.4 }}
        >
          {v.message}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        {payout ? (
          <>
            <div className="flex flex-col">
              <span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>To return</span>
              {/* P262 · number-transition: the reader's own stake drives this, so the figure travels
                  to its new value instead of snapping. A PUBLISHED number would never animate here. */}
              <AnimatedNumber
                value={payout.totalReturn}
                format={money}
                className="font-display tabular"
                style={{ color: "var(--vault-success)", fontSize: 16, fontWeight: 700 }}
              />
            </div>
            <div className="flex flex-col items-end">
              <span className="font-mono uppercase" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Profit</span>
              <AnimatedNumber
                value={payout.profit}
                format={(n) => `+${money(n)}`}
                className="font-display tabular"
                style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}
              />
            </div>
          </>
        ) : (
          /* THE SAME ARGUMENT AS THE DISCLAIMER BELOW, AND IT APPLIES HERE TOO (P281).
             This empty state renders once per card, and nothing is ever pre-filled, so on /build it
             printed EIGHTEEN times — under a field already labelled "Paper stake", beside quick-stake
             chips that show what it does, under a section intro that already says "Enter any stake to
             see the projected paper return … nothing here is placed". Eighteen copies of a sentence
             whose job the label and the chips already do is the definition of wallpaper. The field
             speaks for itself until a stake is entered. */
          null
        )}
      </div>
      {/* No per-instance "Paper only — not betting advice." here.
       *
       * This component renders once per card, so the line printed SEVENTEEN times on /build and
       * repeatedly on /mlb — under every single card. A disclaimer at that density stops being read;
       * it becomes wallpaper, which makes the page less honest in practice, not more.
       *
       * The disclosure is not weakened by removing it: every page carries the persistent top banner
       * ("Educational analytics · Not betting advice. For modeling and research purposes only.") and
       * the sub-header ("Paper-only · educational"), and the global footer states it again — that
       * one is pinned by footer-identity.test.mjs. Said clearly twice beats said faintly twenty times.
       */}
    </div>
  );
}
