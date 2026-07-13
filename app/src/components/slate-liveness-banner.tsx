"use client";

/**
 * SlateLivenessBanner — the honest "is this actually live today?" strip.
 *
 * The site is statically exported, so a page baked on July-11 will keep saying
 * "today's slate" days later. On a mid-July lull day (0-game MLB All-Star break,
 * World Cup between rounds) that reads as a stale slate presented as live. This
 * banner fixes that: it frames on the REAL ET clock (recomputed after hydration),
 * and when the newest slate is NOT today it says so plainly, points at the most
 * recent slate as an archive, and names the next scheduled focus — WITHOUT
 * fabricating any matchup, odd, or pick.
 *
 * It renders NOTHING when the slate genuinely is today's live action, so live
 * days stay uncluttered. Companion to `TodayAwareSlateBanner` (softer, generic);
 * this one is the between-slates / no-games-today framing.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { currentEtDate } from "@/lib/freshness";
import { computeSlateLiveness, focusDateLabel } from "@/lib/slate-liveness";
import { nextWorldCupFocus } from "@/lib/wc-tournament-calendar";
import { mlbBreakNote } from "@/lib/mlb-season-calendar";

interface Props {
  /** Build-time guess at today (ET) — the SSR seed; re-derived on the client. */
  buildTimeToday: string;
  /** Newest committed slate date across sports, or null. */
  latestSlate: string | null;
  /** Whether that newest slate file actually carries ≥1 game. */
  latestSlateHasGames: boolean;
  /** Link to the most-recent slate content (kept reachable as an archive). */
  archiveHref?: string;
  archiveLabel?: string;
  /** Surface the MLB All-Star-break note (only on MLB-bearing pages). */
  includeMlbNote?: boolean;
  /** Surface the next World Cup focus (default true). */
  includeWcFocus?: boolean;
}

export default function SlateLivenessBanner({
  buildTimeToday,
  latestSlate,
  latestSlateHasGames,
  archiveHref,
  archiveLabel,
  includeMlbNote = false,
  includeWcFocus = true,
}: Props) {
  // Seed with the build-time date (matches SSR, no hydration mismatch), then
  // switch to the visitor's real ET clock after mount.
  const [today, setToday] = useState<string>(buildTimeToday);
  useEffect(() => {
    setToday(currentEtDate());
  }, []);

  const liveness = computeSlateLiveness({
    today,
    latestSlate,
    hasGamesToday: latestSlateHasGames && latestSlate === today,
    nextFocus: includeWcFocus ? nextWorldCupFocus(today) : null,
    leagueNotes: includeMlbNote ? [mlbBreakNote(today)].filter((x): x is string => !!x) : [],
  });

  // Genuinely live today → don't clutter the page.
  if (liveness.status === "live-today") return null;

  const focus = liveness.nextFocus;

  return (
    <div
      className="rounded-[4px] px-4 py-3 sm:px-5 sm:py-4 flex flex-col gap-2"
      style={{
        background: "var(--vault-panel-elevated)",
        border: "1px solid var(--vault-border)",
        color: "var(--vault-text-mute)",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
          style={{ color: "var(--vault-gold)" }}
        >
          {liveness.status === "no-data" ? "No slate" : "No games today"}
        </span>
        <span className="text-[14px] font-semibold" style={{ color: "var(--vault-text)" }}>
          {liveness.headline}
        </span>
      </div>

      {liveness.detail && <p className="text-[13px] leading-relaxed">{liveness.detail}</p>}

      {focus && (
        <p className="text-[13px] leading-relaxed">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--vault-text-faint)" }}>
            Next up ·{" "}
          </span>
          <span style={{ color: "var(--vault-text)" }}>
            {focus.label} ({focusDateLabel(focus)})
          </span>
          {focus.note ? <span style={{ color: "var(--vault-text-faint)" }}> — {focus.note}</span> : null}
        </p>
      )}

      {liveness.leagueNotes.map((note) => (
        <p key={note} className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
          {note}
        </p>
      ))}

      {archiveHref && liveness.latestSlate && (
        <Link
          href={archiveHref}
          className="text-[12px] font-semibold underline underline-offset-2 w-fit"
          style={{ color: "var(--vault-gold)" }}
        >
          {archiveLabel ?? "View the most recent slate"} →
        </Link>
      )}
    </div>
  );
}
