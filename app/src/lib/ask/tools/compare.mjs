/**
 * ASK COMPARE + MATCHUP TOOLS — v1.4's read models, called rather than reimplemented.
 *
 * `buildTeamComparison`, `buildPlayerComparison`, `getHeadToHead` and `buildMatchup` are the same pure
 * functions the Compare and Matchup pages run, over the same published entity assets. Ask loads the
 * entities and calls them. It does not compute a shared stat family, a head-to-head window or a
 * season-to-date line of its own, because a second implementation of "their record against each other"
 * is a second answer waiting to disagree with the first.
 *
 * ONE THING COMPARE DOES NOT DO, AND ASK MUST NOT ADD. Compare names no winner and carries no forecast
 * — that separation is enforced in its projection by a forbidden-field list. So a comparison result
 * here carries no `advantage`, no `edge` and no ranking, and the writer is handed recorded values with
 * nothing that looks like a verdict attached.
 */
import { ASK_ERROR, ASK_STATUS } from "../contract.mjs";
import {
  BLOCKER,
  MATCHUP_SPORTS,
  PLAYER_COMPARE_SPORTS,
  TEAM_COMPARE_SPORTS,
  comparePath,
  compareAssetPath,
  matchupPath,
} from "../../compare/contract.mjs";
import { buildTeamComparison } from "../../compare/team-compare.mjs";
import { buildPlayerComparison } from "../../compare/player-compare.mjs";
import { buildMatchup } from "../../compare/matchup.mjs";
import { askAssetPath } from "../contract.mjs";

const unsupported = (detail, links = []) => ({ status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.UNSUPPORTED_DATA, detail, links });

/**
 * Load one compare entity by canonical id, via that kind+sport's selector index — two assets, exactly
 * as the Compare page does.
 *
 * The index's `entries` are PACKED tuples, `[slug, id, label, abbr, …]`, the same space-saving shape
 * the Lab uses. They are unpacked here and nowhere else, so no caller reads a selector row by index.
 * An id is matched against the canonical id OR the slug: the entity resolver hands out canonical ids,
 * while a contextual Ask launch from a page carries the slug already in its URL.
 */
const SELECTOR = Object.freeze({ SLUG: 0, ID: 1, LABEL: 2, ABBR: 3 });

async function loadEntity(turn, kind, sport, id) {
  const idx = await turn.load(compareAssetPath.index(kind, sport));
  if (!idx.ok) return { ok: false, error: ASK_ERROR.ASSET_UNAVAILABLE };

  const row = (idx.json.entries ?? []).find((e) => e[SELECTOR.ID] === id || e[SELECTOR.SLUG] === id);
  if (!row) return { ok: false, error: ASK_ERROR.ENTITY_NOT_FOUND, detail: id };
  const entry = { slug: row[SELECTOR.SLUG], id: row[SELECTOR.ID], label: row[SELECTOR.LABEL], abbr: row[SELECTOR.ABBR] ?? null };

  const doc = await turn.load(compareAssetPath.entity(kind, sport, entry.slug));
  if (!doc.ok) return { ok: false, error: ASK_ERROR.ASSET_UNAVAILABLE };
  return { ok: true, entity: doc.json, entry };
}

/* ────────────────────────────  getTeamComparison  ──────────────────────────── */

export async function getTeamComparison(args, ctx) {
  if (!TEAM_COMPARE_SPORTS.includes(args.sport)) {
    return unsupported(BLOCKER?.TEAM_RESULTS_UNSUPPORTED ?? `team comparison is not available for ${args.sport}`);
  }
  if (args.teamAId === args.teamBId) return unsupported("those are the same team");

  const a = await loadEntity(ctx.turn, "team", args.sport, args.teamAId);
  if (!a.ok) return { status: ASK_STATUS.UNSUPPORTED, error: a.error, detail: a.detail ?? null };
  const b = await loadEntity(ctx.turn, "team", args.sport, args.teamBId);
  if (!b.ok) return { status: ASK_STATUS.UNSUPPORTED, error: b.error, detail: b.detail ?? null };

  const built = buildTeamComparison({ a: a.entity, b: b.entity });
  if (!built.eligibility?.eligible) {
    // The owner's own eligibility reason, verbatim — not a sentence Ask wrote about why it failed.
    return unsupported(built.eligibility?.reason ?? "these teams cannot be compared", [
      { id: "compare", label: "Open Compare", href: comparePath("team", args.sport) },
    ]);
  }

  const href = comparePath("team", args.sport, { a: a.entry.slug, b: b.entry.slug });
  return {
    status: ASK_STATUS.OK,
    sport: args.sport,
    a: { id: built.a.id, label: built.a.name, resultsThrough: built.a.resultsThrough ?? null, coverage: built.a.coverage ?? null },
    b: { id: built.b.id, label: built.b.name, resultsThrough: built.b.resultsThrough ?? null, coverage: built.b.coverage ?? null },
    season: built.season,
    /* Last 5 and last 10 recorded finals per side — the owner's windows, not a window Ask chose. */
    recent: built.recent,
    headToHead: {
      allTime: summariseH2H(built.headToHead?.all),
      thisSeason: summariseH2H(built.headToHead?.season),
    },
    links: [{ id: "compare", label: "Open comparison", href }],
  };
}

/**
 * Copy the head-to-head owner's own `record`. Nothing recounted from the meetings list.
 *
 * The distinction matters: `record.meetings` counts every meeting that passed the filters, while the
 * `meetings` ARRAY is capped by the caller's limit. Deriving the count by measuring the array — which
 * is the obvious mistake — would report "5 meetings" for two teams who have played fifty.
 */
