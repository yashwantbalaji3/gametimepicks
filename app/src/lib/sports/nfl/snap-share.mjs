/**
 * NFL snap-share participation features (research only). PURE: no network, no filesystem.
 * Data: nflverse snap_counts (https://github.com/nflverse), CC BY 4.0. The attribution travels with every
 * derived file.
 *
 * WHY: eligibility is not role certainty. A player on the roster with no blocking injury status was still
 * projected as a starter while he was on IR or took a handful of snaps. Observed offensive snap share
 * before the target week is the free usage signal that separates "on the roster" from "on the field".
 * Nothing here feeds a model or a public page. The preregistration
 * (data/internal/research/nfl/preregistration-participation-v1.json) freezes how it may be evaluated.
 *
 * WHAT A SNAP SHEET MEANS (nflverse, sourced from Pro-Football-Reference): one row for every player who
 * took at least one snap in ANY phase (offense, defense, special teams) of that team-game. So, per team-game:
 *   PLAYED_OFFENSE      row with offense_snaps > 0. The share is a real share.
 *   PLAYED_NO_OFFENSE   row with offense_snaps == 0 (special teams only). He dressed, and his offensive
 *                       share really was 0. This is the ONLY way a 0 enters the average.
 *   ABSENT_FROM_SHEET   the team's sheet exists and he is not on it: inactive, IR, or dressed and unused.
 *                       This is NOT a zero share. It lowers AVAILABILITY and never the average.
 *   SOURCE_MISSING      the schedule says the team played, but no sheet exists. It is not evidence about
 *                       anyone. It is skipped, counted, and never fills a window slot.
 *   (bye)               the team did not play. It is not a game, so it never enters the window.
 *
 * NO LOOKAHEAD: a feature for (season S, week W) reads only games with (season, week) strictly before
 * (S, W). nflverse numbers postseason weeks 19 and up, so (season, week) order is chronological.
 *
 * STINTS: a window only accumulates inside ONE player-team stint, the same effective-dated discipline as
 * role-shares.mjs. A player whose last observed team differs from the target team has NO_HISTORY on the
 * target team. The old team's usage is carried as information only and is never used to classify.
 *
 * TYPED STATES (closed set; each has a distinct meaning and none collapses into a number):
 *   ESTABLISHED    >= minGames played in the window, mean share >= establishedShare, share sd <= establishedMaxSd
 *   EMERGING       last played share >= emergingShare AND (fewer than minGames played OR a rise of
 *                  >= emergingRise over the earlier window mean): a real but thinly evidenced role
 *   FRINGE         mean share < fringeShare
 *   ROTATION       played, and none of the above (a middle share, or a high share that is unstable)
 *   ABSENT_RECENT  has stint history, but the team played every observable window game without him.
 *                  This is the IR / inactive class.
 *   NO_HISTORY     no observed game on the target team inside the lookback. Unknown, NEVER zero: share,
 *                  mean and trend are null, not 0.
 * A missing sheet is a per-GAME presence (SOURCE_MISSING), never a player state: a stint row proves its own
 * sheet exists, so a player with stint history always has at least one observable window game.
 */

export const SNAP_SHARE_VERSION = 1;
export const SNAP_SHARE_ID = "nfl-snap-share-v1-rolling-stint";

export const SNAP_STATES = Object.freeze([
  "ESTABLISHED", "EMERGING", "ROTATION", "FRINGE", "ABSENT_RECENT", "NO_HISTORY",
]);

export const GAME_PRESENCE = Object.freeze(["PLAYED_OFFENSE", "PLAYED_NO_OFFENSE", "ABSENT_FROM_SHEET", "SOURCE_MISSING"]);

/** Frozen by preregistration-participation-v1.json. The test asserts equality; changing one is a new version. */
export const DEFAULT_PARAMS = Object.freeze({
  windowGames: 4,
  minGames: 3,
  establishedShare: 0.6,
  establishedMaxSd: 0.15,
  emergingShare: 0.4,
  emergingRise: 0.15,
  fringeShare: 0.25,
  maxSeasonsBack: 1,
});

/** The only columns the committed tables keep, in nflverse's own names and order. */
export const SNAP_COLUMNS = Object.freeze([
  "game_id", "season", "week", "player", "pfr_player_id", "position", "team", "opponent", "offense_snaps", "offense_pct",
]);

