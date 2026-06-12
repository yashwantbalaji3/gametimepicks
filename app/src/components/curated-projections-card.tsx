/**
 * CuratedProjectionsCard — "tonight's curated projections" rail.
 *
 * Renders a small set (default 6) of the strongest single-leg
 * projections for the active date, picked via
 * `selectCuratedPicks()` in `app/src/lib/curated-projections.ts`.
 *
 * This is the consumer-facing answer to "what's the model's best
 * read tonight?". Sits on the homepage between the Tonight rail and
 * the How-it-works strip, and can optionally render on a sport page.
 *
 * Honest framing:
 *   - Each pick carries a reason tag ("Strong market" / "Watchlist"
 *     / "High-variance") that mirrors the audit's read of the
 *     (sport, market) combo.
 *   - We never claim profitability per pick.
 *   - When the slate produces zero qualifying picks, the section
 *     returns null silently — we don't fake a curated rail.
 *
 * The component is a server component because it reads sync from
 * the unified projections payload. No client interactivity.
 */
import Link from "next/link";
import PlayerAvatar from "./player-avatar";
import { calibratedConfidenceLabel } from "@/lib/confidence-calibration";
import {
  selectCuratedPicks,
  type CuratedPick,
} from "@/lib/curated-projections";
import type { ProjectionsLean } from "@/lib/data-projections";

interface Props {
  date: string;
  leans: ProjectionsLean[];
  /** Total leans on this date — used in the eyebrow footer for
   *  honest "X of N projections" framing. */
  totalLeans?: number;
  ctaHref?: string;
  ctaLabel?: string;
}

export default function CuratedProjectionsCard({
  date,
  leans,
  totalLeans,
  ctaHref,
  ctaLabel,
}: Props) {
  const { picks } = selectCuratedPicks(leans);
  if (picks.length === 0) return null;

  return (
    <section
      className="reveal"
      aria-label={`Curated projections for ${date}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: "var(--vault-gold-bright)",
            boxShadow: "0 0 6px rgba(240, 199, 94, 0.45)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
        >
          Tonight&apos;s curated projections
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {picks.length}
          {totalLeans ? ` of ${totalLeans}` : ""} {picks.length === 1 ? "pick" : "picks"}
        </span>
        <div
          className="flex-1 h-px"
          style={{ background: "var(--vault-rule)" }}
        />
        {ctaHref && (
          <Link
            href={ctaHref}
            className="font-mono uppercase tracking-[0.14em] shrink-0"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            {ctaLabel ?? "Open projections"} →
          </Link>
        )}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none">
        {picks.map((pick) => (
          <li key={`${pick.lean.sport}-${pick.lean.playerName}-${pick.lean.market}-${pick.lean.side}-${pick.lean.line}`}>
            <CuratedPickCard pick={pick} />
          </li>
        ))}
      </ul>
      <p
        className="mt-3 text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Curated by edge × calibration-adjusted confidence × market
        strength. Per-sport caps so the rail stays scannable.
        Educational analytics — not betting advice. Past model
        agreement does not guarantee future outcomes.
      </p>
    </section>
  );
}

function CuratedPickCard({ pick }: { pick: CuratedPick }) {
  const lean = pick.lean;
  const sportKey = (lean.sport === "mlb" || lean.sport === "nba")
    ? lean.sport
    : null;
  const calibrated = sportKey
    ? calibratedConfidenceLabel(sportKey, lean.confidence)
    : null;
  const tagColor =
    pick.reasonTag === "strong-market"
      ? "var(--vault-success)"
      : pick.reasonTag === "watchlist"
        ? "var(--vault-gold-bright)"
        : pick.reasonTag === "high-variance"
          ? "var(--vault-warn)"
          : "var(--vault-text-mute)";
  const edge = lean.edgePct ?? 0;
  const edgeStr = `${edge > 0 ? "+" : ""}${edge.toFixed(1)}%`;
  return (
    <article
      className="gtp-parlay-ticket flex flex-col gap-2"
      aria-label={`${lean.playerName} ${lean.side} ${lean.line ?? "—"} ${lean.marketLabel || lean.market}`}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${tagColor}, transparent)`,
          opacity: 0.75,
        }}
      />
      <header className="pt-3 px-3 flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.16em] inline-flex items-center gap-1.5"
          style={{ color: tagColor, fontSize: 10 }}
        >
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: tagColor }}
          />
          {pick.reasonLabel}
        </span>
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
        >
          {lean.sport.toUpperCase()}
        </span>
      </header>

      <div className="px-3 flex items-center gap-3">
        <PlayerAvatar
          playerId={lean.playerId}
          playerName={lean.playerName}
          team={lean.team || undefined}
          sport={sportKey ?? "nba"}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div
            className="font-display tracking-tight truncate"
            style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}
          >
            {lean.playerName}
          </div>
          <div
            className="font-mono truncate"
            style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
          >
            {lean.side} {lean.line != null ? lean.line.toFixed(1) : "—"}{" "}
            {lean.marketLabel || lean.market}
          </div>
        </div>
      </div>

      <footer
        className="mx-3 mb-3 mt-1 pt-2 grid grid-cols-3 gap-2"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <FooterCell label="Proj." value={fmtNum(lean.projection)} />
        <FooterCell
          label="Edge"
          value={edgeStr}
          accent={edge > 0 ? "var(--vault-success)" : "var(--vault-warn)"}
        />
        <FooterCell
          label="Signal"
          value={calibrated?.label || "—"}
          accent={
            calibrated?.downgraded
              ? "var(--vault-warn)"
              : "var(--vault-gold-bright)"
          }
        />
      </footer>
    </article>
  );
}

function FooterCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
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
          color: accent ?? "var(--vault-text)",
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== "number") return "—";
  return n.toFixed(1);
}
