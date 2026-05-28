"use client";
/**
 * LaneSpread — one premium research "spread" per risk lane.
 *
 * Replaces the prior 3-column `RiskGrid → RiskCard` layout that
 * stacked three identical-looking dense cards side-by-side. Each
 * lane now owns its own horizontal section with:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ ◆  ANCHOR · lower-variance builds                        │ ← lane header
 *   │    Thu · May 28 · MLB-only · Official · 5 slips          │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ ┌─────────────────────┐ ┌──────────┐ ┌──────────┐        │
 *   │ │ Featured slip       │ │ Alt #1   │ │ Alt #2   │        │
 *   │ │ (ParlayTicketCard,  │ │ (smaller │ │ ...      │        │
 *   │ │  emphasis=featured) │ │  ticket) │ │          │        │
 *   │ └─────────────────────┘ └──────────┘ └──────────┘        │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Mobile collapses to a single column: featured first, then alts.
 *
 * The lane header is the single owner of slate-date + sport-bucket +
 * official-pill context — the per-card chip row on individual tickets
 * is suppressed inside the spread so the same information never
 * appears twice on screen.
 *
 * Pure presentation. Optimizer pool, era filter, settlement, and
 * audit policy are untouched.
 */
import { useState } from "react";
import ParlayTicketCard from "./parlay-ticket-card";
import { getLaneDisplay } from "@/lib/lane-display";
import { formatSlateChip } from "@/lib/slate-label";
import type {
  ParlayRiskProfile,
  ParlaySlip,
  ParlayLeg,
  SuggestedSport,
} from "@/lib/parlay-suggested";
import type { CalibrationTable } from "@/lib/confidence-calibration-rules";

export interface LaneSpreadProps {
  profile: ParlayRiskProfile;
  slips: ParlaySlip[];
  /** Whether the slips for this lane came from a fallback pool (e.g.
   *  filters returned nothing and we surfaced the top unfiltered slip
   *  instead). When true, a small honest notice renders above the
   *  cards. */
  isFallback?: boolean;
  /** Slate date (YYYY-MM-DD) for the lane header. Derived from the
   *  optimizer payload by the caller — same source of truth as the
   *  page-level slate strip. */
  slateDate: string;
  /** True when the slate date is older than today (ET). */
  slateIsFallback?: boolean;
  /** Sport-bucket label shown once in the lane header. Caller derives
   *  from the active sport filter; the spread doesn't re-derive. */
  sportBucketLabel?: string | null;
  /** Calibration table threaded into each ticket. */
  calibrationTable?: CalibrationTable;
  /** Click handler for any leg in any slip in this lane (drawer). */
  onLegClick?: (leg: ParlayLeg) => void;
  /** Source kind — drives the "Saved pregame" pill on the ticket. */
  source: "snapshot" | "graded";
  /** Active sport filter — surfaced in the empty-state copy when the
   *  lane has zero matching slips. */
  sport: SuggestedSport;
  /** Whether any filter is active. Surfaced in the empty-state copy. */
  filterActive: boolean;
}

