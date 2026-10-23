/**
 * /players/[sport] — PLAYER / FIGHTER INDEX (gap 6, 2026-10-23). PUBLIC.
 *
 * /players/nfl/ returned 404 while every /players/nfl/<slug>/ page existed (reachable only from Compare, team pages
 * and game links). This lists every player page of one sport from the research projection index — the registry the
 * detail pages are generated from — with a name search and a team filter. Recorded facts only: no forecast, no pick.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow, ResearchShell } from "@/components/research-pages/research-primitives";
import { SPORT_SEGMENTS, type ResearchSport } from "@/lib/research-pages/projection-store";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

import EntityDirectory from "../_directory/entity-directory";
import { SPORT_HUB, SPORT_NAME, countOf, playerRows, sportsWith } from "../_directory/rows";

export const dynamicParams = false;

export function generateStaticParams() {
  return sportsWith("player").map((s) => ({ sport: s.toLowerCase() }));
}

const noun = (s: ResearchSport) => (s === "UFC" ? "fighters" : "players");

export function generateMetadata({ params }: { params: { sport: string } }): Metadata {
  const sport = SPORT_SEGMENTS[params.sport];
  if (!sport) return { title: "Players · GameTimePicks" };
  return withRouteMetadata(`/players/${params.sport}/`, {
    title: `${SPORT_NAME[sport]} ${noun(sport)}: game logs and recorded stats | GameTimePicks`,
    description: `Every ${SPORT_NAME[sport]} ${sport === "UFC" ? "fighter" : "player"} with a GameTimePicks research page (${countOf("player", sport).toLocaleString("en-US")}), searchable by name${sport === "UFC" ? "" : " and team"}. Each page shows recorded games only.`,
  });
}

export default function PlayerIndexPage({ params }: { params: { sport: string } }) {
  const sport = SPORT_SEGMENTS[params.sport];
  if (!sport || !sportsWith("player").includes(sport)) notFound();
  const rows = playerRows(sport);
  const others = sportsWith("player").filter((s) => s !== sport);
  return (
    <ResearchShell back={{ href: "/players/", label: "All players" }}>
      <Eyebrow>{SPORT_NAME[sport]} · Player research</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>{SPORT_NAME[sport]} {noun(sport)}</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 680, lineHeight: 1.6 }}>
        Every {SPORT_NAME[sport]} {sport === "UFC" ? "fighter" : "player"} with a research page: recorded games, recent form and, where one exists, how our published forecasts compared with what happened.
        {sport === "MLB" ? " MLB pages cover the stat categories GameTimePicks captured, not a full box-score history." : null}
        {" "}A {sport === "UFC" ? "fighter" : "player"} without a page has too few recorded {sport === "UFC" ? "bouts" : "games"}, not zero.
      </p>
      <EntityDirectory base={`/players/${params.sport}/`} rows={rows} noun={noun(sport)} groupLabel={sport === "UFC" ? null : "Team"} />
      <p style={{ marginTop: 22, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
        {sport !== "UFC" ? <><Link href={`/teams/${params.sport}/`} style={{ color: "var(--vault-gold-bright)" }}>{SPORT_NAME[sport]} teams</Link> · </> : null}
        {others.map((s) => (
          <span key={s}><Link href={`/players/${s.toLowerCase()}/`} style={{ color: "var(--vault-gold-bright)" }}>{SPORT_NAME[s]} {noun(s)}</Link> · </span>
        ))}
        <Link href={SPORT_HUB[sport]} style={{ color: "var(--vault-gold-bright)" }}>{SPORT_NAME[sport]} hub</Link>
      </p>
    </ResearchShell>
  );
}
