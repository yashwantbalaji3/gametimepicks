/**
 * NFL BOARD ROSTER INTEGRITY (Session 4) — who is on the team NOW, who can play, and who holds the
 * team's passing opportunity, applied at the one place every projected row passes through: the
 * public player board.
 *
 * ── WHAT WAS WRONG, MEASURED ON PIT @ CLE (2026-10-01) ─────────────────────────────────────────
 *
 *   1. "Recent signings — last season's usage … none of it is in this game's projections" listed
 *      Rico Dowdle at PIT with his 2025 Carolina line. He is designated OUT, and the weekly forecast
 *      ALREADY models him at PIT from three 2026 games. Two defects in one row:
 *        · the strip skipped role state `INACTIVE`, a word role evidence never emits (it says OUT);
 *        · it read only the 2024/2025 corpus, so every mover looked "unobserved at the new club"
 *          for the whole season, however many games he had played there.
 *   2. Cleveland published passing yards for THREE quarterbacks (Watson 203, Sanders 95, Gabriel 84;
 *      Σ pass-attempt share 1.957) while the depth chart, 1.3 days old, names one QB1.
 *
 * ── THE RULES, EACH ONE NARROW ─────────────────────────────────────────────────────────────────
 *
 *   UNAVAILABLE ⇒ NO ROW. A player whose canonical designation proves he cannot take the field
 *   (role evidence OUT; injuries contract blocking status) holds no current-game opportunity in ANY
 *   family — including anytime TD. "Conditions on playing, settles void" is a true statement about
 *   settlement and a misleading one under the heading "Likely TD scorers".
 *
 *   ONE PASSER PER PASS-ATTEMPT POOL, FROM THE DEPTH CHART. Only the depth chart's QB1 keeps a
 *   passing-yards projection. This is the rule the §19 shadow measured (9 over-allocated pools → 1
 *   on 2026-09-27) and §2.5 pre-authorised after the Sunday acceptance. It is NOT renormalisation:
 *   the survivor's number is untouched (§20 keeps rescaling behind a model gate). It fails CLOSED:
 *   no fresh chart, or a QB1 the board does not project, leaves the pool exactly as it was and says
 *   why — deleting every passer because we could not read the order would be worse than the defect.
 *
 *   CURRENT-SEASON USAGE IS CURRENT-TEAM EVIDENCE. A player whose weekly forecast row at THIS club is
 *   built from THIS season's games is modelled at this club. He is never a "recent signing whose
 *   role is unobserved"; if he is absent from the board, a gate removed him and the gate is the
 *   reason (see coverage).
 *
 * Nothing here invents a participation probability, a share, or a prior. QUESTIONABLE stays a
 * labelled state on a projected row; a mover with no current-club game stays ROLE_UNCERTAIN.
 */
import { depthChartAsOf, DEPTH_STATE } from "./depth-chart.mjs";
import { conservationForBoard, SHARE_MARKETS } from "./opportunity-conservation.mjs";

/** Role-evidence states (role-vocabularies.mjs) and board states that prove a player will not play. */
export const UNAVAILABLE_STATES = Object.freeze(["OUT", "INACTIVE", "NOT_ON_ROSTER"]);
const UNAVAILABLE = new Set(UNAVAILABLE_STATES);
export const isUnavailableState = (state) => UNAVAILABLE.has(String(state ?? ""));

/** §12.1 fixed 3 days as the bound a Week-N role may be read across. */
export const QB_CHART_MAX_AGE_MS = 3 * 86400000;

/** The per-player states every material current-roster player must end in (§15). */
export const COVERAGE = Object.freeze({
  PROJECTED: "PROJECTED",
  EXCLUDED_UNAVAILABLE: "EXCLUDED_UNAVAILABLE",
  EXCLUDED_NO_CURRENT_ROLE: "EXCLUDED_NO_CURRENT_ROLE",
  WITHHELD_ROLE_UNCERTAIN: "WITHHELD_ROLE_UNCERTAIN",
  NOT_MODELED_BY_FAMILY: "NOT_MODELED_BY_FAMILY",
  /* Session 5 — the family's team pool claims more opportunity than exists (opportunity-conservation.mjs). */
  WITHHELD_POOL_OVER_ALLOCATED: "WITHHELD_POOL_OVER_ALLOCATED",
});

