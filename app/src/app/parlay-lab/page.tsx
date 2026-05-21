import { getSlate, getMeta, getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import type { PropLean, BoardData, ScheduleGame } from "@/lib/types";
import ParlayLabModeTabs from "@/components/parlay-lab-mode-tabs";
import DataSourceBadge from "@/components/data-source-badge";
import NeonCornerBracket from "@/components/neon-corner-bracket";
import Link from "next/link";
import { selectActiveSlate } from "@/lib/active-slate";
import { currentEtDate } from "@/lib/freshness";

/**
 * /parlay-lab — Phase 17 active-slate-aware builder + analyze modes.
 *
 * Phase 17 changes:
 *   - Default selected date is the active slate (today / nearest upcoming),
 *     not whichever past date happens to have the most leans.
 *   - Past dates with leans are still surfaced in the date picker, but
 *     labeled "archived" so the user knows they're not current.
 *   - Builder defaults to "core players only" (top 3 per team).
 *
 * NOT betting advice. NOT a recommendation engine. NOT a parlay scraper.
 */
export default function ParlayLabPage() {
  const slate = getSlate();
  const meta = getMeta();
  const buildTimeToday = currentEtDate();

  // Collect every board date that has leans, plus build a fresh map for
  // the active-slate selector. Past dates with leans are kept (user may
  // explicitly want to analyze them as archived) but labeled distinctly.
  const allDates = getAvailableBoardDates();
  const boardsByDate: Record<string, BoardData> = {};
  for (const d of allDates) {
    boardsByDate[d] = getBoardForDate(d);
  }
  const rawActiveSlate = selectActiveSlate(allDates, buildTimeToday, boardsByDate);
  // Off-day promotion: if "today" exists but has no games AND a future
  // date in the upcoming window has loaded leans, promote that future
  // date as the default builder slate. Matches the board-page behavior.
  const activeSlate = (() => {
    if (rawActiveSlate.kind !== "today") return rawActiveSlate;
    const todayDate = rawActiveSlate.selectedDate;
    if (!todayDate) return rawActiveSlate;
    const todayBoard = boardsByDate[todayDate];
    if ((todayBoard?.games?.length ?? 0) > 0) return rawActiveSlate;
    const futureWithLeans = rawActiveSlate.upcomingAndTodayDates
      .filter((d) => d > todayDate)
      .find((d) => (boardsByDate[d]?.leans?.length ?? 0) > 0);
    if (!futureWithLeans) return rawActiveSlate;
    return { ...rawActiveSlate, selectedDate: futureWithLeans };
  })();

  // STALE-DATA FIX (May 18):
  // Previously this page loaded leans + games from EVERY board file
  // on disk — including archived May 4-15 boards that contain games
  // for already-eliminated teams (e.g. LAL @ OKC from the first
  // round). Those then leaked into the Parlay Lab game picker and
  // candidate generator, showing eliminated teams as if they were
  // current matchups.
  //
  // Fix: restrict the builder's data to TODAY + FUTURE dates only,
  // pulling the date list straight from `activeSlate.upcomingAndTodayDates`.
  // Past dates are intentionally NOT pre-loaded; an explicit
  // archive-review flow is a separate concern that can come later.
  const builderDates = new Set(activeSlate.upcomingAndTodayDates);
  const allLeans: PropLean[] = [];
  const gamesByGameId: Record<string, ScheduleGame> = {};
  const dateLabels = new Map<
    string,
    { label: string; isArchived: boolean; isActiveDefault: boolean }
  >();
  for (const date of allDates) {
    if (!builderDates.has(date)) continue;
    const board = boardsByDate[date];
    if (!board || board.leans.length === 0) continue;
    for (const lean of board.leans) {
      allLeans.push(lean);
    }
    for (const game of board.games ?? []) {
      if (game?.gameId) gamesByGameId[game.gameId] = game;
    }
    const slateDay = slate.days.find((d) => d.date === date);
    const isArchived = date < buildTimeToday;
    const baseLabel = slateDay?.dayLabel ?? formatBareDate(date);
    const label = isArchived ? `${baseLabel} (archived)` : baseLabel;
    dateLabels.set(date, {
      label,
      isArchived,
      isActiveDefault: date === activeSlate.selectedDate,
    });
  }

  return (
    <div className="vault-page-shell px-6 sm:px-8 py-12 md:py-20">
      {/* Slim hero — one headline, one subtitle, sport-mode pills + the
          educational-only chip on a single row. Long explanations live in
          the collapsible "How this works" below. The old NBA section
          tabs (Overview / Model Board / Power Board / Parlays) were
          removed — they made the page feel like an internal dashboard,
          and the primary global nav already has a "Parlay Lab" tab. */}
      <section className="relative overflow-hidden -mx-6 sm:-mx-8 px-6 sm:px-8 pt-2 pb-2">
        <h1
          className="font-display font-semibold tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: "clamp(32px, 5vw, 44px)",
            lineHeight: 1.05,
          }}
        >
          Build candidate slips.
        </h1>
        <p
          className="mt-3 text-[14px] max-w-2xl leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Choose a style, then review the legs. No hit-rate claims until
          slips are saved before games and graded after.
        </p>

        {/* Sport filter pills + educational chip */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span
            className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-[4px]"
            style={{
              fontSize: 11,
              color: "var(--vault-gold-bright)",
              background:
                "linear-gradient(180deg, rgba(212, 175, 55, 0.12) 0%, rgba(212, 175, 55, 0) 90%)",
              border: "1px solid rgba(212, 175, 55, 0.30)",
            }}
            aria-current="page"
          >
            🏀 NBA · active
          </span>
          <span
            className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-[4px]"
            style={{
              fontSize: 11,
              color: "var(--vault-text-faint)",
              border: "1px solid var(--vault-border)",
            }}
            title="MLB candidate slips unlock when slips are saved before games and graded after."
          >
            ⚾ MLB · pending
          </span>
          <span
            className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-[4px]"
            style={{
              fontSize: 11,
              color: "var(--vault-text-faint)",
              border: "1px solid var(--vault-border)",
            }}
            title="World Cup projection model launches before kickoff."
          >
            ⚽ World Cup · coming soon
          </span>
          <DataSourceBadge meta={meta} />
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
            style={{
              background: "var(--vault-warn-dim)",
              color: "var(--vault-warn)",
              border: "1px solid rgba(240, 199, 94, 0.30)",
            }}
          >
            Educational only · not betting advice
          </span>
        </div>
      </section>

      {/* "How this works" — collapsible disclosure so it doesn't dominate
          the page on landing. Open state shows the 3 bullets verbatim. */}
      <section className="mt-10">
        <details
          className="rounded-[5px] vault-glass overflow-hidden group"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <summary
            className="flex items-center justify-between gap-4 cursor-pointer list-none px-4 sm:px-5 py-3.5 transition-colors"
            style={{
              borderBottom: "1px solid transparent",
            }}
          >
            <span className="inline-flex items-center gap-3">
              <span
                className="vault-quiet-label"
                style={{ color: "var(--vault-gold)", letterSpacing: "0.08em" }}
              >
                How this works
              </span>
              <span
                className="text-[12px]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                build mode · analyze mode · no fabrication
              </span>
            </span>
            <span
              aria-hidden
              className="font-mono text-[12px] leading-none transition-transform group-open:rotate-180"
              style={{ color: "var(--vault-text-faint)" }}
            >
              ▾
            </span>
          </summary>
          <ul
            className="space-y-2 list-none text-[13px] leading-relaxed px-4 sm:px-5 py-4"
            style={{
              borderTop: "1px solid var(--vault-rule)",
              color: "var(--vault-text-mute)",
            }}
          >
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
              <strong style={{ color: "var(--vault-text)" }}>
                Build mode
              </strong>{" "}
              generates candidate parlays from real slate leans. Pick a risk
              profile, optionally select specific players, games, or markets.
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
              <strong style={{ color: "var(--vault-text)" }}>
                Analyze mode
              </strong>{" "}
              takes a pasted slip and matches each leg to the model. Format:{" "}
              <code style={{ color: "var(--vault-text)" }}>
                LeBron James Over 25.5 PTS -110
              </code>
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span> We
              never synthesize alternate lines or fabricate legs. If the model
              doesn&apos;t have a lean, that combination isn&apos;t available.
            </li>
          </ul>
        </details>
      </section>


      {/* Client interactive area — mode tabs hold both Build + Analyze */}
      <section className="mt-6">
        <ParlayLabModeTabs
          allLeans={allLeans}
          datesAvailable={Array.from(dateLabels.entries()).map(([date, info]) => ({
            date,
            label: info.label,
            isArchived: info.isArchived,
            isActiveDefault: info.isActiveDefault,
          }))}
          activeSlateKind={activeSlate.kind}
          activeDate={activeSlate.selectedDate}
          gamesByGameId={gamesByGameId}
        />
      </section>

      {/* Footer educational reminder */}
      <section className="mt-16">
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          GametimePicks is an educational analytics project. Nothing on this
          page is betting advice. Past model agreement does not guarantee
          future outcomes. Sports outcomes are uncertain. If gambling is
          affecting your wellbeing, please visit{" "}
          <a
            href="https://www.ncpgambling.org/help-treatment/national-helpline-1-800-522-4700/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--vault-gold-bright)] transition-colors"
          >
            the National Council on Problem Gambling helpline
          </a>
          .
        </p>
      </section>
    </div>
  );
}

function formatBareDate(date: string): string {
  try {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(dt);
  } catch {
    return date;
  }
}
