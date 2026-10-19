/**
 * THE NBA POST-FINAL WAITER — a pure decider. No I/O: the ESPN scoreboard, the committed finals record, the clock and
 * the Actions run list are all arguments.
 *
 * WHY. `nba-results-refresh.yml` is the ONLY writer of app/public/data/nba/results/{latest,finals-<season>}.json —
 * what /nba shows as finals and what the experimental grader reads. Its clocks are crons (`41 * * * *`,
 * `11,26 0-7 * * *`) plus workflow_run on publication-watchdog, which is dense only ~12–22Z. Between 00Z and 12Z only
 * the crons fire, and GitHub delivered 3–5 runs in that span on 10-18 and 10-19. US evening games end ~01:30–05:30Z,
 * so a final can sit on ESPN for hours before it is published — the failure NFL had on 10-18 (NO@NYG).
 *
 * WHAT. Modelled on the MLB lineup waiter (lib/ops/mlb-lineup-waiter.mjs): any delivered trigger starts ONE waiting
 * job (concurrency group `nba-finals-waiter`, never cancelled). From the night's earliest tip + WINDOW_AFTER_TIP_MIN
 * it polls the free ESPN NBA scoreboard about every five minutes and compares every game ESPN shows FINAL with the
 * committed finals record. A final the record does not hold yet → dispatch `nba-results-refresh.yml` (no inputs).
 * The waiter never writes data and never touches a final: the refresh's own write-once / conflict rules stay the
 * only writer.
 *
 * THE NIGHT. A slate is the ET date of (now − NIGHT_ROLLOVER_HOURS): a game that tips at 10:30 PM ET and ends at
 * 1 AM ET belongs to the night it tipped on, and the next night begins at 8 AM ET. ESPN's `?dates=YYYYMMDD` groups
 * NBA games by the same US date (the 01:30Z OKC@SA tip is on 20261020's scoreboard).
 *
 * THE COMMITTED RECORD. app/public/data/nba/results/finals-<season>.json: `finals[]` (write-once rows, by
 * providerEventId), `conflicts[]` (a later observation that disagrees with a recorded final — the recorded row
 * stands, review) and `refused[]` (rows the record would not take: identity disagreement). A final that is in
 * `refused`/`conflicts` without being in `finals` is HELD: one alert, never a dispatch — a refresh cannot change it.
 *
 * THE DECISION. One of
 *   DISPATCH — at least one final is owed and nothing blocks: dispatch the refresh now
 *   WAIT     — keep polling (`waitSeconds`); `reasons` says why (window not open, a refresh in flight, spacing…)
 *   ALERT    — like WAIT (or DONE, see `next`), but `alerts` holds NEW alerts the runner must emit first
 *   DONE     — every game of the night is in the committed record, postponed/cancelled, held, or given up
 * Every alert has a stable `key`; a key in the ledger is never raised twice. `observations` tells the runner what to
 * remember across runs (first time a final was seen; a FINAL → in-progress regression).
 *
 * DEDUPE AND RETRY. A final is keyed `<eventId>:<fingerprint>` (the fingerprint covers both team ids and both
 * scores). A key is dispatched for once — unless every refresh created after that dispatch ended without success
 * (cancelled, failed, timed out): then it is retried, at most MAX_ATTEMPTS_PER_KEY attempts in all, with an alert
 * each way. A refresh that SUCCEEDED after the dispatch while the record still lacks the final is STALLED: one alert,
 * never a re-dispatch (a loop). An ESPN regression (FINAL → in progress) expires the attempts made before it, so
 * when the game goes final again it is owed afresh (still bounded by the per-night cap and the spacing).
 *
 * THE REFRESH'S OWN TRANSPORT. The refresh reads ESPN's MONTH scoreboard (`?dates=YYYYMM`, via
 * lib/sports/espn-scoreboard-window.mjs) over its 9-day window. The waiter polls the cheap day form, and before a
 * dispatch confirms the final on the month form (`confirm`, like the MLB waiter's boxscore check) — a refresh run
 * against a month feed that still shows the game in progress would capture nothing.
 */

