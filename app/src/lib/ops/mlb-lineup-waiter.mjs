/**
 * THE MLB PREGAME LINEUP WAITER — a pure decider. No I/O: the schedule, the upstream lineups, the committed record,
 * the clock and the Actions run list are all arguments.
 *
 * WHY. `mlb-lineup-refresh.yml` rebuilds the full-game simulation once the real batting orders exist, and it is
 * driven only by hourly crons (15:30–00:30Z). Over 2026-10-10..18 GitHub delivered 0–7 of those slots a day and the
 * first afternoon run landed 17:53–22:31Z. On 10-18 not one of the 15:30–17:30 slots fired; a human dispatched the
 * refresh at 18:03Z and it captured both confirmed lineups (TB/CLE) at once. A cron cannot meet a lineup deadline.
 *
 * WHAT. Modelled on the NFL pregame waiter (lib/ops/pregame-free-refresh.mjs): any delivered trigger starts ONE
 * waiting job (concurrency group `mlb-lineup-waiter`, never cancelled). It polls the free StatsAPI about every ten
 * minutes from four hours before each game's first pitch, compares the posted batting orders with the record of the
 * lineups the committed simulation was ACTUALLY built from, and dispatches `mlb-lineup-refresh.yml` (no inputs) only
 * when a side has a newly confirmed or changed nine-man order that the committed simulation does not carry.
 *
 * THE COMMITTED RECORD. The refresh commits `data/internal/mlb/input-snapshots/<date>.json` beside the simulation:
 * per game and side, `source` ("confirmed" | prop-derived) and the nine `batterIds` it consumed. That is the
 * fingerprint's ground truth. When it is missing, the published simulation itself is read instead
 * (`completeness.awayLineupSource/homeLineupSource` + `players.batters[].battingOrder`).
 *
 * PROBABLE PITCHERS ARE NOT A TRIGGER. The simulation takes its starters from the morning BOARD
 * (board-adapter.ts → awayProbablePitcherId), which the refresh does not rebuild — a dispatch for a changed probable
 * would reproduce the same simulation and the stamp-only gate (#1088) would drop it. Only batting orders, which the
 * refresh re-captures in-run, can move the simulation.
 *
 * THE DECISION. One of
 *   DISPATCH — at least one side is owed, nothing blocks: dispatch the refresh now
 *   WAIT     — keep polling (`waitSeconds`); `reasons` says why (no window open, nothing owed, a writer running…)
 *   ALERT    — like WAIT (or DONE, see `next`), but `alerts` holds NEW alerts the runner must emit first
 *   DONE     — every game on the slate has started, is postponed, or there is no slate: exit cleanly
 * `alerts` may also ride on a DISPATCH; the runner always emits them. Every alert has a stable `key`, so a key in the
 * ledger is never raised twice (within a run, and across runs once the runner recovers the ledger).
 */

/** Founder-approved limits. Everything here is a constant a test pins. */
export const WAITER_LIMITS = Object.freeze({
  /** Start watching a game this many minutes before its first pitch. */
  MONITOR_LEAD_MIN: 240,
  /** Poll cadence (the runner adds ± POLL_JITTER_SECONDS). */
  POLL_SECONDS: 600,
  POLL_JITTER_SECONDS: 90,
  /** A refresh dispatched closer than this to first pitch lands after it (the refresh takes ~1.5 min, plus queue). */
  MIN_DISPATCH_LEAD_MIN: 10,
  /** No confirmed-lineup simulation by this lead for a side posted upstream → alert. */
  ALERT_LEAD_MIN: 60,
  /** Dispatches of mlb-lineup-refresh per ET slate (any workflow_dispatch of it counts, manual ones included). */
  MAX_DISPATCHES_PER_SLATE: 6,
  /** Minimum spacing between two dispatches. */
  MIN_SPACING_MIN: 15,
  /** A refresh that finished this recently may not have pushed yet — wait instead of judging stale main. */
  REFRESH_SETTLE_MIN: 3,
  /** A game that started within this window is checked once for "started without a confirmed lineup". */
  STARTED_ALERT_GRACE_MIN: 90,
  /** Never dispatch this close to ET midnight: the refresh resolves its own slate date and would roll to tomorrow. */
  ET_MIDNIGHT_GUARD_MIN: 20,
  /** A doubleheader game 2 with a TBD start is estimated at game 1's first pitch plus this. */
  TBD_GAME_OFFSET_MIN: 200,
  /**
   * A run that arrives with the first window further away than this exits (no relay) and leaves the watch to a later
   * delivery — as the NFL waiter's HORIZON does. Equal to the runner's loop budget, so an arrival inside it sleeps to
   * the window instead. Measured 2026-10-08..18: mlb-daily-production and publication-watchdog completions on main
   * landed inside this horizon before every slate's first window.
   */
  HORIZON_MIN: 330,
  /** Hard cap on StatsAPI calls in one run (the runner enforces it). */
  STATSAPI_CALL_CAP: 400,
});

