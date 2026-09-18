/**
 * ASK ↔ RESEARCH LAB — the three factual research tools, expressed in the Lab's OWN grammar.
 *
 * WHY THIS IS A TRANSLATOR AND NOT A SECOND ENGINE. v1.5 built a bounded, allowlisted query grammar
 * with no SQL, no expressions, 8 filters, 2 sorts, 4 entities, 500 rows and one row partition per
 * query, and proved those bounds. Natural language is more flexible than that grammar, and the
 * tempting move is to widen the grammar so Ask can express more. That would quietly move the Lab's
 * proven boundary to accommodate a chat box.
 *
 * So this module does the opposite: it maps Ask's bounded tool arguments ONTO ResearchQueryV1, hands
 * the result to the Lab's own `validateLabQuery`, and runs the Lab's own `executeLabQuery` against the
 * Lab's own published partitions. Anything Ask cannot express in that grammar is answered with what it
 * CAN do plus a precise follow-up — never by adding a field (§1, §131).
 *
 * A consequence worth stating: every refusal a reader sees here is the LAB's refusal code, not a new
 * vocabulary invented for chat. One grammar, one set of errors, one place they are tested.
 */
import { ASK_ERROR, ASK_STATUS } from "../contract.mjs";
import { LAB_ROUTE, labAssetPath, labBlocker, labModeSupports } from "../../lab/contract.mjs";
import { labDataset } from "../../lab/dataset.mjs";
import { executeLabQuery } from "../../lab/engine.mjs";
import { indexById, labPool, poolById, queryPartitions, serializeLabQuery, statFromSlug, validateLabQuery } from "../../lab/query.mjs";
import { LAB_QUERY_SCHEMA_VERSION } from "../../lab/contract.mjs";

/** The Lab's public asset paths, in the loader's allowlisted shape. */
const indexPath = (mode, sport) => labAssetPath.index(mode, sport);
const partPath = (part) =>
  part.kind === "players" ? labAssetPath.players(part.sport, part.seasonId) : labAssetPath[part.kind](part.sport);

const unsupported = (detail, alternatives = []) => ({
  status: ASK_STATUS.UNSUPPORTED,
  error: ASK_ERROR.UNSUPPORTED_DATA,
  detail,
  alternatives,
});

/**
 * Load the index + the one row partition a query needs, and build the Lab's normalised dataset.
 *
 * Exactly two fetches, which is the Lab's own measured cost — Ask does not get a cheaper or a more
 * expensive path than the page does.
 */
async function loadDataset(turn, mode, sport, query) {
  const idx = await turn.load(indexPath(mode, sport));
  if (!idx.ok) return { ok: false, error: ASK_ERROR.ASSET_UNAVAILABLE };
  const [part] = queryPartitions(query ?? { mode, sport, seasonId: null });
  const p = await turn.load(partPath(part));
  if (!p.ok) return { ok: false, error: ASK_ERROR.ASSET_UNAVAILABLE };
  return { ok: true, index: idx.json, dataset: labDataset(mode, idx.json, p.json, 2) };
}

/** Just the index — needed to resolve a season/stat before the partition to load is even known. */
async function loadIndex(turn, mode, sport) {
  const idx = await turn.load(indexPath(mode, sport));
  return idx.ok ? { ok: true, index: idx.json } : { ok: false, error: ASK_ERROR.ASSET_UNAVAILABLE };
}

/** Turn the Lab's validation failure into an Ask tool result that names the Lab's own code. */
const fromLabErrors = (errors) => ({
  status: ASK_STATUS.UNSUPPORTED,
  error: ASK_ERROR.UNSUPPORTED_DATA,
  detail: errors.map((e) => `${e.code}${e.detail ? `: ${e.detail}` : ""}`).join("; ").slice(0, 300),
});

/** The shared result envelope: totals are the ENGINE's, never recounted from the returned slice. */
function envelope(result, index, extra = {}) {
  return {
    status: result.capped ? ASK_STATUS.PARTIAL : ASK_STATUS.OK,
    totalMatched: result.totalMatched,
    returned: result.returned,
    capped: result.capped,
    cap: result.cap,
    coverage: result.coverage ?? null,
    cost: result.cost,
    warnings: result.warnings ?? [],
    links: [{ id: "lab", label: "Open these results in Research Lab", href: `${LAB_ROUTE}${serializeLabQuery(result.normalizedQuery, index)}` }],
    ...extra,
  };
}

