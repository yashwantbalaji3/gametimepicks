/**
 * /nba/projections/[date] — one static page per committed slate snapshot (follow-up to PR 1163: date selection).
 *
 * generateStaticParams enumerates the dates whose dated snapshot (public/data/nba/experimental-public/<date>.json) is
 * committed and schema-valid — nothing else is listed or linked. It also always includes the build's own ET date, so the
 * param list can never be empty (an empty list kills the whole static export — the P202 lesson /simulate/d/[date]
 * documents); when no snapshot is committed for that date, its page is the honest empty state and no link points at it.
 *
 * A date before the build's ET date is labelled a PAST FROZEN SLATE and is never presented as current; the default view
 * (/nba/projections/) stays the current slate. Each page embeds only its own date's board. Every number is the frozen
 * pregame value, copied verbatim from that date's snapshot by the shared view. After an official final, each player's
 * Actual from the graders' box score sits beside the frozen figure (projection-board-actuals.ts) — never in place of it.
 */
import type { Metadata } from "next";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { currentEtDate } from "@/lib/freshness";
import { boardContext } from "@/components/nba/projection-board-context";
import { committedLaneDates, loadLaneForDate } from "@/components/nba/experimental-lane";
import NbaProjectionsView from "@/components/nba/projections-view";
import { AMENDMENT_A } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { loadEloWinProbabilityContext } from "@/lib/sports/nba/elo-win-probability-context.mjs";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...new Set([...committedLaneDates(), currentEtDate()])].sort().map((date) => ({ date }));
}

export function generateMetadata({ params }: { params: { date: string } }): Metadata {
  const shown = AMENDMENT_A.enabled && (loadLaneForDate(params.date)?.games.length ?? 0) > 0;
  return withRouteMetadata(`/nba/projections/${params.date}/`, {
    title: `NBA Predicted Player Statistics · ${params.date}${params.date < currentEtDate() ? " (past frozen slate)" : ""} · GameTime Picks`,
    description: `Official Forecast NBA player medians for the ${params.date} slate, frozen before tip-off and shown exactly as frozen, with each player's actual box-score figures beside them after the final. Not betting recommendations.`,
    // A date with no committed snapshot is an empty state: reachable, never indexed.
    ...(shown ? {} : { robots: { index: false, follow: true } }),
  });
}

export default function NbaProjectionsDatePage({ params }: { params: { date: string } }) {
  const now = new Date();
  const ctx = boardContext({ date: params.date, nowIso: now.toISOString(), buildEtDate: currentEtDate(now), enabled: AMENDMENT_A.enabled });
  return <NbaProjectionsView lane={ctx.lane} role={ctx.role} date={ctx.date} games={ctx.games} dates={ctx.dates} today={ctx.today} actuals={ctx.actuals} eloCtx={loadEloWinProbabilityContext()} dated />;
}
