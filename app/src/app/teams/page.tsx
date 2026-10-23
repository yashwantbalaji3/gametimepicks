/**
 * /teams — TEAM RESEARCH, BY SPORT (gap 6, 2026-10-23). PUBLIC.
 *
 * The parent of /teams/<sport>/: one card per sport that has team pages, counted from the research projection index.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow, PANEL, ResearchShell } from "@/components/research-pages/research-primitives";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

import { SPORT_NAME, countOf, sportsWith } from "../players/_directory/rows";

export const metadata: Metadata = withRouteMetadata("/teams/", {
  title: "Teams: NFL, MLB and Premier League research | GameTimePicks",
  description: "Every team with a GameTimePicks research page, by sport: recorded results, recent games, upcoming games and player links.",
});

export default function TeamsHome() {
  const sports = sportsWith("team");
  return (
    <ResearchShell back={{ href: "/research/", label: "Research" }}>
      <Eyebrow>Research</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>Teams</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 680, lineHeight: 1.6 }}>
        Pick a sport to see every team with a research page.
      </p>
      <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {sports.map((s) => (
          <li key={s}>
            <Link href={`/teams/${s.toLowerCase()}/`} style={{ ...PANEL, display: "block", textDecoration: "none", color: "var(--vault-text)", minHeight: 44 }}>
              <strong>{SPORT_NAME[s]} teams →</strong>
              <span className="font-mono" style={{ display: "block", fontSize: 12, color: "var(--vault-text-mute)", marginTop: 4 }}>{countOf("team", s)} pages</span>
            </Link>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
        UFC fighters have no team; search them on <Link href="/players/ufc/" style={{ color: "var(--vault-gold-bright)" }}>UFC fighters</Link>. NBA has no team research pages yet. Looking for a player? <Link href="/players/" style={{ color: "var(--vault-gold-bright)" }}>Players</Link>.
      </p>
    </ResearchShell>
  );
}
