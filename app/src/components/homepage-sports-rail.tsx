import Link from "next/link";
import type { ReactNode } from "react";

import {
  getAvailableBoardDates,
  getBoardForDate,
  getLifetimeSummary,
} from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import {
  activeMlbDate,
  getMlbBoardForDate,
  getMlbScheduleForDate,
} from "@/lib/data-mlb";
import {
  activeNhlDate,
  getNhlScheduleForDate,
} from "@/lib/data-nhl";
import {
  activeIplDate,
  getIplScheduleForDate,
} from "@/lib/data-ipl";
import { selectActiveSlate } from "@/lib/active-slate";
import { currentEtDate } from "@/lib/freshness";

/**
 * Sportsbook command-center sports rail.
 *
 * Renders one card per sport (NBA / MLB / NHL / IPL) with:
 *   - live-status chip ("live · N leans", "lines pending",
 *     "schedule live", "stats provider pending")
 *   - matchup or game-count line, derived only from on-disk data
 *   - lifetime audit summary when settled rows exist
 *   - a primary CTA into the sport's Model Board
 *
 * Pure server component. No fabricated data — every status string is
 * derived from board.json / schedule.json / lifetime_summary.json that
 * are already present in `app/public/data/`.
 */
export default function HomepageSportsRail() {
  const today = currentEtDate();

  // ─── NBA ────────────────────────────────────────────────────────────────
  const nbaLifetime = getLifetimeSummary();
  const allBoardDates = getAvailableBoardDates();
  const boardsByDate: Record<string, ReturnType<typeof getBoardForDate>> = {};
  for (const d of allBoardDates) boardsByDate[d] = getBoardForDate(d);
  const nbaActive = (() => {
    const raw = selectActiveSlate(allBoardDates, today, boardsByDate);
    if (raw.kind === "no_data" || raw.kind === "no_current")
      return { kind: raw.kind, date: null as string | null };
    return { kind: raw.kind, date: raw.selectedDate };
  })();
  const nbaActiveBoard = nbaActive.date ? boardsByDate[nbaActive.date] : null;
  const nbaActiveLeans = nbaActiveBoard?.leans?.length ?? 0;
  const nbaActiveGames = nbaActiveBoard?.games?.length ?? 0;
  const nbaCard: SportCardData = {
    sport: "NBA",
    accent: "gold",
    href: "/nba/board",
    matchup: nbaActiveBoard?.games?.length
      ? nbaActiveBoard.games
          .slice(0, 1)
          .map((g) => `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`)
          .join(" · ") +
        (nbaActiveBoard.games.length > 1
          ? ` +${nbaActiveBoard.games.length - 1}`
          : "")
      : null,
    statusText:
      nbaActiveLeans > 0
        ? `live · ${nbaActiveLeans} leans`
        : nbaActiveGames > 0
          ? "lines pending"
          : "off-day",
    statusTone:
      nbaActiveLeans > 0 ? "success" : nbaActiveGames > 0 ? "warn" : "mute",
    auditLine:
      nbaLifetime && nbaLifetime.totalSettled > 0
        ? `Audit · ${nbaLifetime.wins}–${nbaLifetime.losses} on ${nbaLifetime.decisive}`
        : "Audit pending first settlement",
    auditHref: "/results/nba",
    activeDate: nbaActive.date,
  };

  // ─── MLB ────────────────────────────────────────────────────────────────
  const mlbDate = activeMlbDate() ?? null;
  const mlbBoard = mlbDate ? getMlbBoardForDate(mlbDate) : null;
  const mlbSchedule = mlbDate ? getMlbScheduleForDate(mlbDate) : null;
  const mlbLifetime = getMlbLifetimeSummary();
  const mlbLeans = mlbBoard?.summary?.leans ?? 0;
  const mlbGames = mlbBoard?.games?.length ?? mlbSchedule?.games?.length ?? 0;
  const mlbCard: SportCardData = {
    sport: "MLB",
    accent: "success",
    href: "/mlb/board",
    matchup: mlbGames > 0 ? `${mlbGames} games` : null,
    statusText:
      mlbLeans > 0
        ? `live · ${mlbLeans} leans`
        : mlbGames > 0
          ? "lines pending"
          : "off-day",
    statusTone:
      mlbLeans > 0 ? "success" : mlbGames > 0 ? "warn" : "mute",
    auditLine:
      mlbLifetime && mlbLifetime.totalSettled > 0
        ? `Audit · ${mlbLifetime.wins}–${mlbLifetime.losses} on ${mlbLifetime.decisive}${mlbLifetime.partial ? " · partial" : ""}`
        : "Audit pending first settlement",
    auditHref: "/results/mlb",
    activeDate: mlbDate,
  };

  // ─── NHL ────────────────────────────────────────────────────────────────
  const nhlDate = activeNhlDate() ?? null;
  const nhlSchedule = nhlDate ? getNhlScheduleForDate(nhlDate) : null;
  const nhlGames = nhlSchedule?.games?.length ?? 0;
  const nhlCard: SportCardData = {
    sport: "NHL",
    accent: "warn",
    href: "/nhl/board",
    matchup:
      nhlGames > 0 && nhlSchedule
        ? nhlSchedule.games
            .slice(0, 1)
            .map(
              (g) => `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`,
            )
            .join(" · ") +
          (nhlSchedule.games.length > 1
            ? ` +${nhlSchedule.games.length - 1}`
            : "")
        : null,
    statusText: nhlGames > 0 ? "schedule live · lines pending" : "off-day",
    statusTone: nhlGames > 0 ? "warn" : "mute",
    auditLine: "Audit pending first settlement",
    auditHref: "/results/nhl",
    activeDate: nhlDate,
  };

  // ─── IPL ────────────────────────────────────────────────────────────────
  const iplDate = activeIplDate() ?? null;
  const iplSchedule = iplDate ? getIplScheduleForDate(iplDate) : null;
  const iplGames = iplSchedule?.games?.length ?? 0;
  const iplCard: SportCardData = {
    sport: "IPL",
    accent: "warn",
    href: "/ipl/board",
    matchup:
      iplGames > 0 && iplSchedule
        ? iplSchedule.games
            .slice(0, 1)
            .map((g) =>
              g.shortName
                ? g.shortName
                : `${g.awayTeamAbbr ?? "?"} v ${g.homeTeamAbbr ?? "?"}`,
            )
            .join(" · ")
        : null,
    statusText: iplGames > 0 ? "stats provider pending" : "off-day",
    statusTone: iplGames > 0 ? "warn" : "mute",
    auditLine: "Audit pending first settlement",
    auditHref: "/results/ipl",
    activeDate: iplDate,
  };

  const cards: SportCardData[] = [nbaCard, mlbCard, nhlCard, iplCard];

  return (
    <section className="mt-12 reveal" aria-label="Sports command rail">
      <div className="flex items-center gap-3 mb-5">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
          style={{
            background: "var(--vault-gold-bright)",
            boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          Active sports · live boards and pending slates
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <SportCard key={c.sport} {...c} />
        ))}
      </div>
      {/* Audit + Parlay CTA pair underneath the sport rail. Both styled
          like ticket slips so the casino rhythm carries from the rail
          straight into the actions. */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TicketCta
          eyebrow="Model audit"
          headline="Every projection graded after final stats"
          subline="Per-date, per-sport, per-game hit rates with projection vs actual tables."
          ctaLabel="Open the audit hub"
          href="/results"
          accent="gold"
        />
        <TicketCta
          eyebrow="Parlay Lab"
          headline="Candidate slips · risk-aware mixes"
          subline="Conservative, balanced and wider-edge candidate slips built from clean leans. No hit-rate claims until candidate snapshots persist."
          ctaLabel="Open the Parlay Lab"
          href="/parlay-lab"
          accent="success"
        />
      </div>
    </section>
  );
}