function summariseH2H(h) {
  if (!h || h.supported === false) return null;
  return {
    record: h.record ? { meetings: h.record.meetings, aWins: h.record.aWins, bWins: h.record.bWins, ties: h.record.ties } : null,
    seasons: h.seasons ?? [],
    recordedFrom: h.recordedFrom ?? null,
    recordedTo: h.recordedTo ?? null,
    /* Listed meetings only — already capped upstream, and labelled so the writer cannot read the
       length of this array as the head-to-head record. */
    listedMeetings: (h.meetings ?? []).slice(0, 5),
    /* Meetings that exist but are not final, and rows whose two sides disagreed. Both are stated
       rather than dropped: a hidden exclusion is how a record quietly stops adding up. */
    notFinal: (h.notFinal ?? []).length,
    inconsistent: h.inconsistent ?? 0,
  };
}

/* ────────────────────────────  getPlayerComparison  ──────────────────────────── */

export async function getPlayerComparison(args, ctx) {
  if (!PLAYER_COMPARE_SPORTS.includes(args.sport)) {
    return unsupported(`player comparison is not available for ${args.sport}`);
  }
  if (args.playerAId === args.playerBId) return unsupported("those are the same player");

  const a = await loadEntity(ctx.turn, "player", args.sport, args.playerAId);
  if (!a.ok) return { status: ASK_STATUS.UNSUPPORTED, error: a.error, detail: a.detail ?? null };
  const b = await loadEntity(ctx.turn, "player", args.sport, args.playerBId);
  if (!b.ok) return { status: ASK_STATUS.UNSUPPORTED, error: b.error, detail: b.detail ?? null };

  const built = buildPlayerComparison({ a: a.entity, b: b.entity });
  if (!built.eligibility?.eligible) {
    /*
     * The most common refusal here is NO_SHARED_STAT — two players with no stat family in common. UFC
     * fails this for every pair, which is why Player Compare is blocked for UFC entirely. The owner's
     * reason is passed through so the answer explains the real gap rather than "comparison failed".
     */
    return unsupported(built.eligibility?.reason ?? "these players have no shared recorded stat family", [
      { id: "compare", label: "Open Compare", href: comparePath("player", args.sport) },
    ]);
  }

  const href = comparePath("player", args.sport, { a: a.entry.slug, b: b.entry.slug });
  return {
    status: ASK_STATUS.OK,
    sport: args.sport,
    a: { id: built.a.id, label: built.a.name, coverage: built.a.coverage ?? null },
    b: { id: built.b.id, label: built.b.name, coverage: built.b.coverage ?? null },
    sharedFamilies: built.sharedFamilies ?? built.families ?? [],
    season: built.season ?? null,
    windows: built.windows ?? built.recent ?? null,
    links: [{ id: "compare", label: "Open comparison", href }],
  };
}

/* ────────────────────────────  getMatchupContext  ──────────────────────────── */

export async function getMatchupContext(args, ctx) {
  if (!MATCHUP_SPORTS.includes(args.sport)) return unsupported(`matchup research is not available for ${args.sport}`);

  const reg = await ctx.turn.load(askAssetPath.matchups());
  if (!reg.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };

  const entry = (reg.json.entries ?? []).find((e) => e.sport === args.sport && e.gameId === args.gameId);
  if (!entry) {
    /*
     * Matchup pages exist for a BOUNDED set of games, so "no entry" is usually "this game is outside
     * the window", not "this game does not exist". The refusal says which, and offers the research
     * that does exist rather than a dead end.
     */
    return unsupported(`no matchup research page exists for ${args.sport} game ${args.gameId}`, [
      { id: "compare", label: "Open Compare", href: comparePath("team", args.sport) },
    ]);
  }

  const home = await loadEntity(ctx.turn, "team", args.sport, entry.homeTeamId);
  if (!home.ok) return { status: ASK_STATUS.UNSUPPORTED, error: home.error, detail: home.detail ?? null };
  const away = await loadEntity(ctx.turn, "team", args.sport, entry.awayTeamId);
  if (!away.ok) return { status: ASK_STATUS.UNSUPPORTED, error: away.error, detail: away.detail ?? null };

  let built;
  try {
    built = buildMatchup({ entry, home: home.entity, away: away.entity });
  } catch (e) {
    // buildMatchup throws when the registry entry and the loaded teams disagree on identity. That is a
    // join failure, and a join failure is a refusal — never a page assembled from whichever teams loaded.
    return { status: ASK_STATUS.ERROR, error: ASK_ERROR.UNSUPPORTED_DATA, detail: String(e?.message ?? e).slice(0, 160) };
  }

  return {
    status: ASK_STATUS.OK,
    sport: built.sport,
    gameId: built.gameId,
    seasonId: built.seasonId,
    startUtc: built.startUtc,
    neutralSite: built.neutralSite,
    /* A final score when the game is already played; null when it is not. Never a placeholder. */
    final: built.final ?? null,
    home: sideOf(built.home),
    away: sideOf(built.away),
    headToHead: summariseH2H(built.headToHead),
    /*
     * The matchup carries no forecast. It carries a REFERENCE to the forecast owner, so the planner
     * knows to call getPublishedForecasts for this exact game rather than reading a number from here.
     */
    forecastRef: built.forecastRef,
    links: [{ id: "matchup", label: "Open matchup research", href: matchupPath(args.sport, built.gameId) }],
  };
}

const sideOf = (s) => ({
  id: s.id,
  label: s.name,
  abbreviation: s.abbreviation ?? null,
  seasonToDate: s.seasonToDate ?? null,
  priorSeason: s.priorSeason ?? null,
  recent: s.recent ?? null,
  coverage: s.coverage ?? null,
});
