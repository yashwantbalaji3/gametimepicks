/**
 * COMPARABLE STAT FAMILIES (v1.4 · §21) — the ONLY stats two players may be compared on.
 *
 * A family is keyed by a canonical research stat key (`NFL.receivingYards`), never by a display label. Each one names
 * exactly one v1.3 research column (lib/research-pages/stat-groups.mjs), which in turn maps to declared Data Platform
 * family keys — so "Receiving yards" means the same factual definition on both sides of a comparison. Two stats from
 * different sports can never intersect: the sport is part of the key.
 *
 * `order` is the product order per sport (the default stat is the first SHARED family in this order — never object
 * key order or the alphabet). Aggregation semantics are per game: mean / median / min / max over recorded values,
 * with n always shown. A total is published only where a season sum is meaningful for that stat.
 *
 * Pure: no filesystem, no clock. Bundled into the browser, so it imports NOTHING that names platform families
 * (the research cross-check lives in stat-families-check.mjs, build time only — export-leak EX1).
 */
/**
 * @typedef {{ key: string, sport: string, column: string, label: string, unit: string, valueType: "integer",
 *   aggregation: "per-game", total: boolean, comparable: true, coverage: string|null, order: number }} StatFamily
 */

const fam = (sport, column, label, unit, { total = true, coverage = null } = {}) => ({ sport, column, label, unit, total, coverage });

/** Product order per sport. */
const ORDERED = {
  NFL: [
    fam("NFL", "receivingYards", "Receiving yards", "yards"),
    fam("NFL", "receptions", "Receptions", "receptions"),
    fam("NFL", "rushingYards", "Rushing yards", "yards"),
    fam("NFL", "passingYards", "Passing yards", "yards"),
    fam("NFL", "targets", "Targets", "targets"),
    fam("NFL", "receivingTds", "Receiving TDs", "touchdowns"),
    fam("NFL", "rushingAttempts", "Rushing attempts", "attempts"),
    fam("NFL", "rushingTds", "Rushing TDs", "touchdowns"),
    fam("NFL", "passCompletions", "Completions", "completions"),
    fam("NFL", "passAttempts", "Pass attempts", "attempts"),
    fam("NFL", "passingTds", "Passing TDs", "touchdowns", { coverage: "NFL_ESPN_LINES_2023_ON" }),
    fam("NFL", "interceptionsThrown", "Interceptions thrown", "interceptions", { coverage: "NFL_ESPN_LINES_2023_ON" }),
  ],
  EPL: [
    fam("EPL", "goals", "Goals", "goals"),
    fam("EPL", "assists", "Assists", "assists"),
    fam("EPL", "shots", "Shots", "shots"),
    fam("EPL", "shotsOnGoal", "Shots on target", "shots"),
    fam("EPL", "saves", "Saves", "saves"),
    fam("EPL", "goalsAgainst", "Goals against", "goals"),
    fam("EPL", "fouls", "Fouls", "fouls"),
    fam("EPL", "yellowCards", "Yellow cards", "cards"),
    fam("EPL", "redCards", "Red cards", "cards"),
  ],
  MLB: [
    fam("MLB", "hits", "Hits", "hits", { total: false, coverage: "MLB_CAPTURED_ONLY" }),
    fam("MLB", "totalBases", "Total bases", "bases", { total: false, coverage: "MLB_CAPTURED_ONLY" }),
    fam("MLB", "hitsRunsRbis", "Hits + runs + RBIs", "count", { total: false, coverage: "MLB_CAPTURED_ONLY" }),
    fam("MLB", "pitcherStrikeouts", "Strikeouts (pitching)", "strikeouts", { total: false, coverage: "MLB_CAPTURED_ONLY" }),
  ],
  UFC: [],
};

/** @type {Readonly<Record<string, ReadonlyArray<StatFamily>>>} */
export const STAT_FAMILIES = Object.freeze(Object.fromEntries(Object.entries(ORDERED).map(([sport, list]) => [
  sport,
  Object.freeze(list.map((f, order) => Object.freeze({ key: `${sport}.${f.column}`, sport, column: f.column, label: f.label, unit: f.unit, valueType: "integer", aggregation: "per-game", total: f.total, comparable: true, coverage: f.coverage, order }))),
])));

const BY_KEY = new Map(Object.values(STAT_FAMILIES).flat().map((f) => [f.key, f]));

/** Exact lookup by canonical key. Unknown keys return null — never a similarly named stat. */
export function statFamily(key) {
  return BY_KEY.get(key) ?? null;
}

/** URL form of a family (`receiving-yards`) ⇄ canonical key, scoped to one sport. Exact both ways. */
export const statSlug = (family) => family.column.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export function familyBySlug(sport, slug) {
  return (STAT_FAMILIES[sport] ?? []).find((f) => statSlug(f) === slug) ?? null;
}

/**
 * Shared families of two entities, in product order. Pure set intersection on canonical keys: if either side is
 * from another sport, or carries no family, the answer is empty — there is no fallback stat.
 * @param {{ sport: string, stats: string[] }} a
 * @param {{ sport: string, stats: string[] }} b
 * @returns {string[]} canonical keys
 */
export function sharedStatFamilies(a, b) {
  if (!a || !b || a.sport !== b.sport) return [];
  const bs = new Set(b.stats);
  return (STAT_FAMILIES[a.sport] ?? []).filter((f) => a.stats.includes(f.key) && bs.has(f.key)).map((f) => f.key);
}
