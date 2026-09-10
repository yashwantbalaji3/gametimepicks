/**
 * ONE server-side team-mark index, shared by every surface that draws a crest.
 *
 * The Bank Builder page built this inline first, and building it inline a second time is how two
 * pages end up disagreeing about which club a name refers to. It reads artifacts, so it is
 * server-only; components receive the resolved abbreviation and draw it.
 *
 * An audit of the built export on 2026-09-10 found 103 of 265 team-bearing pages rendering no
 * crest or portrait at all — the graded-picks tables, the simulate day views, the sports hub, the
 * results archive. All of them had the team names; none had a way to turn a name into a logo.
 */
import fs from "node:fs";
import path from "node:path";

import { buildTeamMarkIndex, resolveMatchupMarks, resolveTeamMark } from "./team-marks.mjs";

export type TeamMark = { abbr: string; sport: string; name: string };
export type TeamMarkIndex = Map<string, TeamMark>;

let cached: TeamMarkIndex | null = null;

/**
 * Build (once per build) from the feeds' own name/abbr pairings.
 *
 * FOURTEEN DAYS OF BOARDS, not one. A single day's slate names ten clubs, so a page showing an
 * archive or a multi-day schedule would get crests on some rows and not others — which looks more
 * broken than none at all. The window costs a few small reads and covers every club many times.
 */
export function loadTeamMarkIndex(): TeamMarkIndex {
  if (cached) return cached;
  const DATA = path.join(process.cwd(), "public", "data");
  const readJson = (rel: string) => {
    try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; }
  };

  let mlbGames: unknown[] = [];
  try {
    const dir = path.join(DATA, "mlb", "boards");
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-14);
    for (const f of files) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      // The board publishes its slate under `games`; other MLB artifacts use `events`. Reading the
      // wrong key yields an EMPTY index and every row silently keeps its fallback — indistinguishable
      // from the bug this file exists to fix, so both are accepted.
      mlbGames = mlbGames.concat(doc?.games ?? doc?.events ?? []);
    }
  } catch { /* a partial index is fine: unresolved names keep their fallback, never a wrong crest */ }

  const nflRows = readJson("nfl/schedule/latest.json")?.rows ?? [];
  cached = buildTeamMarkIndex({ mlbGames: mlbGames as never, nflRows });
  return cached;
}

/** The club a selection is about, or null. */
export function teamMarkFor(selection: string | null | undefined): TeamMark | null {
  return resolveTeamMark(selection ?? "", loadTeamMarkIndex()) as TeamMark | null;
}

/**
 * A crest URL for a team NAME or ABBREVIATION, or null.
 *
 * Same shape TeamLogo builds, so a surface that carries a `logo` string field instead of an
 * abbreviation can be filled without changing its type. The simulate day view is the reason: it
 * already renders crests, gated on a `logo` URL that several of its branches simply set to null,
 * so every EPL, NFL and archive row silently drew nothing.
 */
export function teamLogoUrlFor(nameOrAbbr: string | null | undefined): string | null {
  const mark = teamMarkFor(nameOrAbbr);
  if (!mark) return null;
  // Soccer crests are keyed by numeric id on ESPN's CDN, which this index does not carry — a name
  // that resolves to an EPL club yields no URL rather than a 404 that degrades to a monogram.
  if (mark.sport === "soccer" || mark.sport === "epl") return null;
  return `https://a.espncdn.com/i/teamlogos/${mark.sport}/500/${mark.abbr}.png`;
}

/** Both clubs in a matchup, or null when either side cannot be resolved. */
export function matchupMarksFor(matchup: string | null | undefined): { away: TeamMark; home: TeamMark } | null {
  return resolveMatchupMarks(matchup ?? "", loadTeamMarkIndex()) as { away: TeamMark; home: TeamMark } | null;
}

/**
 * A fighter's headshot, when we actually have one.
 *
 * ONLY the current card carries photo URLs — the 2,695-row fighter roster has none, and no archived
 * card artifact is retained. So a bout from last month resolves to null and the row falls back to
 * an initials monogram, which is the honest degradation: a headshot URL assembled from a guessed
 * athlete id either 404s or, worse, shows a different person.
 */
let fighterPhotos: Map<string, string> | null = null;
export function fighterPhotoFor(name: string | null | undefined): string | null {
  if (!name) return null;
  if (!fighterPhotos) {
    fighterPhotos = new Map();
    try {
      const card = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "card-latest.json"), "utf8"),
      );
      for (const b of card?.bouts ?? []) {
        for (const corner of [b?.red, b?.blue]) {
          if (corner?.name && corner?.photoUrl) {
            fighterPhotos.set(String(corner.name).toLowerCase().replace(/[^a-z]/g, ""), String(corner.photoUrl));
          }
        }
      }
    } catch { /* no card, no photos — initials are the fallback */ }
  }
  return fighterPhotos.get(String(name).toLowerCase().replace(/[^a-z]/g, "")) ?? null;
}