/** Founder-approved limits. Everything here is a constant a test pins. */
export const WAITER_LIMITS = Object.freeze({
  /** Polling starts this long after the night's earliest tip (an NBA game lasts ~2 h 15 – 2 h 30). */
  WINDOW_AFTER_TIP_MIN: 100,
  /** Poll cadence (the runner adds ± POLL_JITTER_SECONDS). */
  POLL_SECONDS: 300,
  POLL_JITTER_SECONDS: 45,
  /** Dispatches of nba-results-refresh per night (any workflow_dispatch of it counts, manual ones included). */
  MAX_DISPATCHES_PER_NIGHT: 6,
  /** Minimum spacing between two dispatches. */
  MIN_SPACING_MIN: 10,
  /** A refresh that finished this recently may not be on the pulled main yet — wait instead of judging it. */
  REFRESH_SETTLE_MIN: 2,
  /** A final first seen on ESPN this long ago and still not in the committed record → alert. */
  NOT_COMMITTED_ALERT_MIN: 45,
  /** A game still not final (or not recorded) this long after its tip is given up for the night, with an alert. */
  GIVE_UP_AFTER_TIP_MIN: 480,
  /**
   * A run that arrives with the night's first window further away than this exits (no relay) and leaves the watch
   * to a later delivery. Equal to the runner's loop budget, so an arrival inside it sleeps to the window instead.
   */
  HORIZON_MIN: 330,
  /** Hard cap on ESPN calls in one run (the runner enforces it). 66 five-minute cycles + confirmations fit. */
  ESPN_CALL_CAP: 200,
  /** Attempts per final fingerprint whose refresh ended without success (cancelled/failed), then alerted. */
  MAX_ATTEMPTS_PER_KEY: 2,
  /** ESPN answered with no games while the committed schedule lists some for the night: re-read this soon. */
  EMPTY_SCOREBOARD_RETRY_SECONDS: 120,
  /** The night is the ET date of (now − this): late games stay on the night they tipped on until 8 AM ET. */
  NIGHT_ROLLOVER_HOURS: 8,
});

export const WAITER = Object.freeze({ WAIT: "WAIT", DISPATCH: "DISPATCH", DONE: "DONE", ALERT: "ALERT" });

const MIN = 60_000;
const FAILED = new Set(["failure", "timed_out", "startup_failure"]);
/** A refresh that ended like this did not run to its commit: the final it was dispatched for was never taken. */
const NOT_TAKEN = new Set(["cancelled", "failure", "timed_out", "startup_failure", "skipped", "stale"]);
/** Date.parse that never lets an invalid or missing timestamp into arithmetic (NaN → null). */
const ms = (x) => { const t = Date.parse(x ?? ""); return Number.isFinite(t) ? t : null; };

// ── pure helpers ─────────────────────────────────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit, hex — deterministic, dependency-free. */
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The ET calendar date (YYYY-MM-DD) of an instant. */
export function etDate(t) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t));
  const g = (k) => p.find((x) => x.type === k)?.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** The NBA night an instant belongs to: the ET date of (t − NIGHT_ROLLOVER_HOURS). */
export function nightOf(t, rolloverHours = WAITER_LIMITS.NIGHT_ROLLOVER_HOURS) {
  return etDate(t - rolloverHours * 3600_000);
}

