/**
 * RESEARCH LAB QUERY (v1.5) — the typed query object, its URL form, and its validator. PURE.
 *
 * The query is the stable interface. The UI writes one, a URL carries one, the engine executes one, and a future
 * Ask GameTime can pass one as a tool argument — all against the SAME validator, so no caller can widen the
 * grammar by construction. There is no SQL, no expression language and no arbitrary field name.
 *
 *   {
 *     schemaVersion: 1,
 *     mode: "games" | "players" | "seasons",
 *     sport: "MLB" | "NFL" | "EPL" | "UFC",
 *     seasonId: string | "all" | null,
 *     stat: string | null,                      // canonical v1.4 family key, players mode only
 *     filters: [{ field, op, value }],          // AND only — there is no user-authored OR
 *     sort:    [{ field, dir }],
 *     pageSize: number,
 *     page: number                              // 1-based
 *   }
 *
 * FAILING CLOSED. An unknown field, an operator a field does not declare, a slug the exact index does not hold, a
 * season the projection does not carry, a stat a sport does not define, or a budget overrun makes the query
 * INVALID: nothing executes, a stable reason code is returned, and no clause is silently dropped or widened. A
 * display name is never resolved to an id — `switchSport` is the only function that removes state, and it does so
 * because the reader asked for a different sport.
 *
 * URL POLICY. Parameter order is fixed, so one logical query has exactly one canonical share URL. Unknown query
 * keys are IGNORED (a link that picked up a tracking parameter still opens); a known key with an unreadable value
 * is an error, never a guess.
 */
import {
  ALL_SEASONS, ALL_SEASONS_MODES, LAB_BUDGET, LAB_ERROR, LAB_MODES, LAB_MODE_SPORTS, LAB_QUERY_SCHEMA_VERSION,
  LAB_SPORTS, labModeSupports,
} from "./contract.mjs";
import { LAB_DEFAULT_SORT, labField, isIsoDate, sortAllowed } from "./fields.mjs";

/** Canonical parameter order. Serializing in this order is what makes a share URL stable. */
const PARAM_ORDER = Object.freeze([
  "mode", "sport", "season", "team", "opp", "ha", "result",
  "scored_min", "scored_max", "allowed_min", "allowed_max", "total_min", "total_max",
  "from", "to", "player", "stat", "value_min", "value_max", "sort", "size", "page",
]);

/** One URL key ⇢ one typed clause. `multi` keys accept a comma list and become an `in` clause. */
const PARAM_FIELD = Object.freeze({
  team: { field: "teamId", kind: "entity", multi: true },
  opp: { field: "opponentId", kind: "entity" },
  player: { field: "playerId", kind: "entity", multi: true },
  ha: { field: "homeAway", kind: "enum" },
  result: { field: "result", kind: "enum" },
  scored_min: { field: "scored", kind: "min" },
  scored_max: { field: "scored", kind: "max" },
  allowed_min: { field: "allowed", kind: "min" },
  allowed_max: { field: "allowed", kind: "max" },
  total_min: { field: "totalScore", kind: "min" },
  total_max: { field: "totalScore", kind: "max" },
  value_min: { field: "statValue", kind: "min" },
  value_max: { field: "statValue", kind: "max" },
  from: { field: "date", kind: "min" },
  to: { field: "date", kind: "max" },
});

const err = (code, detail = null) => ({ code, detail });

/* ────────────────────────────────  index helpers  ──────────────────────────────── */

/**
 * The selector index a query validates against — exactly the document the builder emits, so the browser and the
 * unit tests reason about the same truth and no option is hardcoded in React (§72, §87).
 *
 * Both pools hold the same 5-tuple `[slug|null, id, label, abbr|null, path|null]`:
 *   `entities`  the MODE's primary selector — teams in games/seasons mode, players in players mode. Every entry
 *               has a slug, because every entry must be nameable in a share URL.
 *   `teams`     the team pool a team/opponent filter resolves through. In games/seasons mode it is `entities`. In
 *               players mode it is the team LABEL table, where a club with no research page carries `slug: null`:
 *               it can be shown as an opponent's name but can never be selected or serialized.
 * @typedef {{ mode: string, sport: string, seasons: string[], entities: Array<any[]>, teams?: Array<any[]>, families?: string[] }} LabIndex
 */

