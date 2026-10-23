/**
 * /players — PLAYER RESEARCH, BY SPORT (gap 6, 2026-10-23). PUBLIC.
 *
 * The parent of /players/<sport>/: one card per sport that has player pages, with the page count from the research
 * projection index (the registry the pages are generated from). NBA has no player research pages and is named so.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow, PANEL, ResearchShell } from "@/components/research-pages/research-primitives";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

import { SPORT_NAME, countOf, sportsWith } from "./_directory/rows";

export const metadata: Metadata = withRouteMetadata("/players/", {
  title: "Players: NFL, MLB, Premier League and UFC research | GameTimePicks",
  description: "Every player and fighter with a GameTimePicks research page, by sport: recorded game logs, recent form and published forecasts beside what happened.",
});

export default function PlayersHome() {
  const sports = sportsWith("player");
  return (
    <ResearchShell back={{ href: "/research/", label: "Research" }}>
      <Eyebrow>Research</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>Players</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 680, lineHeight: 1.6 }}>
        Pick a sport to search its players by name or team. Each page shows recorded games only.
      </p>
      <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {sports.map((s) => {
          const n = countOf("player", s);
          return (
            <li key={s}>
              <Link href={`/players/${s.toLowerCase()}/`} style={{ ...PANEL, display: "block", textDecoration: "none", color: "var(--vault-text)", minHeight: 44 }}>
                <strong>{SPORT_NAME[s]} {s === "UFC" ? "fighters" : "players"} →</strong>
                <span className="font-mono" style={{ display: "block", fontSize: 12, color: "var(--vault-text-mute)", marginTop: 4 }}>{n.toLocaleString("en-US")} pages</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
        NBA has no player research pages; its official forecasts are on the <Link href="/nba/" style={{ color: "var(--vault-gold-bright)" }}>NBA hub</Link>. Looking for a club? <Link href="/teams/" style={{ color: "var(--vault-gold-bright)" }}>Teams</Link>.
      </p>
    </ResearchShell>
  );
}