/**
 * Every (team, player) the weekly forecast models from THIS season's games, keyed by the board's
 * ESPN team spelling. `lastSeason` is the forecast's own column: the newest season the row's usage
 * was observed at that club.
 */
export function currentSeasonUsageIndex({ forecast, season }) {
  const out = new Set();
  const cols = forecast?.columns ?? [];
  const col = Object.fromEntries(cols.map((c, i) => [c, i]));
  if (!("team" in col) || !("espnId" in col) || !("lastSeason" in col)) return out;
  const espnOf = new Map();
  for (const r of forecast?.rows ?? []) {
    const id = r[col.espnId];
    if (id == null || id === "" || Number(r[col.lastSeason]) !== Number(season)) continue;
    const nv = r[col.team];
    if (!espnOf.has(nv)) espnOf.set(nv, nv === "WAS" ? "WSH" : nv === "LA" ? "LAR" : nv);
    out.add(`${espnOf.get(nv)}:nfl-athlete-${id}`);
  }
  return out;
}

/**
 * Current-season receivers the board's RECEIVING family cannot see (§21, §30). The receiving family
 * publishes from the v1 engine's role-share pool; until Session 4 PR B that pool was 2023–2025 only, so
 * every rookie and mover was absent. With the 2026 season folded in, what remains is the honest residue
 * (a player below the pool's own share floor, or a game the capture has not reached yet). Materiality is the v1 pool's
 * OWN inclusion rule (target share ≥ 0.05, run-nfl-event-window `THRESH`) applied to the weekly
 * forecast's current-season share — no threshold is invented here. Named, never silent.
 */
export const RECEIVING_POOL_MIN_SHARE = 0.05;
export function receivingFamilyGaps({ forecast, gameId, season, toBoardTeam, published }) {
  const out = [];
  if (!forecast || !gameId || !published?.has?.("player_receptions")) return out;
  const col = Object.fromEntries((forecast.columns ?? []).map((c, i) => [c, i]));
  for (const r of forecast.rows ?? []) {
    if (r[col.gameId] !== gameId || r[col.market] !== "player_receptions") continue;
    if (Number(r[col.lastSeason]) !== Number(season) || !(Number(r[col.share]) >= RECEIVING_POOL_MIN_SHARE)) continue;
    if (r[col.espnId] == null || r[col.espnId] === "") continue;
    out.push({
      team: toBoardTeam(r[col.team]), playerId: `nfl-athlete-${r[col.espnId]}`, family: "player_receptions",
      reason: `the receiving model's usage pool does not include his ${season} role here yet`,
    });
  }
  return out;
}

/**
 * Apply the one-passer rule to ONE team's rows (mutates `players`' markets). Returns what it did.
 * `players` are board rows ({ playerId, team, markets }); `index` is from `indexDepthCharts`.
 */
export function applyQbStarterRule({ players, team, index, asOf, maxAgeMs = QB_CHART_MAX_AGE_MS }) {
  const passers = (players ?? []).filter((p) => p.team === team && p.markets?.player_pass_yds);
  if (passers.length <= 1) return { team, state: "SINGLE_PASSER", passers: passers.map((p) => p.playerId), removed: [] };
  /* The depth-chart capture spells clubs the ESPN way (WSH, LAR) — the board's own spelling. */
  const chart = index ? depthChartAsOf(index, team, asOf, maxAgeMs) : { state: DEPTH_STATE.NO_SNAPSHOT };
  if (chart.state !== DEPTH_STATE.RESOLVED) {
    return { team, state: "UNRESOLVED", reason: `depth chart ${chart.state}`, passers: passers.map((p) => p.playerId), removed: [], snapshotAt: chart.snapshotAt ?? null };
  }
  const starterId = `nfl-athlete-${chart.starter.playerId}`;
  if (!passers.some((p) => p.playerId === starterId)) {
    return { team, state: "UNRESOLVED", reason: `depth-chart QB1 ${chart.starter.name ?? starterId} is not in the board's passing pool`, passers: passers.map((p) => p.playerId), removed: [], snapshotAt: chart.snapshotAt };
  }
  const removed = [];
  for (const p of passers) {
    if (p.playerId === starterId) continue;
    delete p.markets.player_pass_yds;
    removed.push({ playerId: p.playerId, name: p.name });
  }
  return { team, state: "APPLIED", starter: { playerId: starterId, name: chart.starter.name ?? null }, snapshotAt: chart.snapshotAt, removed, passers: [starterId] };
}