export const SKILL_POSITIONS = Object.freeze(["QB", "RB", "FB", "WR", "TE"]);

/** ESPN abbreviations the boards use → nflverse abbreviations. Every other team is spelled the same. */
export const ESPN_TO_NFLVERSE_TEAM = Object.freeze({ WSH: "WAS", LAR: "LA" });
export const nflverseTeam = (abbr) => (abbr == null ? null : ESPN_TO_NFLVERSE_TEAM[abbr] ?? abbr);

const numOrNull = (v) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const strOrNull = (v) => (v == null || v === "" ? null : String(v));
export const weekKey = (season, week) => season * 100 + week;

/**
 * One raw nflverse CSV row → one kept row in SNAP_COLUMNS order, or a typed rejection.
 * Blank numbers stay null. A blank is never read as 0.
 */
export function normalizeSnapCsvRow(raw) {
  const season = numOrNull(raw?.season);
  const week = numOrNull(raw?.week);
  const gameId = strOrNull(raw?.game_id);
  const team = strOrNull(raw?.team);
  if (season == null || week == null || !gameId || !team) return { ok: false, reason: "missing game_id/season/week/team — a row without a team-game cannot be placed" };
  return {
    ok: true,
    row: [
      gameId, season, week, strOrNull(raw.player), strOrNull(raw.pfr_player_id), strOrNull(raw.position),
      team, strOrNull(raw.opponent), numOrNull(raw.offense_snaps), numOrNull(raw.offense_pct),
    ],
  };
}

