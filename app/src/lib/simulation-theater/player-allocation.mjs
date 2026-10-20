/**
 * SIMULATION THEATER V2 · NFL PLAYER ALLOCATION (`nfl-player-allocation@1`). Pure, deterministic, run-bound.
 *
 * The sim-v2 drive engine records drives, not plays or players. This layer turns ONE validated run's recorded drive
 * facts (plays, net yards, results) into passing / rushing / receiving lines by ALLOCATING them to players in the
 * proportions of the OFFICIAL player projection — the player board, read only through the official forecast snapshot
 * (lib/consistency/official-snapshot.mjs `nflOfficialSnapshot`, founder decision 2026-10-20). Nothing from the sim-v2
 * batch distributions, World Model V2 or role shares is read. Every line is labelled ALLOCATED ("Allocated from the
 * official projection"): it is neither MODELED (stored by the engine) nor DERIVED (exactly computable from the drives).
 *
 * The full rule, with a worked example, is docs/simulation-theater/NFL_PLAYER_ALLOCATION.md. In short, per team:
 *
 *   1 POOLS (official snapshot, joined by `nfl-athlete-*` id and team abbreviation ONLY — never by name)
 *       passers    players with an expected `player_pass_yds`            weight = expected passing yards
 *       rushers    players with an expected `player_rush_yds`            weight = expected rushing yards
 *       receivers  players with expected `player_receptions`             weight = expected receptions; yards weight =
 *                  expected `player_reception_yds`, or (missing) expected receptions × the team's projected yards per
 *                  reception over receivers that have both
 *       scorers    `anytime_td` p → expected touchdowns λ = −ln(1 − p), split into rushing / receiving λ by the
 *                  player's expected rushing vs receiving yards
 *   2 VOLUME (this run's drives)  plays P = Σ plays. The projection implies E[attempts] = E[receptions] ÷ c and
 *       E[carries] = E[rushing yards] ÷ y (c, y: ALLOCATION_RULES, league constants — allocation parameters, not
 *       forecasts). attempts = round(P × E[att] ÷ (E[att] + E[car])), carries = P − attempts,
 *       completions = min(attempts, round(attempts × c)).
 *   3 YARDS (drive by drive)  a drive with net yards > 0 splits them pass/rush by the projection's yard share
 *       (passing = round(net × share), rushing = the rest). A drive with net yards ≤ 0 is UNATTRIBUTED: a drive-level
 *       record cannot tell a sack, a penalty or a loss apart, so its yards stay with the team, unattributed. Hence
 *       team passing + rushing + unattributed = Σ drive net yards, exactly. (No completions ⇒ the share is 0; no
 *       carries ⇒ the share is 1: yards never land on a play type the run has none of.)
 *   4 PLAYERS  largest-remainder apportionment of each team total over the pool weights (ties: playerId order), with
 *       caps: completions ≤ attempts, receptions ≤ targets; yards only to players with a completion / reception / carry.
 *       Targets = attempts and receptions = completions over the receivers; receiving yards = passing yards.
 *   5 TOUCHDOWNS  the team's offensive TD drives (and only those) are apportioned over the scorer λ with caps
 *       (rushing TDs ≤ carries, receiving TDs ≤ receptions), then given to the TD drives in drive order. A receiving TD
 *       is also a passing TD for the passer with the most completions. Tries (XP / two-point), defensive and special-
 *       teams scores, kicking and defense stay team-level / NOT_MODELED.
 *
 * FAIL CLOSED. Missing or mismatched inputs (no snapshot, another event, a team abbreviation the snapshot does not
 * carry, an empty passer / rusher / receiver pool, a TD the pools cannot hold) throw an AllocationError of kind INPUT;
 * a broken reconciliation throws kind INVARIANT. The box score then keeps today's NOT_MODELED player rows and states
 * the code — never a partial table.
 *
 * Deterministic per (receipt, runIndex): no randomness, no clock; the same run and snapshot give byte-identical JSON.
 */