/* ──────────────────────────────────  GAME FINDER  ────────────────────────────────── */

export async function runGameFinder(args, ctx) {
  const sport = args.sport;
  if (!labModeSupports("games", sport)) {
    const blocked = labBlocker("games", sport);
    return unsupported(blocked ?? `game results are not recorded for ${sport}`, alternativesFor(sport));
  }

  const loadedIndex = await loadIndex(ctx.turn, "games", sport);
  if (!loadedIndex.ok) return { status: ASK_STATUS.ERROR, error: loadedIndex.error };
  const index = loadedIndex.index;

  // A season the projection does not carry is a REFUSAL naming what it does carry — never the nearest
  // season silently substituted, which would answer a different question than the one asked.
  const seasonId = args.season ? resolveSeason(args.season, index) : (index.seasons[0] ?? null);
  if (args.season && seasonId === null) {
    return unsupported(`${sport} game results are recorded for ${index.seasons.slice(0, 6).join(", ")}${index.seasons.length > 6 ? "…" : ""} — not ${args.season}`);
  }

  const filters = [];
  if (args.teamId) {
    if (!poolById(labPool(index, "teamId")).has(args.teamId)) return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.ENTITY_NOT_FOUND, detail: args.teamId };
    filters.push({ field: "teamId", op: "eq", value: args.teamId });
  }
  if (args.opponentId) filters.push({ field: "opponentId", op: "eq", value: args.opponentId });
  if (args.result) filters.push({ field: "result", op: "eq", value: args.result === "WIN" ? "W" : "L" });
  if (args.venue) filters.push({ field: "homeAway", op: "eq", value: args.venue === "HOME" ? "H" : "A" });
  pushRange(filters, "scored", args.minRuns, args.maxRuns);
  pushRange(filters, "date", args.fromDate, args.toDate);

  const query = {
    schemaVersion: LAB_QUERY_SCHEMA_VERSION,
    mode: "games",
    sport,
    seasonId,
    stat: null,
    filters,
    sort: gameSort(args.sort),
    pageSize: 25,
    page: 1,
  };

  const checked = validateLabQuery(query, index);
  if (!checked.valid) return fromLabErrors(checked.errors);

  const loaded = await loadDataset(ctx.turn, "games", sport, checked.query);
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: loaded.error };

  const result = executeLabQuery(checked.query, loaded.dataset);
  const rows = result.rows.slice(0, args.limit).map((r) => ({
    gameId: r.gameId,
    date: r.date,
    seasonId: r.seasonId,
    teamA: r.teamA?.label ?? null,
    teamB: r.teamB?.label ?? null,
    scoreA: r.scoreA,
    scoreB: r.scoreB,
    /*
     * LOCATION IS PROVEN OR IT IS NEUTRAL. `hostKnown` false means the source never proved which side
     * was at home, and the engine returns "N" rather than guessing from tuple order. It is carried
     * through verbatim so the writer cannot turn an unproven ordering into "at home" (§62).
     */
    hostKnown: r.hostKnown,
    // The per-team view exists only when the query named a team — otherwise "scored" has no subject.
    team: r.perspective?.team?.label ?? null,
    opponent: r.opponent?.label ?? null,
    scored: r.perspective?.scored ?? null,
    allowed: r.perspective?.allowed ?? null,
    result: r.perspective?.result ?? null,
    homeAway: r.perspective?.homeAway ?? null,
    matchupPath: r.matchupPath ?? null,
  }));
  return envelope(result, index, { rows });
}

/* ──────────────────────────────  PLAYER STAT EXPLORER  ────────────────────────────── */