/** The pool a field of this type resolves through. */
export const labPool = (index, type) => (type === "playerId" ? (index?.entities ?? []) : (index?.teams ?? index?.entities ?? []));

export const poolBySlug = (pool) => new Map(pool.filter((e) => e[0]).map((e) => [e[0], e[1]]));
export const poolById = (pool) => new Map(pool.map((e) => [e[1], e]));
export const indexBySlug = (index) => poolBySlug(index?.entities ?? []);
export const indexById = (index) => poolById(index?.entities ?? []);

/* ────────────────────────────────  defaults  ──────────────────────────────── */

/**
 * The query a reader lands on: the newest supported season, no entity filter, the mode's default sort, one page.
 * Deliberately NOT a 500-row dump and deliberately NOT "today" — the default season comes from the projection's
 * own season list, never from the reader's calendar (§130).
 * @param {LabIndex} index
 */
export function defaultLabQuery(index) {
  const mode = index.mode;
  return {
    schemaVersion: LAB_QUERY_SCHEMA_VERSION,
    mode,
    sport: index.sport,
    seasonId: index.seasons[0] ?? null,
    stat: mode === "players" ? (index.families?.[0] ?? null) : null,
    filters: [],
    sort: LAB_DEFAULT_SORT[mode].map((s) => ({ ...s })),
    pageSize: LAB_BUDGET.defaultPageSize,
    page: 1,
  };
}

/**
 * Change mode or sport deliberately: carry forward ONLY state that cannot belong to a sport or a mode, and let the
 * new target's own index supply the rest. An entity id, a stat family and a season id all belong to exactly one
 * sport (an NFL athlete id means nothing in the Premier League), so they are dropped; a sort key is carried when
 * the new mode still offers it, and a page size belongs to the reader.
 *
 * This is the ONE place state is removed, and the reader asked for it by choosing a different search. It returns a
 * SEARCH STRING rather than a query because the new target's index has not been fetched yet — the parser fills the
 * defaults from that index when it arrives, so the rule exists once and the UI cannot drift from it.
 *
 * The SPORT is kept when the new mode also ships it — changing "Games" to "Seasons" is a change of question, not a
 * change of sport, and silently moving an NFL reader to MLB would be a worse surprise than an empty result.
 *
 * @param {any} query the current, validated query (or null before one exists)
 * @param {{ mode: string, sport?: string }} next
 */