export const ALLOCATION_VERSION = "nfl-player-allocation@1";
export const ALLOCATED_LABEL = "Allocated from the official projection";
export const ALLOCATED_STATUS = "ALLOCATED";

/**
 * Allocation parameters (NOT forecasts). League-wide NFL rates, rounded: completion rate ≈ 0.65 and yards per carry
 * ≈ 4.3 over recent regular seasons. They only convert the projection's expected receptions and rushing yards into the
 * pass/run split of this run's recorded plays. Changing them is a new ALLOCATION_VERSION.
 */
export const ALLOCATION_RULES = Object.freeze({
  completionRate: 0.65,
  yardsPerCarry: 4.3,
  unattributed: "drives with net yards ≤ 0 (sacks, penalties and losses cannot be told apart in a drive-level record)",
  touchdownWeight: "λ = −ln(1 − anytime_td p), split rushing/receiving by expected rushing vs receiving yards",
  rounding: "largest remainder; ties by playerId",
});

export const NFL_ATHLETE_ID = /^nfl-athlete-\d+$/;
const SIDES = Object.freeze(["away", "home"]);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const pos = (v) => (isNum(v) && v > 0 ? v : 0);

export const ALLOCATION_ERROR_KIND = Object.freeze({ INPUT: "INPUT", INVARIANT: "INVARIANT" });

export class AllocationError extends Error {
  constructor(kind, code, detail) {
    super(`player allocation ${code}: ${detail}`);
    this.name = "AllocationError";
    this.kind = kind;
    this.code = code;
    this.detail = detail;
  }
}
const input = (cond, code, detail) => { if (!cond) throw new AllocationError(ALLOCATION_ERROR_KIND.INPUT, code, detail); };
const invariant = (cond, code, detail) => { if (!cond) throw new AllocationError(ALLOCATION_ERROR_KIND.INVARIANT, code, detail); };

/**
 * Largest-remainder apportionment of a non-negative integer `total` over `items` ({id, w, cap?}). Exact: the parts sum
 * to `total`. Remainder ties go to the lower id. Caps are honoured by re-apportioning what a capped item cannot take.
 * Throws when the total cannot be placed (no positive weight, or caps too small).
 * @returns {Map<string, number>}
 */
export function apportion(total, items) {
  const out = new Map(items.map((i) => [i.id, 0]));
  let left = total;
  let open = items.filter((i) => i.w > 0 && (i.cap == null || i.cap > 0));
  while (left > 0) {
    if (!open.length) throw new RangeError(`cannot apportion ${left} of ${total}`);
    const W = open.reduce((a, i) => a + i.w, 0);
    const quota = open.map((i) => ({ i, q: (left * i.w) / W }));
    let placed = 0;
    for (const { i, q } of quota) {
      const room = i.cap == null ? Infinity : i.cap - out.get(i.id);
      const f = Math.min(Math.floor(q), room);
      out.set(i.id, out.get(i.id) + f);
      placed += f;
    }
    let rest = left - placed;
    const byRem = quota
      .filter(({ i }) => i.cap == null || out.get(i.id) < i.cap)
      .sort((a, b) => (b.q - Math.floor(b.q)) - (a.q - Math.floor(a.q)) || (a.i.id < b.i.id ? -1 : a.i.id > b.i.id ? 1 : 0));
    for (const { i } of byRem) {
      if (!rest) break;
      out.set(i.id, out.get(i.id) + 1);
      rest--;
    }
    left = rest;
    open = open.filter((i) => i.cap == null || out.get(i.id) < i.cap);
  }
  return out;
}