export async function runPlayerResearchQuery(args, ctx) {
  const sport = args.sport;
  if (!labModeSupports("players", sport)) {
    return unsupported(labBlocker("players", sport) ?? `player stat lines are not recorded for ${sport}`, alternativesFor(sport));
  }

  const loadedIndex = await loadIndex(ctx.turn, "players", sport);
  if (!loadedIndex.ok) return { status: ASK_STATUS.ERROR, error: loadedIndex.error };
  const index = loadedIndex.index;

  const seasonId = resolveSeason(args.season, index);
  if (seasonId === null) {
    return unsupported(`${sport} player stat lines are recorded for ${index.seasons.join(", ")} — not ${args.season}`);
  }

  const entry = indexById(index).get(args.playerId);
  if (!entry) return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.ENTITY_NOT_FOUND, detail: args.playerId };

  // A stat family is REQUIRED by the Lab's players mode. When the caller did not name one, we answer
  // with the families this player actually has rather than picking one for them — a silently chosen
  // stat is a different question answered confidently.
  const families = availableFamilies(index, entry);
  const stat = args.statFamily ? matchFamily(args.statFamily, families) : null;
  if (!stat) {
    return {
      status: ASK_STATUS.PARTIAL,
      error: ASK_ERROR.UNSUPPORTED_DATA,
      detail: args.statFamily ? `${args.statFamily} is not a recorded family for this player` : "no stat family named",
      availableFamilies: families.slice(0, 20),
      player: { id: entry[1], label: entry[2] },
    };
  }

  const filters = [{ field: "playerId", op: "eq", value: args.playerId }];
  pushRange(filters, "statValue", args.minValue, args.maxValue);

  const query = {
    schemaVersion: LAB_QUERY_SCHEMA_VERSION,
    mode: "players",
    sport,
    seasonId,
    stat,
    filters,
    sort: playerSort(args.sort),
    pageSize: 25,
    page: 1,
  };

  const checked = validateLabQuery(query, index);
  if (!checked.valid) return fromLabErrors(checked.errors);

  const loaded = await loadDataset(ctx.turn, "players", sport, checked.query);
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: loaded.error };

  const result = executeLabQuery(checked.query, loaded.dataset);
  const rows = result.rows.slice(0, args.limit).map((r) => ({
    date: r.date,
    seasonId: r.seasonId,
    team: r.team?.label ?? null,
    opponent: r.opponent?.label ?? null,
    homeAway: r.homeAway ?? null,
    stat,
    // MISSING IS NOT ZERO. The Lab excludes rows with no recorded value for the family rather than
    // reporting a 0, so a null here means "not recorded", and the writer is told to say so.
    value: r.value ?? null,
  }));

  return envelope(result, index, { player: { id: entry[1], label: entry[2] }, stat, season: seasonId, rows });
}

/* ────────────────────────────────  SEASON EXPLORER  ──────────────────────────────── */

export async function getSeasonExplorer(args, ctx) {
  const sport = args.sport;
  if (!labModeSupports("seasons", sport)) {
    return unsupported(labBlocker("seasons", sport) ?? `season totals are not recorded for ${sport}`, alternativesFor(sport));
  }

  const loadedIndex = await loadIndex(ctx.turn, "seasons", sport);
  if (!loadedIndex.ok) return { status: ASK_STATUS.ERROR, error: loadedIndex.error };
  const index = loadedIndex.index;

  const seasonId = args.season ? resolveSeason(args.season, index, true) : "all";
  if (args.season && seasonId === null) {
    return unsupported(`${sport} season totals cover ${index.seasons.slice(0, 6).join(", ")}${index.seasons.length > 6 ? "…" : ""} — not ${args.season}`);
  }

  const filters = [];
  if (args.teamId) {
    if (!poolById(labPool(index, "teamId")).has(args.teamId)) return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.ENTITY_NOT_FOUND, detail: args.teamId };
    filters.push({ field: "teamId", op: "eq", value: args.teamId });
  }

  const query = {
    schemaVersion: LAB_QUERY_SCHEMA_VERSION,
    mode: "seasons",
    sport,
    seasonId,
    stat: null,
    filters,
    sort: seasonSort(args.sort),
    pageSize: 25,
    page: 1,
  };

  const checked = validateLabQuery(query, index);
  if (!checked.valid) return fromLabErrors(checked.errors);

  const loaded = await loadDataset(ctx.turn, "seasons", sport, checked.query);
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: loaded.error };

  const result = executeLabQuery(checked.query, loaded.dataset);
  const rows = result.rows.slice(0, args.limit).map((r) => ({
    team: r.team?.label ?? null,
    seasonId: r.seasonId,
    recordedFinals: r.finals,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    scored: r.scored,
    allowed: r.allowed,
  }));
  return envelope(result, index, { rows });
}

/* ──────────────────────────────────  helpers  ────────────────────────────────── */

/** `gte`/`lte`/`between` only — the three numeric operators the Lab's grammar offers. */
function pushRange(filters, field, min, max) {
  const hasMin = min !== undefined && min !== null;
  const hasMax = max !== undefined && max !== null;
  if (hasMin && hasMax) filters.push({ field, op: "between", value: [min, max] });
  else if (hasMin) filters.push({ field, op: "gte", value: min });
  else if (hasMax) filters.push({ field, op: "lte", value: max });
}

