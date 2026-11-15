/**
 * /nfl/trends — NFL TRENDS (founder directive 2026-11-15, P2), first slice. Every player on the upcoming official player
 * boards, each published market: actual last-5 results, last-5 / last-10 medians and the official projection. Built at
 * export time from the player boards and the player-evidence file; filters run in the browser over those rows.
 *
 * Line-based records (5/5, 4/5 against an observed sportsbook line) appear only where a line was captured before
 * kickoff. When none was, the page says so instead of inventing a comparison line.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import NflTrendsTable, { type TrendRow } from "@/components/nfl/trends-table";
import { buildTrendRows } from "@/lib/sports/nfl/trends-rows.mjs";
import { readEvidenceFor } from "@/lib/sports/nfl/player-evidence-file.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/nfl/trends/", {
  title: "NFL player trends: last 5 games vs the official projection · GameTime Picks",
  description: "Every player on this week's NFL boards: actual recent results beside the official model projection. History, not a pick.",
});

function load(): { rows: TrendRow[]; linesCaptured: number } {
  const dir = path.join(process.cwd(), "public/data/nfl/player-board");
  const root = path.join(process.cwd(), "..");
  const boards = [];
  const evidenceByEvent: Record<string, Record<string, unknown[]>> = {};
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)); } catch { /* no boards ⇒ empty page */ }
  for (const f of files) {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const ev = readEvidenceFor(root, b.providerEventId);
      if (!Object.keys(ev).length) continue; // only boards the evidence file covers (the upcoming slate)
      boards.push(b);
      evidenceByEvent[String(b.providerEventId)] = ev;
    } catch { /* unreadable board ⇒ skipped */ }
  }
  const rows = buildTrendRows({ boards, evidenceByEvent }) as TrendRow[];
  return { rows, linesCaptured: rows.filter((r) => r.lineState !== "NO_OBSERVED_LINE").length };
}

export default function NflTrendsPage() {
  const { rows, linesCaptured } = load();
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
        {linesCaptured
          ? `${linesCaptured} rows have a sportsbook line captured before kickoff; only those show a record against the line.`
          : "No sportsbook player lines were captured for this slate, so no hit rate against a line is shown. We never substitute a made-up line."}{" "}
        Tap a player for every game, opponent and stat line. <Link href="/nfl/">All NFL forecasts →</Link>
      </p>
      {rows.length ? <NflTrendsTable rows={rows} /> : <p style={{ color: "var(--vault-text-mute)" }}>No upcoming NFL player boards right now. Trends return with the next slate&apos;s boards.</p>}
      <p style={{ fontSize: 11.5, color: "var(--vault-text-faint)", marginTop: 14 }}>Box scores: ESPN public game summaries, 2026 regular season. &quot;–&quot; = no stat line (did not play, or recorded no stat). <Link href="/responsible-use/">Responsible use</Link></p>
    </div>
  );
}
