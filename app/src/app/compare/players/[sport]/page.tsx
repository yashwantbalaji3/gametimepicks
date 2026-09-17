/**
 * /compare/players/[sport] — PLAYER COMPARE SHELL (v1.4). PUBLIC, indexable (the shell; every query state shares
 * its canonical). NFL, Premier League, MLB. The pair lives in the URL query and is composed in the browser from the
 * two players' static assets — no page per pair (750 NFL players would be 280,875 pages).
 *
 * UFC has no route: fighters carry outcome flags only, so no comparable stat family exists (404 by construction).
 */
import type { Metadata } from "next";
import { Suspense } from "react";

import PlayerCompareApp from "@/components/compare/player-compare-app";
import { Eyebrow, ResearchShell } from "@/components/research-pages/research-primitives";
import { PLAYER_COMPARE_SPORTS, comparePath } from "@/lib/compare/contract.mjs";
import { SPORT_NAME, familyCoverageText } from "@/lib/compare/copy.mjs";
import { STAT_FAMILIES } from "@/lib/compare/stat-families.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const dynamicParams = false;
type Sport = "NFL" | "EPL" | "MLB";

export function generateStaticParams() {
  return PLAYER_COMPARE_SPORTS.map((s) => ({ sport: s.toLowerCase() }));
}

const sportOf = (seg: string) => (PLAYER_COMPARE_SPORTS as readonly string[]).find((s) => s.toLowerCase() === seg) as Sport | undefined;

export function generateMetadata({ params }: { params: { sport: string } }): Metadata {
  const sport = sportOf(params.sport);
  if (!sport) return { title: "Compare players · GameTimePicks" };
  return withRouteMetadata(comparePath("player", sport), {
    title: `Compare ${SPORT_NAME[sport]} players: game logs side by side | GameTimePicks`,
    description: `Compare two ${SPORT_NAME[sport]} players on the same recorded stat: per-game averages with sample sizes, recent recorded games and coverage notes${sport === "MLB" ? " (captured categories only)" : ""}.`,
  });
}

export default function PlayerCompareShell({ params }: { params: { sport: string } }) {
  const sport = sportOf(params.sport)!;
  const labels = STAT_FAMILIES[sport].map((f) => f.label.toLowerCase());
  return (
    <ResearchShell back={{ href: "/compare/", label: "Compare" }}>
      <Eyebrow>{SPORT_NAME[sport]} · Player Compare</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>Compare {SPORT_NAME[sport]} players</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 700, lineHeight: 1.6 }}>
        Two players on one recorded stat they both have, such as {labels.slice(0, 3).join(", ")}. Every average shows how many games it uses, and a game where the stat was not recorded is left out rather than counted as zero. A comparison is not a forecast.
      </p>
      {sport === "MLB" ? <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", maxWidth: 700 }}>{familyCoverageText("MLB_CAPTURED_ONLY")}</p> : null}
      <Suspense fallback={null}>
        <PlayerCompareApp sport={sport} sportName={SPORT_NAME[sport]} />
      </Suspense>
    </ResearchShell>
  );
}
