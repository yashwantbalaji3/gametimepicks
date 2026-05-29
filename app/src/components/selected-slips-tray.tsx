"use client";
/**
 * SelectedSlipsTray — the "My Card" / "Selected Slips" docked tray for
 * the Parlay Lab Suggested mode (PR `feature/build-my-card-selected-slips`).
 *
 * Reads the BuildMyCard selection context (`useBuildMyCard`) and renders
 * a sticky, bottom-docked bar that:
 *   - shows a running count (`My Card (N)`),
 *   - expands into a compact list of the selected slips — each row shows
 *     the risk-section chip, leg count, combined odds (or "—" when a leg
 *     lacks a price), an honest "pending" tag, and a per-row remove (×),
 *   - offers a "Clear all" action,
 *   - and, when nothing is selected, shows the honest empty-state prompt
 *     "Select suggested parlays to build your card."
 *
 * PR scope: selection + tray only. The paper-bankroll input and the
 * allocator (the "Build allocation" CTA) land in PR 3 — this component
 * deliberately ships without them so the selection UX can be reviewed
 * in isolation.
 *
 * Honesty contract (design doc §2.3 / §2.8 / §2.9):
 *   - combined odds come from `summarizeSelectedSlips`, which returns
 *     null when any leg is missing a price → the row renders "—", never
 *     a fabricated number.
 *   - a `pending` slip is shown as pending; we never imply it is locked.
 *   - educational framing only — "paper bankroll", "Selected Slips";
 *     never "lock", never "safe", never a guarantee.
 *
 * Positioning: fixed bottom dock. On mobile (< md) the dock floats above
 * the fixed `MobileBottomNav` (z-40) via a bottom offset that clears the
 * nav + the device safe-area inset. On desktop the mobile nav is hidden,
 * so the tray anchors bottom-right.
 */
import { useState } from "react";
import { useBuildMyCard } from "./build-my-card-context";
import {
  summarizeSelectedSlips,
  type SelectedSlipSummary,
} from "@/lib/selected-slips";
import { getRiskSectionDisplay } from "@/lib/parlay-risk-sections";
import { formatAmerican } from "@/lib/odds-math";

export default function SelectedSlipsTray() {
  const { enabled, selected, count, remove, clearAll } = useBuildMyCard();
  const [open, setOpen] = useState(false);

  // Outside a provider the context is the no-op default — render nothing
  // so the tray stays strictly opt-in to surfaces that mount the provider.
  if (!enabled) return null;

  const { summaries, withoutOdds } = summarizeSelectedSlips(selected);
  const hasSelection = count > 0;

  return (
    <div
      aria-label="Selected slips tray"
      className="fixed inset-x-0 md:inset-x-auto md:right-4 z-30 flex justify-center md:justify-end px-3 md:px-0 pointer-events-none"
      style={{
        // Clear the mobile bottom nav (fixed, z-40, ~56px tall) plus the
        // device safe-area inset on phones. On md+ the nav is hidden so a
        // flat 16px gap is enough.
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)",
      }}
    >
      <div
        className="pointer-events-auto w-full md:w-[360px] max-w-[420px] rounded-[12px] overflow-hidden md:bottom-4"
        style={{
          background: "var(--gtp-card)",
          border: `1px solid ${
            hasSelection ? "var(--vault-success)" : "var(--vault-card-border, var(--gtp-card-border))"
          }`,
          boxShadow: "0 10px 30px rgba(0,0,0,0.40)",
        }}
      >
        {/* Expanded list — only when there's a selection and the user
            opened the tray. */}
        {hasSelection && open && (
          <div
            className="max-h-[42vh] overflow-y-auto px-3 pt-3 pb-1 flex flex-col gap-2"
            style={{ borderBottom: "1px solid var(--vault-rule)" }}
          >
            {summaries.map((s) => (
              <TrayRow key={s.slipId} summary={s} onRemove={() => remove(s.slipId)} />
            ))}
            {withoutOdds > 0 && (
              <p
                className="text-[11px] leading-snug px-0.5 pt-0.5"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {withoutOdds === 1
                  ? "1 slip has no combined price yet — shown as “—”."
                  : `${withoutOdds} slips have no combined price yet — shown as “—”.`}
              </p>
            )}
          </div>
        )}

        {/* Bar — always present. Empty state vs. count state. */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {hasSelection ? (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={
                  open ? "Collapse selected slips" : "Expand selected slips"
                }
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                style={{ cursor: "pointer", background: "transparent" }}
              >
                <span
                  aria-hidden
                  className="font-mono"
                  style={{
                    color: "var(--vault-text-mute)",
                    fontSize: 12,
                    transform: open ? "rotate(180deg)" : "none",
                    transition: "transform 120ms ease",
                  }}
                >
                  ▲
                </span>
                <span
                  className="font-mono uppercase tracking-[0.14em] truncate"
                  style={{ color: "var(--vault-success)", fontSize: 12 }}
                >
                  My Card ({count})
                </span>
              </button>
              <button
                type="button"
                onClick={clearAll}
                aria-label="Clear all selected slips"
                className="font-mono uppercase tracking-[0.14em] px-2 py-1 rounded-[6px] shrink-0"
                style={{
                  color: "var(--vault-text-mute)",
                  background: "transparent",
                  border: "1px solid var(--vault-rule)",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                Clear all
              </button>
            </>
          ) : (
            <p
              className="text-[12px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              Select suggested parlays to build your card.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** One compact row in the expanded tray: risk chip · leg count ·
 *  combined odds (or "—") · pending tag · remove (×). Pure presentation
 *  over a `SelectedSlipSummary`. */
function TrayRow({
  summary,
  onRemove,
}: {
  summary: SelectedSlipSummary;
  onRemove: () => void;
}) {
  const { sectionKey, sectionLabel, legCount, combinedAmerican, status } =
    summary;
  const display = sectionKey ? getRiskSectionDisplay(sectionKey) : null;
  const odds = formatAmerican(combinedAmerican);
  const isPending = status === "pending";

  return (
    <div
      className="flex items-center gap-2 rounded-[8px] px-2.5 py-2"
      style={{ background: "var(--gtp-card-sunken)" }}
    >
      <span
        className="font-mono uppercase tracking-[0.12em] shrink-0"
        style={{
          color: display ? display.accentVar : "var(--vault-text-faint)",
          fontSize: 10,
        }}
      >
        {sectionLabel ?? "Unranked"}
      </span>
      <span
        className="font-mono shrink-0"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {legCount}-leg
      </span>
      {isPending && (
        <span
          className="font-mono uppercase tracking-[0.1em] shrink-0 px-1.5 py-0.5 rounded-[4px]"
          style={{
            color: "var(--vault-text-faint)",
            border: "1px solid var(--vault-rule)",
            fontSize: 9,
          }}
        >
          pending
        </span>
      )}
      <span
        className="font-mono ml-auto shrink-0"
        style={{ color: "var(--vault-text)", fontSize: 12 }}
      >
        {odds}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${sectionLabel ?? "slip"} from your card`}
        className="shrink-0 inline-flex items-center justify-center rounded-[6px]"
        style={{
          width: 22,
          height: 22,
          color: "var(--vault-text-mute)",
          background: "transparent",
          border: "1px solid var(--vault-rule)",
          cursor: "pointer",
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
