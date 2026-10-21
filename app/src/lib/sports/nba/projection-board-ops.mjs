/**
 * /nba/projections — the projection-only player board's view operations (§13 amendment A, founder decision
 * 2026-10-20). PURE and BROWSER-SAFE: no imports at all, so the client island bundles nothing from the lane producer
 * (receipt hashing uses node:crypto). Pinned by projection-board-client-imports.test.mjs.
 *
 * The operations change WHICH rows show and in WHAT ORDER — never a number. Every value a row carries is copied from
 * the canonical lane snapshot (`nba-experimental-public-snapshot@1`) by `boardRows` on the server.
 *
 * Order: the default is expected minutes (as the /nba lane lists players). A reader may re-sort by a stat column; that
 * is the reader's sort, not a published ordering — no position number, no highlight, no badge is ever attached.
 */

/**
 * Flatten a lane snapshot into board rows (server side). `stats` is PROJECTION_BOARD_STATS from the lane module,
 * passed in so this file needs no import. A row's `v` is aligned with `stats`.
 * @param {object|null} snapshot
 * @param {ReadonlyArray<ReadonlyArray<string>>} stats
 */
export function boardRows(snapshot, stats) {
  const rows = [];
  for (const g of snapshot?.games ?? []) {
    for (const side of ["away", "home"]) {
      const team = g[side] ?? {};
      for (const r of g.players?.[side] ?? []) {
        rows.push({
          id: `${g.providerEventId}:${r.providerAthleteId}`,
          game: String(g.providerEventId),
          name: r.name ?? "",
          injury: r.injuryStatus ?? null,
          team: team.abbr ?? "",
          teamName: team.name ?? team.abbr ?? "",
          min: r.expectedMinutes ?? null,
          v: stats.map(([k]) => (r.medians && k in r.medians ? r.medians[k] : r.comboMedians?.[k] ?? null)),
        });
      }
    }
  }
  return rows;
}

/** Matchup and team filter options, in slate order. */
export function boardOptions(snapshot) {
  const matchups = [];
  const teams = [];
  for (const g of snapshot?.games ?? []) {
    matchups.push({ id: String(g.providerEventId), label: `${g.away?.name ?? g.away?.abbr} at ${g.home?.name ?? g.home?.abbr}` });
    for (const side of ["away", "home"]) if (g[side]?.abbr) teams.push({ id: g[side].abbr, label: g[side].name ?? g[side].abbr });
  }
  return { matchups, teams };
}

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * @template {{ id: string, game: string, name: string, team: string, min: number | null, v: (number | null)[] }} T
 * @param {T[]} rows
 * @returns {T[]}
 * @param {{ matchup?: string, team?: string, player?: string }} f  "" / undefined = no filter on that field
 */
export function filterRows(rows, { matchup = "", team = "", player = "" } = {}) {
  const q = norm(player);
  return rows.filter((r) => (!matchup || r.game === matchup) && (!team || r.team === team) && (!q || norm(r.name).includes(q)));
}

/**
 * Default order: expected minutes, high to low (ties by row id, stable across builds). With `key` = a stat index, sort
 * by that stat in `dir` ("desc" | "asc"); a missing value always sorts last. Returns a new array.
 * @template {{ id: string, game: string, name: string, team: string, min: number | null, v: (number | null)[] }} T
 * @param {T[]} rows
 * @returns {T[]}
 * @param {{ key?: number|null, dir?: "desc"|"asc" }} s
 */
export function sortRows(rows, { key = null, dir = "desc" } = {}) {
  const byMinutes = (a, b) => (b.min ?? -Infinity) - (a.min ?? -Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (key == null) return [...rows].sort(byMinutes);
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a.v[key], y = b.v[key];
    if (x == null || y == null) return x == null && y == null ? byMinutes(a, b) : x == null ? 1 : -1;
    return sign * (x - y) || byMinutes(a, b);
  });
}

/**
 * Stat groups for the stat filter: every column, the four single-stat medians, the three combos, or one stat.
 * @param {ReadonlyArray<ReadonlyArray<string>>} stats
 * @param {ReadonlyArray<string>} comboKeys
 */
export function statGroups(stats, comboKeys) {
  const all = stats.map((_, i) => i);
  const core = all.filter((i) => !comboKeys.includes(stats[i][0]));
  const combos = all.filter((i) => comboKeys.includes(stats[i][0]));
  return [
    { id: "all", label: "All stats", cols: all },
    { id: "core", label: "PTS · REB · AST · 3PM", cols: core },
    { id: "combos", label: "PRA · P+R · P+A", cols: combos },
    ...stats.map(([k, label], i) => ({ id: k, label, cols: [i] })),
  ];
}
