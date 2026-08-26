"use client";
/**
 * SelectedSlipsTray — the "My Card" / "Selected Slips" docked tray for
 * the Parlay Lab Suggested mode.
 *
 * PR `feature/build-my-card-selected-slips` (PR 2) shipped the selection
 * + compact list. PR `feature/build-my-card-bankroll-allocation` (PR 3)
 * adds the paper-bankroll input and the allocation panel: the user types
 * a paper bankroll and the tray splits it **only across the selected
 * slips** (even or confidence-weighted), reusing the pure, unit-tested
 * `allocateSelectedBankroll` helper.
 *
 * Reads the BuildMyCard selection context (`useBuildMyCard`) and renders
 * a sticky, bottom-docked bar that:
 *   - shows a running count (`My Card (N)`),
 *   - expands into a compact list of the selected slips (risk-section
 *     chip, leg count, combined odds or "—", honest "pending" tag, remove ×),
 *   - a paper-bankroll input + Even/Confidence mode toggle,
 *   - per-slip stake + projected payout, a summary footer
 *     (bankroll · allocated · reserve · total potential payout), and an
 *     honest list of any slips dropped from the allocation (settled /
 *     no price), and
 *   - when nothing is selected, the empty-state prompt
 *     "Select suggested parlays to build your card."
 *
 * Honesty contract (design doc §2.3 / §2.6 / §2.8 / §2.9):
 *   - combined odds + payouts come from the shared helpers, which return
 *     null when a leg lacks a price → "—", never a fabricated number.
 *   - a `pending` slip is shown as pending and IS allocatable (it's a
 *     pregame plan); a settled slip is dropped with "already settled" and
 *     never counted as a win/loss here.
 *   - `totalAllocated ≤ bankroll`, `reserve ≥ 0` (enforced by the helper).
 *   - educational framing only — "paper bankroll", "Selected Slips";
 *     never "lock", never "safe", never a guarantee.
 *
 * Positioning: fixed bottom dock. On mobile (< md) the dock floats above
 * the fixed `MobileBottomNav` (z-40); on desktop the mobile nav is
 * hidden, so the tray anchors bottom-right.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useBuildMyCard } from "./build-my-card-context";
import {
  summarizeSelectedSlips,
  type SelectedSlipSummary,
} from "@/lib/selected-slips";
import { getRiskSectionDisplay } from "@/lib/parlay-risk-sections";
import { formatAmerican } from "@/lib/odds-math";
import { MAX_STAKE, MIN_STAKE, sanitizeStake } from "@/lib/parlay-payout";
import {
  allocateSelectedBankroll,
  DEFAULT_BANKROLL,
  type SelectedAllocationMode,
  type SelectedSlipAllocation,
} from "@/lib/selected-bankroll-allocation";

export default function SelectedSlipsTray() {
  const { enabled, selected, count, remove, clearAll } = useBuildMyCard();
  const [open, setOpen] = useState(false);
  const [bankrollInput, setBankrollInput] = useState<string>(`${DEFAULT_BANKROLL}`);
  const [mode, setMode] = useState<SelectedAllocationMode>("even");

  // Hooks must run unconditionally — compute everything, then bail to
  // null below if no provider is mounted (the no-op default has an empty
  // `selected`, so these are cheap no-ops in that case).
  const bankroll = sanitizeStake(bankrollInput) ?? 0;
  const { summaries, withoutOdds } = useMemo(
    () => summarizeSelectedSlips(selected),
    [selected],
  );
  const allocation = useMemo(
    () => allocateSelectedBankroll({ bankroll, slips: selected, mode }),
    [bankroll, selected, mode],
  );

  // Outside a provider the context is the no-op default — render nothing
  // so the tray stays strictly opt-in to surfaces that mount the provider.
  if (!enabled) return null;

  const hasSelection = count > 0;

  return (
    <div
      aria-label="Selected slips tray"
      className="fixed inset-x-0 md:inset-x-auto md:right-4 z-30 flex justify-center md:justify-end px-3 md:px-0 pointer-events-none"
      style={{
        // Clear the mobile bottom nav (fixed, z-40, ~56px tall) plus the
        // device safe-area inset on phones. On md+ the nav is hidden so a
        // flat ~16px gap is enough (the inner panel adds its own margin).
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)",
      }}
    >
      <div
        className="pointer-events-auto w-full md:w-[380px] max-w-[440px] rounded-[12px] overflow-hidden"
        style={{
          background: "var(--gtp-card)",
          border: `1px solid ${
            hasSelection ? "var(--vault-success)" : "var(--gtp-card-border)"
          }`,
          boxShadow: "0 10px 30px color-mix(in srgb, var(--vault-ink-black) 40%, transparent)",
        }}
      >
        {/* Expanded panel — only when there's a selection and the user
            opened the tray. */}
        {hasSelection && open && (
          <div
            className="max-h-[68vh] overflow-y-auto flex flex-col"
            style={{ borderBottom: "1px solid var(--vault-rule)" }}
          >
            {/* Selected list */}
            <div className="px-3 pt-3 pb-2 flex flex-col gap-2">
              <SectionLabel>Selected slips</SectionLabel>
              {summaries.map((s) => (
                <TrayRow key={s.slipId} summary={s} onRemove={() => remove(s.slipId)} />
              ))}
              {withoutOdds > 0 && (
                <p
                  className="text-[11px] leading-snug px-0.5"
                  style={{ color: "var(--vault-text-faint)" }}
                >
                  {withoutOdds === 1
                    ? "1 slip has no combined price — shown as “—” and excluded from the split."
                    : `${withoutOdds} slips have no combined price — shown as “—” and excluded from the split.`}
                </p>
              )}
            </div>

            {/* Paper bankroll + allocation */}
            <div
              className="px-3 py-3 flex flex-col gap-3"
              style={{ borderTop: "1px solid var(--vault-rule)" }}
            >
              <div className="flex flex-wrap items-end justify-between gap-2">
                <BankrollField value={bankrollInput} onChange={setBankrollInput} />
                <ModeToggle mode={mode} onChange={setMode} />
              </div>

              <AllocationBody allocation={allocation} bankroll={bankroll} />
            </div>

            <p
              className="px-3 pb-3 text-[10.5px] leading-snug"
              style={{ color: "var(--vault-text-faint)" }}
            >
              Educational paper-bankroll split across the slips you picked —
              not financial advice, not a guarantee. Payouts are projections.
            </p>
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
                aria-label={open ? "Collapse selected slips" : "Expand selected slips"}
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-mono uppercase tracking-[0.16em]"
      style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
    >
      {children}
    </span>
  );
}

