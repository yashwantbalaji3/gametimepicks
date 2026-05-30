"use client";
/**
 * ParlayResultsDateSectionV2 — redesign of the parlay-first /results
 * per-date section (PR #111).
 *
 * Before: a flat grid of every slip for the date — 70 cards on 5/25.
 * After:
 *   1. Honest date header with W/L/P/Pending + hit rate
 *   2. ✅ Winning slips section (visible by default, "Show all" cap)
 *   3. ⚠ Near-misses (only when there is at least one — collapsed)
 *   4. ❌ Missed slips (collapsed; grouped by lane inside)
 *   5. — Pending / DNP slips (collapsed; explains DNP vs in-flight)
 *
 * Honesty:
 *   - The summary line still shows the full W/L/P/Pending counts.
 *   - Misses and Pending are NEVER hidden — only collapsed by
 *     default so first paint isn't a wall of red.
 *   - No banned betting copy. No fake guarantees.
 */
import { useMemo, useState } from "react";
import ParlayTicketCard from "./parlay-ticket-card";
import PlayerRecentFormDrawer from "./player-recent-form-drawer";
import type { ParlaySlip, ParlayLeg } from "@/lib/parlay-suggested";
import type { CalibrationTable } from "@/lib/confidence-calibration-rules";
import {
  classifySlipStatus,
  isNearMissSlip,
  type SlipLegResultCounts,
  summarizeSlipLegResults,
} from "@/lib/settled-player-summary";
import { getResultIcon } from "@/lib/result-icons";

interface Totals {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
}

interface Props {
  date: string;
  slips: ParlaySlip[];
  totals: Totals | null;
  calibrationTable?: CalibrationTable;
  /** Cap on winning slips visible before "Show all" expands. */
  winsVisibleCap?: number;
}

const LANE_LABEL: Record<string, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  star_power: "Star Power",
  aggressive: "Longshot",
};

const LANE_ORDER: Array<keyof typeof LANE_LABEL> = [
  "conservative",
  "balanced",
  "star_power",
  "aggressive",
];

