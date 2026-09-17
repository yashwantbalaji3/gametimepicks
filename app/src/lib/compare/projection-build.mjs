/**
 * COMPARE PROJECTION ASSEMBLY (v1.4 · C1408 C1409) — pure.
 *
 *   v1.3 research projection records (read ONCE by scripts/compare/build-compare-projections.mjs)
 *        ↓ pair-independent compare entities (entities.mjs)
 *        ↓ selector indexes · bounded matchup registry · coverage receipt
 *   files { relative path → content string }
 *
 * No filesystem, no clock, no network, no forecast input, no Data Platform: the same research projection always gives
 * the same bytes. Pair explosion is impossible by construction — nothing here iterates pairs except the receipt's
 * H2H count over TEAMS (435 MLB + 496 NFL pairs, counted, never written as files).
 */
import { canonicalJson } from "../research-pages/projection-build.mjs";
import {
  COMPARE_PROJECTION_SCHEMA_VERSION, FORBIDDEN_COMPARE_FIELDS, MATCHUP_SPORTS, PLAYER_COMPARE_SPORTS, TEAM_COMPARE_BLOCKED_SPORTS, TEAM_COMPARE_SPORTS, matchupPath,
} from "./contract.mjs";
import { playerCompareEntity, teamCompareEntity, teamSeasonsWithResults } from "./entities.mjs";
import { getHeadToHead } from "./head-to-head.mjs";
import { MATCHUP_PAGE_BUDGET, MATCHUP_WINDOWS, matchupRegistry } from "./matchup.mjs";
import { STAT_FAMILIES } from "./stat-families.mjs";
import { assertFamiliesMatchResearch } from "./stat-families-check.mjs";

export const COMPARE_BUILDER_ID = "gametime-compare-projection@1";

/**
 * @param {{
 *   researchContentSha256: string,
 *   index: Array<{ kind: string, sport: string, id: string, slug: string, label: string, hint: string|null, path: string }>,
 *   teams: Record<string, any[]>,      research team projections by sport
 *   players: Record<string, any[]>,    research player projections by sport
 *   labels: Record<string, Record<string, { name: string, abbreviation: string|null }>>,
 *   previousMatchupIds: Record<string, string[]>,   ids published by the committed registry (durability)
 * }} input
 */
