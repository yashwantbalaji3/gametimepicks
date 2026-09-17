/**
 * RESEARCH LAB PROJECTION ASSEMBLY (v1.5) — pure.
 *
 *   v1.4 compare projection entities (read ONCE by scripts/lab/build-lab-projections.mjs)
 *        ↓ game index (deduped by canonical game id, recorded finals only)
 *        ↓ player row partitions (one per sport + season)
 *        ↓ season summaries · selector indexes · coverage receipt
 *   files { relative path → content string }
 *
 * No filesystem, no clock, no network, no forecast input, no Data Platform, no deploy-time fact: the same compare
 * projection always gives the same bytes.
 *
 * WHY COMPARE IS THE SOURCE. The compare projection already decided, once, which stat families a player carries
 * (`entities.mjs playerStatKeys`) and which team results are proven facts. Re-deriving either here would create a
 * second definition of the same thing; the Lab reads the decided artifact, so a family means exactly what it means
 * in Compare and on a research page.
 */
import { canonicalJson } from "../research-pages/projection-build.mjs";
import { TEAM, isNum } from "../compare/entities.mjs";
import { STAT_FAMILIES } from "../compare/stat-families.mjs";
import { familyCoverageCode, seasonLabel } from "./copy.mjs";
import {
  FORBIDDEN_LAB_FIELDS, LAB_BLOCKED_SPORTS, LAB_MODE_SPORTS, LAB_PROJECTION_SCHEMA_VERSION,
} from "./contract.mjs";
import { HOST_KNOWN, PLAYER as LP } from "./fields.mjs";

export const LAB_BUILDER_ID = "gametime-lab-projection@1";

/** v1.4 compare PLAYER row layout (lib/compare/entities.mjs PLAYER): values start at 6. */
const CP = Object.freeze({ GAME: 0, DATE: 1, SEASON: 2, TEAM: 3, OPP: 4, HA: 5, VALUES: 6 });

/**
 * @param {{
 *   compareContentSha256: string,
 *   researchContentSha256: string,
 *   teams: Record<string, any[]>,      compare team entities by sport
 *   players: Record<string, any[]>,    compare player entities by sport
 *   matchups: Record<string, any[]>,   compare matchup registry by sport (durable page paths)
 *   labels: Record<string, Record<string, [string, string|null]>>,   team label tables from the compare indexes
 *   registry: Array<{ kind: string, sport: string, id: string, slug: string, label: string, path: string }>,
 *                                      the v1.3 research page registry — the ONE source of a slug and a page path
 * }} input
 */
