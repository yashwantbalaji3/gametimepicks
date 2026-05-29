"use client";
/**
 * BankrollPlanPanel — UI for the Parlay Lab "Bankroll Plan" mode.
 *
 * Inputs (top of the panel):
 *   - Bankroll (USD, editable)
 *   - Risk preference (Lower variance · Balanced · Growth)
 *   - Include Swing toggle
 *   - Max slips selector (3 / 5 / 8)
 *
 * Output (below the inputs):
 *   - One card per allocated slip showing lane, combined odds,
 *     editable stake, and projected payout.
 *   - Footer summary: total allocated · reserve · total potential
 *     payout.
 *
 * Honesty:
 *   - Allocation math lives in `allocateBankroll` (pure, unit-tested).
 *   - When any leg lacks `oddsForSide`, the per-slip payout renders as
 *     "—" rather than a fabricated dollar figure.
 *   - Caption explicitly frames the panel as an educational planning
 *     aid, not financial advice.
 *
 * No banned betting copy. No "safe" / "safety". No "guaranteed".
 */
import { useId, useMemo, useState } from "react";
import {
  allocateBankroll,
  type BankrollAllocationResult,
  type RiskPreference,
  type SlipAllocation,
} from "@/lib/bankroll-allocation";
import {
  MAX_STAKE,
  MIN_STAKE,
  projectedPayoutForStake,
  sanitizeStake,
} from "@/lib/parlay-payout";
import { formatAmerican } from "@/lib/odds-math";
import { getLaneDisplay } from "@/lib/lane-display";
import {
  classifyRiskSection,
  combinedAmericanOddsFromLegs,
  getRiskSectionDisplay,
} from "@/lib/parlay-risk-sections";
import type { ParlaySlip } from "@/lib/parlay-suggested";

interface Props {
  /** All eligible slips for the active sport filter. The panel runs
   *  its allocator over this exact pool — the parent decides what's
   *  eligible (e.g. honoring the sport pill on the toolbar). */
  slips: ReadonlyArray<ParlaySlip>;
}

const RISK_OPTIONS: ReadonlyArray<{
  key: RiskPreference;
  label: string;
  sub: string;
}> = [
  {
    key: "lower-variance",
    label: "Lower variance",
    sub: "Tilt toward Anchor + Core",
  },
  {
    key: "balanced",
    label: "Balanced",
    sub: "Default weight curve",
  },
  {
    key: "growth",
    label: "Growth",
    sub: "More toward Spotlight + Swing",
  },
];

const MAX_SLIP_OPTIONS = [3, 5, 8];

const DEFAULT_BANKROLL = 50;