export const WAITER = Object.freeze({ WAIT: "WAIT", DISPATCH: "DISPATCH", DONE: "DONE", ALERT: "ALERT" });

const MIN = 60_000;
const SIDES = Object.freeze(["away", "home"]);
const FAILED = new Set(["failure", "timed_out", "startup_failure"]);

// ── pure helpers ─────────────────────────────────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit, hex — deterministic, dependency-free, enough to tell two batting orders apart. */
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The fingerprint of one side's batting order: the nine player ids in slot order. null for anything not a full nine. */
export function lineupFingerprint(ids) {
  if (!Array.isArray(ids) || ids.length !== 9) return null;
  if (!ids.every((x) => Number.isInteger(Number(x)) && Number(x) > 0)) return null;
  if (new Set(ids.map(Number)).size !== 9) return null;
  return fnv1a(ids.map(Number).join(","));
}

/** The ET calendar date (YYYY-MM-DD) of an instant. */
export function etDate(ms) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const g = (t) => p.find((x) => x.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Minutes until the next ET midnight from an instant. */
export function minutesToEtMidnight(ms) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return 24 * 60 - (h * 60 + m);
}

/**
 * Normalise a StatsAPI `/api/v1/schedule?sportId=1&date=…&hydrate=lineups` payload into the decider's games, and
 * the hydrated lineups into upstream orders. Pure.
 */
export function normalizeSchedule(json) {
  const games = [];
  const upstream = {};
  for (const d of json?.dates ?? []) {
    for (const g of d?.games ?? []) {
      if (!Number.isFinite(g?.gamePk)) continue;
      games.push({
        gamePk: g.gamePk,
        firstPitch: g.gameDate ?? null,
        officialDate: g.officialDate ?? d.date ?? null,
        abstractGameState: g.status?.abstractGameState ?? null,
        codedGameState: g.status?.codedGameState ?? null,
        detailedState: g.status?.detailedState ?? null,
        startTimeTBD: g.status?.startTimeTBD === true,
        doubleHeader: g.doubleHeader ?? "N",
        gameNumber: g.gameNumber ?? 1,
        awayTeamId: g.teams?.away?.team?.id ?? null,
        homeTeamId: g.teams?.home?.team?.id ?? null,
        rescheduleDate: g.rescheduleDate ?? g.rescheduleGameDate ?? null,
      });
      const ids = (arr) => (Array.isArray(arr) ? arr.map((p) => p?.id).filter((x) => Number.isFinite(x)) : []);
      upstream[g.gamePk] = { away: ids(g.lineups?.awayPlayers), home: ids(g.lineups?.homePlayers), source: "schedule" };
    }
  }
  return { games, upstream };
}

/** The upstream order from a `/api/v1/game/{pk}/boxscore` payload — the same `battingOrder` the refresh's capture reads. */
export function boxscoreOrders(json) {
  const ids = (t) => (Array.isArray(t?.battingOrder) ? t.battingOrder.map(Number).filter((x) => Number.isFinite(x)) : []);
  return { away: ids(json?.teams?.away), home: ids(json?.teams?.home), source: "boxscore" };
}

/**
 * The committed record of the lineups each simulated game was built from.
 * Primary: data/internal/mlb/input-snapshots/<date>.json (the provenance the refresh writes).
 * Fallback: the published simulation's own completeness + batters (when the snapshot lacks a game).
 * @returns {Record<string, {away: {source, fingerprint}, home: {source, fingerprint}, from}>}
 */
