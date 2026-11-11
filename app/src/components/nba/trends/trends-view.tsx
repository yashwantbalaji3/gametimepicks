/**
 * /trends — NBA player trends: the NBA ADAPTER's words for the shared Trends board (components/trends/trends-board.tsx,
 * trends-shared 2026-11-11). Every figure comes from lib/sports/nba/trends.ts; this file only names the sport's labels.
 * Its output is frozen in lib/sports/nba/__fixtures__/trends-nba-snapshot.json and must stay byte-identical (parity test).
 * The reference is the official MODEL PROJECTION median; each cell is a count of past games — history, never a
 * probability. Only eligible players carry a number (#); not-verified and ineligible players are listed under their
 * state, unranked.
 */
import Link from "next/link";
import TrendsBoard, { type TrendsSpec } from "@/components/trends/trends-board";
import { MINUTES_REVIEW_NOTE, TRENDS_LINE_NOTE, TRENDS_HISTORY_NOTE, TRENDS_REFERENCE_LABEL, TRENDS_STATS, TRENDS_WINDOWS, type NbaTrends } from "@/lib/sports/nba/trends";

export const NBA_TRENDS_SPEC: TrendsSpec = {
  eyebrow: "NBA · player trends",
  title: "Player trends",
  heroSub: <>Each player&apos;s last 5, 10 and 20 games played against tonight&apos;s <b>{TRENDS_REFERENCE_LABEL}</b> median (the official forecast). {TRENDS_HISTORY_NOTE} Tap a player for game logs.</>,
  emptyText: "No official NBA projection is published yet. Trends return with the next slate.",
  meta: (t) => <><span className="gtp-kind-chip-lite">{TRENDS_REFERENCE_LABEL}</span> slate {t.slateDate}{t.slateIsToday ? "" : " · not tonight's slate, so no player is ranked"} · {t.gamesRead} regular-season games read · <Link href="/nba/projections/">Top Boards →</Link></>,
  caption: "Player trends: tonight's MODEL PROJECTION median and how many of the last 5, 10 and 20 games played were above it",
  stats: TRENDS_STATS,
  thSub: "median · games above",
  fmt: (v) => v.toFixed(1),
  matchupColumns: false,
  minutesReviewNote: MINUTES_REVIEW_NOTE,
  lineNote: TRENDS_LINE_NOTE,
  fine: <>
    # orders players cleared to play (eligibility@1) by tonight&apos;s expected minutes, never by these counts; a minutes projection under review is not numbered. A game counts only when its official final is recorded
    and the box score agrees with it; a game a player did not play is not counted, never read as 0. Not betting advice.
  </>,
  filters: { stats: TRENDS_STATS, orderLabel: "Expected minutes", hitFilter: false },
  panel: { dataUrl: "/data/nba-trends.json", sport: "nba", stats: TRENDS_STATS, windows: TRENDS_WINDOWS, defaultWindow: 10, logMinutes: true, referenceNote: "tonight · median", digits: 1 },
};

export default function TrendsView({ trends }: { trends: NbaTrends }) {
  return <TrendsBoard model={trends} spec={NBA_TRENDS_SPEC} />;
}
