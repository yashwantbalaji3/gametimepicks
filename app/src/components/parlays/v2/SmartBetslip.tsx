"use client";
import { forwardRef } from "react";
import Link from "next/link";
import { slipView, HANDOFF_NOT_AVAILABLE } from "@/lib/slip/smart-slip.mjs";
import type { SmartSlip } from "@/lib/slip/smart-slip-store";

/**
 * SMART BETSLIP · COMPARE-ONLY (SB-L0). Render-only over lib/slip/smart-slip.mjs, which owns every rule: snapshot
 * invalidation on edit, freshness bands, "Price not verified", same-game detection and the handoff constant.
 *
 * There is no outbound link and no sportsbook action here — the handoff control is a disabled button that explains
 * itself. The only link is the site's own responsible-use page.
 */

interface LegDisplay {
  key: string; game: string | null; selection: string | null; line: number | null; sport: string;
  freshnessText: string; priceVisible: boolean; priceText: string; bookText: string | null;
}
interface SlipDisplay {
  state: string; stateText: string; legs: LegDisplay[]; sameGame: boolean; sameGameNote: string | null;
  combinedPriceText: string; handoff: { status: string; label: string; roadmap: string }; availabilityNote: string;
}

const btn = { minHeight: 44, minWidth: 44, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", background: "transparent", fontSize: 12, fontWeight: 600 } as const;

const SmartBetslip = forwardRef<HTMLHeadingElement, {
  slip: SmartSlip;
  nowMs: number | null;
  onRemove: (key: string) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
}>(function SmartBetslip({ slip, nowMs, onRemove, onMove, onClear }, headingRef) {
  /* Until mount there is no reader clock; freshness is a client fact, so the server renders the empty state. */
  const view = slipView(nowMs == null ? { ...slip, legs: [] } : slip, { nowMs: nowMs ?? 0 }) as SlipDisplay;
  const n = view.legs.length;
  return (
    <section aria-labelledby="smart-betslip-heading" className="flex flex-col gap-3 rounded-[14px] p-3.5"
      style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border-strong)" }} data-slip-state={view.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="smart-betslip-heading" ref={headingRef} tabIndex={-1} className="m-0 font-display" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
          Compare slip
        </h3>
        <span className="font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
          Combined: <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{view.combinedPriceText}</span>
        </span>
      </div>

      <p role="status" aria-live="polite" className="m-0" style={{ color: view.state === "PRICED_AS_RECORDED" ? "var(--vault-text-mute)" : "var(--vault-warn)", fontSize: 12.5, lineHeight: 1.5 }}>
        {view.stateText}
      </p>

      {n > 0 ? (
        <ol className="flex flex-col gap-2 list-none m-0 p-0" aria-label="Legs in the compare slip">
          {view.legs.map((l, i) => {
            const name = `${l.selection ?? "leg"}${l.line != null ? ` ${l.line}` : ""}`;
            return (
              <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-3 py-2" style={{ border: "1px solid var(--vault-rule)" }}>
                <span className="flex flex-col min-w-0">
                  <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{name}</span>
                  <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                    {[l.sport.toUpperCase(), l.game].filter(Boolean).join(" · ")}
                  </span>
                  <span className="font-mono tabular-nums" style={{ color: l.priceVisible ? "var(--vault-text-mute)" : "var(--vault-warn)", fontSize: 11 }}>
                    {l.priceVisible ? `${l.priceText} at ${l.bookText}` : l.priceText} · {l.freshnessText}
                  </span>
                </span>
                <span className="flex items-center gap-1.5" role="group" aria-label={`Arrange ${name}`}>
                  <button type="button" className="vault-press rounded-full" style={btn} disabled={i === 0}
                    aria-label={`Move ${name} up`} onClick={() => onMove(i, i - 1)}>↑</button>
                  <button type="button" className="vault-press rounded-full" style={btn} disabled={i === n - 1}
                    aria-label={`Move ${name} down`} onClick={() => onMove(i, i + 1)}>↓</button>
                  <button type="button" className="vault-press rounded-full px-3" style={btn}
                    aria-label={`Remove ${name} from the slip`} onClick={() => onRemove(l.key)}>Remove</button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {view.sameGameNote ? <p className="m-0" style={{ color: "var(--vault-warn)", fontSize: 12 }}>{view.sameGameNote}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled aria-disabled="true" aria-describedby="smart-betslip-handoff-note" data-handoff-status={HANDOFF_NOT_AVAILABLE}
          className="rounded-full px-4" style={{ ...btn, color: "var(--vault-text-faint)", cursor: "not-allowed" }}>
          {view.handoff.label}
        </button>
        {n > 0 ? (
          <button type="button" className="vault-press rounded-full px-4" style={btn} onClick={onClear}>Clear slip</button>
        ) : null}
      </div>
      <p id="smart-betslip-handoff-note" className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.5 }}>
        Sending a slip to a sportsbook is not available. It would need each sportsbook&rsquo;s own documentation and book IDs, and a legal and Terms review.
      </p>
      <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.5 }}>
        {view.availabilityNote} Paper-only: nothing here places a wager. <Link href="/responsible-use" style={{ color: "var(--vault-text-mute)" }}>Responsible use</Link>
      </p>
    </section>
  );
});

export default SmartBetslip;
