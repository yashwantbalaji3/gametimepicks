"use client";
/**
 * ParlayTicketCard — research-card rendering for a single `ParlaySlip`.
 *
 * Rebuilt in PR `feature/lane-spread-slip-cards` (2026-05-28) as part
 * of the Option C editorial direction:
 *
 *   - Header pairs the lane chip with a prominent right-aligned
 *     combined-odds pill. Combined odds is the single largest number
 *     on the card so the user's eye lands there first.
 *   - "Pending final stats" copy is dropped on active suggested cards;
 *     graded cards still surface the resolved status ("Slip hit" /
 *     "Slip missed" / etc.) because that IS the most important fact
 *     about a graded slip.
 *   - The per-card slate / origin / sport-bucket chip row is gone;
 *     the lane spread carries that context once for the whole lane.
 *   - The per-leg "Calibration watch" signal text is replaced with a
 *     tiny tone-dot on the market label — same information, no noise.
 *   - "View form →" copy on each leg becomes "Form →".
 *   - Footer is now a stake input + projected payout pair. Stake math
 *     uses the existing odds-math + new parlay-payout helpers; the
 *     payout is null whenever any leg's `oddsForSide` is missing, so
 *     no fabricated dollar figures ever render.
 *
 * Source: `ParlaySlip` from `@/lib/parlay-suggested`. Pure
 * presentation — no fetches, no fabricated odds, payouts, or stats.
 */
import { useId, useState } from "react";
import type { ParlaySlip, ParlayLeg } from "@/lib/parlay-suggested";
import { formatAmerican } from "@/lib/odds-math";
import {
  DEFAULT_STAKE,
  MAX_STAKE,
  MIN_STAKE,
  projectedPayoutForStake,
  sanitizeStake,
} from "@/lib/parlay-payout";
import {
  EMPTY_CALIBRATION_TABLE,
  calibratedConfidenceLabelFromTable,
  type CalibrationTable,
  type Sport,
} from "@/lib/confidence-calibration-rules";
import { getLaneDisplay } from "@/lib/lane-display";
import {
  classifyRiskSection,
  combinedAmericanOddsFromLegs,
  getRiskSectionDisplay,
} from "@/lib/parlay-risk-sections";
import { formatSlateChip } from "@/lib/slate-label";
import { formatLegGameTime } from "@/lib/leg-game-time";
import { formatSideLine, humanMarketLabel } from "@/lib/market-label";
import PlayerAvatar from "./player-avatar";
import TeamLogo from "./team-logo";

interface Props {
  slip: ParlaySlip;
  /** When true, label the ticket as "Saved before games" (pregame
   *  snapshot) vs the default "Live preview" used by the builder. */
  savedPregame?: boolean;
  /** Optional calibration table (pre-loaded on the server). When
   *  absent, falls back to the empty table — every tier classifies
   *  as "unknown" so we render the raw confidence label without an
   *  overlay. Server pages pass this from `loadCalibrationTable()`;
   *  client callers (e.g. ParlayLabExperience) should pass through
   *  the table they received as their own prop. */
  calibrationTable?: CalibrationTable;
  /** Optional click handler. When provided each leg row becomes a
   *  button that calls onLegClick(leg). The drawer that pops up is
   *  the caller's responsibility — this component only emits the
   *  click. */
  onLegClick?: (leg: ParlayLeg) => void;
  /** PR `feature/lane-spread-slip-cards` — visual emphasis level.
   *  Featured slips get a heavier ticket presentation; alternates
   *  render slightly more subdued so the lane has a clear hierarchy.
   *  Defaults to "featured" for backward compatibility. */
  emphasis?: "featured" | "alternate";
  /** PR `feature/lane-spread-slip-cards` — whether to render the
   *  stake/payout footer. The lane spread surfaces the featured
   *  slip's payout footer; alternates can opt out via false to keep
   *  the lane compact. Defaults to true. */
  showStakeFooter?: boolean;
  /** Per-card slate date chip (YYYY-MM-DD). Lane-spread callers
   *  pass `null`/omit because the lane header already shows the
   *  slate context once. Non-Lab surfaces (e.g. /results) still
   *  pass it so each card carries its own date. */
  slateDate?: string | null;
  /** True when `slateDate` is older than today (ET). */
  slateIsFallback?: boolean;
  /** Origin classification chip. Lane-spread callers omit (lane
   *  header carries one canonical "Official" pill); historical
   *  surfaces still pass to distinguish official / custom / replay. */
  origin?: "official" | "custom" | "replay";
  /** Sport-bucket chip ("NBA-only", "MLB-only", "Mixed"). Same rule
   *  as `slateDate`/`origin`: lane spread omits, other surfaces pass. */
  sportBucketLabel?: string | null;
  /** PR `feature/build-my-card-selected-slips` — opt-in selection
   *  affordance. When true, the card renders an "Add to my card" toggle
   *  below the legs. Strictly opt-in: every existing surface (Results,
   *  homepage, Build Your Own) omits these props and renders exactly as
   *  before. */
  selectable?: boolean;
  /** Whether this slip is currently in the user's selected set. Only
   *  meaningful when `selectable` is true. */
  selected?: boolean;
  /** Toggle handler — receives the slip so the caller can dedupe by
   *  slipId. Only wired when `selectable` is true. */
  onToggleSelect?: (slip: ParlaySlip) => void;
}

