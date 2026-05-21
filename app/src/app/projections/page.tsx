/**
 * /projections — the central hub for all sport projections.
 *
 * Goal: one page where any user can pick a sport and instantly see
 * whether projections are live, lines are pending, or the schedule
 * is the only thing on disk. Five sport cards with big emoji icons
 * and clear status badges.
 *
 * Honesty rules:
 *   - Sport status (live / pending / schedule only / coming soon) is
 *     derived from on-disk data. We never claim "projections live"
 *     when only a schedule is on disk.
 *   - World Cup says "projections coming soon" because the model
 *     isn't live yet (PR #69 framing preserved).
 *   - NHL + IPL stay provider-pending until paid odds + per-player
 *     game-log ingestion ship.
 */
import Link from "next/link";

import {
  getAvailableBoardDates,
  getBoardForDate,
  getLifetimeSummary,
} from "@/lib/data";
import { selectActiveSlate } from "@/lib/active-slate";
import { currentEtDate } from "@/lib/freshness";
import {
  activeMlbDate,
  getMlbBoardForDate,
  getMlbScheduleForDate,
} from "@/lib/data-mlb";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import {
  activeNhlDate,
  getNhlScheduleForDate,
} from "@/lib/data-nhl";
import {
  activeIplDate,
  getIplScheduleForDate,
} from "@/lib/data-ipl";
import {
  loadWorldCupMeta,
  loadWorldCupSchedule,
  daysUntilOpener,
} from "@/lib/data-world-cup";

import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Projections · GameTime Picks",
  description:
    "Pick a sport. See today's projections, schedules, and bookmaker lines. NBA + MLB are live; World Cup, NHL, and IPL render schedule/status honestly.",
};

type SportStatus = "live" | "linesPending" | "scheduleOnly" | "comingSoon";

interface SportCard {
  key: string;
  name: string;
  emoji: string;
  href: string;
  status: SportStatus;
  statusLabel: string;
  matchup: string | null;
  gameLine: string | null;
  projectionLine: string | null;
  trackRecord: string | null;
  accentColor: string;
}

