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

/**
 * The island's WIRE FORMAT (page weight: the props travel in the RSC flight, and the flight is embedded in the HTML).
 * `packBoard` (server) sends each team once — `t: [abbr, name, game]` — and each row as one array,
 * `[name, injury || 0, teamIndex, min, ...v]`, IN THE DEFAULT ORDER (sortRows' expected-minutes order, ties by id).
 * `unpackBoard` (browser) rebuilds the same rows with an index id ("0000", "0001", …), so the default order — and every
 * tie inside it — is exactly the server's. Every number is carried verbatim; nothing is rounded or recomputed.
 * @param {ReturnType<typeof boardRows>} rows
 */
export function packBoard(rows) {
  const t = [];
  const at = new Map();
  const r = sortRows(rows).map((x) => {
    const k = `${x.game}\u0000${x.team}`;
    if (!at.has(k)) { at.set(k, t.length); t.push([x.team, x.teamName, x.game]); }
    return [x.name, x.injury || 0, at.get(k), x.min, ...x.v];
  });
  return { t, r };
}

/**
 * @param {{ t: [string, string, string][], r: (string | number | null)[][] }} packed
 * @returns {{ id: string, game: string, name: string, injury: string | null, team: string, teamName: string, min: number | null, v: (number | null)[] }[]}
 */
export function unpackBoard({ t, r }) {
  return r.map(([name, injury, ti, min, ...v], i) => {
    const [team, teamName, game] = t[/** @type {number} */ (ti)];
    return { id: String(i).padStart(4, "0"), game, name: /** @type {string} */ (name), injury: /** @type {string} */ (injury) || null, team, teamName, min: /** @type {number | null} */ (min), v: /** @type {(number | null)[]} */ (v) };
  });
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

/* ── Follow-up to PR 1163: slate dates, game links, game status ─────────────────────────────────────────────────────
 * Still PURE and import-free. None of these touches a frozen number: a status is a read-only label beside the row, a
 * link is an href, and a date list only names committed snapshot files. */

/** The words a reader sees — the hub's own chip words (lib/sport-hub/contract.ts hubStatusDisplay). */
export const GAME_STATUS_LABEL = Object.freeze({ upcoming: "Upcoming", started: "Started", final: "Final", postponed: "Postponed" });

/**
 * A game's status at BUILD time, from the committed record only:
 *   final      the write-once finals record holds it (FINAL or FINAL_UNDER_REVIEW) — the only owner allowed to say so;
 *   postponed  the committed schedule capture says postponed / canceled;
 *   started    the tip-off instant has passed and no final is recorded ("Started", never "Final" or "Live");
 *   upcoming   otherwise.
 * `fin` is finals-record.mjs finalFor()'s result, resolved by the caller so this module stays import-free. Only the
 * status CODE is returned — no score: the board is not a results page (the linked /nba hub carries the official final),
 * and one short code per game keeps the page light.
 * @param {{ tipUtc: string|null|undefined, nowMs: number, fin?: { state?: string }|null, scheduleStatusRaw?: string|null }} a
 * @returns {"upcoming"|"started"|"final"|"postponed"}
 */
export function gameStatusAtBuild({ tipUtc, nowMs, fin = null, scheduleStatusRaw = null }) {
  if (fin && (fin.state === "FINAL" || fin.state === "FINAL_UNDER_REVIEW")) return "final";
  if (/POSTPONED|CANCELED|CANCELLED/i.test(String(scheduleStatusRaw ?? ""))) return "postponed";
  const t = Date.parse(tipUtc ?? "");
  return Number.isFinite(t) && Number.isFinite(nowMs) && nowMs >= t ? "started" : "upcoming";
}

/**
 * The status on the READER's clock. The page is a static export, so the build's answer goes stale at tip-off (the
 * kickoff-aware rule, components/live/kickoff-aware.tsx): the clock may advance "upcoming" to "started" once the tip-off
 * instant passes. It never rewinds, never says "final" (only the finals record may), and never touches a postponed
 * game. `nowMs` null = the first render, which is always the build's answer (no hydration flip).
 * @param {"upcoming"|"started"|"final"|"postponed"} built
 * @param {string|null|undefined} tipUtc
 * @param {number|null} nowMs
 */
export function gameStatusOnClock(built, tipUtc, nowMs) {
  if (built !== "upcoming" || nowMs == null) return built;
  const t = Date.parse(tipUtc ?? "");
  return Number.isFinite(t) && nowMs >= t ? "started" : "upcoming";
}

/** The hub's lane-card anchor (components/nba/experimental-lane.tsx laneCardId — kept identical, pinned by test). */
export const hubLaneAnchor = (providerEventId) => `/nba/#nba-exp-${providerEventId}`;
/** The hub's schedule section; the game's one-line row is inside it. */
export const HUB_SCHEDULE_HREF = "/nba/#nba-games";

/**
 * The page a game links to — only a destination that exists in THIS build:
 *   - its frozen card on /nba, when the hub renders that card (the hub's current lane holds the game);
 *   - else the /nba schedule section, when the hub lists the game in its window;
 *   - else nothing. There is no NBA game report route for the 2026-27 season (the /games/nba pages are the retired
 *     May–June board's), and the Simulation Theater and every sportsbook are never linked.
 * @param {string} id
 * @param {{ hubLaneIds?: ReadonlySet<string>|null, hubListedIds?: ReadonlySet<string>|null }} where
 * @returns {{ href: string, label: string } | null}
 */
export function gameLink(id, { hubLaneIds = null, hubListedIds = null } = {}) {
  if (hubLaneIds?.has(String(id))) return { href: hubLaneAnchor(id), label: "NBA hub card" };
  if (hubListedIds?.has(String(id))) return { href: HUB_SCHEDULE_HREF, label: "NBA hub schedule" };
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A dated board's URL. */
export const slateHref = (date) => `/nba/projections/${date}/`;

/**
 * Date navigation: the most recent `limit` committed snapshot dates (newest first) plus the neighbours of `date` among
 * ALL committed dates, so every committed slate is reachable by stepping while the list itself stays bounded (page
 * weight does not grow with the season). Only dates in `dates` ever appear — nothing is invented.
 * @param {ReadonlyArray<string>} dates  committed snapshot dates (any order)
 * @param {string|null} date  the slate on this page (null on the default view)
 * @param {number} [limit]
 */
export function slateNav(dates, date, limit = 7) {
  const all = [...new Set(dates.filter((d) => DATE_RE.test(d)))].sort();
  const prev = date ? [...all].reverse().find((d) => d < date) ?? null : null;
  const next = date ? all.find((d) => d > date) ?? null : null;
  return { recent: all.slice(-limit).reverse(), prev, next, total: all.length };
}
