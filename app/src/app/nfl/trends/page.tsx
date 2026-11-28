/**
 * /nfl/trends — NFL TRENDS (founder directive 2026-11-15, P2), first slice. Every player on the upcoming official player
 * boards, each published market: actual last-5 results, last-5 / last-10 medians and the official projection. Built at
 * export time from the player boards and the player-evidence file; filters run in the browser over those rows.
 *
 * Line-based records (5/5, 4/5 against an observed sportsbook line) appear only where a line was captured before
 * kickoff. When none was, the page says so instead of inventing a comparison line.
 * LINES (per game): THE one rule's rows, lib/sports/nfl/line-display-open.mjs nflOpenLineRecords (switch on AND a
 * readable line artifact for the game), selected exactly as the game page's line section selects them
 * (evidence-line.mjs nflEvidenceLines, at the build instant). The board's offer slot is never read. With no game open
 * the page prints no line column and no line sentence.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import NflTrendsTable, { type TrendRow } from "@/components/nfl/trends-table";
import { OBSERVED_LINE_STATES, buildTrendRows, upcomingBoards } from "@/lib/sports/nfl/trends-rows.mjs";
import { packTrendRows } from "@/lib/sports/nfl/trends-wire.mjs";
import { sanitizePlayerBoard } from "@/lib/sports/odds/public-offer-sanitizer.mjs";
import { readEvidenceFor } from "@/lib/sports/nfl/player-evidence-file.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { buildAsOfIso } from "@/lib/build-asof";
import { nflOpenLineRecords } from "@/lib/sports/nfl/line-display-open.mjs";
import { nflEvidenceLines } from "@/lib/sports/nfl/evidence-line.mjs";

export const metadata = withRouteMetadata("/nfl/trends/", {
  title: "NFL player trends: last 5 games vs the official projection · GameTime Picks",
  description: "Every player on this week's NFL boards: actual recent results beside the official model projection. History, not a pick.",
});

function load(): { rows: TrendRow[]; linesCaptured: number; linesOpen: boolean; played: number } {
  /* the build instant: a game at or before it has kicked off and is not this week's board (history stays on its page) */
  const now = buildAsOfIso(); // the export's one build instant (lib/build-asof.ts), shared with every other page
  const dir = path.join(process.cwd(), "public/data/nfl/player-board");
  const root = path.join(process.cwd(), "..");
  const boards = [];
  const evidenceByEvent: Record<string, Record<string, unknown[]>> = {};
  const linesByEvent: Record<string, Record<string, unknown> | null> = {};
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)); } catch { /* no boards ⇒ empty page */ }
  for (const f of files) {
    try {
      /* the SAME loader-boundary sanitiser as the game page: an ineligible operator's offer is withheld here too */
      const b = sanitizePlayerBoard(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      const ev = readEvidenceFor(root, b.providerEventId);
      if (!Object.keys(ev).length) continue; // only boards the evidence file covers (the upcoming slate)
      boards.push(b);
      evidenceByEvent[String(b.providerEventId)] = ev;
      const open = nflOpenLineRecords(String(b.providerEventId));
      linesByEvent[String(b.providerEventId)] = open ? nflEvidenceLines({ board: b, rows: open, asOf: now }) : null;
    } catch { /* unreadable board ⇒ skipped */ }
  }
  const rows = buildTrendRows({ boards, evidenceByEvent, now, linesByEvent }) as TrendRow[];
  return { rows, linesCaptured: rows.filter((r) => r.lineState != null && OBSERVED_LINE_STATES.includes(r.lineState)).length, linesOpen: rows.some((r) => r.lineState != null), played: boards.length - upcomingBoards(boards, now).length };
}

export default function NflTrendsPage() {
  const { rows, linesCaptured, linesOpen, played } = load();
  const players = new Set(rows.map((r) => r.playerId)).size;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <p style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>NFL · Trends</p>
      <h1 style={{ fontSize: 26, margin: "4px 0 6px", color: "var(--vault-text)" }}>Recent form vs the official projection</h1>
      <p style={{ fontSize: 14, color: "var(--vault-text-mute)", margin: "0 0 6px", maxWidth: 760 }}>
        {players} players on this week&apos;s boards, not just the headliners: each one&apos;s actual last five games beside the model&apos;s projection.
        A gap between the two is history, not a pick. The model already weighs recent games, along with role and matchup.
      </p>
      <p style={{ fontSize: 13, color: "var(--vault-text-faint)", margin: "0 0 16px", maxWidth: 760 }}>
        {/* line gate closed for every game ⇒ no sentence about lines at all (history only) */}
        {!linesOpen ? null : <>{linesCaptured
          ? `${linesCaptured} rows have a sportsbook line captured before kickoff; only those show a record against the line, with the line, the sportsbook and when it was captured.`
          : "No sportsbook player lines were captured for this slate, so no hit rate against a line is shown. We never substitute a made-up line."}{" "}</>}
        {played ? `${played} game${played === 1 ? " has" : "s have"} already kicked off and ${played === 1 ? "is" : "are"} not listed; ${played === 1 ? "its" : "their"} history stays on ${played === 1 ? "its" : "each"} game page. ` : ""}Tap a player for every game, opponent and stat line. <Link href="/nfl/">All NFL forecasts →</Link> · <Link href="/nfl/builder/">Scenario builder →</Link>
      </p>
      {rows.length ? <NflTrendsTable packed={packTrendRows(rows)} /> : <p style={{ color: "var(--vault-text-mute)" }}>No upcoming NFL player boards right now. Trends return with the next slate&apos;s boards.</p>}
      <p style={{ fontSize: 11.5, color: "var(--vault-text-faint)", marginTop: 14 }}>Box scores: ESPN public game summaries, 2026 regular season. &quot;–&quot; = no stat line (did not play, or recorded no stat). <Link href="/responsible-use/">Responsible use</Link></p>
    </div>
  );
}