/** Team pools from the official snapshot (joined by id + team abbreviation only). */
export function officialPools(snapshot, abbr) {
  const exp = (p, fam) => pos(p.families?.[fam]?.expected);
  const players = (snapshot.players ?? []).filter((p) => p.team === abbr && NFL_ATHLETE_ID.test(String(p.playerId)));
  const both = players.filter((p) => exp(p, "player_receptions") > 0 && exp(p, "player_reception_yds") > 0);
  const recSum = both.reduce((a, p) => a + exp(p, "player_receptions"), 0);
  const ypr = recSum > 0 ? both.reduce((a, p) => a + exp(p, "player_reception_yds"), 0) / recSum : 1;
  const pool = new Map();
  const unallocated = [];
  for (const p of players) {
    const passW = exp(p, "player_pass_yds");
    const rushW = exp(p, "player_rush_yds");
    const recW = exp(p, "player_receptions");
    const recYdsW = recW > 0 ? (exp(p, "player_reception_yds") || recW * ypr) : 0;
    const pTd = p.families?.anytime_td?.expected;
    const lambda = isNum(pTd) && pTd > 0 && pTd < 1 ? -Math.log(1 - pTd) : 0;
    const mix = rushW + recYdsW;
    if (!passW && !rushW && !recW) { unallocated.push({ playerId: p.playerId, reason: "NO_VOLUME_FAMILY" }); continue; }
    pool.set(p.playerId, {
      playerId: p.playerId, name: p.displayName ?? null, passW, rushW, recW, recYdsW,
      rushTdW: mix > 0 ? (lambda * rushW) / mix : 0,
      recTdW: mix > 0 ? (lambda * recYdsW) / mix : 0,
    });
  }
  const list = [...pool.values()];
  return {
    abbr,
    players: pool,
    passers: list.filter((p) => p.passW > 0),
    rushers: list.filter((p) => p.rushW > 0),
    receivers: list.filter((p) => p.recW > 0),
    expected: {
      passYds: list.reduce((a, p) => a + p.passW, 0),
      rushYds: list.reduce((a, p) => a + p.rushW, 0),
      receptions: list.reduce((a, p) => a + p.recW, 0),
    },
    yardsPerReception: ypr,
    unallocated,
  };
}