export function assembleLabProjection(input) {
  const regBy = new Map(input.registry.map((e) => [`${e.kind}|${e.sport}|${e.id}`, e]));
  const files = new Map();
  const readiness = { games: {}, players: {}, seasons: {} };
  const rowCounts = {};

  /* ── GAMES (MLB, NFL) — one row per canonical game, recorded finals only ───────────────────────── */
  for (const sport of LAB_MODE_SPORTS.games) {
    const entities = [...(input.teams[sport] ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
    const teams = entities.map((t) => [t.slug, t.id, t.name, t.abbreviation ?? null, t.path]);
    const teamIdx = new Map(entities.map((t, i) => [t.id, i]));
    const pathOf = new Map((input.matchups[sport] ?? []).map((m) => [m.gameId, m.path]));

    // Collect both team rows per game id, then reconcile. The rule is the v1.4 H2H rule (docs/MATCHUP_COMPARE §10):
    // a game counts only when both sides are provider-final with both scores AND the two rows agree. A row pair
    // that disagrees is EXCLUDED and counted — never averaged, never half-trusted.
    const sides = new Map();
    for (const t of entities) {
      for (const r of t.rows) {
        const id = r[TEAM.GAME];
        if (!sides.has(id)) sides.set(id, []);
        sides.get(id).push([t.id, r]);
      }
    }
    const excluded = { NOT_FINAL: 0, ONE_SIDE_ONLY: 0, INCONSISTENT: 0 };
    const rows = [];
    const seasonSet = new Set();
    for (const [id, pair] of sides) {
      if (pair.length !== 2) { excluded.ONE_SIDE_ONLY += 1; continue; }
      const [[idA, ra], [idB, rb]] = pair[0][0] < pair[1][0] ? pair : [pair[1], pair[0]];
      const provenA = ra[TEAM.RESULT] && Number.isInteger(ra[TEAM.OWN]) && Number.isInteger(ra[TEAM.OPP_SCORE]);
      const provenB = rb[TEAM.RESULT] && Number.isInteger(rb[TEAM.OWN]) && Number.isInteger(rb[TEAM.OPP_SCORE]);
      if (!provenA && !provenB) { excluded.NOT_FINAL += 1; continue; }
      if (!provenA || !provenB) { excluded.INCONSISTENT += 1; continue; }
      if (ra[TEAM.OWN] !== rb[TEAM.OPP_SCORE] || ra[TEAM.OPP_SCORE] !== rb[TEAM.OWN]) { excluded.INCONSISTENT += 1; continue; }
      if (ra[TEAM.OPP] !== idB || rb[TEAM.OPP] !== idA) { excluded.INCONSISTENT += 1; continue; }
      if (ra[TEAM.SEASON] !== rb[TEAM.SEASON]) { excluded.INCONSISTENT += 1; continue; }

      // Host. "H" on one side and "A" on the other PROVES a host. Two "N" rows prove the source carries no host
      // (an NFL neutral-site game): the tuple then holds the two teams in canonical id order, which is NOT a
      // location claim, and HOST_KNOWN stays clear so no Home/Away filter can ever match the row (§43, §62).
      const hostKnown = (ra[TEAM.HA] === "H" && rb[TEAM.HA] === "A") || (ra[TEAM.HA] === "A" && rb[TEAM.HA] === "H");
      let a, b, sa, sb;
      if (hostKnown) {
        const home = ra[TEAM.HA] === "H" ? [idA, ra] : [idB, rb];
        const away = ra[TEAM.HA] === "H" ? [idB, rb] : [idA, ra];
        a = teamIdx.get(home[0]); b = teamIdx.get(away[0]); sa = home[1][TEAM.OWN]; sb = home[1][TEAM.OPP_SCORE];
      } else {
        a = teamIdx.get(idA); b = teamIdx.get(idB); sa = ra[TEAM.OWN]; sb = ra[TEAM.OPP_SCORE];
      }
      seasonSet.add(ra[TEAM.SEASON]);
      rows.push([id, ra[TEAM.DATE], ra[TEAM.SEASON], a, b, sa, sb, hostKnown ? HOST_KNOWN : 0, pathOf.get(id) ?? null]);
    }
    const seasons = [...seasonSet].sort().reverse();
    const sIdx = new Map(seasons.map((s, i) => [s, i]));
    // Canonical order in the artifact: newest first, then game id descending. Deterministic without a sort in the browser.
    for (const r of rows) r[2] = sIdx.get(r[2]);
    rows.sort((x, y) => (x[1] === y[1] ? (x[0] < y[0] ? 1 : x[0] > y[0] ? -1 : 0) : (x[1] ?? "") < (y[1] ?? "") ? 1 : -1));

    const dates = rows.map((r) => r[1]).filter(Boolean).sort();
    const coverage = {
      status: "PARTIAL",
      kind: sport === "MLB" ? "MLB_FINALS_FROM_2023" : "NFL_FINALS_FROM_1999",
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      notes: sport === "MLB" ? ["MLB_FINALS_ARCHIVE_2023", "CURRENT_SEASON_ROLLING"] : ["NFL_NEUTRAL_HOST_UNKNOWN", "NFL_NO_SEASON_PHASE", "CURRENT_SEASON_ROLLING"],
    };
    files.set(`games/${sport}.json`, canonicalJson({
      schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-games", sport, seasons, teams, rows,
    }));
    files.set(`indexes/games-${sport.toLowerCase()}.json`, canonicalJson({
      schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-index", mode: "games", sport, seasons,
      seasonLabels: Object.fromEntries(seasons.map((s) => [s, seasonLabel(s)])),
      entities: teams, coverage,
      rowsBySeason: Object.fromEntries(seasons.map((s, i) => [s, rows.filter((r) => r[2] === i).length])),
      totalRows: rows.length,
      withMatchupPage: rows.filter((r) => r[8]).length,
    }, true));
    rowCounts[`games/${sport}`] = rows.length;
    readiness.games[sport] = {
      shipped: true, blocker: null, teams: teams.length, seasons, rows: rows.length,
      hostKnown: rows.filter((r) => r[7] & HOST_KNOWN).length,
      hostUnknown: rows.filter((r) => !(r[7] & HOST_KNOWN)).length,
      withMatchupPage: rows.filter((r) => r[8]).length,
      excluded, coverage,
    };
  }
  for (const [sport, blocker] of Object.entries(LAB_BLOCKED_SPORTS.games)) {
    readiness.games[sport] = { shipped: false, blocker, teams: (input.teams[sport] ?? []).length, seasons: [], rows: 0 };
  }

  /* ── PLAYERS (NFL, EPL, MLB) — one partition per sport + season ────────────────────────────────── */
  for (const sport of LAB_MODE_SPORTS.players) {
    const entities = [...(input.players[sport] ?? [])].filter((p) => p.stats.length > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
    const families = STAT_FAMILIES[sport].map((f) => f.key);
    const teamTable = input.labels[sport] ?? {};
    const teamIds = Object.keys(teamTable).sort();
    const teamIdx = new Map(teamIds.map((id, i) => [id, i]));
    // A club with a research page is selectable (it has a slug and a path); one without is a LABEL only. Both slug
    // and path come from the upstream registry — the Lab mints no identity and no second spelling of a team.
    const teams = teamIds.map((id) => {
      const reg = regBy.get(`team|${sport}|${id}`) ?? null;
      return [reg?.slug ?? null, id, teamTable[id][0], teamTable[id][1] ?? null, reg?.path ?? null];
    });
    const players = entities.map((p) => [p.slug, p.id, p.name, p.currentTeamId ? (teamTable[p.currentTeamId]?.[1] ?? null) : null, p.path, p.stats.map((k) => families.indexOf(k))]);
    const playerIdx = new Map(entities.map((p, i) => [p.id, i]));

    const bySeason = new Map();
    const familyRows = Object.fromEntries(families.map((k) => [k, 0]));
    for (const p of entities) {
      const cols = p.stats.map((k) => families.indexOf(k));
      for (const r of p.rows) {
        const values = new Array(families.length).fill(null);
        for (let j = 0; j < cols.length; j += 1) {
          const v = r[CP.VALUES + j];
          // null stays null. A category the source did not record for this game is not a zero (§109).
          if (isNum(v)) { values[cols[j]] = v; familyRows[families[cols[j]]] += 1; }
        }
        const season = r[CP.SEASON];
        if (!bySeason.has(season)) bySeason.set(season, []);
        bySeason.get(season).push([
          playerIdx.get(p.id), r[CP.GAME], r[CP.DATE], season,
          r[CP.TEAM] != null ? teamIdx.get(r[CP.TEAM]) ?? null : null,
          r[CP.OPP] != null ? teamIdx.get(r[CP.OPP]) ?? null : null,
          r[CP.HA] ?? null, ...values,
        ]);
      }
    }
    const seasons = [...bySeason.keys()].sort().reverse();
    const sIdx = new Map(seasons.map((s, i) => [s, i]));
    let total = 0;
    const rowsBySeason = {};
    const seasonFamilies = {};
    for (const season of seasons) {
      const rows = bySeason.get(season);
      for (const r of rows) r[3] = sIdx.get(season);
      rows.sort((x, y) => (x[2] === y[2] ? (x[1] < y[1] ? 1 : x[1] > y[1] ? -1 : x[0] - y[0]) : (x[2] ?? "") < (y[2] ?? "") ? 1 : -1));
      // Each partition carries the sport's FULL season list, so a row's season index means the same thing in
      // every partition and in the index.
      files.set(`players/${sport}/${season}.json`, canonicalJson({
        schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-players", sport, seasonId: season,
        seasons, families, players, teams, rows,
      }));
      rowsBySeason[season] = rows.length;
      // Which families this SEASON actually records — so the UI never offers a season a stat has no rows in (§87).
      seasonFamilies[season] = families.filter((k, i) => rows.some((r) => isNum(r[LP.VALUES + i])));
      total += rows.length;
      rowCounts[`players/${sport}/${season}`] = rows.length;
    }
    const dates = [...bySeason.values()].flat().map((r) => r[2]).filter(Boolean).sort();
    const coverage = {
      status: sport === "MLB" ? "LIMITED" : "PARTIAL",
      kind: `${sport}_PLAYER_ROWS`,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      notes: sport === "MLB" ? ["MLB_PLAYER_CAPTURED_ONLY"] : sport === "NFL" ? ["NFL_NO_CURRENT_SEASON_LOGS", "NFL_GAME_LINES_FROM_2023"] : ["EPL_NO_CURRENT_SEASON_LOGS"],
    };
    files.set(`indexes/players-${sport.toLowerCase()}.json`, canonicalJson({
      schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-index", mode: "players", sport, seasons,
      seasonLabels: Object.fromEntries(seasons.map((s) => [s, seasonLabel(s)])),
      families,
      familyLabels: Object.fromEntries(STAT_FAMILIES[sport].map((f) => [f.key, f.label])),
      familyUnits: Object.fromEntries(STAT_FAMILIES[sport].map((f) => [f.key, f.unit])),
      // The Lab's OWN coverage code: upstream codes name their source, and a public artifact must not.
      familyCoverage: Object.fromEntries(STAT_FAMILIES[sport].map((f) => [f.key, familyCoverageCode(f.coverage ?? null)])),
      seasonFamilies, entities: players, teams, coverage, rowsBySeason, totalRows: total,
    }, true));
    readiness.players[sport] = {
      shipped: true, blocker: null, players: players.length, seasons, rows: total, rowsBySeason,
      families, familyRows, seasonFamilies, coverage,
    };
  }
  for (const [sport, blocker] of Object.entries(LAB_BLOCKED_SPORTS.players)) {
    readiness.players[sport] = { shipped: false, blocker, players: 0, seasons: [], rows: 0 };
  }

  /* ── SEASONS (MLB, NFL) — factual per-team season summaries ────────────────────────────────────── */
  for (const sport of LAB_MODE_SPORTS.seasons) {
    const entities = [...(input.teams[sport] ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
    const teams = entities.map((t) => [t.slug, t.id, t.name, t.abbreviation ?? null, t.path]);
    const seasonSet = new Set();
    const acc = new Map();
    for (let i = 0; i < entities.length; i += 1) {
      const seen = new Set();
      for (const r of entities[i].rows) {
        if (seen.has(r[TEAM.GAME])) continue;   // a repeated game id is ONE game (doubleheaders keep distinct ids)
        seen.add(r[TEAM.GAME]);
        const key = `${i}|${r[TEAM.SEASON]}`;
        seasonSet.add(r[TEAM.SEASON]);
        const e = acc.get(key) ?? { team: i, season: r[TEAM.SEASON], games: 0, finals: 0, w: 0, l: 0, t: 0, scored: 0, allowed: 0 };
        e.games += 1;
        if (r[TEAM.RESULT] && Number.isInteger(r[TEAM.OWN]) && Number.isInteger(r[TEAM.OPP_SCORE])) {
          e.finals += 1;
          if (r[TEAM.RESULT] === "W") e.w += 1; else if (r[TEAM.RESULT] === "L") e.l += 1; else e.t += 1;
          e.scored += r[TEAM.OWN];
          e.allowed += r[TEAM.OPP_SCORE];
        }
        acc.set(key, e);
      }
    }
    const seasons = [...seasonSet].sort().reverse();
    const sIdx = new Map(seasons.map((s, i) => [s, i]));
    const rows = [...acc.values()]
      .filter((e) => e.finals > 0)     // a season with no recorded final has no record to state
      .map((e) => [e.team, sIdx.get(e.season), e.games, e.finals, e.w, e.l, e.t, e.scored, e.allowed])
      .sort((x, y) => x[1] - y[1] || (teams[x[0]][2] < teams[y[0]][2] ? -1 : teams[x[0]][2] > teams[y[0]][2] ? 1 : 0));
    const coverage = {
      status: "PARTIAL",
      kind: `${sport}_SEASON_SUMMARIES`,
      from: seasons[seasons.length - 1] ?? null,
      to: seasons[0] ?? null,
      notes: ["RECORDED_FINALS_ONLY", "CURRENT_SEASON_ROLLING"],
    };
    files.set(`seasons/${sport}.json`, canonicalJson({
      schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-seasons", sport, seasons, teams, rows,
    }));
    files.set(`indexes/seasons-${sport.toLowerCase()}.json`, canonicalJson({
      schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-index", mode: "seasons", sport, seasons,
      seasonLabels: Object.fromEntries(seasons.map((s) => [s, seasonLabel(s)])),
      entities: teams, coverage,
      rowsBySeason: Object.fromEntries(seasons.map((s, i) => [s, rows.filter((r) => r[1] === i).length])),
      totalRows: rows.length,
    }, true));
    rowCounts[`seasons/${sport}`] = rows.length;
    readiness.seasons[sport] = { shipped: true, blocker: null, teams: teams.length, seasons, rows: rows.length, coverage };
  }
  for (const [sport, blocker] of Object.entries(LAB_BLOCKED_SPORTS.seasons)) {
    readiness.seasons[sport] = { shipped: false, blocker, teams: (input.teams[sport] ?? []).length, seasons: [], rows: 0 };
  }

  files.set("readiness.json", canonicalJson({
    schemaVersion: LAB_PROJECTION_SCHEMA_VERSION, artifact: "lab-readiness",
    compareContentSha256: input.compareContentSha256,
    researchContentSha256: input.researchContentSha256,
    modes: LAB_MODE_SPORTS, rows: rowCounts, ...readiness,
  }, true));

  for (const [p, content] of files) assertNoForbiddenLabFields(p, content);
  return { files, summary: { rows: rowCounts, readiness } };
}

/** A Lab artifact must not carry another owner's field names as keys, nor an evaluative one. */
export function assertNoForbiddenLabFields(where, content) {
  for (const f of FORBIDDEN_LAB_FIELDS) {
    if (content.includes(`"${f}":`)) throw new Error(`lab projection ${where}: forbidden owner field "${f}"`);
  }
}