/** One compact row in the selected list: risk chip · leg count ·
 *  combined odds (or "—") · pending tag · remove (×). */
function TrayRow({
  summary,
  onRemove,
}: {
  summary: SelectedSlipSummary;
  onRemove: () => void;
}) {
  const { sectionKey, sectionLabel, legCount, combinedAmerican, status } = summary;
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
            fontSize: 10,
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

function BankrollField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Paper bankroll (USD)</SectionLabel>
      <div
        className="inline-flex items-center rounded-[6px] self-start"
        style={{
          background: "var(--gtp-card-sunken)",
          border: "1px solid var(--vault-rule)",
        }}
      >
        <span
          aria-hidden
          className="px-2 font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 13 }}
        >
          $
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={MIN_STAKE}
          max={MAX_STAKE}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Paper bankroll in USD"
          className="bg-transparent outline-none font-display tabular text-right pr-2 py-1.5 w-[90px]"
          style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 600 }}
        />
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: SelectedAllocationMode;
  onChange: (m: SelectedAllocationMode) => void;
}) {
  const options: ReadonlyArray<{ key: SelectedAllocationMode; label: string }> = [
    { key: "even", label: "Even" },
    { key: "confidence", label: "Confidence" },
  ];
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Split</SectionLabel>
      <div
        role="radiogroup"
        aria-label="Allocation split mode"
        className="inline-flex items-center gap-0.5 p-0.5 rounded-full self-start"
        style={{
          background: "var(--gtp-card-sunken)",
          border: "1px solid var(--vault-rule)",
        }}
      >
        {options.map((opt) => {
          const active = opt.key === mode;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.key)}
              className="font-mono uppercase tracking-[0.12em] px-2.5 py-1 rounded-full"
              style={{
                color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: active ? "var(--vault-gold-bright)" : "transparent",
                fontSize: 10,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AllocationBody({
  allocation,
  bankroll,
}: {
  allocation: ReturnType<typeof allocateSelectedBankroll>;
  bankroll: number;
}) {
  if (allocation.bankrollUnset) {
    return <AllocHint>Enter a paper bankroll above to split it across your slips.</AllocHint>;
  }
  if (allocation.allocatableCount === 0) {
    return (
      <div className="flex flex-col gap-2">
        <AllocHint>None of your selected slips can be allocated right now.</AllocHint>
        <DroppedList dropped={allocation.dropped} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {allocation.allocations.map((row) => (
          <AllocationRow key={row.slip.slipId} row={row} />
        ))}
      </div>
      <DroppedList dropped={allocation.dropped} />
      <AllocationSummary
        bankroll={bankroll}
        totalAllocated={allocation.totalAllocated}
        reserve={allocation.reserve}
        totalPotentialPayout={allocation.totalPotentialPayout}
      />
    </div>
  );
}

function AllocationRow({ row }: { row: SelectedSlipAllocation }) {
  const accent = row.sectionKey
    ? getRiskSectionDisplay(row.sectionKey).accentVar
    : "var(--vault-text-faint)";
  return (
    <div
      className="flex items-center gap-2 rounded-[8px] px-2.5 py-2"
      style={{ background: "var(--gtp-card-sunken)" }}
    >
      <span
        className="font-mono uppercase tracking-[0.12em] shrink-0 inline-flex items-center gap-1.5"
        style={{ color: accent, fontSize: 10 }}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: accent }}
        />
        {row.sectionLabel ?? "Unranked"}
      </span>
      <span
        className="font-mono shrink-0"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {formatAmerican(row.combinedAmerican)}
      </span>
      <span
        className="font-display tabular ml-auto shrink-0"
        style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 600 }}
      >
        {formatUsd(row.stake)}
      </span>
      <span aria-hidden style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
        →
      </span>
      <span
        className="font-display tabular shrink-0 text-right min-w-[58px]"
        style={{
          color: row.payout ? "var(--vault-success)" : "var(--vault-text-faint)",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {row.payout ? formatUsd(row.payout.totalReturn) : "—"}
      </span>
    </div>
  );
}

function DroppedList({
  dropped,
}: {
  dropped: ReturnType<typeof allocateSelectedBankroll>["dropped"];
}) {
  if (dropped.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 list-none m-0 p-0">
      {dropped.map((d) => (
        <li
          key={d.slip.slipId}
          className="text-[11px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {d.slip.legs.length}-leg slip excluded — {d.reasonLabel}.
        </li>
      ))}
    </ul>
  );
}

function AllocationSummary({
  bankroll,
  totalAllocated,
  reserve,
  totalPotentialPayout,
}: {
  bankroll: number;
  totalAllocated: number;
  reserve: number;
  totalPotentialPayout: number;
}) {
  return (
    <div
      className="rounded-[8px] px-2.5 py-2 grid grid-cols-2 gap-x-3 gap-y-1.5"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-rule)" }}
    >
      <SummaryCell label="Bankroll" value={formatUsd(bankroll)} accent="var(--vault-text)" />
      <SummaryCell label="Allocated" value={formatUsd(totalAllocated)} accent="var(--vault-gold-bright)" />
      <SummaryCell label="Reserve" value={formatUsd(reserve)} accent="var(--vault-text-mute)" />
      <SummaryCell
        label="Total potential payout"
        value={formatUsd(totalPotentialPayout)}
        accent="var(--vault-success)"
      />
    </div>
  );
}

function SummaryCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span
        className="font-mono uppercase tracking-[0.12em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular shrink-0"
        style={{ color: accent, fontSize: 12, fontWeight: 600 }}
      >
        {value}
      </span>
    </div>
  );
}

function AllocHint({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[11.5px] leading-snug rounded-[8px] px-2.5 py-2"
      style={{
        color: "var(--vault-text-mute)",
        background: "var(--gtp-card-sunken)",
        border: "1px dashed var(--vault-rule)",
      }}
    >
      {children}
    </p>
  );
}

/** Compact USD: whole dollars when integral, else 2 decimals. Honest "—"
 *  is handled by the caller (this only formats real numbers). */
function formatUsd(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
