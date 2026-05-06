"use client";

/**
 * VaultStatusStrip — Phase 7B-6.
 *
 * Hero strip above the filters: displays the date headline, data mode,
 * schedule + odds source, prop count, and a quiet responsible-use note.
 * Pure presentational — receives a board, renders facts.
 */
import type { BoardData } from "@/lib/types";
import { formatDateLong } from "@/lib/format";

interface Props {
  board: BoardData;
  totalProps: number;
}

export default function VaultStatusStrip({ board, totalProps }: Props) {
  const dateLong = formatDateLong(board.generatedFor);
  const gameCount = board.games?.length ?? 0;

  const oddsLabel = oddsSourceLabel(board);
  const scheduleLabel = scheduleSourceLabel(board);

  return (
    <div
      className="rounded-[4px] mb-5 px-5 py-4"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
        boxShadow: "inset 0 1px 0 rgba(212, 175, 55, 0.04)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)" }}
          >
            gametime vault · model board
          </div>
          <h2
            className="mt-1 font-display text-[22px] md:text-[26px] font-semibold tracking-tight"
            style={{ color: "var(--vault-text)" }}
          >
            {dateLong}
          </h2>
          <div
            className="mt-1 font-mono text-[11px] tracking-wider uppercase"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {gameCount} {gameCount === 1 ? "game" : "games"} · {totalProps} props
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Badge label="schedule" value={scheduleLabel.text} tone={scheduleLabel.tone} />
          <Badge label="odds" value={oddsLabel.text} tone={oddsLabel.tone} />
        </div>
      </div>

      <div
        className="mt-3 pt-3 text-[10px] font-mono tracking-wider uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-border)",
        }}
      >
        analytics · educational use only · not betting advice
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Tone = "gold" | "success" | "warn" | "danger" | "mute";

function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  const styles = badgeColor(tone);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-wider"
      style={{
        color: styles.color,
        background: styles.bg,
        border: `1px solid ${styles.border}`,
      }}
    >
      <span style={{ color: "var(--vault-text-faint)" }}>{label}</span>
      <span style={{ color: styles.color }}>·</span>
      <span style={{ color: styles.color }}>{value}</span>
    </span>
  );
}

function badgeColor(tone: Tone) {
  switch (tone) {
    case "success":
      return {
        color: "var(--vault-success)",
        bg: "var(--vault-success-dim)",
        border: "rgba(110, 231, 168, 0.25)",
      };
    case "warn":
      return {
        color: "var(--vault-warn)",
        bg: "var(--vault-warn-dim)",
        border: "rgba(240, 199, 94, 0.30)",
      };
    case "danger":
      return {
        color: "var(--vault-danger)",
        bg: "var(--vault-danger-dim)",
        border: "rgba(240, 138, 138, 0.30)",
      };
    case "mute":
      return {
        color: "var(--vault-text-faint)",
        bg: "transparent",
        border: "var(--vault-border)",
      };
    case "gold":
    default:
      return {
        color: "var(--vault-gold-bright)",
        bg: "var(--vault-gold-dim)",
        border: "var(--vault-border-strong)",
      };
  }
}

function scheduleSourceLabel(
  board: BoardData,
): { text: string; tone: Tone } {
  const src = board.scheduleSource ?? "unknown";
  if (src === "manual") return { text: "manual verified", tone: "gold" };
  if (src === "nba_api") return { text: "nba_api", tone: "success" };
  if (src === "espn") return { text: "espn", tone: "success" };
  if (src === "demo") return { text: "demo", tone: "warn" };
  return { text: src, tone: "mute" };
}

function oddsSourceLabel(
  board: BoardData,
): { text: string; tone: Tone } {
  switch (board.oddsProviderStatus) {
    case "ok_with_props":
      return { text: "the_odds_api · live", tone: "success" };
    case "ok_no_props":
      return { text: "no props returned", tone: "mute" };
    case "failed":
      return { text: "provider failed", tone: "danger" };
    case "dry_run":
      return { text: "dry run", tone: "warn" };
    case "not_configured":
      return { text: "not configured", tone: "mute" };
    default:
      return { text: "unknown", tone: "mute" };
  }
}
