"use client";
import { useState } from "react";
import { compareSlipOdds, slipSummaryText } from "@/lib/slip/odds-comparison.mjs";

/**
 * SMART BETSLIP · "COMPARE SPORTSBOOK ODDS" — render-only over lib/slip/odds-comparison.mjs, which owns every rule
 * (same-line matching, freshness, eligible operators, the correlation block on the combined price, the handoff
 * capability from the matrix).
 *
 * NO LINKS. The Terms say the Site does not link to or partner with any sportsbook, so this component renders no
 * anchor and no navigation of any kind. The handoff is the copyable leg-by-leg summary; each operator's capability
 * label (MANUAL_ENTRY for every sportsbook today) says so plainly.
 */

interface Matched { legIndex: number; priceText: string; line: number; capturedAt: string; freshness: string }
interface Missing { legIndex: number; reason: string; text: string; bookLines?: number[] }
interface OperatorView {
  book: string; title: string; status: string; matched: Matched[]; missing: Missing[];
  combined: { available: boolean; text: string; blockedText: string | null; label: string | null };
  handoff: { capability: string; label: string };
}
interface LegView { legIndex: number; game: string | null; player: string | null; marketLabel: string | null; identity: { side: string | null; line: number | null } }
interface Comparison { legs: LegView[]; operators: OperatorView[]; anyPriced: boolean; availabilityNote: string; correlation: { text: string | null } }

const btn = { minHeight: 44, minWidth: 44, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", background: "transparent", fontSize: 12, fontWeight: 600 } as const;
const STATUS_TEXT: Record<string, (n: number, of: number) => string> = {
  ALL_MATCHED: (n) => `All ${n} legs priced`,
  PARTIAL: (n, of) => `${n} of ${of} legs priced`,
  NONE: (_n, of) => `None of ${of} legs priced`,
};
const when = (iso: string) => `${new Date(iso).toISOString().slice(11, 16)} UTC`;
const legName = (l: LegView) => [l.player, l.marketLabel, l.identity.side ? `${l.identity.side === "over" ? "Over" : "Under"} ${l.identity.line ?? ""}` : null].filter(Boolean).join(" · ");

export default function SportsbookOddsCompare({ legs, priceRecords, nowMs, defaultOpen = false }: {
  legs: readonly unknown[];
  /** Normalised `gtp.nba.prop-price@1` records. None are captured today (no authorized NBA prop capture). */
  priceRecords: readonly unknown[];
  nowMs: number | null;
  /** Tests and the dev fixture route only. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState<string | null>(null);
  if (!legs.length) return null;
  const raw = nowMs == null ? null : compareSlipOdds({ legs: [...legs], priceRecords: [...priceRecords], nowMs });
  const c = raw as Comparison | null;

  const copy = async (book: string) => {
    if (!raw) return;
    try { await navigator.clipboard.writeText(slipSummaryText(raw, book)); setCopied(book); } catch { setCopied(null); }
  };

  return (
    <div className="flex flex-col gap-2" data-odds-compare="">
      <button type="button" className="vault-press rounded-full px-4 self-start" style={btn} aria-expanded={open} aria-controls="smart-betslip-odds-compare"
        onClick={() => setOpen((v) => !v)}>
        Compare sportsbook odds
      </button>
      {open ? (
        <div id="smart-betslip-odds-compare" className="flex flex-col gap-2">
          {!c || !c.anyPriced ? (
            <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.5 }}>
              No sportsbook has a recorded price for these exact legs yet, so there is nothing to compare.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 list-none m-0 p-0" aria-label="Recorded prices by sportsbook">
              {c.operators.map((o) => (
                <li key={o.book} className="flex flex-col gap-1 rounded-[10px] px-3 py-2" style={{ border: "1px solid var(--vault-rule)" }} data-operator-status={o.status} data-handoff={o.handoff.capability}>
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>{o.title}</span>
                    <span className="font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{STATUS_TEXT[o.status](o.matched.length, c.legs.length)}</span>
                  </span>
                  <ol className="flex flex-col gap-0.5 list-none m-0 p-0">
                    {c.legs.map((l) => {
                      const m = o.matched.find((x) => x.legIndex === l.legIndex);
                      const miss = o.missing.find((x) => x.legIndex === l.legIndex);
                      return (
                        <li key={l.legIndex} className="font-mono tabular-nums" style={{ color: m ? "var(--vault-text-mute)" : "var(--vault-warn)", fontSize: 11 }}>
                          {legName(l)} · {m ? `${m.priceText} · recorded ${when(m.capturedAt)}` : `${miss?.text ?? "Not priced"}${miss?.bookLines ? ` (${miss.bookLines.join(" / ")})` : ""}`}
                        </li>
                      );
                    })}
                  </ol>
                  <span className="font-mono tabular-nums" style={{ color: "var(--vault-text)", fontSize: 12 }}>
                    Combined: {o.combined.text}
                  </span>
                  <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{o.combined.available ? o.combined.label : o.combined.blockedText}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <button type="button" className="vault-press rounded-full px-3" style={btn} onClick={() => copy(o.book)}
                      aria-label={`Copy the ${o.title} slip summary`}>
                      {copied === o.book ? "Copied" : "Copy slip"}
                    </button>
                    <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{o.handoff.label}.</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.5 }}>
            Prices are as recorded, not live, and only the same line counts as the same leg. We do not link to sportsbooks: copy the slip and enter it yourself. {c?.availabilityNote ?? ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
