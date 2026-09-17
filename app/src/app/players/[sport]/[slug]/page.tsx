/**
 * /players/[sport]/[slug] — PLAYER / FIGHTER RESEARCH (v1.3). PUBLIC.
 *
 * Order on the page (§51): header → data coverage (moved up: the period and the gaps frame every number below) →
 * current published forecast (ONLY when an exact-id published forecast exists) → recorded snapshot →
 * Last 3 / 5 / 10 → chart → game log.
 *
 * Facts come from ONE record of the committed research projection. The forecast section is composed separately
 * from the forecast owner's own artifact (lib/research-pages/forecast-join) and is visually distinct; it never feeds a
 * factual number and a factual number never feeds it. No Live request, no provider call.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CompareCta from "@/components/compare/compare-cta";
import { labHref } from "@/lib/lab/lab-store";
import FollowToggle from "@/components/follow/follow-toggle";
import PlayerResearchView from "@/components/research-pages/player-research-view";
import { CoverageStrip, EntityLink, Eyebrow, MONO, PANEL, ResearchShell, ResultBadge, Section, StatTile } from "@/components/research-pages/research-primitives";
import UpcomingList, { type UpcomingItem } from "@/components/research-pages/upcoming-list";
import { normalizeRef } from "@/lib/follow/follow-schema.mjs";
import type { FollowRef } from "@/lib/follow/follow-store";
import { nflPlayerForecasts, ufcFighterForecast } from "@/lib/research-pages/forecast-join";
import { boutOutcomeLabel, formatFightRecord, formatGameDate, formatKickoff } from "@/lib/research-pages/format.mjs";
import { gameHrefs } from "@/lib/research-pages/game-links";
import { comparePath } from "@/lib/compare/contract.mjs";
import { playerHasComparablePeer } from "@/lib/compare/compare-store";
import { SPORT_SEGMENTS, hrefsFor, playerBySlug, staticParams, teamLabels, type PlayerProjection, type ResearchSport } from "@/lib/research-pages/projection-store";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return staticParams("player");
}

const SPORT_NAME: Record<ResearchSport, string> = { MLB: "MLB", NFL: "NFL", EPL: "Premier League", UFC: "UFC" };
const SPORT_HUB: Record<ResearchSport, string> = { MLB: "/mlb/", NFL: "/nfl/", EPL: "/epl/", UFC: "/ufc/" };

function load(params: { sport: string; slug: string }): PlayerProjection | null {
  const sport = SPORT_SEGMENTS[params.sport];
  return sport ? playerBySlug(sport, params.slug) : null;
}

const periodOf = (p: PlayerProjection) => (p.coverage.from && p.coverage.to ? (p.coverage.from === p.coverage.to ? `${p.coverage.from}` : `${p.coverage.from} to ${p.coverage.to}`) : null);

export function generateMetadata({ params }: { params: { sport: string; slug: string } }): Metadata {
  const p = load(params);
  if (!p) return { title: "Player research · GameTimePicks" };
  const route = `/players/${params.sport}/${p.slug}/`;
  const period = periodOf(p);
  const title = p.sport === "UFC" ? `${p.name} fight history | GameTimePicks` : `${p.name} game log and stats | GameTimePicks`;
  const description = p.sport === "UFC"
    ? `${p.name} recorded UFC bouts${period ? ` (${period})` : ""}: opponents and outcomes from GameTime's canonical data. Method and round are not included.`
    : p.sport === "MLB"
      ? `${p.name} MLB game log for the stat categories GameTimePicks captured${period ? ` in ${period}` : ""}. Not a complete box-score history.`
      : `${p.name} ${SPORT_NAME[p.sport]} game log, last 3/5/10 recorded games and season totals${period ? ` for ${period}` : ""}.`;
  return withRouteMetadata(route, { title, description, ...(p.indexable ? {} : { robots: { index: false, follow: true } }) });
}

export default function PlayerResearchPage({ params }: { params: { sport: string; slug: string } }) {
  const p = load(params);
  if (!p) notFound();
  const sport = p.sport;
  const period = periodOf(p);
  const followRef: FollowRef | null = sport === "NFL" ? (normalizeRef({ sport: "NFL", entityType: "player", id: p.id, label: p.name }) as FollowRef | null) : null;

  if (sport === "UFC") return <FighterPage p={p} period={period} />;

  const labels = teamLabels(sport);
  const teamIds = new Set<string>();
  for (const r of p.gameLog) { if (r[3]) teamIds.add(r[3] as string); if (r[4]) teamIds.add(r[4] as string); }
  if (p.currentTeamId) teamIds.add(p.currentTeamId);
  const teamHrefs = hrefsFor(teamIds);
  const usedLabels = Object.fromEntries([...teamIds].filter((id) => labels[id]).map((id) => [id, labels[id]]));
  const links = gameHrefs(sport, p.gameLog.map((r) => [r[0] as string, r[1] as string | null]));
  const forecasts = sport === "NFL" ? nflPlayerForecasts(p.id) : [];
  const latest = p.seasons[0];
  const primary = p.groups[0];
  const currentTeam = p.currentTeamId ? labels[p.currentTeamId] : null;

  return (
    <ResearchShell back={{ href: SPORT_HUB[sport], label: `${SPORT_NAME[sport]} hub` }}>
      <header style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <Eyebrow>{SPORT_NAME[sport]} · Player research</Eyebrow>
          <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0", overflowWrap: "anywhere" }}>{p.name}</h1>
          <p className="font-mono" style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--vault-text-mute)" }}>
            {currentTeam ? <>Current roster: <EntityLink href={p.currentTeamId ? teamHrefs[p.currentTeamId] : null}>{currentTeam.name}</EntityLink> · </> : null}
            {p.seasons.length} recorded season{p.seasons.length === 1 ? "" : "s"}{period ? ` (${period})` : ""}
          </p>
        </div>
        {followRef ? <FollowToggle entity={followRef} variant="labeled" /> : null}
        {playerHasComparablePeer(sport, p.id) ? <CompareCta href={comparePath("player", sport, { a: p.slug })}>Compare player</CompareCta> : null}
        {/* v1.5 · only for a player the Lab carries recorded stat rows for (a UFC fighter never does). */}
        {labHref("players", sport, p.id) ? <CompareCta href={labHref("players", sport, p.id)!}>Filter game stats</CompareCta> : null}
      </header>

      <CoverageStrip coverage={p.coverage} period={period ? `Recorded history: ${period}` : null} />

      {forecasts.length ? (
        <section aria-labelledby="current-forecast" style={{ ...PANEL, marginTop: 16, borderColor: "var(--vault-gold)", borderWidth: 1 }}>
          <Eyebrow>Current GameTime forecast · model output, not history</Eyebrow>
          <h2 id="current-forecast" style={{ margin: "6px 0 4px", fontSize: 17, fontWeight: 750 }}>Published pregame ranges</h2>
          {forecasts.map((f) => (
            <div key={`${f.playerId}-${f.matchup}`} style={{ marginTop: 8 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--vault-text-mute)" }}>
                {f.matchup} · {formatKickoff(f.kickoffUtc)} · Model status: published families only
              </p>
              <dl style={{ margin: "6px 0 0", display: "grid", gap: 4 }}>
                {f.markets.map((m) => (
                  <div key={m.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                    <dt style={{ color: "var(--vault-text-mute)" }}>{m.label}</dt>
                    <dd style={{ margin: 0, fontFamily: MONO }}>{m.median} <span style={{ color: "var(--vault-text-faint)" }}>(range {m.p10}–{m.p90})</span></dd>
                  </div>
                ))}
              </dl>
              {f.href ? <Link href={f.href} style={{ display: "inline-flex", minHeight: 44, alignItems: "center", fontFamily: MONO, fontSize: 11.5, color: "var(--vault-gold-bright)" }}>Why and risk: open the game forecast →</Link> : null}
            </div>
          ))}
        </section>
      ) : null}

      {latest ? (
        <Section id="snapshot" title={`${latest.label} recorded snapshot`} sub="Totals over the games GameTime recorded that season, not a complete season line.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <StatTile label={sport === "EPL" ? "Appearances" : "Recorded games"} value={latest.games} />
            {(primary?.columns ?? []).slice(0, 3).map((k) => {
              const col = p.columns.find((c) => c.key === k)!;
              const tot = latest.totals[k];
              return tot ? <StatTile key={k} label={col.label} value={tot.sum} detail={`over ${tot.n} recorded game${tot.n === 1 ? "" : "s"}`} /> : null;
            })}
          </div>
        </Section>
      ) : null}

      <Section id="research" title="Recent form and game log" sub="Factual lines only, newest first. Team and opponent are the ones for that game.">
        {p.groups.length ? (
          <PlayerResearchView
            player={{ sport, name: p.name, columns: p.columns, groups: p.groups, windows: p.windows, seasons: p.seasons, defaultSeason: p.defaultSeason, gameLog: p.gameLog }}
            labels={usedLabels}
            teamHrefs={teamHrefs}
            gameHrefs={links}
          />
        ) : <p style={{ fontSize: 13, color: "var(--vault-text-mute)" }}>No stat category has a recorded non-zero value for this player yet.</p>}
      </Section>

    </ResearchShell>
  );
}