const byId = (a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
const sortRows = (rows) => rows.sort((a, b) => b.yds - a.yds || byId(a, b));

function allocateSide(events, side, pool, rules) {
  const drives = events.filter((e) => e.offense === side);
  const plays = drives.reduce((a, e) => a + e.plays, 0);
  const netYards = drives.reduce((a, e) => a + e.netYards, 0);
  const tdDrives = drives.filter((e) => e.outcome === "TD");
  if (!drives.length) {
    return { team: { abbr: pool.abbr, plays: 0, attempts: 0, completions: 0, carries: 0, netYards: 0, passYds: 0, rushYds: 0, unattributedYds: 0, unattributedDrives: [], tdDrives: [], passPlayShare: null, passYardShare: null }, lines: { passing: [], rushing: [], receiving: [] }, touchdowns: [] };
  }
  input(pool.passers.length > 0, "NO_PASSER", `${pool.abbr}: the official projection has no player with expected passing yards`);
  input(pool.rushers.length > 0, "NO_RUSHER", `${pool.abbr}: the official projection has no player with expected rushing yards`);
  input(pool.receivers.length > 0, "NO_RECEIVER", `${pool.abbr}: the official projection has no player with expected receptions`);

  // ── volume ──
  const E = pool.expected;
  const eAtt = E.receptions / rules.completionRate;
  const eCar = E.rushYds / rules.yardsPerCarry;
  const passPlayShare = eAtt / (eAtt + eCar);
  const attempts = Math.round(plays * passPlayShare);
  const carries = plays - attempts;
  const completions = Math.min(attempts, Math.round(attempts * rules.completionRate));

  // ── yards, drive by drive ──
  const yardShare = E.passYds / (E.passYds + E.rushYds);
  const share = completions === 0 ? 0 : carries === 0 ? 1 : yardShare;
  let passYds = 0;
  let rushYds = 0;
  let unattributedYds = 0;
  const unattributedDrives = [];
  for (const e of drives) {
    if (e.netYards > 0) {
      const p = Math.round(e.netYards * share);
      passYds += p;
      rushYds += e.netYards - p;
    } else {
      unattributedYds += e.netYards;
      unattributedDrives.push({ drive: e.index + 1, netYards: e.netYards });
    }
  }

  // ── players ──
  const ap = (total, list, w, cap = null) => {
    try {
      return apportion(total, list.map((p) => ({ id: p.playerId, w: w(p), cap: cap ? cap(p) : null })));
    } catch (err) {
      throw new AllocationError(ALLOCATION_ERROR_KIND.INVARIANT, "APPORTION", `${pool.abbr}: ${err.message}`);
    }
  };
  const att = ap(attempts, pool.passers, (p) => p.passW);
  const cmp = ap(completions, pool.passers, (p) => p.passW, (p) => att.get(p.playerId));
  const pYds = ap(passYds, pool.passers, (p) => (cmp.get(p.playerId) > 0 ? p.passW : 0));
  const car = ap(carries, pool.rushers, (p) => p.rushW);
  const rYds = ap(rushYds, pool.rushers, (p) => (car.get(p.playerId) > 0 ? p.rushW : 0));
  const tgt = ap(attempts, pool.receivers, (p) => p.recW);
  const rec = ap(completions, pool.receivers, (p) => p.recW, (p) => tgt.get(p.playerId));
  const cYds = ap(passYds, pool.receivers, (p) => (rec.get(p.playerId) > 0 ? p.recYdsW : 0));

  // ── touchdowns: only this side's offensive TD drives ──
  const slots = [];
  for (const p of pool.players.values()) {
    const c = car.get(p.playerId) ?? 0;
    const r = rec.get(p.playerId) ?? 0;
    if (c > 0 && p.rushTdW > 0) slots.push({ id: `${p.playerId}|RUSH`, playerId: p.playerId, type: "RUSH", w: p.rushTdW, cap: c });
    if (r > 0 && p.recTdW > 0) slots.push({ id: `${p.playerId}|REC`, playerId: p.playerId, type: "REC", w: p.recTdW, cap: r });
  }
  let tdCount;
  try {
    tdCount = apportion(tdDrives.length, slots);
  } catch (err) {
    throw new AllocationError(ALLOCATION_ERROR_KIND.INPUT, "TD_CAPACITY", `${pool.abbr}: ${tdDrives.length} TD drive(s) cannot be placed on the projection's scorers in this run (${err.message})`);
  }
  const leadPasser = [...pool.passers].sort((a, b) => (cmp.get(b.playerId) - cmp.get(a.playerId)) || byId(a, b))[0];
  const order = slots.filter((s) => tdCount.get(s.id) > 0).sort((a, b) => b.w - a.w || (a.id < b.id ? -1 : 1));
  const queue = order.flatMap((s) => Array.from({ length: tdCount.get(s.id) }, () => s));
  const touchdowns = tdDrives.map((e, k) => ({
    drive: e.index + 1, side, type: queue[k].type, scorerId: queue[k].playerId,
    passerId: queue[k].type === "REC" ? leadPasser.playerId : null,
  }));
  const tdOf = (pid, type) => touchdowns.filter((t) => t.type === type && t.scorerId === pid).length;
  const passTdOf = (pid) => touchdowns.filter((t) => t.passerId === pid).length;

  const name = (pid) => pool.players.get(pid)?.name ?? null;
  const lines = {
    passing: sortRows(pool.passers.filter((p) => att.get(p.playerId) > 0).map((p) => ({ playerId: p.playerId, name: name(p.playerId), att: att.get(p.playerId), cmp: cmp.get(p.playerId), yds: pYds.get(p.playerId), td: passTdOf(p.playerId) }))),
    rushing: sortRows(pool.rushers.filter((p) => car.get(p.playerId) > 0).map((p) => ({ playerId: p.playerId, name: name(p.playerId), car: car.get(p.playerId), yds: rYds.get(p.playerId), td: tdOf(p.playerId, "RUSH") }))),
    receiving: sortRows(pool.receivers.filter((p) => tgt.get(p.playerId) > 0).map((p) => ({ playerId: p.playerId, name: name(p.playerId), tgt: tgt.get(p.playerId), rec: rec.get(p.playerId), yds: cYds.get(p.playerId), td: tdOf(p.playerId, "REC") }))),
  };
  return {
    team: { abbr: pool.abbr, plays, attempts, completions, carries, netYards, passYds, rushYds, unattributedYds, unattributedDrives, tdDrives: tdDrives.map((e) => e.index + 1), passPlayShare, passYardShare: share },
    lines,
    touchdowns,
  };
}

const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);

