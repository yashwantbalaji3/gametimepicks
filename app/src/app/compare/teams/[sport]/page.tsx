/**
 * /compare/teams/[sport] — TEAM COMPARE SHELL (v1.4). PUBLIC.
 *
 * One static shell per sport; the pair lives in the URL query and is composed in the browser from static assets
 * (no page per pair — 435 MLB + 496 NFL pairs are never pre-rendered). Canonical is the shell path, so every query
 * state shares one canonical URL and no pair order creates a duplicate page.
 *
 * EPL is generated ONLY to say why it is blocked (no id-keyed final scores): no record, no score, no meeting, and a
 * link to each club's research page. noindex. UFC has no teams and no route (404).
 */
import type { Metadata } from "next";
import { Suspense } from "react";

import TeamCompareApp from "@/components/compare/team-compare-app";
import { EntityLink, Eyebrow, PANEL, ResearchShell, Section } from "@/components/research-pages/research-primitives";
import { BLOCKER, TEAM_COMPARE_BLOCKED_SPORTS, TEAM_COMPARE_SPORTS, comparePath } from "@/lib/compare/contract.mjs";
import { SPORT_NAME, blockerText } from "@/lib/compare/copy.mjs";
import { researchIndex } from "@/lib/research-pages/projection-store";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const dynamicParams = false;
const SPORTS = [...TEAM_COMPARE_SPORTS, ...TEAM_COMPARE_BLOCKED_SPORTS] as Array<"MLB" | "NFL" | "EPL">;

export function generateStaticParams() {
  return SPORTS.map((s) => ({ sport: s.toLowerCase() }));
}

const sportOf = (seg: string) => SPORTS.find((s) => s.toLowerCase() === seg) ?? null;

export function generateMetadata({ params }: { params: { sport: string } }): Metadata {
  const sport = sportOf(params.sport);
  if (!sport) return { title: "Compare teams · GameTimePicks" };
  const blocked = TEAM_COMPARE_BLOCKED_SPORTS.includes(sport);
  return withRouteMetadata(comparePath("team", sport), {
    title: blocked ? `${SPORT_NAME[sport]} team comparison | GameTimePicks` : `Compare ${SPORT_NAME[sport]} teams: records, results and meetings | GameTimePicks`,
    description: blocked
      ? `${SPORT_NAME[sport]} team comparison is not available because final results are not yet an ID-based fact in GameTimePicks data.`
      : `Compare two ${SPORT_NAME[sport]} teams side by side: season records and ${sport === "MLB" ? "runs" : "points"} from official final scores, recent finals and recorded meetings, with sample sizes.`,
    ...(blocked ? { robots: { index: false, follow: true } } : {}),
  });
}

export default function TeamCompareShell({ params }: { params: { sport: string } }) {
  const sport = sportOf(params.sport)!;
  const blocked = TEAM_COMPARE_BLOCKED_SPORTS.includes(sport);
  return (
    <ResearchShell back={{ href: "/compare/", label: "Compare" }}>
      <Eyebrow>{SPORT_NAME[sport]} · Team Compare</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>Compare {SPORT_NAME[sport]} teams</h1>
      {blocked ? (
        <>
          <div role="status" style={{ ...PANEL, marginTop: 14, borderStyle: "dashed" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Team comparison is not available for the {SPORT_NAME[sport]}</p>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>{blockerText(BLOCKER.TEAM_RESULTS_UNSUPPORTED, { kind: "team", sportName: SPORT_NAME[sport] })}</p>
          </div>
          <Section id="club-research" title="Club research" sub="Each club's fixtures and player research pages.">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
              {researchIndex().filter((e) => e.kind === "team" && e.sport === sport).map((e) => (
                <li key={e.id} style={{ fontSize: 13.5, minHeight: 32, display: "inline-flex", alignItems: "center" }}><EntityLink href={e.path}>{e.label}</EntityLink></li>
              ))}
            </ul>
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>Premier League players can be compared on recorded match stats: <EntityLink href={comparePath("player", sport)}>Compare Premier League players</EntityLink>.</p>
          </Section>
        </>
      ) : (
        <>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 700, lineHeight: 1.6 }}>
            Two teams, one shared season, facts only: records and {sport === "MLB" ? "runs" : "points"} from official final scores, each team&apos;s latest finals and their recorded meetings. There is no overall score and no pick.
          </p>
          <Suspense fallback={null}>
            <TeamCompareApp sport={sport as "MLB" | "NFL"} sportName={SPORT_NAME[sport]} />
          </Suspense>
        </>
      )}
    </ResearchShell>
  );
}