export function assembleCompareProjection(input) {
  assertFamiliesMatchResearch();
  const pathOf = new Map(input.index.map((e) => [e.id, e.path]));
  const hintOf = new Map(input.index.map((e) => [e.id, e.hint ?? null]));
  const files = new Map();
  const readiness = { teams: {}, players: {}, matchups: {}, headToHead: {} };
  const entityCounts = {};

  // ── Team compare entities (MLB, NFL) ─────────────────────────────────────────────────────────────
  const teamEntities = {};
  for (const sport of TEAM_COMPARE_SPORTS) {
    const list = [...(input.teams[sport] ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)).map((t) => teamCompareEntity(t, pathOf.get(t.id)));
    const eligible = list.filter((t) => t.supportsResults && teamSeasonsWithResults(t).length > 0);
    teamEntities[sport] = eligible;
    files.set(`teams/${sport}.jsonl`, eligible.map((e) => canonicalJson(e)).join(""));
    readiness.teams[sport] = { researchPages: list.length, eligible: eligible.length, excluded: list.length - eligible.length, shipped: true, blocker: null };
    entityCounts[`teams/${sport}`] = eligible.length;
  }
  for (const sport of TEAM_COMPARE_BLOCKED_SPORTS) {
    readiness.teams[sport] = { researchPages: (input.teams[sport] ?? []).length, eligible: 0, excluded: (input.teams[sport] ?? []).length, shipped: false, blocker: "TEAM_RESULTS_UNSUPPORTED" };
  }
  readiness.teams.UFC = { researchPages: 0, eligible: 0, excluded: 0, shipped: false, blocker: "SPORT_NOT_SUPPORTED" };

  // ── Player compare entities (NFL, EPL, MLB) ──────────────────────────────────────────────────────
  for (const sport of PLAYER_COMPARE_SPORTS) {
    const all = [...(input.players[sport] ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => playerCompareEntity(p, pathOf.get(p.id)));
    const eligible = all.filter((p) => p.stats.length > 0);
    const familyCounts = Object.fromEntries(STAT_FAMILIES[sport].map((f) => [f.key, eligible.filter((p) => p.stats.includes(f.key)).length]));
    files.set(`players/${sport}.jsonl`, eligible.map((e) => canonicalJson(e)).join(""));
    const fams = STAT_FAMILIES[sport].map((f) => f.key);
    files.set(`indexes/players-${sport.toLowerCase()}.json`, canonicalJson({
      schemaVersion: COMPARE_PROJECTION_SCHEMA_VERSION, artifact: "compare-selector-index", kind: "player", sport,
      families: fams,
      // [slug, id, label, hint, family indexes (into `families`)]
      entries: [...eligible].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1)).map((p) => [p.slug, p.id, p.name, hintOf.get(p.id) ?? null, p.stats.map((k) => fams.indexOf(k))]),
      teams: teamLabelTable(input.labels[sport]),
    }));
    readiness.players[sport] = {
      researchPages: all.length, eligible: eligible.length, excluded: all.length - eligible.length,
      excludedReasons: all.length - eligible.length ? { NO_COMPARABLE_STAT_FAMILY: all.length - eligible.length } : {},
      // A family is comparable in practice only when at least two players carry it.
      families: familyCounts, comparableFamilies: fams.filter((k) => familyCounts[k] >= 2), shipped: true, blocker: null,
    };
    entityCounts[`players/${sport}`] = eligible.length;
  }
  readiness.players.UFC = { researchPages: (input.players.UFC ?? []).length, eligible: 0, excluded: (input.players.UFC ?? []).length, excludedReasons: { NO_COMPARABLE_STAT_FAMILY: (input.players.UFC ?? []).length }, families: {}, comparableFamilies: [], shipped: false, blocker: "NO_SHARED_STAT" };

  // ── Head-to-head receipt (counted over team pairs; never written per pair) ───────────────────────
  for (const sport of TEAM_COMPARE_SPORTS) {
    const teams = teamEntities[sport];
    let pairs = 0, pairsWithMeetings = 0, refs = 0, worst = 0, inconsistent = 0;
    for (let i = 0; i < teams.length; i += 1) for (let j = i + 1; j < teams.length; j += 1) {
      const h = getHeadToHead({ a: teams[i], b: teams[j] });
      pairs += 1;
      refs += h.record.meetings;
      inconsistent += h.inconsistent;
      if (h.record.meetings) pairsWithMeetings += 1;
      if (h.record.meetings > worst) worst = h.record.meetings;
    }
    readiness.headToHead[sport] = { pairs, pairsWithMeetings, meetingRefs: refs, worstPairMeetings: worst, inconsistentRowsExcluded: inconsistent, storage: "derived from the two team entities; no per-pair file" };
  }

  // ── Matchup registry (bounded; durable) ──────────────────────────────────────────────────────────
  let matchupPages = 0;
  const registries = {};
  for (const sport of MATCHUP_SPORTS) {
    const { entries, excluded } = matchupRegistry(sport, teamEntities[sport]);
    registries[sport] = entries;
    const ids = new Set(entries.map((e) => e.gameId));
    const dropped = (input.previousMatchupIds[sport] ?? []).filter((id) => !ids.has(id));
    if (dropped.length) throw new Error(`compare projection: ${sport} matchup registry would DROP ${dropped.length} published page(s) (${dropped.slice(0, 5).join(", ")}) — a Matchup URL must stay durable after game day`);
    files.set(`matchups/${sport}.jsonl`, entries.map((e) => canonicalJson({ schemaVersion: COMPARE_PROJECTION_SCHEMA_VERSION, ...e, path: matchupPath(sport, e.gameId) })).join(""));
    matchupPages += entries.length;
    readiness.matchups[sport] = {
      window: MATCHUP_WINDOWS[sport], generated: entries.length, indexable: entries.filter((e) => e.indexable).length, noindex: entries.filter((e) => !e.indexable).length,
      withFinal: entries.filter((e) => e.final).length, withPriorMeetings: entries.filter((e) => e.priorMeetings > 0).length,
      startRange: entries.length ? [entries[0].startUtc, entries[entries.length - 1].startUtc] : null, excluded,
    };
  }
  readiness.matchups.EPL = { generated: 0, blocker: "TEAM_RESULTS_UNSUPPORTED" };
  readiness.matchups.UFC = { generated: 0, blocker: "SPORT_NOT_SUPPORTED" };
  if (matchupPages > MATCHUP_PAGE_BUDGET) throw new Error(`compare projection: ${matchupPages} matchup pages exceeds the budget of ${MATCHUP_PAGE_BUDGET}`);

  // Selector indexes for Team Compare, written after the registry so a comparison can link the pair's scheduled meetings.
  for (const sport of TEAM_COMPARE_SPORTS) {
    const eligible = teamEntities[sport];
    files.set(`indexes/teams-${sport.toLowerCase()}.json`, canonicalJson({
      schemaVersion: COMPARE_PROJECTION_SCHEMA_VERSION, artifact: "compare-selector-index", kind: "team", sport,
      // [slug, id, label, abbreviation, newest season with results, oldest season with results]
      entries: [...eligible].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1)).map((t) => {
        const s = teamSeasonsWithResults(t);
        return [t.slug, t.id, t.name, t.abbreviation, s[0], s[s.length - 1]];
      }),
      // [gameId, awayTeamId, homeTeamId, startUtc, path] — Matchup Explorer pages that exist, for a "Matchup research" link
      matchups: (registries[sport] ?? []).map((e) => [e.gameId, e.awayTeamId, e.homeTeamId, e.startUtc, matchupPath(sport, e.gameId)]),
      teams: teamLabelTable(input.labels[sport]),
    }));
  }

  files.set("stat-families.json", canonicalJson({ schemaVersion: COMPARE_PROJECTION_SCHEMA_VERSION, artifact: "compare-stat-families", families: STAT_FAMILIES }, true));
  files.set("readiness.json", canonicalJson({ schemaVersion: COMPARE_PROJECTION_SCHEMA_VERSION, artifact: "compare-readiness", researchContentSha256: input.researchContentSha256, matchupPageBudget: MATCHUP_PAGE_BUDGET, entities: entityCounts, matchupPages, ...readiness }, true));

  for (const [p, content] of files) assertNoForbiddenCompareFields(p, content);
  return { files, summary: { matchupPages, entities: entityCounts } };
}

const teamLabelTable = (labels) => Object.fromEntries(Object.keys(labels ?? {}).sort().map((id) => [id, [labels[id].name, labels[id].abbreviation ?? null]]));

/** A compare artifact must not carry another owner's field names as keys. */
export function assertNoForbiddenCompareFields(where, content) {
  for (const f of FORBIDDEN_COMPARE_FIELDS) {
    if (content.includes(`"${f}":`)) throw new Error(`compare projection ${where}: forbidden owner field "${f}"`);
  }
}