export default function ParlayResultsDateSectionV2({
  date,
  slips,
  totals,
  calibrationTable,
  winsVisibleCap = 6,
}: Props) {
  const [activeLeg, setActiveLeg] = useState<ParlayLeg | null>(null);
  const [showAllWins, setShowAllWins] = useState(false);

  // Partition slips into wins / near-misses / misses / pending+other.
  const partitioned = useMemo(() => {
    const wins: ParlaySlip[] = [];
    const losses: ParlaySlip[] = [];
    const nearMisses: ParlaySlip[] = [];
    const pendingOrOther: ParlaySlip[] = [];
    for (const s of slips) {
      const kind = classifySlipStatus(s);
      if (kind === "win") wins.push(s);
      else if (kind === "loss") {
        if (isNearMissSlip(s)) nearMisses.push(s);
        else losses.push(s);
      } else pendingOrOther.push(s);
    }
    return { wins, losses, nearMisses, pendingOrOther };
  }, [slips]);

  const decisive = (totals?.wins ?? 0) + (totals?.losses ?? 0);
  const hitRate = decisive > 0 ? (totals?.wins ?? 0) / decisive : null;

  return (
    <section className="flex flex-col gap-3" aria-label={`Results for ${date}`}>
      <DateHeader date={date} totals={totals} hitRate={hitRate} />

      {slips.length === 0 ? (
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          No graded slips for this date yet.
        </p>
      ) : (
        <>
          <WinsSection
            wins={partitioned.wins}
            cap={winsVisibleCap}
            showAll={showAllWins}
            onToggleShowAll={() => setShowAllWins((v) => !v)}
            calibrationTable={calibrationTable}
            onLegClick={setActiveLeg}
          />
          <NearMissesSection
            slips={partitioned.nearMisses}
            calibrationTable={calibrationTable}
            onLegClick={setActiveLeg}
          />
          <MissedSection
            slips={partitioned.losses}
            calibrationTable={calibrationTable}
            onLegClick={setActiveLeg}
          />
          <PendingSection
            slips={partitioned.pendingOrOther}
            calibrationTable={calibrationTable}
            onLegClick={setActiveLeg}
          />
        </>
      )}

      <PlayerRecentFormDrawer
        leg={activeLeg}
        onClose={() => setActiveLeg(null)}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function DateHeader({
  date,
  totals,
  hitRate,
}: {
  date: string;
  totals: Totals | null;
  hitRate: number | null;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {/* PR `fix/results-simplify-dashboard` — real <h2> so each
         settled-date block is a first-class node in the heading
         outline (screen-reader + skim scannability). Styling
         unchanged. */}
      <h2
        className="font-mono uppercase tracking-[0.18em] m-0 font-normal"
        style={{ color: "var(--vault-gold)", fontSize: 11 }}
      >
        {date}
      </h2>
      {totals && (
        <div
          className="flex items-center gap-1.5 font-mono"
          style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
        >
          <ResultPill kind="win" count={totals.wins} />
          <ResultPill kind="loss" count={totals.losses} />
          {totals.pushes > 0 && (
            <ResultPill kind="push" count={totals.pushes} />
          )}
          {totals.pending > 0 && (
            <ResultPill kind="pending" count={totals.pending} />
          )}
        </div>
      )}
      {hitRate !== null && (
        <span
          className="font-display font-semibold tabular px-2 py-0.5 rounded-[3px]"
          style={{
            color: "var(--vault-gold-bright)",
            background: "rgba(212, 175, 55, 0.10)",
            border: "1px solid rgba(212, 175, 55, 0.35)",
            fontSize: 12,
          }}
        >
          {(hitRate * 100).toFixed(1)}%
        </span>
      )}
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
    </header>
  );
}

function ResultPill({
  kind,
  count,
}: {
  kind: "win" | "loss" | "push" | "pending";
  count: number;
}) {
  const meta = getResultIcon(kind);
  return (
    <span
      aria-label={`${count} ${meta.ariaLabel.toLowerCase()}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px]"
      style={{
        color: meta.tone,
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <span aria-hidden style={{ fontSize: 10 }}>
        {meta.icon}
      </span>
      <span style={{ color: "var(--vault-text)", fontSize: 11 }}>{count}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionHeading({
  tone,
  icon,
  label,
  count,
}: {
  tone: string;
  icon: string;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden style={{ fontSize: 12 }}>
        {icon}
      </span>
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: tone, fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        · {count}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
    </div>
  );
}

function WinsSection({
  wins,
  cap,
  showAll,
  onToggleShowAll,
  calibrationTable,
  onLegClick,
}: {
  wins: ParlaySlip[];
  cap: number;
  showAll: boolean;
  onToggleShowAll: () => void;
  calibrationTable?: CalibrationTable;
  onLegClick: (l: ParlayLeg) => void;
}) {
  if (wins.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeading
          tone="var(--vault-success)"
          icon={getResultIcon("win").icon}
          label="Winning slips"
          count={0}
        />
        <p
          className="text-[12px] leading-relaxed rounded-[6px] px-3 py-2"
          style={{
            color: "var(--vault-text-mute)",
            background: "var(--gtp-card)",
            border: "1px dashed var(--vault-border)",
          }}
        >
          No winning slips on this slate. The misses and pending slips
          below are still tracked — see the collapsed sections.
        </p>
      </section>
    );
  }
  const visible = showAll ? wins : wins.slice(0, cap);
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading
        tone="var(--vault-success)"
        icon={getResultIcon("win").icon}
        label="Winning slips"
        count={wins.length}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((slip) => (
          <ParlayTicketCard
            key={slip.slipId}
            slip={slip}
            savedPregame={false}
            calibrationTable={calibrationTable}
            onLegClick={onLegClick}
          />
        ))}
      </div>
      {wins.length > cap && (
        <button
          type="button"
          onClick={onToggleShowAll}
          className="self-start font-mono uppercase tracking-[0.16em] px-3 py-1.5 rounded-[6px]"
          style={{
            color: "var(--vault-success)",
            border: "1px solid var(--vault-success)",
            background: "var(--gtp-card)",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          {showAll ? "Show top" : `Show all ${wins.length} wins`}
        </button>
      )}
    </section>
  );
}

function NearMissesSection({
  slips,
  calibrationTable,
  onLegClick,
}: {
  slips: ParlaySlip[];
  calibrationTable?: CalibrationTable;
  onLegClick: (l: ParlayLeg) => void;
}) {
  if (slips.length === 0) return null;
  return (
    <details
      className="group rounded-[6px]"
      style={{
        background: "var(--gtp-card)",
        border: "1px dashed var(--vault-warn)",
        padding: "10px 12px",
      }}
    >
      <summary
        className="list-none cursor-pointer flex items-center justify-between gap-2"
        aria-label={`${slips.length} near-miss slips — slip lost by one leg`}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 12 }}>
            ⚠
          </span>
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-warn)", fontSize: 10 }}
          >
            Near misses · {slips.length}
          </span>
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            lost by exactly one leg
          </span>
        </span>
        <span
          aria-hidden
          className="font-mono transition-transform group-open:rotate-180"
          style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
        >
          ▾
        </span>
      </summary>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {slips.map((slip) => (
          <ParlayTicketCard
            key={slip.slipId}
            slip={slip}
            savedPregame={false}
            calibrationTable={calibrationTable}
            onLegClick={onLegClick}
          />
        ))}
      </div>
    </details>
  );
}

function MissedSection({
  slips,
  calibrationTable,
  onLegClick,
}: {
  slips: ParlaySlip[];
  calibrationTable?: CalibrationTable;
  onLegClick: (l: ParlayLeg) => void;
}) {
  if (slips.length === 0) return null;
  // Sub-group by lane.
  const buckets = new Map<string, ParlaySlip[]>();
  for (const s of slips) {
    const k = (s.riskProfile ?? "other") as string;
    buckets.set(k, [...(buckets.get(k) ?? []), s]);
  }
  return (
    <details
      className="group rounded-[6px]"
      style={{
        background: "var(--gtp-card)",
        border: "1px dashed var(--vault-border)",
        padding: "10px 12px",
      }}
    >
      <summary
        className="list-none cursor-pointer flex items-center justify-between gap-2"
        aria-label={`${slips.length} missed slips — collapsed by default`}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 12 }}>
            {getResultIcon("loss").icon}
          </span>
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-warn)", fontSize: 10 }}
          >
            Missed slips · {slips.length}
          </span>
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            tap to expand
          </span>
        </span>
        <span
          aria-hidden
          className="font-mono transition-transform group-open:rotate-180"
          style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
        >
          ▾
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {LANE_ORDER.filter((k) => (buckets.get(k) ?? []).length > 0).map((k) => (
          <LaneBucket
            key={k}
            label={LANE_LABEL[k]}
            slips={buckets.get(k) ?? []}
            calibrationTable={calibrationTable}
            onLegClick={onLegClick}
          />
        ))}
        {/* Any lane key we don't recognize falls into "Other" so we never
            silently drop slips. */}
        {[...buckets.entries()]
          .filter(([k]) => !(LANE_ORDER as string[]).includes(k))
          .map(([k, list]) => (
            <LaneBucket
              key={k}
              label={LANE_LABEL[k] ?? k}
              slips={list}
              calibrationTable={calibrationTable}
              onLegClick={onLegClick}
            />
          ))}
      </div>
    </details>
  );
}

function LaneBucket({
  label,
  slips,
  calibrationTable,
  onLegClick,
}: {
  label: string;
  slips: ParlaySlip[];
  calibrationTable?: CalibrationTable;
  onLegClick: (l: ParlayLeg) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {label} · {slips.length}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {slips.map((slip) => (
          <ParlayTicketCard
            key={slip.slipId}
            slip={slip}
            savedPregame={false}
            calibrationTable={calibrationTable}
            onLegClick={onLegClick}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Honest per-slip pending reason, derived purely from how many legs
 * have already graded. We state only what the leg data verifiably
 * shows — the count of unresolved legs — and never infer a cause
 * (DNP vs. not-started) we can't confirm from `result` alone. The
 * group prose below covers the two possible causes in general terms.
 */
function pendingReasonForSlip(slip: ParlaySlip): string {
  const c = summarizeSlipLegResults(slip);
  const resolved = c.wins + c.losses + c.pushes;
  if (c.pending <= 0) {
    // Every leg graded but the slip hasn't settled — grading lag.
    return "Settlement pending";
  }
  if (resolved > 0) {
    return `Waiting on ${c.pending} of ${c.total} legs`;
  }
  return `All ${c.total} legs pending`;
}

function PendingSection({
  slips,
  calibrationTable,
  onLegClick,
}: {
  slips: ParlaySlip[];
  calibrationTable?: CalibrationTable;
  onLegClick: (l: ParlayLeg) => void;
}) {
  if (slips.length === 0) return null;
  return (
    <details
      className="group rounded-[6px]"
      style={{
        background: "var(--gtp-card)",
        border: "1px dashed var(--vault-border)",
        padding: "10px 12px",
      }}
    >
      <summary
        className="list-none cursor-pointer flex items-center justify-between gap-2"
        aria-label={`${slips.length} pending or unavailable slips`}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 12 }}>
            {getResultIcon("pending").icon}
          </span>
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
          >
            Pending / DNP · {slips.length}
          </span>
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            excluded from hit rate
          </span>
        </span>
        <span
          aria-hidden
          className="font-mono transition-transform group-open:rotate-180"
          style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
        >
          ▾
        </span>
      </summary>
      <p
        className="mt-2 text-[11.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Pending here means the slip is either still in flight, or one of
        its legs ended up with the player DNP / box score unavailable.
        These slips are never counted as wins or losses — they sit out
        of the decisive denominator until they settle.
      </p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {slips.map((slip) => (
          <div key={slip.slipId} className="flex flex-col gap-1">
            <span
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              {pendingReasonForSlip(slip)}
            </span>
            <ParlayTicketCard
              slip={slip}
              savedPregame={false}
              calibrationTable={calibrationTable}
              onLegClick={onLegClick}
            />
          </div>
        ))}
      </div>
    </details>
  );
}

// Keep this re-export so future callers can compute slip-leg counts off
// the same module without re-importing settled-player-summary.
export { summarizeSlipLegResults };
export type { SlipLegResultCounts };