/** Deterministic order so a re-capture of identical data is byte-identical: game, team, player id, name. */
export function compareSnapRows(a, b) {
  for (const i of [0, 6, 4, 3]) {
    const x = a[i] ?? "", y = b[i] ?? "";
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** Columnar committed table → row objects (camelCase) for the feature code. */
export function snapRowsFromTable(table) {
  const cols = table?.columns;
  if (!Array.isArray(cols) || cols.join(",") !== SNAP_COLUMNS.join(",")) {
    throw new Error(`snap table columns ${JSON.stringify(cols)} do not match SNAP_COLUMNS — refusing to guess a layout`);
  }
  return (table.rows ?? []).map((r) => ({
    gameId: r[0], season: r[1], week: r[2], player: r[3], pfrId: r[4], position: r[5], team: r[6], opponent: r[7], offenseSnaps: r[8], offensePct: r[9],
  }));
}

/**
 * Schedule (optional) from nflverse game lines: [{ gameId, season, week, home, away, final }].
 * Only COMPLETED games (final != null) can be window games. With no schedule, the team's sheets are
 * the schedule: a bye and a missing sheet then look alike, and both are skipped (never zero).
 */
export function buildSnapIndex(rows, { schedule = null } = {}) {
  const byPlayer = new Map(); // pfrId → rows sorted by (season, week)
  const sheets = new Map(); // team → Map(key → gameId)
  let withoutPlayerId = 0;
  for (const r of rows) {
    if (!sheets.has(r.team)) sheets.set(r.team, new Map());
    sheets.get(r.team).set(weekKey(r.season, r.week), r.gameId);
    if (!r.pfrId) { withoutPlayerId += 1; continue; } // counted; it still proves the sheet exists
    if (!byPlayer.has(r.pfrId)) byPlayer.set(r.pfrId, []);
    byPlayer.get(r.pfrId).push(r);
  }
  for (const list of byPlayer.values()) list.sort((a, b) => weekKey(a.season, a.week) - weekKey(b.season, b.week));

  let teamGames = null; // team → sorted [{ key, season, week, gameId }]
  if (schedule) {
    teamGames = new Map();
    for (const g of schedule) {
      if (!g?.final || g.season == null || g.week == null) continue;
      for (const t of [g.home, g.away]) {
        if (!t) continue;
        if (!teamGames.has(t)) teamGames.set(t, []);
        teamGames.get(t).push({ key: weekKey(g.season, g.week), season: g.season, week: g.week, gameId: g.gameId ?? null });
      }
    }
  } else {
    teamGames = new Map();
    for (const [t, m] of sheets) teamGames.set(t, [...m].map(([key, gameId]) => ({ key, season: Math.floor(key / 100), week: key % 100, gameId })));
  }
  for (const list of teamGames.values()) list.sort((a, b) => a.key - b.key);
  return { byPlayer, sheets, teamGames, scheduleSource: schedule ? "schedule" : "sheets", accounting: { rows: rows.length, withoutPlayerId, players: byPlayer.size } };
}

const round4 = (x) => (x == null ? null : Number(x.toFixed(4)));

/**
 * The snap-share feature for ONE player on ONE team for ONE target week.
 * @param {ReturnType<typeof buildSnapIndex>} index
 * @param {{ pfrId: string, season: number, week: number, team?: string|null }} target  team in nflverse abbreviations; defaults to the last observed team
 */
export function computeSnapShare(index, { pfrId, season, week, team = null }, params = DEFAULT_PARAMS) {
  const targetKey = weekKey(season, week);
  const minKey = weekKey(season - params.maxSeasonsBack, 0);
  const prior = (index.byPlayer.get(pfrId) ?? []).filter((r) => {
    const k = weekKey(r.season, r.week);
    return k < targetKey && k >= minKey; // strictly before the target week: no lookahead
  });
  const last = prior[prior.length - 1] ?? null;
  const targetTeam = team ?? last?.team ?? null;

  // current stint = the trailing run of prior rows on the target team
  const stint = [];
  for (let i = prior.length - 1; i >= 0 && prior[i].team === targetTeam; i -= 1) stint.unshift(prior[i]);
  const priorStint = last && last.team !== targetTeam
    ? { team: last.team, lastSeason: last.season, lastWeek: last.week, lastShare: last.offensePct }
    : null;

  const base = {
    featureId: SNAP_SHARE_ID, pfrId, season, week, team: targetTeam,
    teamChanged: priorStint != null, priorStint,
    meanShare: null, lastShare: null, shareSd: null, trend: null, availability: null, roleStability: null,
    window: { teamGames: 0, played: 0, playedNoOffense: 0, absent: 0, sourceMissing: 0, crossesSeason: false, games: [] },
  };
  if (!stint.length) {
    return { ...base, state: "NO_HISTORY", reason: priorStint ? `last observed on ${priorStint.team}; usage on ${targetTeam} is unobserved (never zero)` : "no observed game in the lookback (never zero)" };
  }

  const stintStart = weekKey(stint[0].season, stint[0].week);
  const byKey = new Map(stint.map((r) => [weekKey(r.season, r.week), r]));
  const teamSheets = index.sheets.get(targetTeam) ?? new Map();
  const candidates = (index.teamGames.get(targetTeam) ?? []).filter((g) => g.key >= stintStart && g.key < targetKey);

  // walk back from the most recent team game; SOURCE_MISSING games are counted but never fill a slot
  const games = [];
  let sourceMissing = 0;
  for (let i = candidates.length - 1; i >= 0 && games.length < params.windowGames; i -= 1) {
    const g = candidates[i];
    if (!teamSheets.has(g.key)) { sourceMissing += 1; continue; }
    const r = byKey.get(g.key);
    const presence = !r ? "ABSENT_FROM_SHEET" : (r.offenseSnaps ?? 0) > 0 ? "PLAYED_OFFENSE" : "PLAYED_NO_OFFENSE";
    // A PLAYED_NO_OFFENSE row is a real zero; a blank offense_pct on a played row stays null and is skipped.
    const share = presence === "PLAYED_OFFENSE" ? r.offensePct : presence === "PLAYED_NO_OFFENSE" ? 0 : null;
    games.unshift({ season: g.season, week: g.week, presence, share });
  }
  const played = games.filter((g) => g.presence !== "ABSENT_FROM_SHEET" && g.share != null);
  const window = {
    teamGames: games.length,
    played: played.length,
    playedNoOffense: games.filter((g) => g.presence === "PLAYED_NO_OFFENSE").length,
    absent: games.filter((g) => g.presence === "ABSENT_FROM_SHEET").length,
    sourceMissing,
    crossesSeason: games.some((g) => g.season !== season),
    games,
  };
  if (!games.length) {
    // unreachable by construction (his own stint row proves a sheet); a silent fallback here would hide a defect
    throw new Error(`snap-share invariant: ${pfrId} has ${targetTeam} stint rows but no observable window game before ${season}/${week}`);
  }
  if (!played.length) {
    return { ...base, window, availability: 0, state: "ABSENT_RECENT", reason: `${targetTeam} played ${games.length} observable game(s) in the window without him` };
  }

  const shares = played.map((g) => g.share);
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const sd = Math.sqrt(shares.reduce((a, b) => a + (b - mean) ** 2, 0) / shares.length);
  const lastShare = shares[shares.length - 1];
  const earlier = shares.slice(0, -1);
  const trend = earlier.length ? lastShare - earlier.reduce((a, b) => a + b, 0) / earlier.length : null;
  const availability = played.length / games.length;
  const metrics = {
    meanShare: round4(mean), lastShare: round4(lastShare), shareSd: round4(sd), trend: round4(trend),
    availability: round4(availability),
    // one number for "how settled is the role": present every week, and at a steady share
    roleStability: round4(availability * (1 - Math.min(1, sd / 0.25))),
  };
  const { state, reason } = classifySnapState({ ...metrics, played: played.length }, params);
  return { ...base, ...metrics, window, state, reason };
}

/** Threshold rules for a PLAYED window. Precedence is part of the frozen definition. */
export function classifySnapState({ meanShare, lastShare, shareSd, trend, played }, params = DEFAULT_PARAMS) {
  const p = params;
  if (played >= p.minGames && meanShare >= p.establishedShare && shareSd <= p.establishedMaxSd) {
    return { state: "ESTABLISHED", reason: `${played} games, mean ${meanShare}, sd ${shareSd}` };
  }
  if (lastShare >= p.emergingShare && (played < p.minGames || (trend != null && trend >= p.emergingRise))) {
    return { state: "EMERGING", reason: played < p.minGames ? `last share ${lastShare} on only ${played} game(s)` : `last share ${lastShare}, up ${trend} on the earlier window` };
  }
  if (meanShare < p.fringeShare) return { state: "FRINGE", reason: `mean share ${meanShare} < ${p.fringeShare}` };
  return { state: "ROTATION", reason: `mean ${meanShare}, sd ${shareSd} — played, role not settled` };
}

/**
 * nflverse players.csv rows → the id bridge (pfr ↔ gsis ↔ espn). An ESPN id claimed by two PFR ids is
 * AMBIGUOUS and resolves to nobody. A bridge is an id join, never a name guess.
 */
export function buildIdBridge(players, { onlyPfrIds = null } = {}) {
  const byPfr = new Map();
  for (const p of players) {
    const pfr = strOrNull(p.pfr_id);
    if (!pfr || (onlyPfrIds && !onlyPfrIds.has(pfr))) continue;
    byPfr.set(pfr, { gsisId: strOrNull(p.gsis_id), espnId: strOrNull(p.espn_id), name: strOrNull(p.display_name) });
  }
  const claims = new Map(); // espnId → [pfrId…]
  for (const [pfr, v] of byPfr) if (v.espnId) (claims.get(v.espnId) ?? claims.set(v.espnId, []).get(v.espnId)).push(pfr);
  const byEspn = new Map();
  const collisions = [];
  for (const [espnId, pfrs] of claims) {
    byEspn.set(espnId, pfrs.length === 1 ? pfrs[0] : null);
    if (pfrs.length > 1) collisions.push({ espnId, pfrIds: [...pfrs].sort() });
  }
  collisions.sort((a, b) => (a.espnId < b.espnId ? -1 : 1));
  return { byPfr, byEspn, collisions };
}

/** Board id (`nfl-athlete-<espnId>` or a bare ESPN id) → PFR id, typed. */
export function resolveBoardPlayer(bridge, playerId) {
  const espnId = String(playerId ?? "").replace(/^nfl-athlete-/, "");
  if (!/^\d+$/.test(espnId)) return { state: "UNBRIDGED", reason: "not an ESPN athlete id" };
  if (!bridge.byEspn.has(espnId)) return { state: "UNBRIDGED", espnId, reason: "no PFR id carries this ESPN id in nflverse players" };
  const pfrId = bridge.byEspn.get(espnId);
  if (pfrId == null) return { state: "AMBIGUOUS", espnId, reason: "two PFR ids claim this ESPN id — never a pick" };
  return { state: "RESOLVED", espnId, pfrId };
}

const normName = (n) => String(n ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.'`-]/g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").replace(/\s+/g, " ").trim();

/**
 * How snap-count players join the ids the boards use, measured both ways for one season.
 *   forward: snap rows with offense_snaps > 0 → does an ESPN id exist for the PFR id?
 *   reverse: board-space player-games (ESPN corpus, REG, any pass/rush/target involvement) → does a snap
 *            row exist for the bridged PFR id in that season-week? This is the rate the boards live with.
 * Matched pairs are audited for team and name agreement, so a false join shows up, not only a join rate.
 */
export function auditIdJoin({ snapRows, bridge, corpusGames, season }) {
  const rowsFor = snapRows.filter((r) => r.season === season);
  const offense = rowsFor.filter((r) => (r.offenseSnaps ?? 0) > 0);
  const skill = offense.filter((r) => SKILL_POSITIONS.includes(r.position));
  const hasEspn = (r) => Boolean(r.pfrId && bridge.byPfr.get(r.pfrId)?.espnId);
  const rate = (a, b) => (b ? Number((a / b).toFixed(4)) : null);

  const bySeasonWeekPfr = new Map();
  for (const r of rowsFor) if (r.pfrId) bySeasonWeekPfr.set(`${r.week}|${r.pfrId}`, r);

  const reverse = { playerGames: 0, matched: 0, unbridged: 0, ambiguous: 0, noSnapRow: 0, teamAgree: 0, nameAgree: 0, examplesUnmatched: [], examplesNameDisagree: [] };
  for (const g of corpusGames ?? []) {
    if (g.season !== season || g.seasonType !== 2) continue;
    for (const p of g.players ?? []) {
      if ((p.passAtt ?? 0) + (p.rushAtt ?? 0) + (p.targets ?? 0) <= 0) continue;
      reverse.playerGames += 1;
      const res = resolveBoardPlayer(bridge, p.playerId);
      if (res.state !== "RESOLVED") {
        reverse[res.state === "AMBIGUOUS" ? "ambiguous" : "unbridged"] += 1;
        if (reverse.examplesUnmatched.length < 12) reverse.examplesUnmatched.push({ playerId: p.playerId, name: p.name, week: g.week, why: res.state });
        continue;
      }
      const row = bySeasonWeekPfr.get(`${g.week}|${res.pfrId}`);
      if (!row) {
        reverse.noSnapRow += 1;
        if (reverse.examplesUnmatched.length < 12) reverse.examplesUnmatched.push({ playerId: p.playerId, name: p.name, week: g.week, why: "NO_SNAP_ROW" });
        continue;
      }
      reverse.matched += 1;
      if (row.team === nflverseTeam(p.teamAbbr)) reverse.teamAgree += 1;
      if (normName(row.player) === normName(p.name)) reverse.nameAgree += 1;
      else if (reverse.examplesNameDisagree.length < 12) reverse.examplesNameDisagree.push({ espn: p.name, nflverse: row.player });
    }
  }
  return {
    season,
    method: "id join pfr_player_id → nflverse players.csv (pfr_id → espn_id); names are audited, never used to join",
    forward: {
      offenseRows: offense.length, withEspnId: offense.filter(hasEspn).length, rate: rate(offense.filter(hasEspn).length, offense.length),
      skillOffenseRows: skill.length, skillWithEspnId: skill.filter(hasEspn).length, skillRate: rate(skill.filter(hasEspn).length, skill.length),
      rowsWithoutPfrId: rowsFor.filter((r) => !r.pfrId).length,
    },
    reverse: {
      ...reverse,
      rate: rate(reverse.matched, reverse.playerGames),
      teamAgreeRate: rate(reverse.teamAgree, reverse.matched),
      nameAgreeRate: rate(reverse.nameAgree, reverse.matched),
    },
  };
}

/** Recursively key-sorted, whitespace-free JSON: the canonical form a preregistration hash is taken over. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The document a frozen hash covers: everything except the hash block itself. */
export function hashableContent(doc) {
  const { frozenHash, ...rest } = doc ?? {};
  return rest;
}