export default function ProjectionsHubPage() {
  const today = currentEtDate();

  // ─── NBA ────────────────────────────────────────────────────────────
  const nbaLifetime = getLifetimeSummary();
  const allDates = getAvailableBoardDates();
  const boardsByDate: Record<string, ReturnType<typeof getBoardForDate>> = {};
  for (const d of allDates) boardsByDate[d] = getBoardForDate(d);
  const nbaActive = selectActiveSlate(allDates, today, boardsByDate);
  const nbaActiveDate =
    nbaActive.kind !== "no_data" && nbaActive.kind !== "no_current"
      ? nbaActive.selectedDate
      : null;
  const nbaActiveBoard = nbaActiveDate ? boardsByDate[nbaActiveDate] : null;
  const nbaGames = nbaActiveBoard?.games ?? [];
  const nbaLeans = nbaActiveBoard?.leans?.length ?? 0;
  const nbaMatchup =
    nbaGames.length > 0
      ? `${nbaGames[0].awayTeamAbbr} @ ${nbaGames[0].homeTeamAbbr}` +
        (nbaGames.length > 1 ? ` +${nbaGames.length - 1}` : "")
      : null;
  const nbaCard: SportCard = {
    key: "nba",
    name: "NBA",
    emoji: "🏀",
    href: "/nba/board",
    status:
      nbaLeans > 0
        ? "live"
        : nbaGames.length > 0
          ? "linesPending"
          : "scheduleOnly",
    statusLabel:
      nbaLeans > 0
        ? "Live projections"
        : nbaGames.length > 0
          ? "Lines pending"
          : "Off-day",
    matchup: nbaMatchup,
    gameLine: nbaActiveDate
      ? `${nbaGames.length} game${nbaGames.length === 1 ? "" : "s"} · ${nbaActiveDate}`
      : "No upcoming slate on disk",
    projectionLine:
      nbaLeans > 0 ? `${nbaLeans} projections` : "Projections pending",
    trackRecord:
      nbaLifetime && nbaLifetime.totalSettled > 0 && nbaLifetime.hitRate !== null
        ? `Track record · ${nbaLifetime.wins}–${nbaLifetime.losses} on ${nbaLifetime.decisive} (${(nbaLifetime.hitRate * 100).toFixed(1)}%)`
        : null,
    accentColor: "rgba(120, 175, 255, 1)",
  };

  // ─── MLB ────────────────────────────────────────────────────────────
  const mlbDate = activeMlbDate() ?? null;
  const mlbBoard = mlbDate ? getMlbBoardForDate(mlbDate) : null;
  const mlbSchedule = mlbDate ? getMlbScheduleForDate(mlbDate) : null;
  const mlbLifetime = getMlbLifetimeSummary();
  const mlbLeans = mlbBoard?.summary?.leans ?? 0;
  const mlbGames = mlbBoard?.games?.length ?? mlbSchedule?.games?.length ?? 0;
  const mlbCard: SportCard = {
    key: "mlb",
    name: "MLB",
    emoji: "⚾",
    href: "/mlb/board",
    status:
      mlbLeans > 0 ? "live" : mlbGames > 0 ? "linesPending" : "scheduleOnly",
    statusLabel:
      mlbLeans > 0
        ? "Live projections"
        : mlbGames > 0
          ? "Lines pending"
          : "Off-day",
    matchup: mlbGames > 0 ? `${mlbGames} games today` : null,
    gameLine: mlbDate
      ? `${mlbGames} game${mlbGames === 1 ? "" : "s"} · ${mlbDate}`
      : "No upcoming slate on disk",
    projectionLine:
      mlbLeans > 0 ? `${mlbLeans} projections` : "Projections pending",
    trackRecord:
      mlbLifetime && mlbLifetime.totalSettled > 0 && mlbLifetime.hitRate !== null
        ? `Track record · ${mlbLifetime.wins}–${mlbLifetime.losses} on ${mlbLifetime.decisive} (${(mlbLifetime.hitRate * 100).toFixed(1)}%)`
        : null,
    accentColor: "rgba(140, 230, 175, 1)",
  };

  // ─── World Cup ──────────────────────────────────────────────────────
  const wcMeta = loadWorldCupMeta();
  const wcSchedule = loadWorldCupSchedule();
  const wcDays = daysUntilOpener();
  const wcOpener = wcSchedule[0];
  const wcCard: SportCard = {
    key: "world-cup",
    name: "World Cup",
    emoji: "⚽",
    href: "/world-cup",
    status: "comingSoon",
    statusLabel: wcDays > 0 ? `Kicks off in ${wcDays} days` : "Tournament live",
    matchup: wcOpener ? `${wcOpener.home} vs ${wcOpener.away}` : null,
    gameLine: wcMeta
      ? `${wcSchedule.length} matches · USA · Canada · Mexico`
      : "Schedule on disk",
    projectionLine: "Projections coming soon",
    trackRecord: null,
    accentColor: "var(--vault-gold-bright)",
  };

  // ─── NHL ────────────────────────────────────────────────────────────
  const nhlDate = activeNhlDate() ?? null;
  const nhlSchedule = nhlDate ? getNhlScheduleForDate(nhlDate) : null;
  const nhlGames = nhlSchedule?.games?.length ?? 0;
  const nhlCard: SportCard = {
    key: "nhl",
    name: "NHL",
    emoji: "🏒",
    href: "/nhl/board",
    status: nhlGames > 0 ? "scheduleOnly" : "comingSoon",
    statusLabel: nhlGames > 0 ? "Schedule live" : "Provider pending",
    matchup:
      nhlGames > 0 && nhlSchedule
        ? `${nhlSchedule.games[0].awayTeamAbbr} @ ${nhlSchedule.games[0].homeTeamAbbr}` +
          (nhlGames > 1 ? ` +${nhlGames - 1}` : "")
        : null,
    gameLine: nhlDate
      ? `${nhlGames} game${nhlGames === 1 ? "" : "s"} · ${nhlDate}`
      : "Schedule pending",
    projectionLine: "Projection model pending",
    trackRecord: null,
    accentColor: "rgba(180, 215, 255, 1)",
  };

  // ─── IPL ────────────────────────────────────────────────────────────
  const iplDate = activeIplDate() ?? null;
  const iplSchedule = iplDate ? getIplScheduleForDate(iplDate) : null;
  const iplGames = iplSchedule?.games?.length ?? 0;
  const iplCard: SportCard = {
    key: "ipl",
    name: "IPL",
    emoji: "🏏",
    href: "/ipl/board",
    status: iplGames > 0 ? "scheduleOnly" : "comingSoon",
    statusLabel: iplGames > 0 ? "Schedule live" : "Provider pending",
    matchup:
      iplGames > 0 && iplSchedule
        ? iplSchedule.games[0].shortName ?? null
        : null,
    gameLine: iplDate
      ? `${iplGames} match${iplGames === 1 ? "" : "es"} · ${iplDate}`
      : "Schedule pending",
    projectionLine: "Stats provider pending",
    trackRecord: null,
    accentColor: "rgba(255, 195, 130, 1)",
  };

  // Split into "tonight" cards (live, lines-pending, or schedule-only
  // for today) and "coming soon" cards (no game today). World Cup
  // belongs in the coming-soon group until kickoff (June 11).
  const tonightCards: SportCard[] = [nbaCard, mlbCard, nhlCard, iplCard];
  const comingSoonCards: SportCard[] = [wcCard];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <SectionHeader
        eyebrow="Tonight · pick a sport"
        title="Tonight's projections."
        sub="NBA + MLB have live projections. NHL + IPL render schedule only until projection pipelines ship. Nothing here is invented; status badges reflect exactly what's on disk."
      />

      {/* Tonight's sport cards — emoji graphics + status badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tonightCards.map((c) => (
          <SportProjectionCard key={c.key} card={c} />
        ))}
      </div>

      {/* Coming soon — World Cup. Renders below the main rail so casual
          users see tonight first; the tournament still has its own hub. */}
      <section className="mt-8" aria-label="Coming soon">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="font-mono uppercase tracking-[0.16em] shrink-0"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Coming soon
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {comingSoonCards.map((c) => (
            <SportProjectionCard key={c.key} card={c} />
          ))}
        </div>
      </section>

      {/* What the badges mean */}
      <section
        className="mt-10 rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
        style={{
          background: "rgba(7,11,26,0.45)",
          border: "1px solid var(--vault-border)",
          color: "var(--vault-text-mute)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.14em] mb-2"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          What the status badges mean
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 list-none p-0">
          <li>
            <strong style={{ color: "var(--vault-success)" }}>Live projections</strong>{" "}
            · model has projected every player on tonight's slate against
            the bookmaker line.
          </li>
          <li>
            <strong style={{ color: "var(--vault-warn)" }}>Lines pending</strong>{" "}
            · schedule is confirmed; bookmaker lines + projections land at
            the next refresh.
          </li>
          <li>
            <strong style={{ color: "var(--vault-text)" }}>Schedule live</strong>{" "}
            · games are on disk but the projection model isn't wired yet.
          </li>
          <li>
            <strong style={{ color: "var(--vault-text-faint)" }}>Provider pending</strong>{" "}
            · no schedule and no model. We'll never show fake numbers
            here.
          </li>
        </ul>
      </section>

      {/* Honesty footer */}
      <p
        className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-center"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Educational analytics · not betting advice · every projection graded after final stats
      </p>
    </div>
  );
}

function SportProjectionCard({ card }: { card: SportCard }) {
  const statusTone: { bg: string; fg: string; dot: string } =
    card.status === "live"
      ? {
          bg: "rgba(74, 222, 128, 0.12)",
          fg: "var(--vault-success)",
          dot: "var(--vault-success)",
        }
      : card.status === "linesPending"
        ? {
            bg: "var(--vault-warn-dim)",
            fg: "var(--vault-warn)",
            dot: "var(--vault-warn)",
          }
        : card.status === "scheduleOnly"
          ? {
              bg: "rgba(120, 175, 255, 0.10)",
              fg: "rgba(120, 175, 255, 1)",
              dot: "rgba(120, 175, 255, 1)",
            }
          : {
              bg: "var(--vault-panel-elevated)",
              fg: "var(--vault-text-faint)",
              dot: "var(--vault-text-faint)",
            };
  return (
    <Link
      href={card.href}
      className="rounded-[10px] vault-glow-hover block overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(7,11,26,0.85) 0%, rgba(7,11,26,0.55) 100%)",
        border: "1px solid var(--vault-border)",
        textDecoration: "none",
      }}
    >
      {/* Top accent bar — picks up the sport accent */}
      <span
        aria-hidden
        className="block h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${card.accentColor}, transparent)`,
          opacity: 0.55,
        }}
      />
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              role="img"
              style={{
                fontSize: 40,
                lineHeight: 1,
                filter: "drop-shadow(0 0 12px rgba(240, 199, 94, 0.08))",
              }}
            >
              {card.emoji}
            </span>
            <div>
              <div
                className="font-mono uppercase tracking-[0.18em]"
                style={{ color: card.accentColor, fontSize: 11 }}
              >
                {card.name}
              </div>
              {card.matchup && (
                <div
                  className="font-display tracking-tight"
                  style={{
                    color: "var(--vault-text)",
                    fontSize: 18,
                    lineHeight: 1.15,
                  }}
                >
                  {card.matchup}
                </div>
              )}
            </div>
          </div>
          <span
            className="font-mono uppercase tracking-[0.14em] inline-flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-[4px]"
            style={{
              background: statusTone.bg,
              color: statusTone.fg,
              fontSize: 9,
              border: `1px solid ${statusTone.fg}`,
              opacity: 0.95,
            }}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: statusTone.dot,
                boxShadow: card.status === "live"
                  ? `0 0 6px ${statusTone.dot}`
                  : "none",
              }}
            />
            {card.statusLabel}
          </span>
        </div>
        <div className="space-y-1">
          {card.gameLine && (
            <div
              className="font-mono"
              style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
            >
              {card.gameLine}
            </div>
          )}
          {card.projectionLine && (
            <div
              className="font-mono"
              style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
            >
              {card.projectionLine}
            </div>
          )}
          {card.trackRecord && (
            <div
              className="font-mono"
              style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
            >
              {card.trackRecord}
            </div>
          )}
        </div>
        <div
          className="mt-4 font-mono uppercase tracking-[0.16em]"
          style={{ color: card.accentColor, fontSize: 11 }}
        >
          Open {card.name} →
        </div>
      </div>
    </Link>
  );
}