interface SportCardData {
  sport: string;
  accent: "gold" | "success" | "warn";
  href: string;
  matchup: string | null;
  statusText: string;
  statusTone: "success" | "warn" | "mute";
  auditLine: string;
  auditHref: string;
  activeDate: string | null;
}

function SportCard({
  sport,
  accent,
  href,
  matchup,
  statusText,
  statusTone,
  auditLine,
  auditHref,
  activeDate,
}: SportCardData) {
  const accentColor =
    accent === "success"
      ? "var(--vault-success)"
      : accent === "warn"
        ? "var(--vault-warn)"
        : "var(--vault-gold-bright)";
  const statusColor =
    statusTone === "success"
      ? "var(--vault-success)"
      : statusTone === "warn"
        ? "var(--vault-warn)"
        : "var(--vault-text-faint)";
  return (
    <div
      className="rounded-[8px] gtp-aurora-halo overflow-hidden flex flex-col"
      style={{
        border: "1px solid var(--vault-border)",
        background:
          "linear-gradient(180deg, rgba(7,11,26,0.78) 0%, rgba(7,11,26,0.55) 100%)",
      }}
    >
      <Link
        href={href}
        className="block vault-glow-hover px-4 py-4 sm:px-5 sm:py-5 flex-1"
        style={{ textDecoration: "none" }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: accentColor, fontSize: 11 }}
          >
            {sport}
          </span>
          <span
            className="font-mono uppercase tracking-[0.14em] inline-flex items-center gap-1.5"
            style={{ color: statusColor, fontSize: 9 }}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: statusColor,
                boxShadow:
                  statusTone === "success"
                    ? "0 0 6px rgba(74, 222, 128, 0.55)"
                    : statusTone === "warn"
                      ? "0 0 6px rgba(212, 175, 55, 0.55)"
                      : "none",
              }}
            />
            {statusText}
          </span>
        </div>
        <h3
          className="font-display font-semibold tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: 18,
            lineHeight: 1.15,
            minHeight: 42,
          }}
        >
          {matchup ?? "No active slate"}
        </h3>
        <div
          className="mt-1 font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
        >
          {activeDate ?? "—"}
        </div>
      </Link>
      <div
        className="flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <Link
          href={auditHref}
          className="font-mono"
          style={{
            color: "var(--vault-text-mute)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          {auditLine}
        </Link>
        <Link
          href={href}
          className="font-mono"
          style={{
            color: accentColor,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          Open →
        </Link>
      </div>
    </div>
  );
}

function TicketCta({
  eyebrow,
  headline,
  subline,
  ctaLabel,
  href,
  accent,
}: {
  eyebrow: string;
  headline: ReactNode;
  subline: ReactNode;
  ctaLabel: string;
  href: string;
  accent: "gold" | "success";
}) {
  const c =
    accent === "success" ? "var(--vault-success)" : "var(--vault-gold-bright)";
  return (
    <Link
      href={href}
      className="gtp-aurora-halo block vault-glow-hover rounded-[8px]"
      style={{
        background:
          "linear-gradient(180deg, rgba(7,11,26,0.85) 0%, rgba(7,11,26,0.55) 100%)",
        border: "1px solid var(--vault-border)",
        textDecoration: "none",
      }}
    >
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{ background: c, boxShadow: `0 0 8px ${c}` }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: c, fontSize: 10 }}
          >
            {eyebrow}
          </span>
        </div>
        <h3
          className="mt-2 font-display font-semibold tracking-tight"
          style={{ color: "var(--vault-text)", fontSize: 18, lineHeight: 1.2 }}
        >
          {headline}
        </h3>
        <p
          className="mt-2 text-[12px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {subline}
        </p>
        <div
          className="mt-3 font-mono"
          style={{
            color: c,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {ctaLabel} →
        </div>
      </div>
    </Link>
  );
}