/** The reconciliations every allocation must satisfy (also re-checked independently by consistency/checks.mjs). */
function verify(events, out) {
  const ids = [];
  for (const s of SIDES) {
    const { team: t, lines: L } = out.teams[s];
    const off = events.filter((e) => e.offense === s);
    const net = off.reduce((a, e) => a + e.netYards, 0);
    invariant(t.passYds + t.rushYds + t.unattributedYds === net, "YARDS_RECONCILE", `${t.abbr}: passing ${t.passYds} + rushing ${t.rushYds} + unattributed ${t.unattributedYds} ≠ drive net yards ${net}`);
    invariant(t.unattributedYds === off.filter((e) => e.netYards <= 0).reduce((a, e) => a + e.netYards, 0), "UNATTRIBUTED", `${t.abbr}: unattributed yards are not the drives with net ≤ 0`);
    invariant(t.attempts + t.carries === off.reduce((a, e) => a + e.plays, 0), "PLAYS_RECONCILE", `${t.abbr}: attempts + carries ≠ plays`);
    invariant(t.completions <= t.attempts, "CMP_LE_ATT", `${t.abbr}: completions ${t.completions} > attempts ${t.attempts}`);
    invariant(sum(L.passing, "att") === t.attempts && sum(L.passing, "cmp") === t.completions && sum(L.passing, "yds") === t.passYds, "PASSING_SUM", `${t.abbr}: passing lines do not sum to the team`);
    invariant(sum(L.receiving, "tgt") === t.attempts && sum(L.receiving, "rec") === t.completions && sum(L.receiving, "yds") === t.passYds, "RECEIVING_SUM", `${t.abbr}: receiving lines do not sum to the team`);
    invariant(sum(L.rushing, "car") === t.carries && sum(L.rushing, "yds") === t.rushYds, "RUSHING_SUM", `${t.abbr}: rushing lines do not sum to the team`);
    for (const r of L.passing) invariant(r.cmp <= r.att, "CMP_LE_ATT", `${r.playerId}: ${r.cmp}/${r.att}`);
    for (const r of L.receiving) invariant(r.rec <= r.tgt && r.td <= r.rec, "REC_LE_TGT", `${r.playerId}: ${r.rec} rec / ${r.tgt} tgt / ${r.td} TD`);
    for (const r of L.rushing) invariant(r.td <= r.car, "TD_LE_CAR", `${r.playerId}: ${r.td} TD on ${r.car} carries`);
    const tdDrives = off.filter((e) => e.outcome === "TD").map((e) => e.index + 1);
    const tds = out.touchdowns.filter((x) => x.side === s);
    invariant(JSON.stringify(tds.map((x) => x.drive)) === JSON.stringify(tdDrives), "TD_DRIVES", `${t.abbr}: touchdowns on drives ${tds.map((x) => x.drive)} ≠ TD drives ${tdDrives}`);
    invariant(sum(L.rushing, "td") + sum(L.receiving, "td") === tdDrives.length && sum(L.passing, "td") === sum(L.receiving, "td"), "TD_SUM", `${t.abbr}: player touchdowns ≠ TD drives`);
    for (const r of [...L.rushing, ...L.receiving]) invariant(r.td === 0 || r.yds >= r.td, "TD_SCORER_YARDS", `${r.playerId}: ${r.td} TD on ${r.yds} yards (a scoring play gains at least a yard)`);
    for (const k of ["passing", "rushing", "receiving"]) for (const r of L[k]) ids.push(r.playerId);
  }
  for (const id of ids) invariant(NFL_ATHLETE_ID.test(id), "PLAYER_ID", `${id} is not an nfl-athlete id`);
}