export function switchTarget(query, next) {
  const sport = next.sport && labModeSupports(next.mode, next.sport) ? next.sport
    : query?.sport && labModeSupports(next.mode, query.sport) ? query.sport
      : LAB_MODE_SPORTS[next.mode][0];
  const parts = [["mode", next.mode], ["sport", String(sport).toLowerCase()]];
  const sort = (query?.sort ?? []).filter((s) => sortAllowed(next.mode, s.field));
  const isDefault = sort.map((s) => `${s.field}-${s.dir}`).join(",") === LAB_DEFAULT_SORT[next.mode].map((s) => `${s.field}-${s.dir}`).join(",");
  if (sort.length && !isDefault) parts.push(["sort", sort.map((s) => `${s.field}-${s.dir}`).join(",")]);
  if (query?.pageSize && LAB_BUDGET.pageSizes.includes(query.pageSize) && query.pageSize !== LAB_BUDGET.defaultPageSize) parts.push(["size", String(query.pageSize)]);
  return `?${parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/* ────────────────────────────────  parse  ──────────────────────────────── */

/**
 * Read a query out of a URL search string. Returns `{ query, errors }`: `errors` is non-empty when a KNOWN key
 * carried a value this grammar cannot read. Unknown keys are ignored.
 * @param {string} search location.search, with or without "?"
 * @param {LabIndex} index
 */
export function parseLabQuery(search, index) {
  const raw = String(search ?? "");
  const errors = [];
  if (raw.length > LAB_BUDGET.maxUrlLength) errors.push(err(LAB_ERROR.QUERY_TOO_LARGE, `${raw.length} characters`));
  const p = new URLSearchParams(raw);
  const q = defaultLabQuery(index);

  const mode = p.get("mode");
  if (mode && mode !== index.mode) errors.push(err(LAB_ERROR.UNKNOWN_MODE, mode));
  const sport = p.get("sport");
  if (sport && sport.toUpperCase() !== index.sport) errors.push(err(LAB_ERROR.UNSUPPORTED_SPORT_MODE, sport));

  const season = p.get("season");
  if (season) q.seasonId = season;

  if (index.mode === "players") {
    const stat = p.get("stat");
    if (stat) q.stat = statFromSlug(stat, index.families ?? []) ?? { unknown: stat };
    if (q.stat && typeof q.stat === "object") { errors.push(err(LAB_ERROR.STAT_NOT_SUPPORTED, q.stat.unknown)); q.stat = null; }
  }

  const filters = [];
  for (const key of Object.keys(PARAM_FIELD)) {
    const value = p.get(key);
    if (value == null || value === "") continue;
    const spec = PARAM_FIELD[key];
    const def = labField(index.mode, spec.field);
    if (!def) { errors.push(err(LAB_ERROR.UNKNOWN_FIELD, `${spec.field} (${index.mode})`)); continue; }
    if (spec.kind === "entity") {
      const bySlug = poolBySlug(labPool(index, def.type));
      const parts = spec.multi ? value.split(",") : [value];
      if (!spec.multi && parts.length > 1) { errors.push(err(LAB_ERROR.INVALID_VALUE, `${key}=${value}`)); continue; }
      const ids = [];
      for (const slug of parts) {
        const id = bySlug.get(slug);
        // A slug the exact index does not hold is an error. There is no case folding, trimming or prefix match,
        // and a display name is never a lookup key (§65, NJ-style guard).
        if (id == null) { errors.push(err(LAB_ERROR.ENTITY_NOT_FOUND, `${key}=${slug}`)); continue; }
        if (!ids.includes(id)) ids.push(id);
      }
      if (!ids.length) continue;
      if (ids.length > 1 && !def.ops.includes("in")) { errors.push(err(LAB_ERROR.OPERATOR_NOT_ALLOWED, `${spec.field} in`)); continue; }
      filters.push(ids.length > 1 ? { field: spec.field, op: "in", value: ids } : { field: spec.field, op: "eq", value: ids[0] });
    } else if (spec.kind === "enum") {
      if (!def.values.includes(value)) { errors.push(err(LAB_ERROR.INVALID_VALUE, `${key}=${value}`)); continue; }
      filters.push({ field: spec.field, op: "eq", value });
    } else {
      const bound = def.type === "date" ? (isIsoDate(value) ? value : null) : numeric(value, def.type);
      if (bound == null) { errors.push(err(LAB_ERROR.INVALID_VALUE, `${key}=${value}`)); continue; }
      filters.push({ field: spec.field, op: spec.kind === "min" ? "gte" : "lte", value: bound });
    }
  }
  q.filters = mergeBounds(filters);

  const sort = p.get("sort");
  if (sort) {
    const parsed = [];
    for (const token of sort.split(",")) {
      const m = /^([A-Za-z]+)-(asc|desc)$/.exec(token);
      if (!m) { errors.push(err(LAB_ERROR.INVALID_VALUE, `sort=${token}`)); continue; }
      parsed.push({ field: m[1], dir: m[2] });
    }
    if (parsed.length) q.sort = parsed;
  }
  const size = Number(p.get("size"));
  if (p.get("size")) {
    if (LAB_BUDGET.pageSizes.includes(size)) q.pageSize = size;
    else errors.push(err(LAB_ERROR.INVALID_VALUE, `size=${p.get("size")}`));
  }
  const page = Number(p.get("page"));
  if (p.get("page")) {
    if (Number.isInteger(page) && page >= 1) q.page = page;
    else errors.push(err(LAB_ERROR.INVALID_VALUE, `page=${p.get("page")}`));
  }
  return { query: q, errors };
}

const numeric = (value, type) => {
  if (!/^-?\d+(\.\d+)?$/.test(String(value))) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (type === "int" && !Number.isInteger(n)) return null;
  return n;
};

/** Two bounds on one field collapse into a single `between` clause, so the clause count means what it says. */
function mergeBounds(filters) {
  const out = [];
  for (const f of filters) {
    const prior = out.find((o) => o.field === f.field && (o.op === "gte" || o.op === "lte" || o.op === "between"));
    if (prior && (f.op === "gte" || f.op === "lte") && (prior.op === "gte" || prior.op === "lte") && prior.op !== f.op) {
      const lo = prior.op === "gte" ? prior.value : f.value;
      const hi = prior.op === "gte" ? f.value : prior.value;
      out[out.indexOf(prior)] = { field: f.field, op: "between", value: [lo, hi] };
      continue;
    }
    out.push(f);
  }
  return out;
}

/* ────────────────────────────────  serialize  ──────────────────────────────── */

/**
 * The canonical share URL for a query. Fixed key order, canonical slugs and ids only, empty values omitted, and no
 * base64 blob — the same logical query always produces the same string.
 * @param {any} query
 * @param {LabIndex} index
 */
export function serializeLabQuery(query, index) {
  const slugOf = (type, id) => poolById(labPool(index, type)).get(id)?.[0] ?? null;
  const bag = new Map();
  bag.set("mode", query.mode);
  bag.set("sport", String(query.sport).toLowerCase());
  if (query.seasonId) bag.set("season", query.seasonId);
  const slugs = (type, value) => (Array.isArray(value) ? value : [value]).map((id) => slugOf(type, id));
  for (const f of query.filters ?? []) {
    const keys = Object.entries(PARAM_FIELD).filter(([, s]) => s.field === f.field);
    if (!keys.length) continue;
    const def = labField(query.mode, f.field);
    if (def?.type === "teamId" || def?.type === "playerId") {
      const parts = slugs(def.type, f.value);
      if (parts.some((s) => s == null)) continue;      // an id with no slug is not serializable; never guessed
      bag.set(keys[0][0], parts.join(","));
    } else if (def?.type === "enum") {
      bag.set(keys[0][0], String(f.value));
    } else {
      const [minKey] = keys.find(([, s]) => s.kind === "min") ?? [];
      const [maxKey] = keys.find(([, s]) => s.kind === "max") ?? [];
      if (f.op === "gte" && minKey) bag.set(minKey, String(f.value));
      else if (f.op === "lte" && maxKey) bag.set(maxKey, String(f.value));
      else if (f.op === "between" && minKey && maxKey) { bag.set(minKey, String(f.value[0])); bag.set(maxKey, String(f.value[1])); }
    }
  }
  if (query.mode === "players" && query.stat) bag.set("stat", statSlug(query.stat));
  const sort = (query.sort ?? []).map((s) => `${s.field}-${s.dir}`).join(",");
  const defaultSort = LAB_DEFAULT_SORT[query.mode].map((s) => `${s.field}-${s.dir}`).join(",");
  if (sort && sort !== defaultSort) bag.set("sort", sort);
  if (query.pageSize && query.pageSize !== LAB_BUDGET.defaultPageSize) bag.set("size", String(query.pageSize));
  if (query.page && query.page > 1) bag.set("page", String(query.page));

  const parts = PARAM_ORDER.filter((k) => bag.has(k)).map((k) => `${k}=${encodeURIComponent(bag.get(k))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Stat family key ⇢ URL slug and back. The KEY is identity; the slug is only its URL spelling. */
export const statSlug = (key) => String(key).slice(String(key).indexOf(".") + 1).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const statFromSlug = (slug, families) => families.find((k) => statSlug(k) === slug) ?? null;

/* ────────────────────────────────  validate  ──────────────────────────────── */

/**
 * Validate a query against the grammar AND the projection's own capability. Returns `{ valid, errors, query }`
 * with a normalized query (sort defaults filled, page clamped to ≥ 1) when valid. Nothing here repairs a value.
 * @param {any} query
 * @param {LabIndex} index
 */
export function validateLabQuery(query, index) {
  const errors = [];
  if (!query || typeof query !== "object") return { valid: false, errors: [err(LAB_ERROR.INVALID_VALUE, "query is not an object")], query: null };
  if (query.schemaVersion !== LAB_QUERY_SCHEMA_VERSION) errors.push(err(LAB_ERROR.UNKNOWN_SCHEMA_VERSION, String(query.schemaVersion)));
  if (!LAB_MODES.includes(query.mode)) errors.push(err(LAB_ERROR.UNKNOWN_MODE, String(query.mode)));
  if (!LAB_SPORTS.includes(query.sport)) errors.push(err(LAB_ERROR.UNSUPPORTED_SPORT_MODE, String(query.sport)));
  else if (LAB_MODES.includes(query.mode) && !labModeSupports(query.mode, query.sport)) errors.push(err(LAB_ERROR.UNSUPPORTED_SPORT_MODE, `${query.mode}/${query.sport}`));
  if (errors.length) return { valid: false, errors, query: null };
  if (query.mode !== index.mode || query.sport !== index.sport) {
    return { valid: false, errors: [err(LAB_ERROR.UNSUPPORTED_SPORT_MODE, `${query.mode}/${query.sport}`)], query: null };
  }

  const filters = Array.isArray(query.filters) ? query.filters : [];
  if (filters.length > LAB_BUDGET.maxFilters) errors.push(err(LAB_ERROR.TOO_MANY_FILTERS, `${filters.length} > ${LAB_BUDGET.maxFilters}`));
  const sorts = Array.isArray(query.sort) && query.sort.length ? query.sort : LAB_DEFAULT_SORT[query.mode].map((s) => ({ ...s }));
  if (sorts.length > LAB_BUDGET.maxSorts) errors.push(err(LAB_ERROR.TOO_MANY_SORTS, `${sorts.length} > ${LAB_BUDGET.maxSorts}`));

  // Season: an id the projection carries, or the documented "all" sentinel where the mode allows it. "all" is
  // legal only where ONE partition already holds every season (games, seasons) — never for player rows, which are
  // partitioned by season (see ALL_SEASONS in contract.mjs).
  if (query.seasonId === ALL_SEASONS) {
    if (!ALL_SEASONS_MODES.includes(query.mode)) errors.push(err(LAB_ERROR.ALL_SEASONS_NOT_SUPPORTED, query.mode));
  } else if (query.seasonId == null) {
    errors.push(err(LAB_ERROR.SEASON_NOT_SUPPORTED, "no season selected"));
  } else if (!index.seasons.includes(query.seasonId)) {
    errors.push(err(LAB_ERROR.SEASON_NOT_SUPPORTED, query.seasonId));
  }

  if (query.mode === "players") {
    if (!query.stat) errors.push(err(LAB_ERROR.STAT_REQUIRED, null));
    else if (!(index.families ?? []).includes(query.stat)) errors.push(err(LAB_ERROR.STAT_NOT_SUPPORTED, query.stat));
  } else if (query.stat) {
    errors.push(err(LAB_ERROR.UNKNOWN_FIELD, `stat (${query.mode})`));
  }

  const hasTeam = filters.some((f) => f.field === "teamId");
  let entityTotal = 0;
  for (const f of filters) {
    const def = labField(query.mode, f.field);
    if (!def) { errors.push(err(LAB_ERROR.UNKNOWN_FIELD, String(f.field))); continue; }
    if (!def.ops.includes(f.op)) { errors.push(err(LAB_ERROR.OPERATOR_NOT_ALLOWED, `${f.field} ${f.op}`)); continue; }
    if (def.requiresTeam && !hasTeam) errors.push(err(LAB_ERROR.FIELD_REQUIRES_TEAM, String(f.field)));
    if (def.requiresStat && !query.stat) errors.push(err(LAB_ERROR.STAT_REQUIRED, String(f.field)));
    if (def.type === "teamId" || def.type === "playerId") {
      const list = Array.isArray(f.value) ? f.value : [f.value];
      entityTotal += list.length;
      // A cross-sport id can never pass: the pool holds this sport's canonical ids only (probe 5 / §111).
      const pool = poolById(labPool(index, def.type));
      for (const id of list) if (!pool.has(id)) errors.push(err(LAB_ERROR.ENTITY_NOT_FOUND, String(id)));
    } else if (def.type === "enum") {
      if (!def.values.includes(f.value)) errors.push(err(LAB_ERROR.INVALID_VALUE, `${f.field}=${f.value}`));
    } else if (def.type === "date") {
      const list = f.op === "between" ? f.value : [f.value];
      if (!Array.isArray(list) || !list.every(isIsoDate)) errors.push(err(LAB_ERROR.INVALID_VALUE, `${f.field}`));
      else if (f.op === "between" && !(list[0] <= list[1])) errors.push(err(LAB_ERROR.INVALID_DATE_RANGE, `${list[0]}…${list[1]}`));
    } else {
      const list = f.op === "between" ? f.value : [f.value];
      if (!Array.isArray(list) || !list.every((n) => typeof n === "number" && Number.isFinite(n))) errors.push(err(LAB_ERROR.INVALID_VALUE, String(f.field)));
      else if (def.type === "int" && !list.every(Number.isInteger)) errors.push(err(LAB_ERROR.INVALID_VALUE, String(f.field)));
      else if (f.op === "between" && !(list[0] <= list[1])) errors.push(err(LAB_ERROR.INVALID_VALUE, `${f.field} ${list[0]}…${list[1]}`));
    }
  }
  if (entityTotal > LAB_BUDGET.maxEntities) errors.push(err(LAB_ERROR.TOO_MANY_ENTITIES, `${entityTotal} > ${LAB_BUDGET.maxEntities}`));

  for (const s of sorts) {
    if (!sortAllowed(query.mode, s.field)) { errors.push(err(LAB_ERROR.UNKNOWN_FIELD, `sort ${s.field}`)); continue; }
    if (s.dir !== "asc" && s.dir !== "desc") errors.push(err(LAB_ERROR.INVALID_VALUE, `sort ${s.field}-${s.dir}`));
    if (s.field === "statValue" && !query.stat) errors.push(err(LAB_ERROR.STAT_REQUIRED, "sort statValue"));
    const def = labField(query.mode, s.field);
    if (def?.requiresTeam && !hasTeam) errors.push(err(LAB_ERROR.FIELD_REQUIRES_TEAM, `sort ${s.field}`));
  }

  if (!LAB_BUDGET.pageSizes.includes(query.pageSize)) errors.push(err(LAB_ERROR.INVALID_VALUE, `pageSize ${query.pageSize}`));
  if (!Number.isInteger(query.page) || query.page < 1) errors.push(err(LAB_ERROR.INVALID_VALUE, `page ${query.page}`));
  else if (query.pageSize * query.page > LAB_BUDGET.maxRows) errors.push(err(LAB_ERROR.LIMIT_EXCEEDED, `page ${query.page} × ${query.pageSize} > ${LAB_BUDGET.maxRows}`));

  if (errors.length) return { valid: false, errors, query: null };
  return {
    valid: true,
    errors: [],
    query: {
      schemaVersion: LAB_QUERY_SCHEMA_VERSION,
      mode: query.mode,
      sport: query.sport,
      seasonId: query.seasonId,
      stat: query.stat ?? null,
      filters: filters.map((f) => ({ field: f.field, op: f.op, value: Array.isArray(f.value) ? [...f.value] : f.value })),
      sort: sorts.map((s) => ({ field: s.field, dir: s.dir })),
      pageSize: query.pageSize,
      page: query.page,
    },
  };
}

/** Which partitions a valid query needs. The engine never loads more than `LAB_BUDGET.maxPartitions`. */
export function queryPartitions(query) {
  if (query.mode === "games") return [{ kind: "games", sport: query.sport }];
  if (query.mode === "seasons") return [{ kind: "seasons", sport: query.sport }];
  return [{ kind: "players", sport: query.sport, seasonId: query.seasonId }];
}
