/**
 * /matchups/[sport]/[gameId] — MATCHUP EXPLORER (v1.4). PUBLIC.
 *
 * One page per game in the bounded compare registry (MLB/NFL scheduled windows), keyed by the EXACT canonical game id.
 * It keeps three owners apart on the page:
 *
 *   FACTUAL HISTORY   the two teams entering this game + recorded meetings (compare projection, lib/compare/matchup.mjs)
 *   CURRENT SCHEDULE  the scheduled instant; scheduled vs started is decided on the reader's clock (MatchupStatus)
 *   CURRENT FORECAST  a link to the forecast owner's report, joined by exact id (matchup-forecast.ts) — no value copied
 *
 * The route is durable: the builder refuses to drop a published game, so the URL keeps working after game day, when a
 * recorded final appears in its own Result section. No Live or provider request is made from this page.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import MatchupStatus from "@/components/compare/matchup-status";
import { HeadToHeadBlock } from "@/components/compare/team-compare-app";
import TeamLogo from "@/components/team-logo";
import { EntityLink, Eyebrow, MONO, PANEL, ResearchShell, ResultBadge, Section, StatTile } from "@/components/research-pages/research-primitives";
import { MATCHUP_SPORTS, comparePath, matchupPath } from "@/lib/compare/contract.mjs";
import { SPORT_NAME, seasonLabel } from "@/lib/compare/copy.mjs";
import { compareTeams, matchupEntries, matchupEntry } from "@/lib/compare/compare-store";
import { buildMatchup } from "@/lib/compare/matchup.mjs";
import { matchupForecast } from "@/lib/compare/matchup-forecast";
import { coverageNoteText } from "@/lib/research-pages/coverage.mjs";
import { formatGameDate, formatKickoff, formatRecord } from "@/lib/research-pages/format.mjs";
import { gameHrefs } from "@/lib/research-pages/game-links";
import { teamLabels } from "@/lib/research-pages/projection-store";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const dynamicParams = false;
type Sport = "MLB" | "NFL";

export function generateStaticParams() {
  return (MATCHUP_SPORTS as Sport[]).flatMap((s) => matchupEntries(s).map((e) => ({ sport: s.toLowerCase(), gameId: e.gameId })));
}

function load(params: { sport: string; gameId: string }) {
  const sport = (MATCHUP_SPORTS as string[]).find((s) => s.toLowerCase() === params.sport) as Sport | undefined;
  if (!sport) return null;
  const entry = matchupEntry(sport, params.gameId);
  if (!entry) return null;
  const teams = compareTeams(sport);
  const home = teams.get(entry.homeTeamId);
  const away = teams.get(entry.awayTeamId);
  if (!home || !away) return null;
  return { sport, entry, m: buildMatchup({ entry, home, away }) };
}

const joiner = (neutral: boolean) => (neutral ? "vs" : "at");

export function generateMetadata({ params }: { params: { sport: string; gameId: string } }): Metadata {
  const x = load(params);
  if (!x) return { title: "Matchup research · GameTimePicks" };
  const { sport, entry, m } = x;
  const title = `${m.away.name} ${joiner(m.neutralSite)} ${m.home.name} matchup history and team stats | GameTimePicks`;
  const description = `${m.away.name} ${joiner(m.neutralSite)} ${m.home.name}, ${formatGameDate(m.startUtc)}: each team's recorded results entering the game and their recorded meetings in ${SPORT_NAME[sport]} data.`;
  return withRouteMetadata(matchupPath(sport, entry.gameId), { title, description, ...(entry.indexable ? {} : { robots: { index: false, follow: true } }) });
}

export default function MatchupPage({ params }: { params: { sport: string; gameId: string } }) {
  const x = load(params);
  if (!x) notFound();
  const { sport, entry } = x;
  const m: any = x.m;
  const labels = teamLabels(sport);
  const unit = sport === "MLB" ? "Runs" : "Points";
  const forecast = matchupForecast(sport, entry.gameId);
  const recentIds = [...m.away.recent.games, ...m.home.recent.games].map((g: any) => [g.gameId, g.date] as [string, string | null]);
  const links = gameHrefs(sport, [[entry.gameId, entry.startUtc], ...m.headToHead.meetings.map((g: any) => [g.gameId, g.date] as [string, string | null]), ...recentIds]);
  const ownGameHref = links[entry.gameId] ?? null;
  const liveHref = sport === "MLB" ? "/live/" : ownGameHref;
  const logoSport = sport === "MLB" ? "mlb" : "nfl";
  const notes = [...new Set([...m.away.coverage.notes, ...m.home.coverage.notes])];

  const sideBlock = (side: any, role: string) => (
    <div style={{ ...PANEL, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {side.abbreviation ? <TeamLogo team={side.abbreviation} sport={logoSport} size="md" /> : null}
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{role}</p>
          <p style={{ margin: "2px 0 0", fontWeight: 750, fontSize: 16, overflowWrap: "anywhere" }}><EntityLink href={side.path}>{side.name}</EntityLink></p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 10 }}>
        <StatTile label={`${seasonLabel(entry.seasonId)} before this game`} value={side.seasonToDate.finals ? formatRecord(side.seasonToDate) : "No finals"} detail={`${side.seasonToDate.finals} recorded final${side.seasonToDate.finals === 1 ? "" : "s"}`} />
        <StatTile label={`${unit} per final`} value={side.seasonToDate.finals ? `${side.seasonToDate.scoredPerFinal}–${side.seasonToDate.allowedPerFinal}` : "—"} detail={side.seasonToDate.finals ? `scored–allowed, n=${side.seasonToDate.finals}` : "no recorded final this season yet"} />
        {side.priorSeason ? <StatTile label={`${seasonLabel(side.priorSeason.seasonId)} season`} value={formatRecord(side.priorSeason)} detail={`${side.priorSeason.finals} recorded finals · ${side.priorSeason.scoredPerFinal}–${side.priorSeason.allowedPerFinal} per final`} /> : null}
      </div>
      <p style={{ margin: "12px 0 4px", fontFamily: MONO, fontSize: 10.5, color: "var(--vault-text-mute)" }}>
        {side.recent.n < side.recent.size ? `The ${side.recent.n} recorded finals available` : `Last ${side.recent.n} recorded finals`} before this game · {side.recent.w}–{side.recent.l}{side.recent.t ? `–${side.recent.t}` : ""}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {side.recent.games.map((g: any) => (
          <li key={g.gameId} style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", alignItems: "center", fontSize: 13 }}>
            <ResultBadge code={g.result} />
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{g.own}–{g.opp}</span>
            <span style={{ color: "var(--vault-text-mute)" }}>{g.ha === "A" ? "@" : "vs"} {g.opponentId ? labels[g.opponentId]?.name ?? "Opponent not recorded" : "Opponent not recorded"}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>{formatGameDate(g.date)}</span>
            {links[g.gameId] ? <Link href={links[g.gameId]} style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-gold-bright)" }}>Game →</Link> : null}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <ResearchShell back={{ href: sport === "MLB" ? "/mlb/" : "/nfl/", label: `${SPORT_NAME[sport]} hub` }}>
      <Eyebrow>{SPORT_NAME[sport]} · Matchup research</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0", overflowWrap: "anywhere" }}>
        {m.away.name} {joiner(m.neutralSite)} {m.home.name}
      </h1>
      <p style={{ margin: "4px 0 10px", fontFamily: MONO, fontSize: 11.5, color: "var(--vault-text-mute)" }}>
        {formatKickoff(m.startUtc)} · {seasonLabel(entry.seasonId)} season{m.neutralSite ? " · neutral site" : ""}
      </p>

      <section aria-labelledby="matchup-game" style={{ ...PANEL }}>
        <h2 id="matchup-game" style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>{m.final ? "Result" : "Schedule"}</h2>
        {m.final ? (
          <p data-matchup-status="final" style={{ margin: 0, fontSize: 14 }}>
            Final (official score): {m.away.name} <strong style={{ fontVariantNumeric: "tabular-nums" }}>{m.final.away}</strong> · {m.home.name} <strong style={{ fontVariantNumeric: "tabular-nums" }}>{m.final.home}</strong>
          </p>
        ) : (
          <MatchupStatus startUtc={m.startUtc} liveHref={liveHref} liveLabel={sport === "MLB" ? "Check live scores" : "Open the game page"} />
        )}
        {ownGameHref ? <p style={{ margin: "6px 0 0", fontSize: 13 }}><Link href={ownGameHref} style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Game page →</Link></p> : null}
      </section>

      <aside aria-label="Data coverage" style={{ ...PANEL, marginTop: 14, borderStyle: "dashed" }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-gold-bright)" }}>Data coverage</p>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
          Team numbers below count only games with an official final score for both teams, played before this game&apos;s scheduled start. They are history, not a prediction.
        </p>
        {notes.length ? <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>{notes.map((n) => <li key={n}>{coverageNoteText(n, m.home.coverage)}</li>)}</ul> : null}
      </aside>

      <Section id="matchup-teams" title="The teams entering this game" sub="Each team's own recorded finals. The two recent lists are not the same dates.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {sideBlock(m.away, m.neutralSite ? "Team" : "Away")}
          {sideBlock(m.home, m.neutralSite ? "Team" : "Home")}
        </div>
      </Section>

      <Section id="matchup-h2h" title="Recorded meetings before this game" sub={m.headToHead.recordedFrom ? `Official finals between these teams, seasons ${seasonLabel(m.headToHead.recordedFrom)}–${seasonLabel(m.headToHead.recordedTo)} in GameTimePicks data (most recent 10 listed). Not an all-time series.` : undefined}>
        <HeadToHeadBlock h={m.headToHead} aName={m.away.name} bName={m.home.name} gameHrefs={links} />
      </Section>

      {forecast ? (
        <section aria-labelledby="matchup-forecast" style={{ ...PANEL, marginTop: 22, borderColor: "var(--vault-gold)", borderWidth: 1 }}>
          <Eyebrow>Current GameTime forecast</Eyebrow>
          <h2 id="matchup-forecast" style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 750 }}>Model output, not historical fact</h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
            GameTimePicks published a forecast for this game. It lives in the game report with its own reasoning, risk and status; nothing on this page changes it.
          </p>
          <p style={{ margin: "8px 0 0" }}><Link href={forecast.href} style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", minHeight: 44, display: "inline-flex", alignItems: "center", fontSize: 14 }}>{forecast.label} →</Link></p>
          {forecast.players.length ? (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.7 }}>
              Players with a published range in that report: {forecast.players.map((p, i) => <span key={p.id}>{i ? " · " : ""}<EntityLink href={p.researchHref}>{p.name}</EntityLink></span>)}
            </p>
          ) : null}
        </section>
      ) : null}

      <Section id="matchup-more" title="More research">
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 13.5 }}>
          <li style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}><EntityLink href={comparePath("team", sport, { a: m.away.slug, b: m.home.slug })}>Compare these teams by season</EntityLink></li>
          <li style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}><EntityLink href={m.away.path}>{m.away.name} research</EntityLink></li>
          <li style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}><EntityLink href={m.home.path}>{m.home.name} research</EntityLink></li>
        </ul>
      </Section>
    </ResearchShell>
  );
}