/**
 * The pregame roster/usage receipt for one board (§24), per team. Built from what the builder
 * already decided — it states the decisions, it does not make new ones.
 */
export function buildCoverage({ teams, players, excluded, arrivals, qbRules, noRole = [], familyGaps = [], poolWithheld = [] }) {
  const out = {};
  for (const team of teams) {
    const rows = [];
    for (const p of players.filter((x) => x.team === team)) {
      rows.push({ playerId: p.playerId, name: p.name, state: COVERAGE.PROJECTED, families: Object.keys(p.markets).sort(), participation: p.participation ?? null });
    }
    for (const e of excluded.filter((x) => x.team === team)) {
      if (rows.some((r) => r.playerId === e.playerId)) continue;
      rows.push({ playerId: e.playerId, name: e.name, state: COVERAGE.EXCLUDED_UNAVAILABLE, reason: e.reason });
    }
    for (const n of noRole.filter((x) => x.team === team)) {
      if (rows.some((r) => r.playerId === n.playerId)) continue;
      rows.push({ playerId: n.playerId, name: n.name, state: COVERAGE.EXCLUDED_NO_CURRENT_ROLE, reason: n.reason });
    }
    for (const a of arrivals?.[team] ?? []) {
      if (rows.some((r) => r.playerId === a.playerId)) continue;
      rows.push({ playerId: a.playerId, name: a.name, state: COVERAGE.WITHHELD_ROLE_UNCERTAIN, reason: `no game for ${team} yet this season — role at ${team} not yet observed` });
    }
    for (const r of qbRules.find((q) => q.team === team)?.removed ?? []) {
      const notModeled = [{ family: "player_pass_yds", state: COVERAGE.NOT_MODELED_BY_FAMILY, reason: "not the depth chart's QB1 — the team's passing projection belongs to the starter" }];
      const row = rows.find((x) => x.playerId === r.playerId);
      /* A backup whose ONLY family was passing has no row left once the rule runs — he is still
         accounted for, never dropped in silence (caught by MATERIAL_OMISSION on Drew Lock, SEA). */
      if (row) row.notModeled = notModeled;
      else rows.push({ playerId: r.playerId, name: r.name, state: COVERAGE.NOT_MODELED_BY_FAMILY, reason: notModeled[0].reason, notModeled });
    }
    /* Session 5 — every holder of a withheld pool is accounted for, including a player whose ONLY row was
       that family (a backup QB's rushing): removed, never dropped in silence. */
    for (const w of poolWithheld.filter((x) => x.team === team)) {
      const reason = `team ${w.pool} pool over-allocated (Σshare ${w.sum.toFixed(3)}) — family withheld for ${team}, never renormalised`;
      for (const h of w.players) {
        const entries = w.markets.map((family) => ({ family, state: COVERAGE.WITHHELD_POOL_OVER_ALLOCATED, reason }));
        const row = rows.find((x) => x.playerId === h.playerId);
        if (row) (row.notModeled ??= []).push(...entries);
        else rows.push({ playerId: h.playerId, name: h.name, state: COVERAGE.NOT_MODELED_BY_FAMILY, reason, notModeled: entries });
      }
    }
    for (const g of familyGaps.filter((x) => x.team === team)) {
      const row = rows.find((x) => x.playerId === g.playerId);
      if (!row || row.state !== COVERAGE.PROJECTED || row.families.includes(g.family)) continue;
      (row.notModeled ??= []).push({ family: g.family, state: COVERAGE.NOT_MODELED_BY_FAMILY, reason: g.reason });
    }
    out[team] = {
      counts: Object.fromEntries(Object.values(COVERAGE).map((s) => [s, rows.filter((r) => r.state === s).length])),
      players: rows,
    };
  }
  return out;
}

/**
 * The deterministic audit (§28–§30, §62). Pure: reads a board and the facts it must agree with.
 * Returns violations; an empty list is the pass. Never mutates.
 *
 * @param board          a published nfl-player-board artifact
 * @param rosterByTeam   Map ESPN team → Set of `nfl-athlete-<id>` (current roster)
 * @param unavailable    Map `nfl-athlete-<id>` → reason (designation proves he cannot play)
 * @param usage          Set `${team}:${playerId}` of current-season usage at that club (optional)
 * @param expected       `${team}:${playerId}` the weekly forecast models for THIS game from this
 *                       season's games — the model's own materiality, no threshold invented here.
 *                       Each must end in a coverage state; silence is MATERIAL_OMISSION (§30).
 */