export default function BankrollPlanPanel({ slips }: Props) {
  const [bankrollInput, setBankrollInput] = useState<string>(`${DEFAULT_BANKROLL}`);
  const [riskPref, setRiskPref] = useState<RiskPreference>("balanced");
  const [includeSwing, setIncludeSwing] = useState(false);
  const [maxSlips, setMaxSlips] = useState<number>(5);
  // Per-slip stake overrides: when the user edits a stake input, that
  // slip's stake is taken from this map instead of the allocator's
  // recommendation. Keyed by slipId so re-allocation doesn't wipe edits
  // for slips that are still in the picked set.
  const [stakeOverrides, setStakeOverrides] = useState<Record<string, string>>({});

  const bankroll = sanitizeStake(bankrollInput) ?? 0;

  const result: BankrollAllocationResult = useMemo(() => {
    return allocateBankroll({
      bankroll,
      slips,
      riskPreference: riskPref,
      includeSwing,
      maxSlips,
    });
  }, [bankroll, slips, riskPref, includeSwing, maxSlips]);

  // Project the (possibly edited) totals so the summary reflects what
  // the user actually intends to stake.
  const effective = useMemo(() => {
    const rows: SlipAllocation[] = result.allocations.map((a) => {
      const overrideRaw = stakeOverrides[a.slip.slipId];
      const overrideClean = overrideRaw != null ? sanitizeStake(overrideRaw) : null;
      const stake = overrideClean ?? a.stake;
      const payout = projectedPayoutForStake(a.slip.legs, stake);
      return { slip: a.slip, stake, payout };
    });
    const totalAllocated = rows.reduce((s, a) => s + a.stake, 0);
    const totalPotentialPayout = rows.reduce(
      (s, a) => s + (a.payout?.totalReturn ?? 0),
      0,
    );
    const reserve = Math.max(bankroll - totalAllocated, 0);
    return { rows, totalAllocated, totalPotentialPayout, reserve };
  }, [result.allocations, stakeOverrides, bankroll]);

  const bankrollId = useId();
  const maxSlipsId = useId();

  return (
    <section
      aria-label="Bankroll Plan"
      className="flex flex-col gap-4"
    >
      <PlanIntro />

      <div
        className="rounded-[10px] p-3 sm:p-4 flex flex-col gap-4"
        style={{
          background: "var(--gtp-card)",
          border: "1px solid var(--gtp-card-border)",
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 sm:gap-4 items-end">
          <BankrollInput
            id={bankrollId}
            value={bankrollInput}
            onChange={setBankrollInput}
          />
          <RiskPicker active={riskPref} onChange={setRiskPref} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SwingToggle on={includeSwing} onChange={setIncludeSwing} />
          <MaxSlipsPicker
            id={maxSlipsId}
            value={maxSlips}
            onChange={(n) => setMaxSlips(n)}
          />
        </div>
      </div>

      {bankroll <= 0 ? (
        <EmptyHint title="Set a bankroll to see suggested allocation" body="Enter a positive dollar amount above. The planner will distribute it across model-suggested slips." />
      ) : effective.rows.length === 0 ? (
        <EmptyHint
          title="No allocatable slips for the current filters"
          body="Widen the sport filter on Suggested mode, raise Max slips, or enable Swing to bring more eligible slips in."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <header className="flex items-baseline justify-between gap-2">
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              Suggested allocation
            </span>
            {result.capHit && (
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                {effective.rows.length} of {result.capHit ? "more" : ""} eligible slips
              </span>
            )}
          </header>
          <div className="flex flex-col gap-2">
            {effective.rows.map((row) => (
              <AllocationRow
                key={row.slip.slipId}
                row={row}
                onStakeChange={(value) =>
                  setStakeOverrides((prev) => ({
                    ...prev,
                    [row.slip.slipId]: value,
                  }))
                }
                stakeInputValue={
                  stakeOverrides[row.slip.slipId] ?? `${row.stake}`
                }
              />
            ))}
          </div>
          <PlanSummary
            bankroll={bankroll}
            totalAllocated={effective.totalAllocated}
            reserve={effective.reserve}
            totalPotentialPayout={effective.totalPotentialPayout}
          />
        </div>
      )}
    </section>
  );
}

function PlanIntro() {
  return (
    <p
      className="text-[13px] leading-relaxed"
      style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}
    >
      Educational planning aid. Set a bankroll and a risk preference;
      the planner suggests a starting allocation across today&apos;s
      model-ranked slips. You can edit any stake — payouts update in
      place. Not financial advice.
    </p>
  );
}

function BankrollInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={`${id}-bankroll`}
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Bankroll (USD)
      </label>
      <div
        className="inline-flex items-center rounded-[6px]"
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
          id={`${id}-bankroll`}
          type="number"
          inputMode="decimal"
          min={MIN_STAKE}
          max={MAX_STAKE}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Total bankroll in USD"
          className="bg-transparent outline-none font-display tabular text-right pr-2 py-2 w-[96px]"
          style={{
            color: "var(--vault-text)",
            fontSize: 18,
            fontWeight: 600,
          }}
        />
      </div>
    </div>
  );
}

function RiskPicker({
  active,
  onChange,
}: {
  active: RiskPreference;
  onChange: (next: RiskPreference) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Risk preference
      </span>
      <div
        role="radiogroup"
        aria-label="Risk preference"
        className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full self-start"
        style={{
          background: "var(--gtp-card-sunken)",
          border: "1px solid var(--vault-rule)",
        }}
      >
        {RISK_OPTIONS.map((opt) => {
          const isActive = opt.key === active;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(opt.key)}
              title={opt.sub}
              className="font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-full inline-flex items-center"
              style={{
                color: isActive ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: isActive ? "var(--vault-gold-bright)" : "transparent",
                fontSize: 10,
                fontWeight: isActive ? 600 : 500,
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

function SwingToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className="inline-flex items-center gap-2 cursor-pointer select-none"
      style={{ color: "var(--vault-text)" }}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--vault-gold-bright)]"
        style={{ width: 16, height: 16 }}
        aria-label="Include Swing (high-variance) slips"
      />
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ fontSize: 11 }}
      >
        Include Swing
      </span>
    </label>
  );
}

function MaxSlipsPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={`${id}-max`}
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Max slips
      </label>
      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-full"
        style={{
          background: "var(--gtp-card-sunken)",
          border: "1px solid var(--vault-rule)",
        }}
        role="group"
        aria-label="Maximum number of slips"
      >
        {MAX_SLIP_OPTIONS.map((n) => {
          const isActive = n === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={isActive}
              className="font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-full"
              style={{
                color: isActive ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: isActive ? "var(--vault-gold-bright)" : "transparent",
                fontSize: 10,
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AllocationRow({
  row,
  onStakeChange,
  stakeInputValue,
}: {
  row: SlipAllocation;
  onStakeChange: (v: string) => void;
  stakeInputValue: string;
}) {
  // Internal lane label is kept on the slip's `riskProfile` for the
  // allocator math; the user-visible chip uses the new public risk
  // section derived from combined odds.
  void getLaneDisplay;
  const combinedAmerican = combinedAmericanOddsFromLegs(row.slip.legs);
  const sectionKey = classifyRiskSection(combinedAmerican);
  const section = getRiskSectionDisplay(sectionKey);
  return (
    <article
      aria-label={`${section.label} allocation`}
      className="rounded-[8px] px-3 py-3 flex flex-wrap items-center gap-3"
      style={{
        background: "var(--gtp-card-sunken)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em] inline-flex items-center gap-1.5 shrink-0"
        style={{ color: section.accentVar, fontSize: 11 }}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: section.accentVar }}
        />
        {section.label}
      </span>
      <span
        className="font-mono shrink-0"
        style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
      >
        {row.slip.legs.length}{" "}
        {row.slip.legs.length === 1 ? "leg" : "legs"}
      </span>
      <span
        className="font-display tabular shrink-0"
        style={{
          color: "var(--vault-gold-bright)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {combinedAmerican != null ? formatAmerican(combinedAmerican) : "—"}
      </span>
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Stake
        </span>
        <div
          className="inline-flex items-center rounded-[6px]"
          style={{
            background: "var(--gtp-card)",
            border: "1px solid var(--vault-rule)",
          }}
        >
          <span
            aria-hidden
            className="px-1.5 font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
          >
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={MIN_STAKE}
            max={MAX_STAKE}
            step={1}
            value={stakeInputValue}
            onChange={(e) => onStakeChange(e.target.value)}
            aria-label={`Stake for ${section.label} slip`}
            className="bg-transparent outline-none font-display tabular text-right pr-2 py-1 w-[68px]"
            style={{
              color: "var(--vault-text)",
              fontSize: 14,
              fontWeight: 600,
            }}
          />
        </div>
      </div>
      <div className="flex flex-col items-end gap-0 shrink-0 min-w-[88px]">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Projected payout
        </span>
        <span
          className="font-display tabular"
          style={{
            color: row.payout ? "var(--vault-success)" : "var(--vault-text-faint)",
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {row.payout ? `$${row.payout.totalReturn.toFixed(2)}` : "—"}
        </span>
      </div>
    </article>
  );
}

function PlanSummary({
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
    <footer
      className="rounded-[8px] px-3 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <SummaryCell label="Bankroll" value={`$${bankroll.toFixed(0)}`} accent="var(--vault-text)" />
      <SummaryCell
        label="Total allocated"
        value={`$${totalAllocated.toFixed(0)}`}
        accent="var(--vault-gold-bright)"
      />
      <SummaryCell label="Reserve" value={`$${reserve.toFixed(0)}`} accent="var(--vault-text-mute)" />
      <SummaryCell
        label="Total potential payout"
        value={`$${totalPotentialPayout.toFixed(0)}`}
        accent="var(--vault-success)"
      />
    </footer>
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
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="font-mono uppercase tracking-[0.14em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular truncate"
        style={{
          color: accent,
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyHint({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-[10px] px-4 py-5 flex flex-col items-center text-center gap-2"
      style={{
        background: "var(--gtp-card)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
      >
        {title}
      </span>
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 360 }}
      >
        {body}
      </p>
    </div>
  );
}