/**
 * Match a season the caller named against the seasons the projection carries.
 *
 * WHY THIS IS NOT JUST AN EQUALITY CHECK. Season ids are sport-qualified — "NFL-2025", "MLB-2026",
 * "EPL-2025-26" — and a person (or a model repeating them) writes "2025". Those are the same season
 * spelled two ways, not two different seasons, so the qualified spelling is resolved:
 *
 *   exact                      "NFL-2025"  → "NFL-2025"
 *   sport-qualified            "2025"      → "NFL-2025"
 *   split-year, qualified      "2025"      → "EPL-2025-26"   (only when exactly one season matches)
 *
 * Every other input is REFUSED and the caller is told which seasons exist. "last season", "recent"
 * and "this year" are not seasons; resolving them here would be Ask inventing a fact from a calendar
 * the projection never stated. Ambiguity — two seasons starting "2025" — is also a refusal, never the
 * first match.
 */
function resolveSeason(season, index, allowAll = false) {
  const want = String(season ?? "").trim();
  if (!want) return null;
  if (want.toLowerCase() === "all") return allowAll || index.mode !== "players" ? "all" : null;

  const seasons = index.seasons ?? [];
  if (seasons.includes(want)) return want;

  const sport = String(index.sport ?? "").toUpperCase();
  const candidates = [
    `${sport}-${want}`,                                   // "2025" → "NFL-2025"
    ...seasons.filter((s) => s.startsWith(`${sport}-${want}-`)), // "2025" → "EPL-2025-26"
    ...seasons.filter((s) => s.startsWith(`${want}-`)),          // already-qualified split year
  ];
  const hits = [...new Set(candidates)].filter((c) => seasons.includes(c));
  return hits.length === 1 ? hits[0] : null;
}

/** The families this player actually has rows for, from the index's own per-player family list. */
function availableFamilies(index, entry) {
  const families = index.families ?? [];
  const idxs = entry[5] ?? [];
  const mine = idxs.map((i) => families[i]).filter(Boolean);
  return mine.length ? mine : [...families];
}

/**
 * Match a stat family the model named against the real family keys.
 *
 * Accepts the canonical key, the Lab's URL slug for it, or a case/punctuation-insensitive spelling.
 * It never returns a family the player does not have — an unmatched name is a refusal that lists the
 * real ones, because guessing "receiving yards" onto "rushingYards" would be a wrong answer stated
 * confidently.
 */
function matchFamily(wanted, families) {
  const raw = String(wanted).trim();
  if (families.includes(raw)) return raw;
  const bySlug = statFromSlug(raw, families);
  if (bySlug) return bySlug;
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(raw);
  const hit = families.filter((f) => norm(f) === target || norm(f.slice(f.indexOf(".") + 1)) === target);
  return hit.length === 1 ? hit[0] : null;
}

const gameSort = (s) => ({
  DATE_DESC: [{ field: "date", dir: "desc" }],
  DATE_ASC: [{ field: "date", dir: "asc" }],
  SCORE_DESC: [{ field: "scored", dir: "desc" }],
  SCORE_ASC: [{ field: "scored", dir: "asc" }],
}[s] ?? [{ field: "date", dir: "desc" }]);

const playerSort = (s) => ({
  DATE_DESC: [{ field: "date", dir: "desc" }],
  DATE_ASC: [{ field: "date", dir: "asc" }],
  VALUE_DESC: [{ field: "statValue", dir: "desc" }],
  VALUE_ASC: [{ field: "statValue", dir: "asc" }],
}[s] ?? [{ field: "date", dir: "desc" }]);

const seasonSort = (s) => ({
  SEASON_DESC: [{ field: "seasonId", dir: "desc" }],
  SEASON_ASC: [{ field: "seasonId", dir: "asc" }],
  WINS_DESC: [{ field: "wins", dir: "desc" }],
  WINS_ASC: [{ field: "wins", dir: "asc" }],
}[s] ?? [{ field: "seasonId", dir: "desc" }]);

/**
 * What IS available when a sport is not, so a refusal ends with a route rather than a dead end.
 * These are product facts, not guesses: EPL has player-match research but no canonical team results;
 * UFC has fighter research but no comparable numeric stat family.
 */
function alternativesFor(sport) {
  if (sport === "EPL") return [{ id: "epl", label: "EPL fixtures and player research", href: "/epl/" }];
  if (sport === "UFC") return [{ id: "ufc", label: "UFC fighter research", href: "/ufc/" }];
  return [];
}
