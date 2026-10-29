/**
 * /teams/[sport] — TEAM INDEX (gap 6, 2026-10-23). PUBLIC.
 *
 * /teams/nfl/ returned 404 while every /teams/nfl/<slug>/ page existed. This lists every team page of one sport from
 * the research projection index — the registry the detail pages are generated from — with a name search. UFC has no
 * teams, so it has no page here.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow, ResearchShell } from "@/components/research-pages/research-primitives";
import { SPORT_SEGMENTS } from "@/lib/research-pages/projection-store";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

import EntityDirectory from "../../players/_directory/entity-directory";
import { SPORT_HUB, SPORT_NAME, countOf, sportsWith, teamRows } from "../../players/_directory/rows";

export const dynamicParams = false;

export function generateStaticParams() {
  return sportsWith("team").map((s) => ({ sport: s.toLowerCase() }));
}

export function generateMetadata({ params }: { params: { sport: string } }): Metadata {
  const sport = SPORT_SEGMENTS[params.sport];
  if (!sport) return { title: "Teams · GameTimePicks" };
  return withRouteMetadata(`/teams/${params.sport}/`, {
    title: `${SPORT_NAME[sport]} teams: results, recent games and schedule | GameTimePicks`,
    description: `All ${countOf("team", sport)} ${SPORT_NAME[sport]} teams with a GameTimePicks research page: recorded results, recent games, upcoming games and player links.`,
  });
}

export default function TeamIndexPage({ params }: { params: { sport: string } }) {
  const sport = SPORT_SEGMENTS[params.sport];
  if (!sport || !sportsWith("team").includes(sport)) notFound();
  const rows = teamRows(sport);
  const others = sportsWith("team").filter((s) => s !== sport);
  return (
    <ResearchShell back={{ href: "/teams/", label: "All teams" }}>
      <Eyebrow>{SPORT_NAME[sport]} · Team research</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>{SPORT_NAME[sport]} teams</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 680, lineHeight: 1.6 }}>
        Every {SPORT_NAME[sport]} team with a research page.
        {sport === "EPL" ? " Each club page shows its current-season results from the official full-time scores of every graded Premier League match, plus fixtures, upcoming matches and its players. Earlier seasons show fixtures only." : " Each page shows recorded results, recent games, upcoming games and links to its players."}
      </p>
      <EntityDirectory base={`/teams/${params.sport}/`} rows={rows} noun="teams" groupLabel={null} />
      <p style={{ marginTop: 22, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
        <Link href={`/players/${params.sport}/`} style={{ color: "var(--vault-gold-bright)" }}>{SPORT_NAME[sport]} players</Link> ·{" "}
        {others.map((s) => (
          <span key={s}><Link href={`/teams/${s.toLowerCase()}/`} style={{ color: "var(--vault-gold-bright)" }}>{SPORT_NAME[s]} teams</Link> · </span>
        ))}
        <Link href={SPORT_HUB[sport]} style={{ color: "var(--vault-gold-bright)" }}>{SPORT_NAME[sport]} hub</Link>
      </p>
    </ResearchShell>
  );
}
