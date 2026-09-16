/**
 * /live HUB — server-side roster. NODE ONLY; never imported by a client component.
 *
 * WHAT THIS IS. The static half of the hub: for today's MLB slate, everything that is knowable at
 * BUILD time — canonical URL, matchup, first pitch, the frozen pregame run bands, and the canonical
 * settlement row when one exists. The moving half (score, inning, state, freshness) arrives at read
 * time from ONE batch gateway call and is joined to this roster by `gamePk`.
 *
 * ⚠ THE ROSTER MAKES NO CLAIM ABOUT THE PRESENT. It deliberately carries no "is live" or "has
 * started" field. A static artifact that asserts something about now ages into a lie — the Phase 6
 * release blocker — so every present-tense answer comes from the envelope, evaluated on the
 * reader's clock. `firstPitch` travels as a fact about the schedule, not as a verdict.
 *
 * Reuses the owners that already exist: the full-game simulation slate (the same artifact the
 * report pages read), `projectMlbForecast` (which omits totalRuns because MLB totals are PAUSED),
 * `buildAllGameDetails` for canonical slugs, and `currentEtDate` for "today".
 */
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "@/lib/freshness";
import { gameHrefByMatchId } from "@/lib/game-detail";
import { projectMlbForecast } from "./forecast-join.mjs";
import { type FollowRef, mlbTeamRefByName } from "@/lib/follow/entity-registry";

export interface HubRosterGame {
  /** StatsAPI gamePk as a string — the join key to the live envelope's eventId. */
  gamePk: string;
  /** Canonical public URL. The hub never links anywhere else. */
  href: string;
  matchup: string;
  awayAbbr: string;
  homeAbbr: string;
  awayName: string;
  homeName: string;
  venue: string | null;
  /** Scheduled first pitch (UTC ISO). A SCHEDULE fact, never a statement about now. */
  firstPitch: string | null;
  /** Frozen per-team run bands, or null when no publishable simulation exists for this game. */
  forecast: { runs: { home: any; away: any } } | null;
  forecastGeneratedAt: string | null;
  /** Canonical team refs (v1.1.2) — for a LOCAL followed marker only. Never used to fetch or reorder. */
  awayRef: FollowRef | null;
  homeRef: FollowRef | null;
  /** The canonical graded result, when the settlement owner has produced one. */
  settlement: { actual: { homeRuns: number; awayRuns: number; winner?: string }; gradedAt: string | null } | null;
}

export interface HubRoster {
  etDate: string;
  games: HubRosterGame[];
  /** True when the slate artifact exists at all — distinguishes "no games" from "no artifact". */
  slateArtifactPresent: boolean;
}

const readJson = (abs: string) => {
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
};
const dataPath = (rel: string) => path.join(process.cwd(), "public/data", rel);

/**
 * Canonical settlement rows for one ET date, keyed by gamePk.
 *
 * Read from `mlb/results/game-predictions-graded.jsonl` — the settlement owner. A game appears here
 * only once it has actually been graded, which is exactly the signal the lifecycle needs to tell
 * SETTLED apart from a provider FINAL.
 */
function settlementsFor(etDate: string): Map<string, HubRosterGame["settlement"]> {
  const out = new Map<string, HubRosterGame["settlement"]>();
  const abs = dataPath("mlb/results/game-predictions-graded.jsonl");
  let raw: string;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue; // a malformed row is skipped, never guessed at
    }
    if (row?.date !== etDate || row?.gamePk === undefined) continue;
    const a = row?.actual;
    if (!a || typeof a.homeRuns !== "number" || typeof a.awayRuns !== "number") continue;
    // Many rows per game (one per market); they share one actual result, so first wins.
    const key = String(row.gamePk);
    if (!out.has(key)) out.set(key, { actual: a, gradedAt: row.gradedAt ?? null });
  }
  return out;
}

/**
 * Today's MLB roster.
 *
 * `nowIso` is injectable so tests pin a date instead of depending on the day they run.
 */
export function buildHubRoster(nowIso?: string): HubRoster {
  const etDate = currentEtDate(nowIso ? new Date(nowIso) : undefined);
  const slate = readJson(dataPath(`mlb/full-game-simulations/${etDate}.json`));
  const settlements = settlementsFor(etDate);

  const games: HubRosterGame[] = [];
  for (const g of slate?.games ?? []) {
    const gamePk = g?.gamePk === undefined || g?.gamePk === null ? null : String(g.gamePk);
    if (!gamePk) continue; // an event we cannot name is an event we cannot join
    /*
     * Resolved through the route owner's OWN id lookup, not by parsing a slug. The first attempt
     * here matched a trailing gamePk — which only doubleheaders carry, so it silently produced an
     * empty hub. `gameHrefByMatchId` resolves by matchId (the gamePk) and is doubleheader-safe by
     * construction, because that is the identity the detail owner already indexes on.
     */
    const href = gameHrefByMatchId("mlb", gamePk);
    if (!href) continue; // no canonical page ⇒ no card, rather than a link that 404s
    const forecast = projectMlbForecast(g);
    games.push({
      gamePk,
      href,
      matchup: `${g.awayTeam} @ ${g.homeTeam}`,
      awayAbbr: g.awayTeam ?? "",
      homeAbbr: g.homeTeam ?? "",
      awayName: g.awayTeamName ?? g.awayTeam ?? "",
      homeName: g.homeTeamName ?? g.homeTeam ?? "",
      venue: g.venue ?? null,
      firstPitch: g.firstPitch ?? null,
      forecast: forecast ? { runs: forecast.runs } : null,
      forecastGeneratedAt: slate?.generatedAt ?? null,
      awayRef: mlbTeamRefByName(g.awayTeamName ?? null),
      homeRef: mlbTeamRefByName(g.homeTeamName ?? null),
      settlement: settlements.get(gamePk) ?? null,
    });
  }

  // Ordered by first pitch so the hub reads like a day, with unknown starts last rather than first.
  games.sort((a, b) => {
    const ta = Date.parse(a.firstPitch ?? "");
    const tb = Date.parse(b.firstPitch ?? "");
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return a.gamePk.localeCompare(b.gamePk);
    if (!Number.isFinite(ta)) return 1;
    if (!Number.isFinite(tb)) return -1;
    return ta - tb;
  });

  return { etDate, games, slateArtifactPresent: Boolean(slate) };
}

/**
 * The canonical graded result for ONE game, or null.
 *
 * Used by the game page so its lifecycle has the same settlement input the hub uses — one reader of
 * one artifact, rather than each surface inventing its own notion of "finished".
 */
export function settlementForGamePk(gamePk: string | number | null | undefined, etDate: string | null): HubRosterGame["settlement"] {
  if (gamePk === null || gamePk === undefined || !etDate) return null;
  return settlementsFor(etDate).get(String(gamePk)) ?? null;
}