/** The NBA season of an ET date ("2026-27"): August starts a new season — as lib/sports/nba/finals-record.mjs. */
export function seasonOf(dateEt) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(dateEt ?? ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  const start = mo >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The same "completed" test the refresh's capture applies (capture-nba-results.mjs, current-results.mjs). */
export const isFinalStatus = (name) => /^STATUS_FINAL/.test(String(name ?? ""));
/** Off the night: postponed, cancelled, suspended, forfeited — nothing will be final tonight. */
export const isOffStatus = (name) => /POSTPONED|CANCEL|SUSPENDED|FORFEIT/i.test(String(name ?? ""));

/** A final's fingerprint: both team ids and both scores. A corrected score is a NEW fingerprint. */
export function finalFingerprint(g) {
  return fnv1a(`${g.eventId}|h${g.homeId}:${g.homeScore}|a${g.awayId}:${g.awayScore}`);
}

/**
 * Normalise an ESPN scoreboard payload (day or month form) into the decider's games. Pure. Rows without an id are
 * dropped; a score that is not a number is null (the refresh's adapter quarantines such a final).
 */
export function normalizeScoreboard(json) {
  const out = [];
  for (const e of json?.events ?? []) {
    const id = e?.id == null ? "" : String(e.id);
    if (!id) continue;
    const c = e.competitions?.[0];
    const side = (role) => c?.competitors?.find((t) => t?.homeAway === role) ?? null;
    const H = side("home"), A = side("away");
    const score = (x) => (x?.score != null && x.score !== "" && Number.isFinite(Number(x.score)) ? Number(x.score) : null);
    out.push({
      eventId: id,
      shortName: e.shortName ?? null,
      tip: e.date ?? null,
      statusName: e.status?.type?.name ?? null,
      seasonType: e.season?.type ?? null,
      homeId: H?.team?.id != null ? String(H.team.id) : null,
      awayId: A?.team?.id != null ? String(A.team.id) : null,
      homeScore: score(H),
      awayScore: score(A),
    });
  }
  return out;
}

/**
 * What the committed finals record holds. `finals`: eventId → the recorded final; `held`: eventId → why a final is
 * kept out of `finals` (refused) or under review (conflicts).
 */
export function committedFinals(record) {
  const finals = {};
  for (const f of record?.finals ?? []) {
    if (f?.providerEventId == null) continue;
    finals[String(f.providerEventId)] = { ftHome: f.ftHome, ftAway: f.ftAway, homeId: f.home?.providerTeamId ?? null, awayId: f.away?.providerTeamId ?? null };
  }
  const held = {};
  for (const r of record?.refused ?? []) if (r?.providerEventId != null) held[String(r.providerEventId)] = `refused by the finals record: ${r.reason ?? "no reason recorded"}`;
  for (const c of record?.conflicts ?? []) if (c?.providerEventId != null) held[String(c.providerEventId)] ??= `under review in the finals record's conflicts: ${c.note ?? "a disagreeing observation"}`;
  return { present: !!record && Array.isArray(record.finals), finals, held };
}

/**
 * Why the refresh's adapter (lib/sports/nba/current-results.mjs) would quarantine this final, or null. Diagnostic
 * only — the waiter still dispatches (latest.json publishes the final either way); it explains a stall.
 */
export function adapterQuarantineReason(g, scheduleIndex) {
  if (scheduleIndex && !scheduleIndex[g.eventId]) return "no committed schedule capture carries this event id (no schedule lineage)";
  if (!Number.isInteger(g.homeScore) || !Number.isInteger(g.awayScore)) return "FINAL without integer points";
  if (g.homeScore === g.awayScore) return `final ${g.homeScore}-${g.awayScore} is tied`;
  const st = scheduleIndex?.[g.eventId]?.seasonType;
  if (st != null && g.seasonType != null && st !== g.seasonType) return `seasonType disagrees (schedule ${st}, scoreboard ${g.seasonType})`;
  return null;
}

// ── the decider ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param o.nowIso         the run's clock
 * @param o.slateDate      the night being watched (YYYY-MM-DD; default nightOf(now))
 * @param o.games          normalizeScoreboard(day form) for that night (re-read every cycle)
 * @param o.confirm        { [eventId]: game } from the MONTH form (the refresh's transport); null/undefined = not
 *                         checked yet (a would-be DISPATCH returns `needsConfirm` instead)
 * @param o.committed      committedFinals(record) from freshly pulled main
 * @param o.scheduleTips   { [eventId]: { tip, seasonType } } from the committed schedule capture — input sanity and
 *                         stall diagnostics (optional)
 * @param o.refreshRuns    recent nba-results-refresh runs [{ databaseId, createdAt, updatedAt, status, conclusion, event }]
 * @param o.ledger         { dispatches: [{ at, fingerprint, sides: [key], unconfirmed? }], alerted: [key],
 *                           finalSeen: [{ eventId, at }], regressions: [{ eventId, at }] }
 * @param o.limits         overrides of WAITER_LIMITS (tests, flags)
 */
export function decideFinalsWaiter(o) {
  const L = { ...WAITER_LIMITS, ...(o?.limits ?? {}) };
  const now = Date.parse(o?.nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("decideFinalsWaiter: nowIso required");
  const slateDate = o?.slateDate ?? nightOf(now, L.NIGHT_ROLLOVER_HOURS);
  const committed = o?.committed ?? { present: false, finals: {}, held: {} };
  const recorded = committed.finals ?? {};
  const held = committed.held ?? {};
  const sched = o?.scheduleTips ?? null;
  const ledger = {
    dispatches: o?.ledger?.dispatches ?? [],
    alerted: new Set(o?.ledger?.alerted ?? []),
    finalSeen: (o?.ledger?.finalSeen ?? []).filter((x) => ms(x?.at) != null),
    regressions: (o?.ledger?.regressions ?? []).filter((x) => ms(x?.at) != null),
  };
  const reasons = [];
  const alerts = [];
  const observations = { finalSeen: [], regressed: [] };
  const alert = (key, message) => { if (!ledger.alerted.has(key) && !alerts.some((a) => a.key === key)) alerts.push({ key, message }); };

  const lastRegression = (id) => Math.max(-Infinity, ...ledger.regressions.filter((r) => String(r.eventId) === id).map((r) => ms(r.at)));
  /** When ESPN was first seen showing this game final, since its last regression (null = not seen yet). */
  const finalSince = (id) => {
    const lr = lastRegression(id);
    const t = ledger.finalSeen.filter((x) => String(x.eventId) === id && ms(x.at) > lr).map((x) => ms(x.at));
    return t.length ? Math.min(...t) : null;
  };

  // ── refresh runs and what became of each earlier dispatch (the ledger) ──
  const runs = (o?.refreshRuns ?? []).filter((r) => ms(r?.createdAt) != null);
  const nightRuns = runs.filter((r) => nightOf(ms(r.createdAt), L.NIGHT_ROLLOVER_HOURS) === slateDate);
  for (const r of nightRuns) {
    if (r.status === "completed" && FAILED.has(r.conclusion)) alert(`refresh-failed:${r.databaseId}`, `nba-results-refresh run ${r.databaseId} (${r.event}) concluded ${r.conclusion}`);
  }
  const settled = (r) => ms(r.updatedAt ?? r.createdAt) != null && ms(r.updatedAt ?? r.createdAt) + L.REFRESH_SETTLE_MIN * MIN <= now;
  const runsAfter = (at) => runs.filter((r) => ms(r.createdAt) >= at - MIN);
  //   LANDED  — a refresh created at/after the dispatch succeeded (and has had time to push): main is the answer;
  //   PENDING — a refresh created after it is still running, or none has appeared yet (never re-dispatch);
  //   LOST    — every refresh created after it ended without success → retry, bounded per key.
  const outcome = (at) => {
    const after = runsAfter(at);
    if (after.some((r) => r.status === "completed" && r.conclusion === "success")) return after.some((r) => r.status === "completed" && r.conclusion === "success" && settled(r)) ? "LANDED" : "PENDING";
    if (after.some((r) => r.status !== "completed")) return "PENDING";
    if (after.length && after.every((r) => NOT_TAKEN.has(r.conclusion))) return "LOST";
    return after.length ? "PENDING" : "NONE";
  };
  const attempts = new Map(); // key → [{ at, outcome }]
  for (const d of ledger.dispatches.filter((x) => ms(x?.at) != null)) {
    const at = ms(d.at);
    let oc = outcome(at);
    // An `attempt` line with no `dispatch` line (gh errored; GitHub may or may not have accepted it) blocks its key
    // only once a refresh run actually appeared after it.
    if (oc === "NONE") { if (d.unconfirmed) continue; oc = "PENDING"; }
    for (const k of d.sides ?? []) {
      const id = String(k).split(":")[0];
      if (lastRegression(id) > at) continue; // ESPN took the final back after this dispatch: expired
      if (!attempts.has(k)) attempts.set(k, []);
      attempts.get(k).push({ at, outcome: oc });
    }
  }
  /** "fresh" | "retry" | "pending" | "landed" | "exhausted" for one owed key. */
  const attemptState = (k) => {
    const list = attempts.get(k) ?? [];
    if (!list.length) return "fresh";
    if (list.some((x) => x.outcome === "PENDING")) return "pending";
    if (list.some((x) => x.outcome === "LANDED")) return "landed";
    return list.length < L.MAX_ATTEMPTS_PER_KEY ? "retry" : "exhausted";
  };
  const everDispatched = (id) => ledger.dispatches.some((d) => ms(d?.at) != null && !d.unconfirmed && (d.sides ?? []).some((k) => String(k).split(":")[0] === id));

  // ── classify every game of the night ──
  // ESPN's day scoreboard groups by the US (ET) date of the tip; a stray row from another date is never this night's.
  const games = (o?.games ?? []).filter((g) => g?.eventId && (ms(g.tip) == null || etDate(ms(g.tip)) === slateDate));
  const table = [];
  for (const g of games) {
    const id = String(g.eventId);
    const tip = ms(g.tip);
    const row = { eventId: id, shortName: g.shortName, tip: tip != null ? new Date(tip).toISOString() : null, status: g.statusName };
    table.push(row);
    if (recorded[id]) { row.state = "RECORDED"; continue; }
    if (isOffStatus(g.statusName)) { row.state = "POSTPONED"; continue; }
    if (tip == null) { row.state = "NO_TIP"; alert(`no-tip:${slateDate}:${id}`, `game ${id} (${g.shortName ?? "?"}) has no parseable tip time on ESPN — not watched`); continue; }
    const pastGiveUp = now > tip + L.GIVE_UP_AFTER_TIP_MIN * MIN;
    if (isFinalStatus(g.statusName)) {
      if (held[id]) {
        row.state = "HELD";
        alert(`held:${id}`, `game ${id} (${g.shortName ?? "?"}) is final on ESPN but ${held[id]} — not dispatching; a refresh cannot change it`);
        continue;
      }
      const fp = finalFingerprint(g);
      row.key = `${id}:${fp}`;
      row.final = `${g.awayScore}-${g.homeScore}`;
      const since = finalSince(id);
      if (since == null) observations.finalSeen.push({ eventId: id, at: new Date(now).toISOString() });
      const age = since == null ? 0 : (now - since) / MIN;
      row.finalForMin = Math.round(age);
      if (age >= L.NOT_COMMITTED_ALERT_MIN) alert(`late:${row.key}`, `game ${id} (${g.shortName ?? "?"}) has been final on ESPN for ${Math.round(age)} min (first seen ${new Date(since).toISOString()}) and is still not in the committed finals record`);
      if (pastGiveUp) { row.state = "GIVEN_UP"; alert(`giveup:${slateDate}:${id}`, `game ${id} (${g.shortName ?? "?"}) is final on ESPN but still not recorded ${Math.round(L.GIVE_UP_AFTER_TIP_MIN / 60)} h after tip — the waiter stops watching it`); continue; }
      row.state = "OWED";
      row.attempt = attemptState(row.key);
      continue;
    }
    // Not final (scheduled, in progress, halftime, delayed …).
    const wasFinal = finalSince(id);
    if (wasFinal != null) {
      observations.regressed.push({ eventId: id, at: new Date(now).toISOString() });
      alert(`regress:${id}:${new Date(wasFinal).toISOString()}`, `ESPN moved game ${id} (${g.shortName ?? "?"}) from FINAL back to ${g.statusName ?? "not final"}${everDispatched(id) ? " after a refresh was dispatched for it" : ""} — waiting for it to be final again`);
    }
    if (pastGiveUp) { row.state = "GIVEN_UP"; alert(`giveup:${slateDate}:${id}`, `game ${id} (${g.shortName ?? "?"}) is still ${g.statusName ?? "not final"} on ESPN ${Math.round(L.GIVE_UP_AFTER_TIP_MIN / 60)} h after tip — the waiter stops watching it`); continue; }
    row.opensAt = new Date(tip + L.WINDOW_AFTER_TIP_MIN * MIN).toISOString();
    row.state = now >= tip + L.WINDOW_AFTER_TIP_MIN * MIN ? "WATCHING" : "BEFORE_WINDOW";
  }

  // A final the waiter dispatched for, whose refresh has LANDED since, and which the record still does not hold:
  // the refresh did not take it. Say so once (with the adapter's likely reason); never re-dispatch (a loop).
  for (const r of table.filter((x) => x.state === "OWED")) {
    const g = games.find((x) => String(x.eventId) === r.eventId);
    if (r.attempt === "landed") {
      const why = adapterQuarantineReason(g, sched);
      alert(`stalled:${r.key}`, `game ${r.eventId} (${r.shortName ?? "?"}): a refresh completed after the dispatch for this final, yet the committed finals record does not hold it${why ? ` — likely: ${why}` : ""}`);
    }
    if (r.attempt === "retry") alert(`lost:${r.key}`, `game ${r.eventId} (${r.shortName ?? "?"}): the refresh dispatched for this final ended without success (cancelled, failed or timed out) — retrying once`);
    if (r.attempt === "exhausted") alert(`retry-exhausted:${r.key}`, `game ${r.eventId} (${r.shortName ?? "?"}): ${L.MAX_ATTEMPTS_PER_KEY} refreshes dispatched for this final all ended without success — not dispatching again`);
  }

  const finish = (decision, extra = {}) => {
    const out = { decision, slateDate, reasons, alerts, observations, games: table, waitSeconds: 0, ...extra };
    if (alerts.length && decision !== WAITER.DISPATCH) return { ...out, decision: WAITER.ALERT, next: decision };
    return out;
  };

  if (!games.length) {
    // ESPN returned no games (an empty or malformed-but-200 payload) while the committed schedule lists some for the
    // night that are not long over: an input failure, not an empty night.
    const tips = sched ? Object.values(sched).map((x) => ms(x?.tip)).filter((t) => t != null && etDate(t) === slateDate) : [];
    if (tips.some((t) => now < t + L.GIVE_UP_AFTER_TIP_MIN * MIN)) {
      reasons.push(`ESPN listed no games for ${slateDate} while the committed schedule lists ${tips.length} — treated as an input failure, re-reading`);
      return finish(WAITER.WAIT, { waitSeconds: L.EMPTY_SCOREBOARD_RETRY_SECONDS, inputSuspect: true });
    }
    reasons.push(`no NBA games on the night of ${slateDate}`);
    return finish(WAITER.DONE);
  }

  const owedRows = table.filter((r) => r.state === "OWED");
  const pendingRows = table.filter((r) => r.state === "WATCHING" || r.state === "BEFORE_WINDOW");
  const activeOwed = owedRows.filter((r) => ["fresh", "retry", "pending"].includes(r.attempt));
  if (!pendingRows.length && !activeOwed.length) {
    reasons.push(`every game of ${slateDate} is recorded, postponed, held or given up — nothing left to watch`);
    return finish(WAITER.DONE);
  }

  const fresh = owedRows.filter((r) => r.attempt === "fresh" || r.attempt === "retry").map((r) => r.key);
  const inFlightOwed = owedRows.filter((r) => r.attempt === "pending").map((r) => r.key);
  if (inFlightOwed.length) reasons.push(`already dispatched for ${inFlightOwed.join(", ")} (refresh in flight or not yet on main) — never twice for the same final`);
  const stalled = owedRows.filter((r) => r.attempt === "landed" || r.attempt === "exhausted").map((r) => r.key);
  if (stalled.length) reasons.push(`${stalled.join(", ")}: not taken by a completed refresh / retries exhausted — alerted, not dispatching again`);

  if (!fresh.length) {
    const watching = pendingRows.filter((r) => r.state === "WATCHING");
    if (watching.length || inFlightOwed.length) {
      if (watching.length) reasons.push(`watching ${watching.length} game(s) not final yet: ${watching.map((r) => `${r.eventId}(${r.status})`).join(", ")}`);
      return finish(WAITER.WAIT, { waitSeconds: inFlightOwed.length ? 60 : L.POLL_SECONDS });
    }
    // Every remaining game is before its window: sleep to the first one (or leave it to a later trigger).
    const opens = Math.min(...pendingRows.map((r) => ms(r.opensAt)).filter((t) => t != null));
    reasons.push(`no game near its end yet — the first window opens at ${new Date(opens).toISOString()} (tip + ${L.WINDOW_AFTER_TIP_MIN} min)`);
    if ((opens - now) / MIN > L.HORIZON_MIN) {
      reasons.push(`more than ${L.HORIZON_MIN} min away — left to a later trigger (this run exits without relaying)`);
      return finish(WAITER.WAIT, { waitSeconds: Math.round((opens - now) / 1000), leaveToLaterTrigger: true });
    }
    return finish(WAITER.WAIT, { waitSeconds: Math.max(60, Math.round((opens - now) / 1000)) });
  }
  const retries = owedRows.filter((r) => r.attempt === "retry").map((r) => r.key);
  if (retries.length) reasons.push(`retrying ${retries.join(", ")}: the refresh dispatched for it ended without success`);

  // ── gates, in order: each is a WAIT, never a skip ──
  const pollWait = L.POLL_SECONDS;
  const inflight = runs.filter((r) => r.status && r.status !== "completed");
  if (inflight.length) { reasons.push(`an nba-results-refresh run is ${inflight[0].status} — re-deciding on what it commits`); return finish(WAITER.WAIT, { waitSeconds: 60, owed: fresh }); }
  const settling = runs.find((r) => r.status === "completed" && ms(r.updatedAt ?? r.createdAt) + L.REFRESH_SETTLE_MIN * MIN > now);
  if (settling) { reasons.push(`nba-results-refresh run ${settling.databaseId} finished under ${L.REFRESH_SETTLE_MIN} min ago — re-deciding on its push`); return finish(WAITER.WAIT, { waitSeconds: 60, owed: fresh }); }

  const dispatchRuns = nightRuns.filter((r) => r.event === "workflow_dispatch");
  const ledgerTonight = ledger.dispatches.filter((d) => !d.unconfirmed && ms(d?.at) != null && nightOf(ms(d.at), L.NIGHT_ROLLOVER_HOURS) === slateDate);
  const count = Math.max(dispatchRuns.length, ledgerTonight.length);
  if (count >= L.MAX_DISPATCHES_PER_NIGHT) {
    alert(`cap:${slateDate}`, `dispatch cap reached (${count}/${L.MAX_DISPATCHES_PER_NIGHT}) with ${fresh.length} final(s) still owed: ${fresh.join(", ")}`);
    reasons.push(`per-night dispatch cap reached (${count}/${L.MAX_DISPATCHES_PER_NIGHT})`);
    return finish(WAITER.WAIT, { waitSeconds: pollWait, owed: fresh });
  }
  const last = Math.max(-Infinity, ...dispatchRuns.map((r) => ms(r.createdAt)), ...ledgerTonight.map((d) => ms(d.at)));
  const sinceLast = (now - last) / MIN;
  if (sinceLast < L.MIN_SPACING_MIN) {
    reasons.push(`last dispatch ${Math.round(sinceLast)} min ago — spacing is ${L.MIN_SPACING_MIN} min`);
    return finish(WAITER.WAIT, { waitSeconds: Math.max(30, Math.round((L.MIN_SPACING_MIN - sinceLast) * 60)), owed: fresh });
  }
  // Confirm on the refresh's own transport (the month scoreboard) — last, because it is the expensive read.
  if (o?.confirm == null) { reasons.push("final(s) owed — confirming on the month scoreboard the refresh reads, then re-deciding"); return finish(WAITER.WAIT, { waitSeconds: 0, owed: fresh, needsConfirm: true }); }
  const confirmed = fresh.filter((k) => {
    const [id, fp] = k.split(":");
    const m = o.confirm[id];
    return m && isFinalStatus(m.statusName) && finalFingerprint(m) === fp;
  });
  const unconfirmed = fresh.filter((k) => !confirmed.includes(k));
  if (unconfirmed.length) reasons.push(`${unconfirmed.join(", ")}: the month scoreboard (the refresh's transport) does not show this final yet`);
  if (!confirmed.length) return finish(WAITER.WAIT, { waitSeconds: 120, owed: fresh });

  reasons.push(`${confirmed.length} final(s) on ESPN not in the committed finals record: ${confirmed.join(", ")}`);
  return finish(WAITER.DISPATCH, { owed: confirmed, fingerprint: fnv1a(confirmed.slice().sort().join("|")), dispatchNumber: count + 1 });
}