export function committedLineups({ inputSnapshot, simulation }) {
  const out = {};
  for (const g of simulation?.games ?? []) {
    if (!Number.isFinite(g?.gamePk)) continue;
    const c = g.completeness ?? {};
    const bat = Array.isArray(g.players?.batters) ? g.players.batters : [];
    const side = (team, source) => {
      const order = bat.filter((b) => b.team === team && Number.isFinite(b.battingOrder)).sort((a, b) => a.battingOrder - b.battingOrder);
      const okSlots = order.length === 9 && order.every((b, i) => b.battingOrder === i + 1);
      return { source: source ?? null, fingerprint: source === "confirmed" && okSlots ? lineupFingerprint(order.map((b) => b.playerId)) : null };
    };
    out[g.gamePk] = { away: side(g.awayTeam, c.awayLineupSource), home: side(g.homeTeam, c.homeLineupSource), from: "simulation", firstPitch: g.firstPitch ?? null };
  }
  for (const g of inputSnapshot?.games ?? []) {
    if (!Number.isFinite(g?.gamePk)) continue;
    const side = (s) => ({ source: s?.source ?? null, fingerprint: s?.source === "confirmed" ? lineupFingerprint(s?.batterIds) : null });
    out[g.gamePk] = { away: side(g.away), home: side(g.home), from: "input-snapshot", firstPitch: g.firstPitch ?? out[g.gamePk]?.firstPitch ?? null };
  }
  return out;
}

/** Is this game off the slate (postponed / cancelled / suspended before it began)? */
export function isPostponed(g) {
  const coded = String(g?.codedGameState ?? "");
  const det = String(g?.detailedState ?? "");
  return coded === "D" || coded === "C" || /postponed|cancel+ed/i.test(det) || (/suspended/i.test(det) && g?.abstractGameState !== "Live");
}

/** Has this game started? Live/Final from StatsAPI, or the clock past its first pitch (by either source). */
function hasStarted(g, effFirstPitch, boardFirstPitch, now) {
  if (g.abstractGameState === "Live" || g.abstractGameState === "Final") return true;
  if (g.startTimeTBD) return false; // a TBD game starts when StatsAPI says it is Live
  const candidates = [effFirstPitch, boardFirstPitch].filter(Number.isFinite);
  return candidates.some((t) => now >= t);
}

// ── the decider ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param o.nowIso           the run's clock
 * @param o.slateDate        the ET slate date being watched (YYYY-MM-DD)
 * @param o.games            normalizeSchedule(...).games for that date (re-read every cycle)
 * @param o.upstream         { [gamePk]: { away: number[], home: number[], source } } — the posted orders
 * @param o.committed        committedLineups(...) for that date (from freshly pulled main)
 * @param o.boardFirstPitch  { [gamePk]: ISO } from the committed board — the refresh's own pre-event boundary
 * @param o.boardPresent     whether app/public/data/mlb/boards/<date>.json exists (no board → the refresh no-ops)
 * @param o.refreshRuns      recent mlb-lineup-refresh runs [{ databaseId, createdAt, updatedAt, status, conclusion, event }]
 * @param o.activeWriters    in-flight/queued runs of any gtp-generated-artifacts writer [{ workflowName, status }]; null = not checked
 * @param o.ledger           { dispatches: [{ at, fingerprint, sides: [key] }], alerted: [key] } — this run's memory plus what was recovered
 * @param o.limits           overrides of WAITER_LIMITS (tests, repo variables)
 */
