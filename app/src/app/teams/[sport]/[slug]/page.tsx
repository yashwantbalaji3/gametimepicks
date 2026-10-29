/**
 * /teams/[sport]/[slug] — TEAM RESEARCH (v1.3). PUBLIC.
 *
 * Reads ONE team's record from the committed research projection (never the Data Platform store). The slug is
 * presentation: generateStaticParams enumerates the projection registry and dynamicParams is false, so an unknown
 * slug is a 404 and nothing is ever looked up by name.
 *
 * Sport-aware by construction: MLB shows runs, NFL points, and EPL shows fixtures — the research platform has no id-keyed
 * final scores for EPL (§31). Batch 1 · #8: an EPL club page now also lists its CURRENT-SEASON results, joined by event id
 * from the graded ledger the /epl hub reads (lib/sports/epl/team-results.mjs); earlier seasons stay fixtures only. Upcoming games are decided on the reader's clock; this page makes
 * no Live request — each game link carries its own report.
 *
 * Research home PR (2026-10-05): the one forecast this page shows is the team's OWN Forecast Record rows — ledger rows
 * whose canonical subject id IS this team's id (today: NFL team score, 32/32 teams). Read through the same section and
 * the same ledger reader as the player pages; no game-level row is attributed to a team (those rows carry no team id),
 * and the section renders nothing for a team the ledger holds no row for.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CompareCta from "@/components/compare/compare-cta";
import { labHref } from "@/lib/lab/lab-store";
import FollowToggle from "@/components/follow/follow-toggle";
import ForecastHistorySection from "@/components/research-pages/forecast-history-section";
import TeamLogo from "@/components/team-logo";
import TeamMark from "@/components/ui/team-mark";
import { eplCrestUrl } from "@/lib/entity/identity-urls";
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
import { loadEplGradedRecord } from "@/lib/sports/epl/graded-record";
import { eplTeamResults } from "@/lib/sports/epl/team-results.mjs";
import { eplTeamCoverageWithResults } from "@/lib/research-pages/coverage.mjs";

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

/** An EPL club's recorded results from the /epl hub's graded ledger, joined by event id; null for other sports. */
function eplResultsFor(t: NonNullable<ReturnType<typeof load>>) {
  if (t.sport !== "EPL") return null;
  return eplTeamResults({ teamName: t.name, games: t.games, ledger: loadEplGradedRecord()?.team.matchesList ?? [] });
}

export function generateMetadata({ params }: { params: { sport: string; slug: string } }): Metadata {
  const t = load(params);
  if (!t) return { title: "Team research · GameTimePicks" };
  const route = `/teams/${params.sport}/${t.slug}/`;
  const eplPlayed = eplResultsFor(t)?.record.played ?? 0;
  if (eplPlayed > 0) {
    return withRouteMetadata(route, {
      title: `${t.name} results, fixtures and squad | GameTimePicks`,
      description: `${t.name} Premier League ${t.seasons[0]?.label ?? "current-season"} results from official full-time scores, upcoming fixtures and player research.`,
      ...(t.indexable ? {} : { robots: { index: false, follow: true } }),
    });
  }
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
  /* Batch 1 · #8: an EPL club's current-season results (newest first) and the coverage that says so. */
  const eplResults = eplResultsFor(t);
  const eplRows = eplResults?.rows ?? [];
  const eplPlayedIds = new Set(eplRows.map((r) => r.eventId));
  const coverage = sport === "EPL" ? eplTeamCoverageWithResults(t.coverage, eplRows.length) : t.coverage;
  const seasonLabelOf = (id: string) => t.seasons.find((x) => x.id === id)?.label ?? null;
  const eplSeasonLabels = [...new Set(eplRows.map((r) => seasonLabelOf(r.seasonId)).filter(Boolean))];

  const upcoming: UpcomingItem[] = t.games
    .filter((g) => g[5] === "S" && g[1] && /T\d{2}:/.test(g[1]) && !eplPlayedIds.has(g[0]))
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
        {/* GTP-18: the club crest by its exact ESPN team id (epl-team-<id>); initials if it fails to load. */}
        {sport === "EPL" && eplCrestUrl(t.id) ? <TeamMark name={t.name} logoUrl={eplCrestUrl(t.id)} size="lg" /> : null}
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

      <CoverageStrip coverage={coverage} period={period} />

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
                  <span className="gtp-hit-44-links" style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

      {eplResults && eplRows.length ? (
        <Section
          id="results"
          title={eplSeasonLabels.length === 1 ? `${eplSeasonLabels[0]} results` : "Recorded results"}
          sub={`${eplResults.record.played} played · ${eplResults.record.w} won, ${eplResults.record.d} drawn, ${eplResults.record.l} lost · ${eplResults.record.scored} scored, ${eplResults.record.conceded} conceded. Official full-time scores from the graded Premier League record, newest first.`}
        >
          <ul data-epl-team-results="" style={{ ...PANEL, listStyle: "none", margin: 0, display: "grid", gap: 6 }}>
            {eplRows.map((r) => (
              <li key={r.eventId} data-result-id={r.eventId} style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center", justifyContent: "space-between" }}>
                <span className="gtp-hit-44-links" style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                  <ResultBadge code={r.result} />
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{r.own}–{r.opp}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>{r.ha === "A" ? "away @" : "home vs"}</span>
                  <EntityLink href={r.opponentId ? teamHrefs[r.opponentId] : null}>{r.opponentId ? labels[r.opponentId]?.name ?? "Opponent not recorded" : "Opponent not recorded"}</EntityLink>
                </span>
                <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--vault-text-mute)" }}>{formatGameDate(r.kickoffUtc)}</span>
                  {links[r.eventId] ? <Link href={links[r.eventId]} style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-gold-bright)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Match report →</Link> : null}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>W won · D drawn · L lost, from this club&rsquo;s side of the full-time score.</p>
        </Section>
      ) : null}

      {/* The team's own published forecasts from the Forecast Record (subject id = this team's id). */}
      <ForecastHistorySection subjectId={t.id} name={t.name} />

      <Section id="upcoming" title={sport === "EPL" ? "Upcoming fixtures" : "Upcoming games"} sub="From the committed schedule. Times are US Eastern.">
        <UpcomingList items={upcoming} emptyText={`No upcoming ${sport === "EPL" ? "fixtures" : "games"} in the committed schedule.`} />
      </Section>

      <Section id="season-log" title={t.supportsResults ? "Season results" : "Fixture history"} sub={t.supportsResults ? "Every game GameTime records for the season, newest first." : eplRows.length ? "Fixtures by season. Current-season final scores are listed under results above; earlier seasons show fixtures only." : "Fixtures by season. Final scores are not shown because they are not yet an ID-based fact in GameTime data."}>
        <TeamSeasonLog teamName={t.name} seasons={t.seasons} defaultSeason={t.defaultSeason} games={t.games} labels={labels} teamHrefs={teamHrefs} gameHrefs={links} supportsResults={t.supportsResults} />
      </Section>

      {squad.length ? (
        <Section id="players" title="Player research" sub={`Players with a GameTime research page ${squadLabel}.`}>
          <ul className="gtp-hit-44-links" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
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