function FighterPage({ p, period }: { p: PlayerProjection; period: string | null }) {
  const opponents = p.opponents ?? {};
  const cards = p.cards ?? {};
  const oppHrefs = hrefsFor(Object.keys(opponents));
  const links = gameHrefs("UFC", [...p.gameLog.map((r) => [r[0] as string, r[1] as string | null] as [string, string | null]), ...(p.upcoming ?? []).map((u) => [u.gameId, u.startUtc] as [string, string | null])]);
  const forecast = ufcFighterForecast(p.id);
  const upcoming: UpcomingItem[] = (p.upcoming ?? []).map((u) => ({
    id: u.gameId, startUtc: u.startUtc, prefix: "vs", opponentLabel: (u.opponentId && opponents[u.opponentId]) || "Opponent not announced",
    opponentHref: u.opponentId ? oppHrefs[u.opponentId] ?? null : null, context: u.cardId ? cards[u.cardId] ?? null : null,
    href: links[u.gameId] ?? null, linkLabel: "Bout",
  }));
  const record = formatFightRecord(p.record);
  const last5 = p.gameLog.slice(0, 5);
  const head: React.CSSProperties = { padding: "6px 9px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--vault-text-faint)", textAlign: "left", fontWeight: 600 };
  const cell: React.CSSProperties = { padding: "8px 9px", fontSize: 13, borderTop: "1px solid var(--vault-rule)" };

  return (
    <ResearchShell back={{ href: "/ufc/", label: "UFC hub" }}>
      <header>
        <Eyebrow color="var(--sport-ufc)">UFC · Fighter research</Eyebrow>
        <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0", overflowWrap: "anywhere" }}>{p.name}</h1>
        <p className="font-mono" style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--vault-text-mute)" }}>{p.gameLog.length} recorded bout{p.gameLog.length === 1 ? "" : "s"}{period ? ` · ${period}` : ""}</p>
      </header>

      <CoverageStrip coverage={p.coverage} period={period ? `Recorded history: ${period}` : null} />

      {forecast ? (
        <section aria-labelledby="current-forecast" style={{ ...PANEL, marginTop: 16, borderColor: "var(--vault-gold)" }}>
          <Eyebrow>Current GameTime forecast · model output, not history</Eyebrow>
          <h2 id="current-forecast" style={{ margin: "6px 0 4px", fontSize: 17, fontWeight: 750 }}>{forecast.matchup}</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--vault-text-mute)" }}>
            {forecast.eventName ? `${forecast.eventName} · ` : ""}{formatKickoff(forecast.startUtc)} · Win chance for {p.name}: <strong style={{ color: "var(--vault-text)" }}>{Math.round(forecast.winnerChance * 1000) / 10}%</strong> · Model status: winner head passed its preregistered evaluation
          </p>
          <Link href={forecast.href} style={{ display: "inline-flex", minHeight: 44, alignItems: "center", fontFamily: MONO, fontSize: 11.5, color: "var(--vault-gold-bright)" }}>Why and risk: open the bout forecast →</Link>
        </section>
      ) : null}

      <Section id="snapshot" title="Recorded outcomes" sub="Counted over the bouts GameTime records. A bout with no winner (draw or no contest) is never counted as a loss.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <StatTile label="Recorded record" value={record ?? "—"} detail={`${p.gameLog.length} recorded bout${p.gameLog.length === 1 ? "" : "s"}`} />
          <StatTile label="Last 5 recorded" value={<span style={{ display: "inline-flex", gap: 4 }}>{last5.map((r) => <ResultBadge key={String(r[0])} code={r[6] === "N" ? "D" : (r[6] as string)} />)}</span>} detail={`newest first · n=${last5.length}`} />
        </div>
      </Section>

      {upcoming.length ? (
        <Section id="upcoming" title="Upcoming bout" sub="From the committed fight schedule. Times are US Eastern.">
          <UpcomingList items={upcoming} max={2} emptyText="No upcoming bout in the committed schedule." />
        </Section>
      ) : null}

      <Section id="fight-history" title="Fight history" sub="Newest first. D marks a bout with no winner (draw or no contest).">
        <div data-scroll-x style={{ overflowX: "auto" }} role="region" aria-label={`${p.name} fight history`} tabIndex={0}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
            <caption className="sr-only">{p.name} recorded bouts, newest first</caption>
            <thead><tr><th scope="col" style={head}>Date</th><th scope="col" style={head}>Opponent</th><th scope="col" style={head}>Outcome</th><th scope="col" style={head}>Card</th></tr></thead>
            <tbody>
              {p.gameLog.map((r) => (
                <tr key={String(r[0])}>
                  <td style={{ ...cell, fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>{formatGameDate(r[1] as string | null)}</td>
                  <td style={cell}><EntityLink href={r[4] ? oppHrefs[r[4] as string] : null}>{(r[4] && opponents[r[4] as string]) || "Opponent not recorded"}</EntityLink></td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><ResultBadge code={r[6] === "N" ? "D" : (r[6] as string)} /> {boutOutcomeLabel(r[6] as string)}</span></td>
                  <td style={{ ...cell, fontSize: 12, color: "var(--vault-text-mute)" }}>{(r[10] && cards[r[10] as string]) || "—"}{links[r[0] as string] ? <> · <Link href={links[r[0] as string]} style={{ color: "var(--vault-gold-bright)" }}>Bout →</Link></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

    </ResearchShell>
  );
}