export function auditBoard({ board, rosterByTeam, unavailable, usage = null, expected = null, shareOf = null }) {
  const v = [];
  /* Session 5 — a share-sourced family still published on an over-allocated team pool. Recomputed from the
     forecast's own shares (shareOf), never read back from the producer's record of what it withheld. */
  if (shareOf) {
    const shareFamilies = SHARE_MARKETS.filter((m) => {
      const f = board?.families?.[m];
      return f && (f.state === "PUBLISHED" || f.state === "ESTIMATE") && /share-level/.test(String(f.model ?? ""));
    });
    if (shareFamilies.length) {
      const scoped = { players: (board?.players ?? []).map((p) => ({ ...p, markets: Object.fromEntries(Object.entries(p.markets ?? {}).filter(([m]) => shareFamilies.includes(m))) })) };
      for (const r of conservationForBoard({ board: scoped, shareOf }).rows) {
        if (r.state === "OVER_ALLOCATED") v.push({ code: "POOL_OVER_ALLOCATED_PUBLISHED", team: r.team, pool: r.pool, sum: r.sum, players: r.players.map((x) => x.name) });
      }
    }
  }
  const [away, home] = String(board?.matchup ?? "").split(/\s+(?:@|VS|vs)\s+/);
  const teams = new Set([away, home].filter(Boolean));
  const seen = new Map();
  for (const p of board?.players ?? []) {
    if (!teams.has(p.team)) v.push({ code: "THIRD_TEAM", team: p.team, playerId: p.playerId, name: p.name });
    if (seen.has(p.playerId)) v.push({ code: "DUPLICATE_IDENTITY", team: p.team, playerId: p.playerId, name: p.name, also: seen.get(p.playerId) });
    seen.set(p.playerId, p.team);
    const roster = rosterByTeam?.get(p.team);
    if (roster && roster.size && !roster.has(p.playerId)) v.push({ code: "OFF_ROSTER", team: p.team, playerId: p.playerId, name: p.name });
    if (unavailable?.has(p.playerId) || isUnavailableState(p.participation)) {
      v.push({ code: "UNAVAILABLE_PROJECTED", team: p.team, playerId: p.playerId, name: p.name, families: Object.keys(p.markets ?? {}) });
    }
  }
  for (const team of teams) {
    const passers = (board?.players ?? []).filter((p) => p.team === team && p.markets?.player_pass_yds);
    const rule = (board?.integrity?.qbStarter ?? []).find((q) => q.team === team);
    if (passers.length > 1 && rule?.state !== "UNRESOLVED") {
      v.push({ code: "PASS_POOL_MULTI", team, players: passers.map((p) => p.name) });
    }
  }
  const projected = new Set((board?.players ?? []).map((p) => `${p.team}:${p.playerId}`));
  const accounted = new Set(projected);
  for (const [team, c] of Object.entries(board?.coverage ?? {})) for (const r of c.players ?? []) accounted.add(`${team}:${r.playerId}`);
  for (const key of expected ?? []) {
    if (accounted.has(key)) continue;
    const [team, playerId] = key.split(":");
    if (teams.has(team)) v.push({ code: "MATERIAL_OMISSION", team, playerId });
  }
  for (const [team, list] of Object.entries(board?.newArrivals ?? {})) {
    for (const a of list ?? []) {
      if (projected.has(`${team}:${a.playerId}`)) v.push({ code: "ARRIVAL_PROJECTED", team, playerId: a.playerId, name: a.name });
      if (isUnavailableState(a.participation) || unavailable?.has(a.playerId)) v.push({ code: "ARRIVAL_UNAVAILABLE", team, playerId: a.playerId, name: a.name });
      if (usage?.has(`${team}:${a.playerId}`)) v.push({ code: "ARRIVAL_HAS_CURRENT_USAGE", team, playerId: a.playerId, name: a.name });
      if (!teams.has(team)) v.push({ code: "THIRD_TEAM", team, playerId: a.playerId, name: a.name });
    }
  }
  return v;
}
