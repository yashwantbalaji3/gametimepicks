/**
 * /nfl/trends — the NFL adapter's words for the shared Trends board (components/trends/trends-board.tsx). Every figure
 * comes from lib/sports/nfl/trends.ts. The reference is the simulation receipt of record's MODEL PROJECTION median, which
 * is also the threshold the history counts against — "a model threshold, not a sportsbook line" (no NFL line qualifies
 * for display today). Counts are history, never a probability. Opponent and home/away are their own columns; the
 * 5/5 · 4/5 · 3/5 filter reads the chosen stat's last-5 MODEL-THRESHOLD count (never a sportsbook line's). The QB markets
 * are #1302's, under forward evaluation: the page says EXPERIMENTAL beside the projection.
 */
import Link from "next/link";
import TrendsBoard, { type TrendsSpec } from "@/components/trends/trends-board";
import { NFL_QB_STATUS_NOTE, NFL_THRESHOLD_NOTE, NFL_TRENDS_HISTORY_NOTE, NFL_TRENDS_STATS, NFL_TRENDS_WINDOWS } from "@/lib/sports/nfl/trends";
import type { TrendsModel } from "@/lib/trends/contract";

export const NFL_TRENDS_SPEC: TrendsSpec = {
  eyebrow: "NFL · quarterback trends",
  title: "Quarterback trends",
  heroSub: <>Each projected starting quarterback&apos;s last 5 and 10 games against this week&apos;s <b>MODEL PROJECTION</b> — a {NFL_THRESHOLD_NOTE}. History, not a probability. Tap a quarterback for game logs.</>,
  emptyText: "No NFL simulation of record is published for the coming week yet. Trends return with the next one.",
  meta: (t) => <><span className="gtp-kind-chip-lite">MODEL PROJECTION</span> {NFL_QB_STATUS_NOTE} · week from {t.slateDate}{t.slateIsToday ? "" : " · not the coming week, so no player is ranked"} · {t.gamesRead} games read · <Link href="/nfl/">NFL hub →</Link></>,
  caption: "Quarterback trends: this week's MODEL PROJECTION (a model threshold, not a sportsbook line) and how many of the last 5 and 10 games played were above it",
  stats: NFL_TRENDS_STATS,
  thSub: "model threshold · games above",
  fmt: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)),
  matchupColumns: true,
  minutesReviewNote: "",
  lineNote: "observed record, not a probability",
  fine: <>
    # orders quarterbacks cleared to play (eligibility@1, a Doubtful starter is not) in games whose official forecast knows the starting-QB situation (R5), by projected attempts — never by these counts.
    A game counts only when its final is recorded and the quarterback threw at least one pass; {NFL_TRENDS_HISTORY_NOTE} Not betting advice.
  </>,
  filters: { stats: NFL_TRENDS_STATS, orderLabel: "Projected attempts", hitFilter: true },
  panel: { dataUrl: "/data/nfl-trends.json", sport: "nfl", stats: NFL_TRENDS_STATS, windows: NFL_TRENDS_WINDOWS, defaultWindow: 5, logMinutes: false, referenceNote: `this week · ${NFL_THRESHOLD_NOTE}`, digits: 0 },
};

export default function NflTrendsView({ trends }: { trends: TrendsModel }) {
  return <TrendsBoard model={trends} spec={NFL_TRENDS_SPEC} />;
}
