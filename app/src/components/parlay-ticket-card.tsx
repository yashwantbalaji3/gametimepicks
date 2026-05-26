/**
 * ParlayTicketCard — sportsbook-style ticket rendering for a single
 * `ParlaySlip`. Replaces the previous flat 3-row card with a layered
 * receipt feel:
 *
 *   - Top accent line keyed to status (gold for pending, green for win,
 *     amber for loss, mute for push)
 *   - Risk-profile badge top-left, status pill top-right
 *   - Per-leg rows with player, market, side, line, friendly
 *     confidence, and (when graded) the final stat + hit/miss dot
 *   - Bottom footer with combined American odds + per-$100 profit
 *     (when every leg has stored odds — otherwise we show "—" honestly)
 *
 * Source: app/src/lib/data-parlays.ts ParlaySlip. Pure presentation:
 * caller passes a real slip, we render it. No fabricated odds, payouts,
 * or final stats. When the saved snapshot has missing data, the
 * corresponding cell shows "—" not a placeholder number.
 */
import type { ParlaySlip, ParlayLeg } from "@/lib/parlay-suggested";
import {
  combinedParlayPayoutPer100,
  formatAmerican,
} from "@/lib/odds-math";
import { confidenceLabel } from "@/lib/confidence-labels";
import {
  EMPTY_CALIBRATION_TABLE,
  calibratedConfidenceLabelFromTable,
  type CalibrationTable,
  type Sport,
} from "@/lib/confidence-calibration-rules";
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

function humanProfileLabel(profile: ParlaySlip["riskProfile"]): string {
  switch (profile) {
    case "conservative": return "Conservative";
    case "balanced": return "Balanced";
    case "aggressive": return "High variance";
    case "star_power": return "Star Power";
    default: return profile;
  }
}

function riskProfileColor(profile: ParlaySlip["riskProfile"]): string {
  switch (profile) {
    case "conservative":
      return "var(--vault-success)";
    case "aggressive":
      return "var(--vault-warn)";
    case "star_power":
      return "var(--vault-gold-bright)";
    case "balanced":
    default:
      return "var(--vault-gold-bright)";
  }
}

function statusLabel(status: ParlaySlip["status"]): string {
  switch (status) {
    case "pending":
      return "Pending final stats";
    case "win":
      return "Slip hit";
    case "loss":
      return "Slip missed";
    case "push":
      return "Slip push";
    case "void":
      return "Slip void";
    default:
      return status;
  }
}

