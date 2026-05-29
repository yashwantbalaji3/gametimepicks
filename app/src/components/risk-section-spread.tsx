"use client";
/**
 * RiskSectionSpread — public Parlay Lab Suggested-mode layout that
 * groups slips into four odds-derived sections (Low / Medium / High /
 * Longshot) instead of internal lane names (Anchor / Core / Spotlight
 * / Swing).
 *
 * Replaces the per-profile <LaneSpread> in Suggested mode. Each
 * section renders a compact header (label · odds-range subtitle ·
 * slip count) and a grid of full ticket cards. Every card has an
 * editable stake + projected payout. Single-game NBA slips keep their
 * "Single-game · higher variance" chip from PR #148. Sport-bucket
 * label and slate-date context come from the page-level slate strip,
 * so the section headers stay clean.
 *
 * Pure presentation. Optimizer payload, settlement, era filter, and
 * audit policy are untouched.
 */
import ParlayTicketCard from "./parlay-ticket-card";
import {
  RISK_SECTION_ORDER,
  combinedAmericanOddsFromLegs,
  classifyRiskSection,
  getRiskSectionDisplay,
  type RiskSectionKey,
} from "@/lib/parlay-risk-sections";
import type {
  ParlayLeg,
  ParlaySlip,
  SuggestedSport,
} from "@/lib/parlay-suggested";
import type { CalibrationTable } from "@/lib/confidence-calibration-rules";

export interface RiskSectionSpreadProps {
  /** Pre-filtered slips for the active sport tab (Low / Medium / High
   *  / Longshot is derived from each slip's combined odds inside this
   *  component). */
  slips: ReadonlyArray<ParlaySlip>;
  /** Active sport — surfaces in the section empty-state copy. */
  sport: SuggestedSport;
  /** Honest source classification surfaced as "Saved pregame" on each
   *  ticket. */
  source: "snapshot" | "graded";
  /** Calibration table threaded into every ticket card. */
  calibrationTable?: CalibrationTable;
  /** Leg click handler — opens the recent-form drawer. */
  onLegClick?: (leg: ParlayLeg) => void;
}

/** When two slips' scores differ by less than this, prefer the one
 *  that contains at least one star leg. Mild, transparent, never
 *  surfaces a weaker slip over a better one when scores diverge. */
const STAR_TIEBREAKER_THRESHOLD = 0.05;

function _slipHasStar(slip: ParlaySlip): boolean {
  return slip.legs.some(
    (l) => l.isStar === true || (l.starTier && l.starTier !== "none"),
  );
}

function _sortWithStarTiebreaker(
  slips: ReadonlyArray<ParlaySlip>,
): ParlaySlip[] {
  // Stable sort by score descending; within `STAR_TIEBREAKER_THRESHOLD`
  // promote slips that contain a star leg.
  const arr = [...slips];
  arr.sort((a, b) => {
    const scoreGap = (b.score ?? 0) - (a.score ?? 0);
    if (Math.abs(scoreGap) >= STAR_TIEBREAKER_THRESHOLD) return scoreGap;
    const aHasStar = _slipHasStar(a);
    const bHasStar = _slipHasStar(b);
    if (aHasStar && !bHasStar) return -1;
    if (bHasStar && !aHasStar) return 1;
    // Fully tied → preserve insertion order.
    return scoreGap;
  });
  return arr;
}

export default function RiskSectionSpread({
  slips,
  sport,
  source,
  calibrationTable,
  onLegClick,
}: RiskSectionSpreadProps) {
  // Compute the (slip, sectionKey) pairs once.
  const tagged = slips.map((slip) => ({
    slip,
    section: classifyRiskSection(combinedAmericanOddsFromLegs(slip.legs)),
  }));
  // Bucket per section, preserving order.
  const buckets = new Map<RiskSectionKey, ParlaySlip[]>();
  for (const key of RISK_SECTION_ORDER) buckets.set(key, []);
  for (const t of tagged) buckets.get(t.section)!.push(t.slip);

  const savedPregame = source === "snapshot";

  return (
    <div className="flex flex-col gap-5">
      {RISK_SECTION_ORDER.map((sectionKey) => {
        const display = getRiskSectionDisplay(sectionKey);
        const sectionSlips = _sortWithStarTiebreaker(
          buckets.get(sectionKey) ?? [],
        );
        return (
          <section
            key={sectionKey}
            aria-label={`${display.label} parlays`}
            className="rounded-[10px] overflow-hidden"
            style={{
              background: "var(--gtp-card)",
              border: "1px solid var(--gtp-card-border)",
            }}
          >
            <header
              className="px-3 sm:px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"
              style={{
                background: "var(--gtp-card-sunken)",
                borderBottom: "1px solid var(--vault-rule)",
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: display.accentVar, fontSize: 12 }}
              >
                {display.label}
              </span>
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                · combined odds {display.oddsRange}
              </span>
              <span
                className="font-mono ml-auto"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                {sectionSlips.length}
                {sectionSlips.length === 1 ? " parlay" : " parlays"}
              </span>
            </header>

            {sectionSlips.length === 0 ? (
              <SectionEmpty sport={sport} sectionKey={sectionKey} />
            ) : (
              <div className="px-3 sm:px-4 py-4 grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                {sectionSlips.map((slip) => (
                  <ParlayTicketCard
                    key={slip.slipId}
                    slip={slip}
                    emphasis="featured"
                    showStakeFooter
                    savedPregame={savedPregame}
                    calibrationTable={calibrationTable}
                    onLegClick={onLegClick}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SectionEmpty({
  sport,
  sectionKey,
}: {
  sport: SuggestedSport;
  sectionKey: RiskSectionKey;
}) {
  const display = getRiskSectionDisplay(sectionKey);
  let body: string;
  if (sport === "nba") {
    body = `No NBA-only ${display.label.toLowerCase()} parlays on tonight's slate. Try the Mixed or All tabs.`;
  } else if (sport === "mlb") {
    body = `No MLB-only ${display.label.toLowerCase()} parlays today. Try the Mixed or All tabs.`;
  } else if (sport === "multi") {
    body = `No Mixed ${display.label.toLowerCase()} parlays today. Single-sport tabs may still have options.`;
  } else {
    body = `No ${display.label.toLowerCase()} parlays in today's eligible pool.`;
  }
  return (
    <div
      className="px-3 sm:px-4 pb-5 pt-3 flex flex-col items-center text-center gap-1.5"
      style={{ minHeight: 96 }}
    >
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 360 }}
      >
        {body}
      </p>
    </div>
  );
}