export default function LaneSpread({
  profile,
  slips,
  isFallback = false,
  slateDate,
  slateIsFallback = false,
  sportBucketLabel,
  calibrationTable,
  onLegClick,
  source,
  sport,
  filterActive,
}: LaneSpreadProps) {
  const lane = getLaneDisplay(profile);
  const slate = formatSlateChip(slateDate, slateIsFallback);
  const featured = slips[0];
  const alts = slips.slice(1);
  const savedPregame = source === "snapshot";

  return (
    <section
      aria-label={`${lane.name} lane`}
      className="rounded-[10px] overflow-hidden"
      style={{
        background: "var(--gtp-card)",
        border: `1px solid var(--gtp-card-border)`,
      }}
    >
      <LaneHeader
        lane={lane}
        slateLabel={slate.label}
        slateTone={slate.tone}
        sportBucketLabel={sportBucketLabel ?? null}
        slipCount={slips.length}
      />

      {slips.length === 0 ? (
        <LaneEmptyState
          accent={lane.accentVar}
          name={lane.name}
          sport={sport}
          filterActive={filterActive}
        />
      ) : (
        <div className="px-3 sm:px-4 pb-4">
          {isFallback && filterActive && (
            <LaneFallbackNote name={lane.name} />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3 lg:gap-4">
            {/* Featured slip — full emphasis, stake/payout footer on. */}
            <LaneSlipCard
              slip={featured}
              emphasis="featured"
              showStakeFooter
              savedPregame={savedPregame}
              calibrationTable={calibrationTable}
              onLegClick={onLegClick}
            />

            {/* Alternates column — compact tickets, no stake footer.
                On mobile the alts stack below the featured (single
                column from the grid above). On desktop the alts
                column is a vertical stack of up to N tickets. */}
            {alts.length > 0 && (
              <div className="flex flex-col gap-2">
                {alts.map((slip, i) => (
                  <LaneSlipCard
                    key={slip.slipId}
                    slip={slip}
                    emphasis="alternate"
                    showStakeFooter={false}
                    savedPregame={savedPregame}
                    calibrationTable={calibrationTable}
                    onLegClick={onLegClick}
                    altIndex={i + 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Lane header — one row carrying lane name, subtitle, slate date,
 *  sport bucket, official chip, and slip count. This is the single
 *  source of slate/sport-bucket context for the lane; per-card chips
 *  are suppressed inside the spread to avoid double-rendering. */
function LaneHeader({
  lane,
  slateLabel,
  slateTone,
  sportBucketLabel,
  slipCount,
}: {
  lane: ReturnType<typeof getLaneDisplay>;
  slateLabel: string;
  slateTone: "today" | "latest-available" | "neutral" | "missing";
  sportBucketLabel: string | null;
  slipCount: number;
}) {
  const slateColor =
    slateTone === "today"
      ? "var(--vault-gold-bright)"
      : "var(--vault-text-mute)";
  return (
    <header
      className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
      style={{
        background: "var(--gtp-card-sunken)",
        borderBottom: "1px solid var(--vault-rule)",
      }}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          color: lane.accentVar,
          background: "var(--gtp-card)",
          border: `1px solid ${lane.accentVar}`,
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        {lane.icon}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: lane.accentVar, fontSize: 11, lineHeight: 1.1 }}
        >
          {lane.name}
        </span>
        <span
          className="font-mono"
          style={{
            color: "var(--vault-text-mute)",
            fontSize: 11,
            lineHeight: 1.2,
          }}
        >
          {lane.subtitle}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <ContextChip color={slateColor} bordered>
          {slateLabel}
        </ContextChip>
        {sportBucketLabel && (
          <ContextChip color="var(--vault-text-mute)" bordered>
            {sportBucketLabel}
          </ContextChip>
        )}
        <ContextChip color="var(--vault-success)" bordered>
          Official
        </ContextChip>
        <ContextChip color="var(--vault-text-faint)">
          {slipCount} {slipCount === 1 ? "slip" : "slips"}
        </ContextChip>
      </div>
    </header>
  );
}

function ContextChip({
  children,
  color,
  bordered = false,
}: {
  children: React.ReactNode;
  color: string;
  bordered?: boolean;
}) {
  return (
    <span
      className="font-mono uppercase tracking-[0.10em] px-2 py-1 rounded-[4px] inline-flex items-center"
      style={{
        color,
        background: "var(--gtp-card)",
        border: bordered ? `1px solid ${color}` : "1px solid transparent",
        fontSize: 10,
        lineHeight: 1.1,
      }}
    >
      {children}
    </span>
  );
}

/** Slip card wrapper — keeps a small "Alt N" eyebrow above each
 *  alternate so users can see at a glance which slip is the lane's
 *  featured pick and which are alternates. */
function LaneSlipCard({
  slip,
  emphasis,
  showStakeFooter,
  savedPregame,
  calibrationTable,
  onLegClick,
  altIndex,
}: {
  slip: ParlaySlip;
  emphasis: "featured" | "alternate";
  showStakeFooter: boolean;
  savedPregame: boolean;
  calibrationTable: CalibrationTable | undefined;
  onLegClick?: (leg: ParlayLeg) => void;
  altIndex?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {emphasis === "alternate" && altIndex != null && (
        <span
          className="font-mono uppercase tracking-[0.16em] px-1"
          style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
        >
          Alt {altIndex}
        </span>
      )}
      <ParlayTicketCard
        slip={slip}
        emphasis={emphasis}
        showStakeFooter={showStakeFooter}
        savedPregame={savedPregame}
        calibrationTable={calibrationTable}
        onLegClick={onLegClick}
      />
    </div>
  );
}

function LaneFallbackNote({ name }: { name: string }) {
  return (
    <p
      className="text-[11.5px] leading-snug rounded-[4px] px-2.5 py-1.5 mb-3"
      style={{
        color: "var(--vault-text-mute)",
        background: "var(--gtp-card-sunken)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      No clean {name} slip with these filters. Showing the best
      unfiltered suggestion instead.
    </p>
  );
}

function LaneEmptyState({
  accent,
  name,
  sport,
  filterActive,
}: {
  accent: string;
  name: string;
  sport: SuggestedSport;
  filterActive: boolean;
}) {
  let title: string;
  let body: string;
  if (sport === "nba") {
    title = `No NBA-only ${name.toLowerCase()} slip`;
    body =
      "Today's slate didn't produce a clean NBA-only build for this lane. Try the Mixed tab — or the All tab to widen the pool.";
  } else if (sport === "mlb") {
    title = `No MLB-only ${name.toLowerCase()} slip`;
    body =
      "Today's slate didn't produce a clean MLB-only build for this lane. Try the Mixed tab — or the All tab to widen the pool.";
  } else if (sport === "multi") {
    title = `No mixed ${name.toLowerCase()} slip`;
    body =
      "Mixed combines sports. Use NBA or MLB tabs for single-sport slips, or All to see everything.";
  } else if (filterActive) {
    title = `No ${name.toLowerCase()} slip`;
    body =
      "These filters left nothing the model could build cleanly. Try a different team or fewer players.";
  } else {
    title = `No ${name.toLowerCase()} slip`;
    body =
      "Today's slate doesn't satisfy this lane yet — too few eligible legs or correlation caps.";
  }
  return (
    <div
      className="px-3 sm:px-4 pb-6 pt-4 flex flex-col items-center text-center gap-2"
      style={{ minHeight: 140 }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: accent, fontSize: 12, lineHeight: 1.2 }}
      >
        {title}
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 320 }}
      >
        {body}
      </p>
    </div>
  );
}

/** Optional toggle wrapper for the Swing (high-variance) lane.
 *  Renders a single button-with-disclosure; when open it surfaces a
 *  single LaneSpread with the Swing slips.
 *
 *  Kept inside the LaneSpread file so the lane-display tokens stay
 *  co-located with the only surfaces that need them.
 */
export function SwingLaneToggle(props: LaneSpreadProps & { defaultOpen?: boolean }) {
  const { defaultOpen = false, ...spread } = props;
  const [open, setOpen] = useState(defaultOpen);
  const lane = getLaneDisplay(spread.profile);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start font-mono uppercase tracking-[0.16em] px-3 py-1.5 rounded-[6px] inline-flex items-center gap-2"
        style={{
          color: lane.accentVar,
          border: `1px solid ${lane.accentVar}`,
          background: "var(--gtp-card)",
          fontSize: 10,
          cursor: "pointer",
        }}
      >
        <span aria-hidden style={{ fontSize: 12 }}>
          {open ? "▾" : "▸"}
        </span>
        {open ? `Hide ${lane.name}` : `Show ${lane.name}`}
      </button>
      {open && <LaneSpread {...spread} />}
    </div>
  );
}
