import { getSlate, getMeta, getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import type { PropLean, BoardData, ScheduleGame } from "@/lib/types";
import ParlayLabModeTabs from "@/components/parlay-lab-mode-tabs";
import DataSourceBadge from "@/components/data-source-badge";
import NeonCornerBracket from "@/components/neon-corner-bracket";
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
  const activeSlate = selectActiveSlate(allDates, buildTimeToday, boardsByDate);

  // Build the per-date payload the client needs. Each date carries:
  //   - its leans (for the builder)
  //   - a label (Today / Tomorrow / Yesterday / weekday-name)
  //   - an isArchived flag (true when the date is in the past)
  //   - whether it's the active default
  const allLeans: PropLean[] = [];
  const gamesByGameId: Record<string, ScheduleGame> = {};
  const dateLabels = new Map<
    string,
    { label: string; isArchived: boolean; isActiveDefault: boolean }
  >();
  for (const date of allDates) {
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
      {/* Hero — premium data-orbit backdrop + neon corner brackets +
          subtle scanline. Sportsbook-lounge centerpiece. */}
      <section className="vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-6 sm:-mx-8 px-6 sm:px-8 pt-6 pb-2">
        <NeonCornerBracket />
        <div
          className="vault-quiet-label mb-4 inline-flex items-center gap-2"
          style={{ color: "var(--vault-gold)", letterSpacing: "0.08em" }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
            style={{ background: "var(--vault-gold-bright)" }}
          />
          Parlay Lab · educational analysis
        </div>

        <h1
          className="vault-display-h1 max-w-3xl"
          style={{ color: "var(--vault-text)" }}
        >
          Build with the{" "}
          <span style={{ color: "var(--vault-gold-bright)" }}>model</span>
          .
        </h1>

        <p
          className="mt-6 text-[15px] md:text-[17px] max-w-2xl leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Generate candidate parlays from the slate&apos;s real model leans, or
          paste a slip you&apos;ve already built and compare each leg to our
          projections, edges, and recent-trend data. We never tell you to
          bet — we tell you what the model thinks.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <DataSourceBadge meta={meta} />
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
            style={{
              background: "var(--vault-warn-dim)",
              color: "var(--vault-warn)",
              border: "1px solid rgba(240, 199, 94, 0.30)",
            }}
          >
            Educational only — not betting advice
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
      <section className="mt-8">
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