/** Resolved/graded status copy. Active "pending" slips intentionally
 *  show NO status text — the user already knows the slip is live by
 *  context (it's on the Lab page), and surfacing "Pending final
 *  stats" on every active card was visual noise. */
function gradedStatusLabel(status: ParlaySlip["status"]): string | null {
  switch (status) {
    case "win":
      return "Slip hit";
    case "loss":
      return "Slip missed";
    case "push":
      return "Slip push";
    case "void":
      return "Slip void";
    case "pending":
    default:
      return null;
  }
}

function slateChipColor(tone: "today" | "latest-available" | "neutral" | "missing"): string {
  switch (tone) {
    case "today":
      return "var(--vault-gold-bright)";
    case "latest-available":
      return "var(--vault-text-mute)";
    case "missing":
      return "var(--vault-warn)";
    case "neutral":
    default:
      return "var(--vault-text-mute)";
  }
}

function statusColor(status: ParlaySlip["status"]): string {
  switch (status) {
    case "win":
      return "var(--vault-success)";
    case "loss":
      return "var(--vault-warn)";
    case "push":
      return "var(--vault-text-mute)";
    case "void":
      return "var(--vault-text-faint)";
    case "pending":
    default:
      return "var(--vault-gold-bright)";
  }
}

export default function ParlayTicketCard({
  slip,
  savedPregame,
  calibrationTable = EMPTY_CALIBRATION_TABLE,
  onLegClick,
  emphasis = "featured",
  showStakeFooter = true,
  slateDate = null,
  slateIsFallback = false,
  origin,
  sportBucketLabel = null,
  selectable = false,
  selected = false,
  onToggleSelect,
}: Props) {
  const accent = statusColor(slip.status);
  // PR `feature/parlay-risk-section-simplification` (2026-05-28) —
  // The public chip on each card now shows the odds-derived risk
  // section (Low / Medium / High / Longshot), not the internal lane
  // name (Anchor / Core / Spotlight / Swing). The internal name still
  // drives the Star Power glow + Bankroll Plan allocator math, but
  // the user-facing label is unified.
  const lane = getLaneDisplay(slip.riskProfile);
  const _combinedForChip = combinedAmericanOddsFromLegs(slip.legs);
  const riskSection = getRiskSectionDisplay(
    classifyRiskSection(_combinedForChip),
  );
  const isStarPower = slip.riskProfile === "star_power";
  const isFeatured = emphasis === "featured";
  const gradedLabel = gradedStatusLabel(slip.status);
  const slate = slateDate ? formatSlateChip(slateDate, slateIsFallback) : null;
  const showChipRow = !!(slate || origin || sportBucketLabel);
  const combined = projectedPayoutForStake(slip.legs, 1);
  // combined odds are derived from the same decimal math as the
  // payout helper. We only need the American format here.
  const combinedAmerican = combined
    ? (() => {
        const decimal = combined.totalReturn; // stake=1 → decimal
        if (decimal >= 2) return Math.round((decimal - 1) * 100);
        if (decimal > 1) return -Math.round(100 / (decimal - 1));
        return 0;
      })()
    : null;

  // Stake input lives in the card itself so the user can edit per
  // slip without a global stake setting. Sanitised on commit; the
  // raw string is kept for input control so the user can type freely.
  const [stakeInput, setStakeInput] = useState<string>(`${DEFAULT_STAKE}`);
  const stake = sanitizeStake(stakeInput) ?? DEFAULT_STAKE;
  const payout = projectedPayoutForStake(slip.legs, stake);
  const stakeId = useId();

  return (
    <article
      className={`gtp-parlay-ticket relative overflow-hidden flex flex-col ${
        isFeatured ? "gap-3" : "gap-2"
      } ${isStarPower && isFeatured ? "casino-glow-card" : ""}`}
      data-emphasis={emphasis}
      style={{
        opacity: isFeatured ? 1 : 0.95,
      }}
      aria-label={`${riskSection.label} parlay slip · ${slip.legs.length} legs${
        gradedLabel ? ` · ${gradedLabel}` : ""
      }`}
    >
      {/* Top accent rule keyed to status. Visual differentiator that
          gives the card a "ticket" feel without changing dimensions. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: isFeatured ? 0.75 : 0.5,
        }}
      />

      <header
        className={`flex items-center justify-between gap-3 px-4 ${
          isFeatured ? "pt-3.5" : "pt-3"
        }`}
      >
        <span
          className="font-mono uppercase tracking-[0.16em] inline-flex items-center gap-1.5 min-w-0"
          style={{ color: riskSection.accentVar, fontSize: isFeatured ? 11 : 10 }}
        >
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: riskSection.accentVar }}
          />
          <span className="truncate">
            {riskSection.label}
            {slip.singleGame
              ? " · single-game"
              : slip.sameGame
                ? " · same-game"
                : ""}
          </span>
        </span>
        <CombinedOddsPill
          american={combinedAmerican}
          emphasis={emphasis}
          gradedLabel={gradedLabel}
          accent={accent}
          savedPregame={savedPregame}
        />
      </header>

      {slip.singleGame && (
        <div
          className="px-4 -mt-1"
          aria-label="Single-game variance note"
        >
          <span
            className="font-mono uppercase tracking-[0.10em] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px]"
            style={{
              color: "var(--vault-warn)",
              background: "var(--gtp-card-sunken)",
              border: "1px solid var(--vault-warn)",
              fontSize: 10,
              lineHeight: 1.1,
            }}
            title="Single-game build — all legs share one matchup, so the slip carries correlation risk and reads as higher variance than a multi-game slip with the same legs."
          >
            <span aria-hidden style={{ fontSize: 11 }}>⟁</span>
            Single-game · higher variance
          </span>
        </div>
      )}

      {showChipRow && (
        <div
          className="flex flex-wrap items-center gap-2 px-4 -mt-1"
          aria-label="Slip context"
        >
          {slate && (
            <span
              className="font-mono uppercase tracking-[0.08em] px-2.5 py-1 rounded-[4px]"
              style={{
                color: slateChipColor(slate.tone),
                background: "var(--gtp-card-sunken)",
                border: `1px solid ${slateChipColor(slate.tone)}`,
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              {slate.label}
            </span>
          )}
          {origin === "official" && (
            <span
              className="font-mono uppercase tracking-[0.08em] px-2.5 py-1 rounded-[4px]"
              style={{
                color: "var(--vault-success)",
                background: "var(--gtp-card-sunken)",
                border: "1px solid var(--vault-success)",
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              Official
            </span>
          )}
          {(origin === "custom" || origin === "replay") && (
            <span
              className="font-mono uppercase tracking-[0.08em] px-2.5 py-1 rounded-[4px]"
              style={{
                color:
                  origin === "replay"
                    ? "var(--vault-warn)"
                    : "var(--vault-text-mute)",
                background: "var(--gtp-card-sunken)",
                border: `1px dashed ${
                  origin === "replay"
                    ? "var(--vault-warn)"
                    : "var(--vault-text-mute)"
                }`,
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              {origin === "replay"
                ? "Replay · not official"
                : "Custom · not officially tracked"}
            </span>
          )}
          {sportBucketLabel && (
            <span
              className="font-mono uppercase tracking-[0.08em] px-2.5 py-1 rounded-[4px]"
              style={{
                color: "var(--vault-text-mute)",
                background: "var(--gtp-card-sunken)",
                border: "1px solid var(--vault-rule)",
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              {sportBucketLabel}
            </span>
          )}
        </div>
      )}

      <ul className={`px-4 ${isFeatured ? "space-y-2" : "space-y-1.5"}`}>
        {slip.legs.map((leg, i) => (
          <li key={`${slip.slipId}-${i}`}>
            <TicketLegRow
              leg={leg}
              calibrationTable={calibrationTable}
              onLegClick={onLegClick}
              emphasis={emphasis}
            />
          </li>
        ))}
      </ul>

      {selectable && (
        <div className="px-4 -mt-0.5">
          <SelectToggle
            slip={slip}
            selected={selected}
            onToggleSelect={onToggleSelect}
            riskLabel={riskSection.label}
          />
        </div>
      )}

      {showStakeFooter && (
        <footer
          className="mx-4 mb-3 mt-1 pt-2.5 flex flex-wrap items-end justify-between gap-3"
          style={{ borderTop: "1px solid var(--vault-rule)" }}
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${stakeId}-stake`}
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
            >
              Stake (USD)
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
                style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
              >
                $
              </span>
              <input
                id={`${stakeId}-stake`}
                type="number"
                inputMode="decimal"
                min={MIN_STAKE}
                max={MAX_STAKE}
                step={1}
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                aria-label="Stake amount in USD"
                className="bg-transparent outline-none font-display tabular text-right pr-2 py-1.5 w-[72px]"
                style={{
                  color: "var(--vault-text)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1 text-right">
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
            >
              Projected payout
            </span>
            <span
              className="font-display tabular"
              style={{
                color: payout ? "var(--vault-success)" : "var(--vault-text-faint)",
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {payout ? `$${payout.totalReturn.toFixed(2)}` : "—"}
            </span>
          </div>
        </footer>
      )}
    </article>
  );
}

/** Opt-in "Add to my card" toggle rendered below the legs when the
 *  card is `selectable`. Pure presentation — emits the slip on click so
 *  the caller dedupes by slipId. Accessible: `aria-pressed` reflects the
 *  selected state and the label changes between "Add to my card" and
 *  "Added to my card". No banned copy, no "lock"/"safe" language. */
function SelectToggle({
  slip,
  selected,
  onToggleSelect,
  riskLabel,
}: {
  slip: ParlaySlip;
  selected: boolean;
  onToggleSelect?: (slip: ParlaySlip) => void;
  riskLabel: string;
}) {
  const accent = selected ? "var(--vault-success)" : "var(--vault-gold-bright)";
  return (
    <button
      type="button"
      onClick={() => onToggleSelect?.(slip)}
      aria-pressed={selected}
      aria-label={
        selected
          ? `Remove this ${riskLabel} slip from my card`
          : `Add this ${riskLabel} slip to my card`
      }
      className="w-full inline-flex items-center justify-center gap-2 rounded-[6px] py-2 font-mono uppercase tracking-[0.14em] transition-colors"
      style={{
        color: selected ? "var(--vault-success)" : "var(--vault-text-mute)",
        background: selected ? "rgba(74, 222, 128, 0.08)" : "var(--gtp-card-sunken)",
        border: `1px ${selected ? "solid" : "dashed"} ${accent}`,
        fontSize: 11,
        cursor: "pointer",
      }}
    >
      <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
        {selected ? "✓" : "+"}
      </span>
      {selected ? "Added to my card" : "Add to my card"}
    </button>
  );
}

/** Combined-odds pill that anchors the top-right of the slip card.
 *  Active "pending" slips show ONLY the odds (no status text). Graded
 *  slips replace the odds pill with a status pill (win/loss/etc.)
 *  because the resolved status is the most important fact on a graded
 *  slip. */
function CombinedOddsPill({
  american,
  emphasis,
  gradedLabel,
  accent,
  savedPregame,
}: {
  american: number | null;
  emphasis: "featured" | "alternate";
  gradedLabel: string | null;
  accent: string;
  savedPregame: boolean | undefined;
}) {
  // Graded slip → status pill replaces the odds pill.
  if (gradedLabel) {
    return (
      <span
        className="font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-[4px] shrink-0"
        style={{
          color: accent,
          border: `1px solid ${accent}`,
          background: "var(--gtp-card-sunken)",
          fontSize: 10,
          lineHeight: 1.1,
        }}
      >
        {gradedLabel}
      </span>
    );
  }
  // Active suggested slip → big combined-odds pill anchors the eye.
  return (
    <span
      className="font-display tabular inline-flex items-center gap-2 px-3 py-1 rounded-[6px] shrink-0"
      style={{
        color: "var(--vault-gold-bright)",
        background: "var(--gtp-card-sunken)",
        border: "1px solid var(--vault-gold-bright)",
        fontSize: emphasis === "featured" ? 18 : 15,
        fontWeight: 600,
        lineHeight: 1,
      }}
      aria-label={
        american != null
          ? `Combined American odds ${formatAmerican(american)}`
          : "Combined odds unavailable"
      }
      title={
        savedPregame
          ? "Combined American odds — saved pregame"
          : "Combined American odds"
      }
    >
      {american != null ? formatAmerican(american) : "—"}
    </span>
  );
}

function TicketLegRow({
  leg,
  calibrationTable,
  onLegClick,
  emphasis,
}: {
  leg: ParlayLeg;
  calibrationTable: CalibrationTable;
  onLegClick?: (leg: ParlayLeg) => void;
  emphasis: "featured" | "alternate";
}) {
  const result = leg.result;
  const resultAccent =
    result === "win"
      ? "var(--vault-success)"
      : result === "loss"
        ? "var(--vault-warn)"
        : result === "push"
          ? "var(--vault-text-mute)"
          : "var(--vault-text-faint)";
  // Calibration-aware label is still computed so the dot indicator can
  // surface tone, but the verbose "· Calibration watch" suffix is no
  // longer appended to the meta line.
  const sportKey = (leg.sport === "mlb" || leg.sport === "nba")
    ? (leg.sport as Sport)
    : null;
  const calibrated = leg.confidence && sportKey
    ? calibratedConfidenceLabelFromTable(
        sportKey,
        leg.confidence,
        calibrationTable[sportKey] ?? {},
      )
    : null;
  // Dot indicator replaces the noisy "· Calibration watch" suffix that
  // used to repeat on every leg. Amber dot = audit downgraded this
  // tier ("Calibration watch"). Green dot = label held its strength.
  // No dot when we have no confidence signal.
  const calibrationDotColor = calibrated && calibrated.label
    ? calibrated.downgraded
      ? "var(--vault-warn)"
      : "var(--vault-success)"
    : null;
  const calibrationDotTitle = calibrated && calibrated.label
    ? calibrated.downgraded
      ? `Calibration watch — ${calibrated.reason}`
      : calibrated.label
    : null;

  const interactive = !!onLegClick;
  const RowTag = interactive ? "button" : "div";
  const rowProps: Record<string, unknown> = interactive
    ? {
        type: "button",
        onClick: () => onLegClick?.(leg),
        "aria-label": `View recent form for ${leg.playerName}`,
      }
    : {};
  const avatarSport = (leg.sport === "mlb" || leg.sport === "nba")
    ? (leg.sport as "mlb" | "nba")
    : "nba";
  const teamSport = (leg.sport === "mlb" || leg.sport === "nba" || leg.sport === "nhl")
    ? (leg.sport as "mlb" | "nba" | "nhl")
    : undefined;
  const marketName = humanMarketLabel(leg.sport, leg.market, leg.marketLabel);
  const sideLineLabel = formatSideLine(leg.side, leg.line);
  const bookLabel = formatBookLabel(leg.bookmaker);
  // PR `feature/leg-game-time-threading` — prefer the optimizer's
  // real `commenceTime` / `gameTime` over the date-only `gameDate`.
  // Falls back to date only when neither time is present, so single-
  // game / pregame slates still get the same compact label they had
  // before. Never fabricates a time.
  const gameDateLabel =
    formatLegGameTime({
      gameDate: leg.gameDate,
      commenceTime: leg.commenceTime ?? null,
      gameTime: leg.gameTime ?? null,
    }) || formatGameDate(leg.gameDate);
  // Matchup context: we don't know home/away at slip-card time so use
  // "TEAM vs OPP" as the conventional non-directional matchup string.
  // Never fabricate — when opponent is missing, fall back to team alone.
  const matchupLabel = leg.team
    ? leg.opponent
      ? `${leg.team} vs ${leg.opponent}`
      : leg.team
    : leg.opponent ?? null;
  // Right-anchored value for line 1: graded leg shows the result+stat;
  // active leg shows the per-leg American odds.
  const rightValue = result
    ? `${result.toUpperCase()}${typeof leg.finalStat === "number" ? ` · ${leg.finalStat}` : ""}`
    : formatAmerican(leg.oddsForSide ?? null);
  const rightValueColor = result ? resultAccent : "var(--vault-text)";

  return (
    <RowTag
      {...rowProps}
      className={`w-full text-left grid grid-cols-[auto_1fr] gap-2.5 items-start px-2.5 py-2 rounded-[6px] ${interactive ? "gtp-leg-button" : ""}`}
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-rule)",
        cursor: interactive ? "pointer" : "default",
      }}
    >
      <PlayerAvatar
        playerId={leg.playerId ?? null}
        playerName={leg.playerName}
        team={leg.team ?? undefined}
        sport={avatarSport}
        size="sm"
        flat
      />
      <div className="min-w-0 flex flex-col gap-0.5">
        {/* Line 1: team logo · player name · matchup · odds (right-aligned) */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {leg.team && teamSport ? (
              <TeamLogo team={leg.team} sport={teamSport} size="sm" />
            ) : null}
            <StarBadge tier={leg.starTier} />
            <span
              className="font-display tracking-tight truncate"
              style={{
                color: "var(--vault-text)",
                fontSize: emphasis === "featured" ? 14 : 13,
                fontWeight: 600,
              }}
            >
              {leg.playerName}
            </span>
            {matchupLabel && (
              <span
                className="font-mono truncate shrink"
                style={{
                  color: "var(--vault-text-faint)",
                  fontSize: 11,
                }}
              >
                · {matchupLabel}
              </span>
            )}
          </div>
          <span
            className="font-display tabular shrink-0 text-right"
            style={{
              color: rightValueColor,
              fontSize: emphasis === "featured" ? 14 : 13,
              fontWeight: 700,
              lineHeight: 1,
            }}
            aria-label={result ? `Result: ${rightValue}` : `Per-leg American odds ${rightValue}`}
          >
            {rightValue}
          </span>
        </div>
        {/* Line 2: calibration dot · market · side+line · book · game date · Form action */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex items-center gap-1.5 min-w-0 flex-1 font-mono"
            style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
          >
            {calibrationDotColor && (
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: calibrationDotColor }}
                title={calibrationDotTitle ?? undefined}
              />
            )}
            <span
              className="truncate"
              style={{ color: "var(--vault-text)" }}
            >
              {marketName} {sideLineLabel}
            </span>
            {bookLabel && (
              <span className="shrink-0">
                · <span style={{ color: "var(--vault-text-mute)" }}>{bookLabel}</span>
              </span>
            )}
            {gameDateLabel && (
              <span className="shrink-0 hidden sm:inline">
                · <span style={{ color: "var(--vault-text-faint)" }}>{gameDateLabel}</span>
              </span>
            )}
          </div>
          {interactive ? (
            <span
              className="font-mono uppercase tracking-[0.12em] shrink-0"
              style={{
                color: "var(--vault-gold-bright)",
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              Form →
            </span>
          ) : null}
        </div>
      </div>
    </RowTag>
  );
}

/** Best-effort book label normaliser. Maps known bookmaker keys to
 *  their display names; falls through to the raw string with the first
 *  letter capitalised. Pure presentation — never throws. */
function formatBookLabel(book: string | null | undefined): string | null {
  if (!book) return null;
  const k = book.toLowerCase().trim();
  if (!k) return null;
  const known: Record<string, string> = {
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    betmgm: "BetMGM",
    caesars: "Caesars",
    pointsbet: "PointsBet",
    barstool: "Barstool",
    wynnbet: "WynnBet",
    bet365: "bet365",
    pinnacle: "Pinnacle",
    espnbet: "ESPN BET",
    fanatics: "Fanatics",
    hardrockbet: "Hard Rock Bet",
  };
  return known[k] ?? book.charAt(0).toUpperCase() + book.slice(1);
}

/** "2026-05-28" → "May 28". Returns null on parse failure. Honest:
 *  the leg payload only carries the date (no time), so we surface
 *  date only and let PR3 thread the start-time when board metadata is
 *  available. */
function formatGameDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (mi < 0 || mi > 11 || Number.isNaN(day)) return null;
  return `${months[mi]} ${day}`;
}

/**
 * StarBadge — small ⭐ pill that visually flags a featured player on
 * the leg. Renders nothing when the leg isn't a star (no penalty,
 * just no badge). Tier labels stay subtle: a single ⭐ covers all
 * tiers; we don't want to clutter the card with 3 different stars.
 */
function StarBadge({
  tier,
}: {
  tier?: "none" | "regular" | "core" | "superstar";
}) {
  if (!tier || tier === "none") return null;
  const title =
    tier === "superstar"
      ? "Featured superstar"
      : tier === "core"
        ? "Featured starter"
        : "Featured rotation";
  return (
    <span
      aria-hidden
      className="inline-flex items-center mr-1.5"
      style={{
        color: "var(--vault-gold-bright)",
        fontSize: 11,
        verticalAlign: "middle",
      }}
      title={title}
    >
      ⭐
    </span>
  );
}