export function decideLineupWaiter(o) {
  const L = { ...WAITER_LIMITS, ...(o?.limits ?? {}) };
  const now = Date.parse(o?.nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("decideLineupWaiter: nowIso required");
  const slateDate = o?.slateDate ?? etDate(now);
  const upstream = o?.upstream ?? {};
  const committed = o?.committed ?? {};
  const boardFp = o?.boardFirstPitch ?? {};
  const ledger = { dispatches: o?.ledger?.dispatches ?? [], alerted: new Set(o?.ledger?.alerted ?? []) };
  const dispatchedSides = new Set(ledger.dispatches.flatMap((d) => d.sides ?? []));
  const reasons = [];
  const alerts = [];
  const alert = (key, message) => { if (!ledger.alerted.has(key) && !alerts.some((a) => a.key === key)) alerts.push({ key, message }); };

  // ── classify every game on the slate ──
  const raw = (o?.games ?? []).filter((g) => !g.officialDate || g.officialDate === slateDate);
  const byTeams = new Map();
  for (const g of raw) {
    const k = `${g.awayTeamId}-${g.homeTeamId}`;
    if (!byTeams.has(k)) byTeams.set(k, []);
    byTeams.get(k).push(g);
  }
  const table = [];
  for (const g of raw) {
    const scheduled = Date.parse(g.firstPitch ?? "");
    let eff = scheduled;
    if (g.startTimeTBD) {
      // Doubleheader game 2: "TBD" (≈ 30–45 min after game 1 ends). Estimate from game 1, never earlier than listed.
      const sibs = (byTeams.get(`${g.awayTeamId}-${g.homeTeamId}`) ?? []).filter((x) => x.gamePk !== g.gamePk && !x.startTimeTBD && (x.gameNumber ?? 1) < (g.gameNumber ?? 2));
      const g1 = Math.min(...sibs.map((x) => Date.parse(x.firstPitch ?? "")).filter(Number.isFinite));
      eff = Math.max(Number.isFinite(scheduled) ? scheduled : -Infinity, Number.isFinite(g1) ? g1 + L.TBD_GAME_OFFSET_MIN * MIN : -Infinity);
      if (!Number.isFinite(eff)) eff = NaN;
    }
    const boardT = Date.parse(boardFp[g.gamePk] ?? "");
    const row = { gamePk: g.gamePk, firstPitch: Number.isFinite(eff) ? new Date(eff).toISOString() : null, tbd: !!g.startTimeTBD, doubleHeader: g.doubleHeader, gameNumber: g.gameNumber, sides: {} };
    if (isPostponed(g)) { row.state = "POSTPONED"; table.push(row); continue; }
    // The refresh simulates only the games on the committed board; a game added to the slate after it (a makeup, a
    // re-slotted postponement) cannot be refreshed, so it is reported, never dispatched for.
    if (o?.boardPresent && Object.keys(boardFp).length && !boardFp[g.gamePk]) { row.state = "NOT_ON_BOARD"; table.push(row); continue; }
    if (hasStarted(g, eff, boardT, now)) {
      row.state = "STARTED";
      const startedAt = Math.min(...[eff, boardT].filter(Number.isFinite));
      if (Number.isFinite(startedAt) && now - startedAt <= L.STARTED_ALERT_GRACE_MIN * MIN) {
        const missing = SIDES.filter((s) => !committed[g.gamePk]?.[s]?.fingerprint);
        if (missing.length) alert(`started:${slateDate}:${g.gamePk}`, `game ${g.gamePk} started without a confirmed-lineup simulation for ${missing.join(" + ")} (lineup never posted upstream before first pitch, or never refreshed)`);
      }
      table.push(row);
      continue;
    }
    // The dispatch deadline honours BOTH clocks: StatsAPI's (re-read each cycle — a moved first pitch) and the
    // board's (the refresh judges "started" against the board's gameDate, so past it a refresh cannot help).
    const deadline = Math.min(...[eff, g.startTimeTBD ? NaN : boardT].filter(Number.isFinite));
    const lead = (deadline - now) / MIN;
    row.leadMin = Number.isFinite(lead) ? Math.round(lead) : null;
    row.windowOpen = Number.isFinite(lead) ? lead <= L.MONITOR_LEAD_MIN : false;
    row.dispatchable = row.windowOpen && lead >= L.MIN_DISPATCH_LEAD_MIN;
    row.opensAt = Number.isFinite(deadline) ? new Date(deadline - L.MONITOR_LEAD_MIN * MIN).toISOString() : null;
    row.state = row.windowOpen ? "WATCHING" : "BEFORE_WINDOW";
    for (const s of SIDES) {
      const up = lineupFingerprint(upstream[g.gamePk]?.[s]);
      const com = committed[g.gamePk]?.[s]?.fingerprint ?? null;
      const key = up ? `${g.gamePk}:${s}:${up}` : null;
      const st = !up ? "NOT_POSTED" : up === com ? "CURRENT" : "OWED";
      row.sides[s] = { upstream: up, committed: com, status: st, key };
      if (st === "OWED" && row.windowOpen && !g.startTimeTBD && Number.isFinite(lead) && lead <= L.ALERT_LEAD_MIN) {
        alert(`t60:${key}`, `game ${g.gamePk} ${s}: confirmed lineup posted upstream but no simulation built from it at T-${Math.max(0, Math.round(lead))} min`);
      }
    }
    table.push(row);
  }

  const live = table.filter((r) => r.state === "WATCHING" || r.state === "BEFORE_WINDOW");
  const finish = (decision, extra = {}) => {
    const out = { decision, slateDate, reasons, alerts, games: table, waitSeconds: 0, ...extra };
    if (alerts.length && decision !== WAITER.DISPATCH) return { ...out, decision: WAITER.ALERT, next: decision };
    return out;
  };

  // ── refresh failures (any trigger) on this slate ──
  const runs = (o?.refreshRuns ?? []).filter((r) => etDate(Date.parse(r.createdAt ?? "")) === slateDate);
  for (const r of runs) {
    if (r.status === "completed" && FAILED.has(r.conclusion)) alert(`refresh-failed:${r.databaseId}`, `mlb-lineup-refresh run ${r.databaseId} (${r.event}) concluded ${r.conclusion}`);
  }

  // A side the waiter already dispatched for, whose refresh has completed since, and which main still does not
  // carry: the refresh did not take it. Say so once; never re-dispatch the same fingerprint (that is a loop).
  for (const d of ledger.dispatches) {
    const doneAfter = runs.some((r) => r.status === "completed" && r.conclusion === "success" && Date.parse(r.createdAt) >= Date.parse(d.at) - MIN && Date.parse(r.updatedAt ?? r.createdAt) + L.REFRESH_SETTLE_MIN * MIN <= now);
    if (!doneAfter) continue;
    for (const k of d.sides ?? []) {
      const [pk, s] = k.split(":");
      const row = live.find((r) => String(r.gamePk) === pk);
      if (row?.sides?.[s]?.key === k && row.sides[s].status === "OWED") alert(`stalled:${k}`, `game ${pk} ${s}: a refresh completed after the dispatch for this lineup, yet main still does not carry it`);
    }
  }

  if (!raw.length) { reasons.push(`no MLB games on the ${slateDate} slate`); return finish(WAITER.DONE); }
  if (!live.length) { reasons.push(`every game on ${slateDate} has started or is postponed — nothing left to watch`); return finish(WAITER.DONE); }

  const pollWait = L.POLL_SECONDS;
  const watching = live.filter((r) => r.windowOpen);
  if (!watching.length) {
    const opens = Math.min(...live.map((r) => Date.parse(r.opensAt ?? "")).filter(Number.isFinite));
    if (!Number.isFinite(opens)) { reasons.push("no game has a known first pitch yet (TBD) — re-reading the schedule"); return finish(WAITER.WAIT, { waitSeconds: pollWait }); }
    reasons.push(`no monitoring window open — the first opens at ${new Date(opens).toISOString()} (T-${L.MONITOR_LEAD_MIN})`);
    if ((opens - now) / MIN > L.HORIZON_MIN) {
      reasons.push(`more than ${L.HORIZON_MIN} min away — left to a later trigger (this run exits without relaying)`);
      return finish(WAITER.WAIT, { waitSeconds: Math.round((opens - now) / 1000), leaveToLaterTrigger: true });
    }
    return finish(WAITER.WAIT, { waitSeconds: Math.max(60, Math.round((opens - now) / 1000)) });
  }

  // ── what is owed ──
  const owed = watching.filter((r) => r.dispatchable).flatMap((r) => SIDES.filter((s) => r.sides[s].status === "OWED").map((s) => r.sides[s].key));
  const fresh = owed.filter((k) => !dispatchedSides.has(k));
  const attempted = owed.filter((k) => dispatchedSides.has(k));
  if (attempted.length) reasons.push(`already dispatched once for ${attempted.join(", ")} — never twice for the same fingerprint`);
  if (!fresh.length) {
    const notPosted = watching.flatMap((r) => SIDES.filter((s) => r.sides[s].status === "NOT_POSTED").map((s) => `${r.gamePk}:${s}`));
    reasons.push(notPosted.length ? `waiting for ${notPosted.length} side(s) to post: ${notPosted.join(", ")}` : "every posted lineup is already in the committed simulation");
    return finish(WAITER.WAIT, { waitSeconds: pollWait });
  }
  const fingerprint = fnv1a(fresh.slice().sort().join("|"));

  // ── gates, in order: each is a WAIT, never a skip ──
  if (o?.boardPresent === false) { reasons.push(`no board for ${slateDate} yet — the refresh would no-op`); return finish(WAITER.WAIT, { waitSeconds: pollWait, owed: fresh }); }
  if (minutesToEtMidnight(now) <= L.ET_MIDNIGHT_GUARD_MIN) { reasons.push("within the ET-midnight guard — a refresh started now could resolve tomorrow's slate"); return finish(WAITER.WAIT, { waitSeconds: pollWait, owed: fresh }); }

  const inflight = (o?.refreshRuns ?? []).filter((r) => r.status && r.status !== "completed");
  if (inflight.length) { reasons.push(`an mlb-lineup-refresh run is ${inflight[0].status} — re-deciding on what it commits`); return finish(WAITER.WAIT, { waitSeconds: 60, owed: fresh }); }
  const settling = runs.find((r) => r.status === "completed" && Date.parse(r.updatedAt ?? r.createdAt) + L.REFRESH_SETTLE_MIN * MIN > now);
  if (settling) { reasons.push(`mlb-lineup-refresh run ${settling.databaseId} finished under ${L.REFRESH_SETTLE_MIN} min ago — re-deciding on its push`); return finish(WAITER.WAIT, { waitSeconds: 60, owed: fresh }); }

  const dispatchRuns = runs.filter((r) => r.event === "workflow_dispatch");
  const ledgerToday = ledger.dispatches.filter((d) => etDate(Date.parse(d.at)) === slateDate);
  const count = Math.max(dispatchRuns.length, ledgerToday.length);
  if (count >= L.MAX_DISPATCHES_PER_SLATE) {
    alert(`cap:${slateDate}`, `dispatch cap reached (${count}/${L.MAX_DISPATCHES_PER_SLATE}) with ${fresh.length} side(s) still owed: ${fresh.join(", ")}`);
    reasons.push(`per-slate dispatch cap reached (${count}/${L.MAX_DISPATCHES_PER_SLATE})`);
    return finish(WAITER.WAIT, { waitSeconds: pollWait, owed: fresh });
  }
  const last = Math.max(-Infinity, ...dispatchRuns.map((r) => Date.parse(r.createdAt)), ...ledgerToday.map((d) => Date.parse(d.at)));
  const sinceLast = (now - last) / MIN;
  if (sinceLast < L.MIN_SPACING_MIN) {
    reasons.push(`last dispatch ${Math.round(sinceLast)} min ago — spacing is ${L.MIN_SPACING_MIN} min`);
    return finish(WAITER.WAIT, { waitSeconds: Math.max(30, Math.round((L.MIN_SPACING_MIN - sinceLast) * 60)), owed: fresh });
  }
  if (o?.activeWriters == null) { reasons.push("writer queue not checked yet — check it, then re-decide"); return finish(WAITER.WAIT, { waitSeconds: 0, owed: fresh, needsWriterCheck: true }); }
  if (o.activeWriters.length) {
    reasons.push(`a gtp-generated-artifacts writer is ${o.activeWriters[0].status}: ${[...new Set(o.activeWriters.map((w) => w.workflowName))].join(", ")} — waiting, then re-deciding on fresh main`);
    return finish(WAITER.WAIT, { waitSeconds: 60, owed: fresh });
  }

  reasons.push(`${fresh.length} side(s) newly confirmed or changed upstream and not in the committed simulation: ${fresh.join(", ")}`);
  return finish(WAITER.DISPATCH, { owed: fresh, fingerprint, dispatchNumber: count + 1 });
}
