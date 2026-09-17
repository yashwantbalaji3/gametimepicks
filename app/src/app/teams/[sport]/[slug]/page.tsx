/**
 * /teams/[sport]/[slug] — TEAM RESEARCH (v1.3). PUBLIC.
 *
 * Reads ONE team's record from the committed research projection (never the Data Platform store). The slug is
 * presentation: generateStaticParams enumerates the projection registry and dynamicParams is false, so an unknown
 * slug is a 404 and nothing is ever looked up by name.
 *
 * Sport-aware by construction: MLB shows runs, NFL points, and EPL shows fixtures WITHOUT any record, because its
 * platform has no id-keyed final scores (§31). Upcoming games are decided on the reader's clock; this page makes
 * no Live request and joins no forecast — each game link carries its own report.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CompareCta from "@/components/compare/compare-cta";
import { labHref } from "@/lib/lab/lab-store";
import FollowToggle from "@/components/follow/follow-toggle";
import TeamLogo from "@/components/team-logo";
import { CoverageStrip, EntityLink, Eyebrow, MONO, PANEL, ResearchShell, ResultBadge, Section, StatTile } from "@/components/research-pages/research-primitives";
import TeamSeasonLog from "@/components/research-pages/team-season-log";
import UpcomingList, { type UpcomingItem } from "@/components/research-pages/upcoming-list";
import { normalizeRef } from "@/lib/follow/follow-schema.mjs";
import type { FollowRef } from "@/lib/follow/follow-store";
import { comparePath } from "@/lib/compare/contract.mjs";
import { teamInCompare } from "@/lib/compare/compare-store";
import { formatGameDate, formatRecord, recentFormSentence } from "@/lib/research-pages/format.mjs";
import { gameHrefs } from "@/lib/research-pages/game-links";
import { SPORT_SEGMENTS, hrefsFor, playerBySlug, researchIndex, staticParams, teamBySlug, teamLabels, type ResearchSport } from "@/lib/research-pages/projection-store";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return staticParams("team");
}

const SPORT_NAME: Record<ResearchSport, string> = { MLB: "MLB", NFL: "NFL", EPL: "Premier League", UFC: "UFC" };
const SPORT_HUB: Record<ResearchSport, string> = { MLB: "/mlb/", NFL: "/nfl/", EPL: "/epl/", UFC: "/ufc/" };

function load(params: { sport: string; slug: string }) {
  const sport = SPORT_SEGMENTS[params.sport];
  return sport ? teamBySlug(sport, params.slug) : null;
}

export function generateMetadata({ params }: { params: { sport: string; slug: string } }): Metadata {
  const t = load(params);
  if (!t) return { title: "Team research · GameTimePicks" };
  const route = `/teams/${params.sport}/${t.slug}/`;
  const title = t.supportsResults ? `${t.name} results, recent games and schedule | GameTimePicks` : `${t.name} fixtures and squad | GameTimePicks`;
  const period = t.coverage.from && t.coverage.to ? `${t.coverage.from}–${t.coverage.to}` : "recorded seasons";
  const description = t.supportsResults
    ? `${t.name} (${SPORT_NAME[t.sport]}) season-by-season results, recent games and upcoming schedule from official final scores, ${period}.`
    : `${t.name} Premier League fixtures and player research. Final results are not yet part of GameTime data, so no record is shown.`;
  return withRouteMetadata(route, { title, description, ...(t.indexable ? {} : { robots: { index: false, follow: true } }) });
}

export default function TeamResearchPage({ params }: { params: { sport: string; slug: string } }) {
  const t = load(params);
  if (!t) notFound();
  const sport = t.sport;
  const labels = teamLabels(sport);
  const opponentIds = new Set(t.games.map((g) => g[4]));
  const teamHrefs = hrefsFor(opponentIds);
  const links = gameHrefs(sport, t.games.map((g) => [g[0], g[1]] as [string, string | null]));

  const followRef: FollowRef | null = sport === "MLB" || sport === "NFL" ? (normalizeRef({ sport, entityType: "team", id: t.id, label: t.name }) as FollowRef | null) : null;
  const current = t.seasons.find((s) => s.id === t.defaultSeason) ?? null;
  const recentFinals = t.games.filter((g) => g[8]).slice(0, 5);

  const upcoming: UpcomingItem[] = t.games
    .filter((g) => g[5] === "S" && g[1] && /T\d{2}:/.test(g[1]))
    .map((g) => ({
      id: g[0], startUtc: g[1] as string, prefix: g[3] === "H" ? "vs" : g[3] === "A" ? "@" : "vs",
      opponentLabel: g[4] ? labels[g[4]]?.name ?? "Opponent not recorded" : "Opponent not recorded",
      opponentHref: g[4] ? teamHrefs[g[4]] ?? null : null, context: null,
      href: links[g[0]] ?? null, linkLabel: sport === "EPL" ? "Match report" : "Game",
    }));

  // Players with research pages whose most recent recorded game was for this team.
  const squad = researchIndex()
    .filter((e) => e.kind === "player" && e.sport === sport)
    .map((e) => playerBySlug(sport, e.slug))
    .filter((p): p is NonNullable<typeof p> => !!p && (sport === "NFL" ? p.currentTeamId === t.id : p.gameLog[0]?.[3] === t.id))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1));
  const squadHrefs = hrefsFor(squad.map((p) => p.id));
  const squadLabel = sport === "NFL" ? "on the current roster" : sport === "EPL" ? "whose latest recorded match was for this club" : "whose latest captured game was for this club";

  const period = t.coverage.from && t.coverage.to ? (t.coverage.from === t.coverage.to ? `${t.coverage.from} season` : `${t.coverage.from} to ${t.coverage.to} seasons`) : null;
  const logoSport = sport === "MLB" ? "mlb" : sport === "NFL" ? "nfl" : null;

  return (
    <ResearchShell back={{ href: SPORT_HUB[sport], label: `${SPORT_NAME[sport]} hub` }}>
      <header style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {logoSport && t.abbreviation ? <TeamLogo team={t.abbreviation} sport={logoSport} size="lg" /> : null}
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <Eyebrow>{SPORT_NAME[sport]} · Team research</Eyebrow>
          <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0", overflowWrap: "anywhere" }}>{t.name}</h1>
          <p className="font-mono" style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--vault-text-mute)" }}>
            {t.abbreviation ? `${t.abbreviation} · ` : ""}{SPORT_NAME[sport]}{t.currentSeason ? ` · current season ${t.seasons[0].label}` : ""}
          </p>
        </div>
        {followRef ? <FollowToggle entity={followRef} variant="labeled" /> : null}
        {(sport === "MLB" || sport === "NFL") && teamInCompare(sport, t.id) ? <CompareCta href={comparePath("team", sport, { a: t.slug })}>Compare team</CompareCta> : null}
        {/* v1.5 · only when the Lab actually has recorded finals for this team; no season is pinned, so the link
            cannot go stale against a refreshed projection. */}
        {labHref("games", sport, t.id) ? <CompareCta href={labHref("games", sport, t.id)!}>Find games</CompareCta> : null}
      </header>

      <CoverageStrip coverage={t.coverage} period={period} />

      {t.supportsResults && current?.record ? (
        <Section id="snapshot" title={`${current.label} season snapshot`} sub="Derived only from games with an official final score recorded for both teams. Pending and postponed games are not counted.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <StatTile label="Record" value={formatRecord(current.record)} detail={`${current.record.finals} recorded final${current.record.finals === 1 ? "" : "s"}`} />
            <StatTile label={sport === "MLB" ? "Runs scored" : "Points scored"} value={current.record.scored} detail={`in ${current.record.finals} recorded finals`} />
            <StatTile label={sport === "MLB" ? "Runs allowed" : "Points allowed"} value={current.record.allowed} detail={`in ${current.record.finals} recorded finals`} />
          </div>
        </Section>
      ) : null}

      {t.supportsResults ? (
        <Section id="recent" title="Recent games" sub={recentFormSentence(t.recentForm, "The team")}>
          {recentFinals.length ? (
            <ul style={{ ...PANEL, listStyle: "none", margin: 0, display: "grid", gap: 6 }}>
              {recentFinals.map((g) => (
                <li key={g[0]} style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <ResultBadge code={g[8]} />
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{g[6]}–{g[7]}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>{g[3] === "A" ? "@" : "vs"}</span>
                    <EntityLink href={g[4] ? teamHrefs[g[4]] : null}>{g[4] ? labels[g[4]]?.name ?? "Opponent not recorded" : "Opponent not recorded"}</EntityLink>
                  </span>
                  <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--vault-text-mute)" }}>{formatGameDate(g[1])}</span>
                    {links[g[0]] ? <Link href={links[g[0]]} style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-gold-bright)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Game →</Link> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p style={{ fontSize: 13, color: "var(--vault-text-mute)" }}>No final with both scores is recorded yet.</p>}
        </Section>
      ) : null}

      <Section id="upcoming" title={sport === "EPL" ? "Upcoming fixtures" : "Upcoming games"} sub="From the committed schedule. Times are US Eastern.">
        <UpcomingList items={upcoming} emptyText={`No upcoming ${sport === "EPL" ? "fixtures" : "games"} in the committed schedule.`} />
      </Section>

      <Section id="season-log" title={t.supportsResults ? "Season results" : "Fixture history"} sub={t.supportsResults ? "Every game GameTime records for the season, newest first." : "Fixtures by season. Final scores are not shown because they are not yet an ID-based fact in GameTime data."}>
        <TeamSeasonLog teamName={t.name} seasons={t.seasons} defaultSeason={t.defaultSeason} games={t.games} labels={labels} teamHrefs={teamHrefs} gameHrefs={links} supportsResults={t.supportsResults} />
      </Section>

      {squad.length ? (
        <Section id="players" title="Player research" sub={`Players with a GameTime research page ${squadLabel}.`}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
            {squad.map((p) => (
              <li key={p.id} style={{ fontSize: 13.5, minHeight: 32, display: "inline-flex", alignItems: "center" }}>
                <EntityLink href={squadHrefs[p.id]}>{p.name}</EntityLink>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </ResearchShell>
  );
}
