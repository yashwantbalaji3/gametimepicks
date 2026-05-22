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
import type { ParlaySlip, ParlayLeg } from "@/lib/data-parlays";
import {
  combinedParlayPayoutPer100,
  formatAmerican,
} from "@/lib/odds-math";
import { confidenceLabel } from "@/lib/confidence-labels";

interface Props {
  slip: ParlaySlip;
  /** When true, label the ticket as "Saved before games" (pregame
   *  snapshot) vs the default "Live preview" used by the builder. */
  savedPregame?: boolean;
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

function riskProfileColor(profile: ParlaySlip["riskProfile"]): string {
  switch (profile) {
    case "conservative":
      return "var(--vault-success)";
    case "aggressive":
      return "var(--vault-warn)";
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

export default function ParlayTicketCard({ slip, savedPregame }: Props) {
  const accent = statusColor(slip.status);
  const profileColor = riskProfileColor(slip.riskProfile);
  const payout = combinedParlayPayoutPer100(slip.legs);
  return (
    <article
      className="gtp-parlay-ticket relative overflow-hidden flex flex-col gap-3"
      aria-label={`${slip.riskProfile} parlay slip · ${slip.legs.length} legs · ${statusLabel(slip.status)}`}
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
          {slip.riskProfile}
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
            <TicketLegRow leg={leg} />
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

function TicketLegRow({ leg }: { leg: ParlayLeg }) {
  const result = leg.result;
  const resultAccent =
    result === "win"
      ? "var(--vault-success)"
      : result === "loss"
        ? "var(--vault-warn)"
        : result === "push"
          ? "var(--vault-text-mute)"
          : "var(--vault-text-faint)";
  const signal = leg.confidence ? confidenceLabel(leg.confidence) : null;
  return (
    <div
      className="grid grid-cols-[1fr_auto] gap-2 items-center px-2 py-1.5 rounded-[4px]"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="min-w-0">
        <div
          className="font-display tracking-tight truncate"
          style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}
        >
          {leg.playerName}
        </div>
        <div
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
        >
          {leg.marketLabel || leg.market}{" "}
          {leg.side} {leg.line != null ? leg.line.toFixed(1) : "—"}
          {leg.team ? ` · ${leg.team}` : ""}
          {signal ? ` · ${signal}` : ""}
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
    </div>
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
