/**
 * Build-time rows for the research index pages (gap 6) — SERVER ONLY.
 *
 * Every row is an entry of the research projection index, the registry `generateStaticParams` of the detail pages
 * reads, so the index lists exactly the pages that exist: no more, no fewer. The group (team) is the index's own
 * hint where it carries one (NFL), else the player's current team from their own projection record — an exact id
 * lookup in the sport's label table, never a name match. No team ⇒ no group.
 */
import { playerBySlug, researchIndex, teamBySlug, teamLabels, type ResearchSport } from "@/lib/research-pages/projection-store";

import type { DirectoryRow } from "./entity-directory";

export const SPORT_NAME: Record<ResearchSport, string> = { NFL: "NFL", MLB: "MLB", EPL: "Premier League", UFC: "UFC" };
export const SPORT_HUB: Record<ResearchSport, string> = { NFL: "/nfl/", MLB: "/mlb/", EPL: "/epl/", UFC: "/ufc/" };
export const SPORT_ORDER: ResearchSport[] = ["NFL", "MLB", "EPL", "UFC"];

/** Sports with at least one page of this kind, in display order. */
export function sportsWith(kind: "player" | "team"): ResearchSport[] {
  const have = new Set(researchIndex().filter((e) => e.kind === kind).map((e) => e.sport));
  return SPORT_ORDER.filter((s) => have.has(s));
}

export function countOf(kind: "player" | "team", sport: ResearchSport): number {
  return researchIndex().filter((e) => e.kind === kind && e.sport === sport).length;
}

const byLabel = (a: DirectoryRow, b: DirectoryRow) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]);

export function playerRows(sport: ResearchSport): DirectoryRow[] {
  const labels = teamLabels(sport);
  return researchIndex()
    .filter((e) => e.kind === "player" && e.sport === sport)
    .map((e): DirectoryRow => {
      const teamId = e.hint ? null : playerBySlug(sport, e.slug)?.currentTeamId ?? null;
      const group = e.hint ?? (teamId ? labels[teamId]?.name ?? null : null);
      return [e.slug, e.label, group, null];
    })
    .sort(byLabel);
}

export function teamRows(sport: ResearchSport): DirectoryRow[] {
  return researchIndex()
    .filter((e) => e.kind === "team" && e.sport === sport)
    .map((e): DirectoryRow => {
      const t = teamBySlug(sport, e.slug);
      return [e.slug, e.label, null, t ? [t.abbreviation, t.supportsResults ? "results recorded" : "fixtures only"].filter(Boolean).join(" · ") : null];
    })
    .sort(byLabel);
}