export default function ParlayTicketCard({
  slip,
  savedPregame,
  calibrationTable = EMPTY_CALIBRATION_TABLE,
  onLegClick,
}: Props) {
  const accent = statusColor(slip.status);
  const profileColor = riskProfileColor(slip.riskProfile);
  const payout = combinedParlayPayoutPer100(slip.legs);
  const profileLabel = humanProfileLabel(slip.riskProfile);
  return (
    <article
      className="gtp-parlay-ticket relative overflow-hidden flex flex-col gap-3"
      aria-label={`${profileLabel} parlay slip · ${slip.legs.length} legs · ${statusLabel(slip.status)}`}
    >
      {/* Top accent rule keyed to status. Visual differentiator that
          gives the card a "ticket" feel without changing dimensions. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: 0.75,
        }}
      />

      <header className="flex items-center justify-between gap-2 pt-3 px-4">
        <span
          className="font-mono uppercase tracking-[0.16em] inline-flex items-center gap-1.5"
          style={{ color: profileColor, fontSize: 10 }}
        >
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: profileColor }}
          />
          {profileLabel}
          {slip.sameGame ? " · same-game" : ""}
        </span>
        <span
          className="font-mono uppercase tracking-[0.14em] px-2 py-0.5 rounded-[3px]"
          style={{
            color: accent,
            border: `1px solid ${accent}`,
            background: "rgba(7,11,26,0.55)",
            fontSize: 9,
          }}
        >
          {savedPregame && slip.status === "pending"
            ? "Saved · pending"
            : statusLabel(slip.status)}
        </span>
      </header>

      <ul className="px-4 space-y-1.5">
        {slip.legs.map((leg, i) => (
          <li key={`${slip.slipId}-${i}`}>
            <TicketLegRow
              leg={leg}
              calibrationTable={calibrationTable}
              onLegClick={onLegClick}
            />
          </li>
        ))}
      </ul>

      <footer
        className="mx-4 mb-3 mt-1 pt-2 grid grid-cols-3 gap-2"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <FooterCell
          label="Legs"
          value={`${slip.legs.length}`}
          accent="var(--vault-text)"
        />
        <FooterCell
          label="Combined"
          value={payout ? formatAmerican(payout.american) : "—"}
          accent="var(--vault-gold-bright)"
        />
        <FooterCell
          label="Per $100"
          value={payout ? `+$${payout.profitPer100.toFixed(0)}` : "—"}
          accent={payout ? "var(--vault-success)" : "var(--vault-text-faint)"}
        />
      </footer>
    </article>
  );
}

function TicketLegRow({
  leg,
  calibrationTable,
  onLegClick,
}: {
  leg: ParlayLeg;
  calibrationTable: CalibrationTable;
  onLegClick?: (leg: ParlayLeg) => void;
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
  // Calibration-aware label: when the audit shows a (sport, tier) is
  // inverted, we display "Calibration watch" instead of the model's
  // raw "Stronger signal" so users don't trust the label more than the
  // numbers justify. Falls back to the raw friendly label otherwise.
  const sportKey = (leg.sport === "mlb" || leg.sport === "nba")
    ? (leg.sport as Sport)
    : null;
  const signal = leg.confidence
    ? sportKey
      ? calibratedConfidenceLabelFromTable(
          sportKey,
          leg.confidence,
          calibrationTable[sportKey] ?? {},
        ).label
      : confidenceLabel(leg.confidence)
    : null;
  // When onLegClick is provided we render the row as a button. The
  // visible content is unchanged; only the wrapping element + a small
  // affordance ("View form") at the bottom-left of the meta line
  // signals the row is interactive.
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
  return (
    <RowTag
      {...rowProps}
      className={`w-full text-left grid grid-cols-[auto_1fr_auto] gap-2 sm:gap-2.5 items-center px-2 py-1.5 rounded-[4px] ${interactive ? "gtp-leg-button" : ""}`}
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-rule)",
        cursor: interactive ? "pointer" : "default",
      }}
    >
      <PlayerAvatar
        playerId={leg.playerId ?? null}
        playerName={leg.playerName}
        team={leg.team ?? undefined}
        sport={avatarSport}
        size="xs"
        flat
      />
      <div className="min-w-0">
        <div
          className="font-display tracking-tight truncate flex items-center gap-1.5"
          style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}
        >
          <SportBadge sport={leg.sport} />
          <StarBadge tier={leg.starTier} />
          <span className="truncate">{leg.playerName}</span>
        </div>
        <div
          className="font-mono flex items-center gap-1.5 min-w-0"
          style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
        >
          {leg.team && teamSport ? (
            <TeamLogo team={leg.team} sport={teamSport} size="sm" />
          ) : null}
          <span className="truncate">
            {leg.marketLabel || leg.market}{" "}
            {leg.side} {leg.line != null ? leg.line.toFixed(1) : "—"}
            {leg.team ? ` · ${leg.team}` : ""}
            {signal ? ` · ${signal}` : ""}
            {interactive ? (
              <span
                style={{
                  marginLeft: 6,
                  color: "var(--vault-gold-bright)",
                  fontWeight: 500,
                }}
              >
                · View form →
              </span>
            ) : null}
          </span>
        </div>
      </div>
      <span
        className="font-mono uppercase tracking-[0.12em] inline-flex items-center gap-1 shrink-0 text-right"
        style={{ color: resultAccent, fontSize: 9 }}
      >
        {result && (
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: resultAccent }}
          />
        )}
        {result ? result : formatAmerican(leg.oddsForSide ?? null)}
        {typeof leg.finalStat === "number" ? ` · ${leg.finalStat}` : ""}
      </span>
    </RowTag>
  );
}

/**
 * SportBadge — small pill that visually tags a leg as NBA or MLB so a
 * multi-sport slip is unmistakable. Uses 🏀/⚾ when supported. */
function SportBadge({ sport }: { sport: string }) {
  const s = (sport ?? "").toLowerCase();
  if (s !== "nba" && s !== "mlb") return null;
  const icon = s === "nba" ? "🏀" : "⚾";
  const tone =
    s === "nba" ? "var(--vault-gold-bright)" : "var(--vault-success)";
  return (
    <span
      aria-hidden
      className="inline-flex items-center mr-1.5 font-mono uppercase tracking-[0.12em]"
      style={{
        color: tone,
        fontSize: 9,
        verticalAlign: "middle",
      }}
      title={s.toUpperCase()}
    >
      <span style={{ marginRight: 2 }}>{icon}</span>
      {s.toUpperCase()}
    </span>
  );
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
  // Tier-specific tooltip so power-users can see why a leg got the
  // boost, but the visible glyph is the same single ⭐.
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

function FooterCell({
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
        className="font-mono uppercase tracking-[0.16em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular truncate"
        style={{ color: accent, fontSize: 14, fontWeight: 600, lineHeight: 1 }}
      >
        {value}
      </span>
    </div>
  );
}