/**
 * @param {object} sample   one adapted, VALIDATED TheaterSample (adapter-nfl-sim-v2.mjs)
 * @param {object} manifest its TheaterManifest (event id, teams)
 * @param {object} snapshot the official forecast snapshot (`gtp.contract.official-forecast-snapshot@1`, NFL)
 * @returns {object} the allocation (plain JSON); throws AllocationError
 */
export function allocateNflPlayers(sample, manifest, snapshot, rules = ALLOCATION_RULES) {
  input(snapshot && typeof snapshot === "object", "NO_OFFICIAL_SNAPSHOT", "no official forecast snapshot for this event");
  input(snapshot.sport === "NFL" && Array.isArray(snapshot.players), "NO_OFFICIAL_SNAPSHOT", "not an NFL official snapshot with players");
  input(manifest && sample && sample.validation?.ok === true && Array.isArray(sample.events) && sample.events.length > 0, "SAMPLE", "a validated run with drives is required");
  input(sample.receiptId === manifest.receiptId, "RUN_BINDING", `sample of ${sample.receiptId} is not from receipt ${manifest.receiptId}`);
  input(String(snapshot.eventId) === String(manifest.eventId), "EVENT_MISMATCH", `snapshot is for ${snapshot.eventId}, run is for ${manifest.eventId}`);
  for (const s of SIDES) {
    input(snapshot[s]?.abbr === manifest.teams?.[s]?.abbr, "TEAM_MISMATCH", `${s}: snapshot ${snapshot[s]?.abbr ?? "?"} ≠ run ${manifest.teams?.[s]?.abbr ?? "?"}`);
  }
  const teams = {};
  const touchdowns = [];
  const unallocated = [];
  for (const s of SIDES) {
    const pool = officialPools(snapshot, manifest.teams[s].abbr);
    const r = allocateSide(sample.events, s, pool, rules);
    teams[s] = { team: r.team, lines: r.lines };
    touchdowns.push(...r.touchdowns);
    unallocated.push(...pool.unallocated.map((u) => ({ ...u, team: pool.abbr })));
  }
  touchdowns.sort((a, b) => a.drive - b.drive);
  const official = (snapshot.sources ?? []).filter((x) => x.role === "OFFICIAL").map((x) => ({ path: x.path, sha256: x.sha256, modelVersion: x.modelVersion }));
  const out = {
    version: ALLOCATION_VERSION,
    status: ALLOCATED_STATUS,
    label: ALLOCATED_LABEL,
    eventId: String(manifest.eventId),
    receiptId: manifest.receiptId,
    runIndex: sample.runIndex,
    snapshotId: snapshot.snapshotId ?? null,
    officialSources: official,
    rules: { ...rules },
    teams,
    touchdowns,
    unallocated,
  };
  verify(sample.events, out);
  return out;
}

/** Non-throwing wrapper: `{ ok: true, allocation }` or `{ ok: false, error: { kind, code, reason } }`. */
export function safeAllocateNflPlayers(sample, manifest, snapshot, rules = ALLOCATION_RULES) {
  try {
    return { ok: true, allocation: allocateNflPlayers(sample, manifest, snapshot, rules), error: null };
  } catch (e) {
    if (!(e instanceof AllocationError)) throw e;
    return { ok: false, allocation: null, error: { kind: e.kind, code: e.code, reason: String(e.detail) } };
  }
}
