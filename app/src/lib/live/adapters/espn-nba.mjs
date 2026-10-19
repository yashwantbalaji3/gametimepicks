/**
 * NBA LIVE ADAPTER — pure normalization of ESPN public NBA scoreboard + summary JSON. NO network, NO fs.
 *
 * ⚠ INTERNAL ONLY. NOT PUBLICLY ENABLED. The sport-capability registry keeps NBA `HISTORICAL_ONLY`, the
 * gateway's `SUPPORTED_SPORTS` stays ["nfl","mlb"], and `LIVE_PUBLIC_SPORTS` cannot name nba
 * (`rollout.test.mjs`). Nothing in `src/app/**` or `api/**` imports this module. It exists so the
 * opening-night capture kit can replay real payloads through the exact code that would later serve
 * them — "a sport without validated live tracking is never presented as tracked live", and this file
 * is the thing being validated, not a thing being shipped.
 *
 * SOURCE POSTURE. Same as `espn-nfl.mjs`: `site.api.espn.com` is a public, key-free JSON surface — not
 * a contracted API — so every field is read defensively and nothing outside this module sees an ESPN
 * field name. Recorded 2026-10-19 against real payloads (fixtures/nba-*.json, provenance sidecar).
 *
 * IDENTITY. ESPN's NBA event id IS the repository's NBA providerEventId (schedule, finals record,
 * private forecasts), and ESPN's athlete id IS the forecast's `providerAthleteId`. Both joins are exact.
 *
 * ── THE NBA LIFECYCLE ─────────────────────────────────────────────────────────────────────────
 *
 *   PREGAME ──▶ LIVE ⇄ END_OF_PERIOD ⇄ HALFTIME ──▶ FINAL_PROVISIONAL ──▶ FINAL_CANONICAL
 *      │          (DELAYED is in-play too)              ▲ ESPN STATUS_FINAL     ▲ ONLY the NBA finals
 *      └─▶ POSTPONED / CANCELLED (terminal, no score)                          record (write-once) can
 *                                                                                promote — never ESPN
 *
 * `lifecycle` is the NBA-grained state; `state` is the shared contract's LIVE_STATES projection
 * (PRE / LIVE / DELAYED / FINAL / …) so `freshness.mjs` and `lifecycle.mjs` consume an NBA game exactly
 * as they consume an NFL or MLB envelope — one freshness owner, one set of bands.
 *
 * ⚠ A PROVIDER FINAL IS NOT A SETTLEMENT. `mapNbaStatus` can never return FINAL_CANONICAL. The single
 * door is `applyCanonicalFinality`, which reads the committed finals record through `finalFor` (the
 * record's own settlement-facing lookup) and promotes only when the record says FINAL — not
 * FINAL_UNDER_REVIEW, not PENDING — AND its score and team ids equal what the provider shows.
 *
 * ⚠ ABSENT IS NULL, NEVER 0. Player stats are parsed by `boxscore-parse.mjs`'s `parseAthlete` — the
 * corpus parser that already encodes ESPN's zero-fill quirks — so the live box and the research corpus
 * cannot disagree about what "no row" means. A DNP keeps its reason; a player with no minutes yet has
 * every stat null.
 */
import { makeCompetitor, makeEnvelope } from "../contract.mjs";
import { freshnessOf, refreshPolicyFor } from "../freshness.mjs";
import { assertLabelOrder, parseAthlete } from "../../sports/nba/boxscore-parse.mjs";
import { finalFor } from "../../sports/nba/finals-record.mjs";

export const NBA_LIVE_ADAPTER_VERSION = "espn-nba-live-v1";
export const NBA_PROVIDER = "espn-public";

/** Every NBA lifecycle value. UNKNOWN is a real answer, never a guess at a neighbour. */
export const NBA_LIFECYCLE = Object.freeze([
  "PREGAME",
  "LIVE",
  "HALFTIME",
  "END_OF_PERIOD",
  "DELAYED",
  "FINAL_PROVISIONAL",
  "FINAL_CANONICAL",
  "POSTPONED",
  "CANCELLED",
  "UNKNOWN",
]);

const int = (x) => {
  if (typeof x === "number") return Number.isInteger(x) ? x : null;
  if (typeof x !== "string" || !/^\s*\d+\s*$/.test(x)) return null;
  return Number(x);
};

/**
 * ESPN status → NBA lifecycle (PROVIDER level — never FINAL_CANONICAL).
 *
 * The specific status NAME is consulted first (a postponed game is coarse `pre`, a cancelled one is
 * coarse `post`); the coarse state is the fallback; an unrecognized pair is UNKNOWN.
 */
export function mapNbaStatus(status) {
  const name = status?.type?.name ?? "";
  if (name === "STATUS_POSTPONED") return "POSTPONED";
  if (name === "STATUS_CANCELED" || name === "STATUS_CANCELLED") return "CANCELLED";
  if (name === "STATUS_DELAYED" || name === "STATUS_SUSPENDED") return "DELAYED";
  if (name === "STATUS_HALFTIME") return "HALFTIME";
  if (name === "STATUS_END_PERIOD") return "END_OF_PERIOD";
  switch (status?.type?.state) {
    case "in":
      return "LIVE";
    case "post":
      // A post state that never completed is not a played-out game.
      return status?.type?.completed === false ? "UNKNOWN" : "FINAL_PROVISIONAL";
    case "pre":
      return "PREGAME";
    default:
      return "UNKNOWN";
  }
}

/** NBA lifecycle → the shared contract's LIVE_STATES, so freshness/lifecycle need no NBA branch. */
export function contractStateOf(lifecycle) {
  switch (lifecycle) {
    case "PREGAME":
      return "PRE";
    case "LIVE":
    case "HALFTIME":
    case "END_OF_PERIOD":
      return "LIVE";
    case "DELAYED":
      return "DELAYED";
    case "FINAL_PROVISIONAL":
    case "FINAL_CANONICAL":
      return "FINAL";
    case "POSTPONED":
    case "CANCELLED":
      return lifecycle;
    default:
      return "UNKNOWN";
  }
}

const IN_PLAY = new Set(["LIVE", "HALFTIME", "END_OF_PERIOD", "DELAYED"]);
const FINALS = new Set(["FINAL_PROVISIONAL", "FINAL_CANONICAL"]);
const SCORED = new Set([...IN_PLAY, ...FINALS]);

/** Period 1–4 → Q1–Q4; 5 → OT, 6 → 2OT …; 0/absent → null (pregame has no period). */
export function periodOf(n) {
  const number = int(n);
  if (number === null || number < 1) return null;
  if (number <= 4) return { number, label: `Q${number}`, isOvertime: false, overtimeNumber: null };
  const ot = number - 4;
  return { number, label: ot === 1 ? "OT" : `${ot}OT`, isOvertime: true, overtimeNumber: ot };
}

/** Linescores in period order, or null. A blank cell is null in place — never 0, never dropped. */
function linescoresOf(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows = raw.map((l, i) => ({ period: int(l?.period) ?? i + 1, points: int(l?.value) ?? int(l?.displayValue) }));
  rows.sort((a, b) => a.period - b.period);
  return rows.map((r) => r.points);
}

function sideOf(competitors, homeAway, scored) {
  const c = (competitors ?? []).find((x) => x?.homeAway === homeAway) ?? {};
  return {
    teamId: c?.team?.id != null ? String(c.team.id) : c?.id != null ? String(c.id) : null,
    abbr: c?.team?.abbreviation ?? null,
    name: c?.team?.displayName ?? null,
    score: scored ? int(c?.score) : null,
    linescores: scored ? linescoresOf(c?.linescores) : null,
  };
}

function buildGame({ id, startTime, status, competitors, fetchedAt, source }) {
  const lifecycle = mapNbaStatus(status);
  const scored = SCORED.has(lifecycle);
  const home = sideOf(competitors, "home", scored);
  const away = sideOf(competitors, "away", scored);
  const discrepancies = [];
  for (const [key, side] of [["home", home], ["away", away]]) {
    if (side.score === null || !side.linescores || side.linescores.some((p) => p === null)) continue;
    const sum = side.linescores.reduce((s, p) => s + p, 0);
    // Informational: ESPN's linescores can lag the running score by a possession. Never held.
    if (sum !== side.score) discrepancies.push({ kind: "INFO", code: "LINESCORE_SUM_MISMATCH", side: key, score: side.score, linescoreSum: sum });
  }
  return {
    schemaVersion: 1,
    adapterVersion: NBA_LIVE_ADAPTER_VERSION,
    sport: "NBA",
    provider: NBA_PROVIDER,
    source,
    eventId: id,
    providerEventId: id,
    startTime: startTime ?? null,
    lifecycle,
    /** Contract projection — what freshness.mjs / lifecycle.mjs read. */
    state: contractStateOf(lifecycle),
    providerStatus: status?.type?.name ?? null,
    stateDetail: status?.type?.detail ?? null,
    sourceUpdatedAt: null, // ESPN publishes no update stamp — never fabricated
    fetchedAt,
    period: SCORED.has(lifecycle) ? periodOf(status?.period) : null,
    // A clock only while the ball is live. "0.0" at a break or "12:00" on a final reads as a running clock.
    clock: lifecycle === "LIVE" && typeof status?.displayClock === "string" ? status.displayClock : null,
    home,
    away,
    canonical: null,
    discrepancies,
  };
}

/** Normalize ONE scoreboard event. An event with no id is refused, never synthesized. */
export function normalizeNbaEvent(event, fetchedAt) {
  const id = event?.id;
  if (typeof id !== "string" || id.length === 0) return null;
  const comp = event?.competitions?.[0] ?? {};
  return buildGame({
    id,
    startTime: typeof event?.date === "string" ? event.date : (comp?.date ?? null),
    status: event?.status ?? comp?.status ?? {},
    competitors: comp?.competitors,
    fetchedAt,
    source: "scoreboard",
  });
}

/** Normalize a whole scoreboard payload; malformed → []. */
export function normalizeNbaScoreboard(payload, fetchedAt) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.map((e) => normalizeNbaEvent(e, fetchedAt)).filter((e) => e !== null);
}

/** The event id a summary says it describes — used to refuse a mismatched response. */
export function summaryEventId(summary) {
  const id = summary?.header?.id ?? summary?.header?.competitions?.[0]?.id ?? null;
  return id ? String(id) : null;
}

/**
 * The game state as the SUMMARY's header states it. Verified 2026-10-19: on a final the header status
 * carries only `type` (no period/clock), so the scoreboard stays the primary state source and this is
 * the cross-check the capture report compares against it.
 */
export function normalizeNbaSummaryGame(summary, fetchedAt) {
  const id = summaryEventId(summary);
  if (!id) return null;
  const comp = summary?.header?.competitions?.[0] ?? {};
  return buildGame({ id, startTime: comp?.date ?? null, status: comp?.status ?? {}, competitors: comp?.competitors, fetchedAt, source: "summary" });
}

/**
 * The shared LiveEventEnvelope for this game — the shape a future gateway path would serve.
 * `playerStats` stays null: the contract's player rows carry GameTime MARKET keys, and no NBA market
 * key exists to put there. The live box travels as `normalizeNbaBoxscore`'s own shape instead.
 */
export function toLiveEnvelope(game) {
  return makeEnvelope({
    eventId: game.eventId,
    sport: "NBA",
    provider: NBA_PROVIDER,
    providerEventId: game.providerEventId,
    startTime: game.startTime,
    state: game.state,
    stateDetail: game.stateDetail,
    sourceUpdatedAt: null,
    fetchedAt: game.fetchedAt,
    period: game.period ? { number: game.period.number, label: game.period.label, clock: game.clock, phase: game.providerStatus } : null,
    competitors: {
      home: makeCompetitor({ teamId: game.home.teamId, abbr: game.home.abbr, name: game.home.name, score: game.home.score }),
      away: makeCompetitor({ teamId: game.away.teamId, abbr: game.away.abbr, name: game.away.name, score: game.away.score }),
    },
    situation: null,
    playerStats: null,
  });
}

/* ───────────────────────────────── per-player live box ───────────────────────────────── */

/** The live box stats this adapter states. Keys match the private forecast's (`pts`, `reb`, `ast`, `threePm`). */
export const LIVE_STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm", "threePa", "minutes"]);

/**
 * Per-player live box from a `summary?event=` payload.
 *
 * → `{ ok: true, available: false, players: [] }` before tip (no `boxscore.players` — verified on the
 *   opening-night pregame summary), `{ ok: true, available: true, players }` once it exists, and
 *   `{ ok: false, reason: "LABEL_ORDER_CHANGED" }` if ESPN moved a column: a position-indexed stat read
 *   off a moved column is a wrong number, so the box fails CLOSED (no stats) rather than open.
 */
export function normalizeNbaBoxscore(summary) {
  const blocks = summary?.boxscore?.players;
  if (!Array.isArray(blocks) || blocks.length === 0) return { ok: true, available: false, players: [] };
  const sideById = new Map();
  for (const t of summary?.boxscore?.teams ?? []) if (t?.team?.id != null) sideById.set(String(t.team.id), t.homeAway ?? null);
  for (const c of summary?.header?.competitions?.[0]?.competitors ?? []) {
    const id = c?.team?.id ?? c?.id;
    if (id != null && !sideById.get(String(id))) sideById.set(String(id), c.homeAway ?? null);
  }
  const players = [];
  for (const block of blocks) {
    const teamId = block?.team?.id != null ? String(block.team.id) : null;
    for (const group of block?.statistics ?? []) {
      try {
        assertLabelOrder(group?.labels);
      } catch {
        return { ok: false, available: true, reason: "LABEL_ORDER_CHANGED", labels: group?.labels ?? null, players: [] };
      }
      for (const entry of group?.athletes ?? []) {
        const a = parseAthlete(entry, teamId);
        if (!a.providerAthleteId) continue; // identity is never minted from a name
        players.push({
          providerAthleteId: a.providerAthleteId,
          name: a.name,
          teamId,
          teamAbbr: block?.team?.abbreviation ?? null,
          side: sideById.get(teamId) ?? null,
          starter: a.starter,
          active: a.active,
          didNotPlay: a.didNotPlay,
          dnpReason: a.dnpReason,
          /** Minutes are the participation evidence (ESPN writes a literal "0" for a real sub-minute stint). */
          appeared: !a.didNotPlay && a.minutes !== null,
          stats: { pts: a.pts, reb: a.reb, ast: a.ast, threePm: a.threePm, threePa: a.threePa, minutes: a.minutes },
        });
      }
    }
  }
  return { ok: true, available: true, players };
}

/** Null-stat accounting for the capture report: how many appeared players lack each stat, plus DNPs. */
export function countMissingStats(box) {
  const out = { players: 0, appeared: 0, didNotPlay: 0, notYetAppeared: 0, nullOnAppeared: Object.fromEntries(LIVE_STAT_KEYS.map((k) => [k, 0])), zeroMinuteRows: 0 };
  for (const p of box?.players ?? []) {
    out.players++;
    if (p.didNotPlay) out.didNotPlay++;
    else if (!p.appeared) out.notYetAppeared++;
    else {
      out.appeared++;
      if (p.stats.minutes === 0) out.zeroMinuteRows++;
      for (const k of LIVE_STAT_KEYS) if (p.stats[k] === null) out.nullOnAppeared[k]++;
    }
  }
  return out;
}

/** Stats that went DOWN between two boxes — informational (scorer corrections happen), never held. */
export function boxscoreDecreases(prevBox, nextBox) {
  const prev = new Map((prevBox?.players ?? []).map((p) => [p.providerAthleteId, p]));
  const out = [];
  for (const p of nextBox?.players ?? []) {
    const q = prev.get(p.providerAthleteId);
    if (!q) continue;
    for (const k of LIVE_STAT_KEYS) {
      if (typeof q.stats[k] === "number" && typeof p.stats[k] === "number" && p.stats[k] < q.stats[k]) {
        out.push({ kind: "INFO", code: "STAT_DECREASED", providerAthleteId: p.providerAthleteId, name: p.name, stat: k, from: q.stats[k], to: p.stats[k] });
      }
    }
  }
  return out;
}

/* ───────────────────────────────── canonical finality ───────────────────────────────── */

/**
 * The ONLY door to FINAL_CANONICAL.
 *
 * @param game    a normalized game (provider-level lifecycle)
 * @param record  the committed NBA finals record (`public/data/nba/results/finals-<season>.json`), or null
 * @returns a NEW game; the input is not mutated. `canonical` states what the record said.
 */
export function applyCanonicalFinality(game, record) {
  if (!game) return game;
  const verdict = finalFor(record, game.providerEventId);
  const canonical = verdict.state === "PENDING" ? { state: "PENDING" } : { state: verdict.state, ftHome: verdict.ftHome, ftAway: verdict.ftAway, source: "nba-finals-record" };
  const discrepancies = [...game.discrepancies];
  if (verdict.state === "PENDING") return { ...game, canonical, discrepancies };

  if (game.lifecycle !== "FINAL_PROVISIONAL") {
    // The record holds a final but the provider does not say final — surfaced, never auto-resolved.
    if (game.lifecycle !== "FINAL_CANONICAL") discrepancies.push({ kind: "INFO", code: "CANONICAL_FINAL_WHILE_PROVIDER_NOT_FINAL", lifecycle: game.lifecycle });
    return { ...game, canonical, discrepancies };
  }
  if (verdict.state !== "FINAL") {
    discrepancies.push({ kind: "INFO", code: "CANONICAL_UNDER_REVIEW", recordState: verdict.state });
    return { ...game, canonical, discrepancies };
  }
  const row = (record?.finals ?? []).find((f) => f.providerEventId === String(game.providerEventId));
  const teamsAgree = row && String(row.home?.providerTeamId) === game.home.teamId && String(row.away?.providerTeamId) === game.away.teamId;
  const scoresAgree = verdict.ftHome === game.home.score && verdict.ftAway === game.away.score;
  if (!teamsAgree || !scoresAgree) {
    discrepancies.push({
      kind: "INFO",
      code: teamsAgree ? "CANONICAL_SCORE_MISMATCH" : "CANONICAL_TEAM_MISMATCH",
      provider: { home: game.home.score, away: game.away.score, homeTeamId: game.home.teamId, awayTeamId: game.away.teamId },
      record: { home: verdict.ftHome, away: verdict.ftAway, homeTeamId: row?.home?.providerTeamId ?? null, awayTeamId: row?.away?.providerTeamId ?? null },
    });
    return { ...game, canonical, discrepancies };
  }
  return { ...game, lifecycle: "FINAL_CANONICAL", state: "FINAL", canonical: { ...canonical, recordedAt: row.firstRecordedAt ?? null }, discrepancies };
}

/* ───────────────────────────────── monotonicity guard ───────────────────────────────── */

/** Progress rank. A later poll may never present a LOWER rank than one already observed. */
const RANK = Object.freeze({
  PREGAME: 0, POSTPONED: 0, CANCELLED: 0,
  LIVE: 1, HALFTIME: 1, END_OF_PERIOD: 1, DELAYED: 1,
  FINAL_PROVISIONAL: 2, FINAL_CANONICAL: 3,
});
const rankOf = (lifecycle) => (lifecycle in RANK ? RANK[lifecycle] : null);

/**
 * A lower score seen this many consecutive polls is accepted as a provider correction (still flagged).
 * Without it a genuine scorer's correction would freeze the game at the pre-correction score forever —
 * including through the final. Lifecycle regressions have no such escape: LIVE→PREGAME and FINAL→LIVE
 * are held indefinitely.
 */
export const SCORE_CORRECTION_CONFIRM_POLLS = 3;

export function emptyGuard() {
  return { lastGood: null, pendingCorrection: null };
}

/**
 * Advance the guard by one observation.
 *
 * @param guard     previous guard state (or null)
 * @param observed  a normalized game for this poll, or null when the read failed
 * @returns `{ guard, presented, held, discrepancies }`. When held, `presented` is the last-known-good
 *          game VERBATIM (same `fetchedAt`, so freshness ages honestly) and every discrepancy is
 *          `kind: "PROVIDER_REGRESSION"`.
 */
export function advanceNbaGuard(guard, observed, { confirmPolls = SCORE_CORRECTION_CONFIRM_POLLS } = {}) {
  const g = guard ?? emptyGuard();
  const prev = g.lastGood;
  if (!observed) return { guard: g, presented: prev, held: prev !== null, discrepancies: [], reason: "NO_OBSERVATION" };
  if (!prev) return { guard: { lastGood: observed, pendingCorrection: null }, presented: observed, held: false, discrepancies: [], reason: "FIRST_OBSERVATION" };

  // A canonical final is owned by the write-once record: nothing a provider says afterwards moves it.
  if (prev.lifecycle === "FINAL_CANONICAL") {
    const wentBack = (rankOf(observed.lifecycle) ?? -1) < 2;
    const differs = wentBack || observed.home.score !== prev.home.score || observed.away.score !== prev.away.score;
    const d = differs ? [regression("AFTER_CANONICAL_FINAL", prev, observed)] : [];
    return { guard: g, presented: prev, held: true, discrepancies: d, reason: "CANONICAL_FINAL_IS_TERMINAL" };
  }

  const lifecycleIssues = [];
  const scoreIssues = [];
  const rp = rankOf(prev.lifecycle);
  const ro = rankOf(observed.lifecycle);
  if (ro === null) {
    if (rp !== null && rp >= 1) lifecycleIssues.push(regression("LIFECYCLE_TO_UNKNOWN", prev, observed));
  } else if (rp !== null && ro < rp) {
    lifecycleIssues.push(regression("LIFECYCLE_BACKWARDS", prev, observed));
  }
  if (rp === 1 && ro === 1 && prev.period && observed.period && observed.period.number < prev.period.number) {
    lifecycleIssues.push(regression("PERIOD_BACKWARDS", prev, observed));
  }
  if (lifecycleIssues.length === 0) {
    for (const side of ["home", "away"]) {
      const a = prev[side].score;
      const b = observed[side].score;
      if (a === null) continue;
      if (b === null) lifecycleIssues.push(regression("SCORE_DISAPPEARED", prev, observed, { side }));
      else if (b < a) scoreIssues.push(regression("SCORE_DECREASED", prev, observed, { side, from: a, to: b }));
    }
  }

  if (lifecycleIssues.length > 0) {
    return { guard: { ...g, pendingCorrection: null }, presented: prev, held: true, discrepancies: lifecycleIssues, reason: "HELD_LAST_KNOWN_GOOD" };
  }
  if (scoreIssues.length > 0) {
    const key = `${observed.home.score}-${observed.away.score}`;
    const count = g.pendingCorrection?.key === key ? g.pendingCorrection.count + 1 : 1;
    if (count >= confirmPolls) {
      const accepted = scoreIssues.map((d) => ({ ...d, resolution: "ACCEPTED_AS_PROVIDER_CORRECTION", confirmedPolls: count }));
      return { guard: { lastGood: observed, pendingCorrection: null }, presented: observed, held: false, discrepancies: accepted, reason: "SCORE_CORRECTION_CONFIRMED" };
    }
    return { guard: { lastGood: prev, pendingCorrection: { key, count } }, presented: prev, held: true, discrepancies: scoreIssues, reason: "HELD_LAST_KNOWN_GOOD" };
  }
  return { guard: { lastGood: observed, pendingCorrection: null }, presented: observed, held: false, discrepancies: [], reason: "ADVANCED" };
}

function regression(code, prev, observed, extra = {}) {
  return {
    kind: "PROVIDER_REGRESSION",
    code,
    from: { lifecycle: prev.lifecycle, period: prev.period?.number ?? null, home: prev.home.score, away: prev.away.score, fetchedAt: prev.fetchedAt },
    to: { lifecycle: observed.lifecycle, period: observed.period?.number ?? null, home: observed.home.score, away: observed.away.score, fetchedAt: observed.fetchedAt },
    ...extra,
  };
}

/* ───────────────────────────── provider health · freshness · polling ───────────────────────────── */

/**
 * Transport health from the recent poll log (`[{ at, ok }]`, oldest first). Independent of freshness:
 * a healthy provider polled every 60 s is still DELAYED by the 45 s band, and that is the band's job.
 */
export function assessProviderHealth(attempts) {
  const list = Array.isArray(attempts) ? attempts : [];
  if (list.length === 0) return { status: "NO_DATA", consecutiveFailures: 0, lastSuccessAt: null, attempts: 0, failures: 0 };
  let consecutiveFailures = 0;
  for (let i = list.length - 1; i >= 0 && !list[i].ok; i--) consecutiveFailures++;
  const lastOk = [...list].reverse().find((a) => a.ok);
  const failures = list.filter((a) => !a.ok).length;
  const status = consecutiveFailures === 0 ? "HEALTHY" : consecutiveFailures < 3 ? "DEGRADED" : "FAILING";
  return { status, consecutiveFailures, lastSuccessAt: lastOk?.at ?? null, attempts: list.length, failures };
}

/** Freshness by the shared bands (FRESH < 45 s ≤ DELAYED < 120 s ≤ STALE), on the reader's clock. */
export function nbaFreshness(game, nowMs) {
  return freshnessOf(game, nowMs);
}

/** How often the summary (567 KB-class detail payload) is read while a game is in play. */
export const SUMMARY_INTERVAL_MS = 120_000;
/**
 * Once ESPN says final, only the finals record can change anything. `nba-results-refresh.yml` writes it
 * hourly (:41) and at :11/:26 across 00–07Z, so checking more often than every 15 min buys nothing.
 */
export const SETTLEMENT_CHECK_MS = 15 * 60_000;

/**
 * The polling plan for one game. Built on `refreshPolicyFor` so the NBA cadence IS the shared cadence.
 * FINAL_CANONICAL stops everything; FINAL_PROVISIONAL stops the provider and only re-checks the record.
 */
export function nbaPollingPlan(game, nowMs) {
  switch (game?.lifecycle) {
    case "FINAL_CANONICAL":
      return { stop: true, scoreboardMs: null, summaryMs: null, settlementCheckMs: null, reason: "FINAL_CANONICAL" };
    case "FINAL_PROVISIONAL":
      return { stop: false, scoreboardMs: null, summaryMs: null, settlementCheckMs: SETTLEMENT_CHECK_MS, reason: "AWAITING_CANONICAL_FINAL" };
    case "POSTPONED":
    case "CANCELLED":
      return { stop: true, scoreboardMs: null, summaryMs: null, settlementCheckMs: null, reason: game.lifecycle };
    default: {
      const policy = refreshPolicyFor(game, nowMs);
      const inPlay = IN_PLAY.has(game?.lifecycle);
      return { stop: false, scoreboardMs: policy.clientIntervalMs, summaryMs: inPlay ? SUMMARY_INTERVAL_MS : null, settlementCheckMs: null, reason: policy.reason, ttlSeconds: policy.ttlSeconds };
    }
  }
}

/* ───────────────────────────── progress vs frozen pregame projection ───────────────────────────── */

export const FROZEN_PROJECTION_LABEL = "pregame projection (frozen)";
/** The stat families the private forecast projects. Rows are only built for these. */
export const NBA_PROGRESS_STATS = Object.freeze(["pts", "reb", "ast", "threePm"]);
export const NBA_STAT_LABEL = Object.freeze({ pts: "Points", reb: "Rebounds", ast: "Assists", threePm: "3-pointers made" });
export const MISSING_DISPLAY = "—";

const fin = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** A live value for display: the number, or "—". Never "0" for an absent stat. */
export function displayLiveValue(v) {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : MISSING_DISPLAY;
}

/**
 * FACTUAL progress rows: live box value beside the FROZEN pregame projection. No live probability, no
 * pace, no "on track" — the two numbers sit side by side and nothing is inferred from them.
 *
 * @param box     `normalizeNbaBoxscore(...)` output (or null before tip / on a failed read)
 * @param frozen  one game of the private forecast artifact shape: `{ modelVersion, inputAsOf,
 *                players: { home: [{ providerAthleteId, name, pts: { p10, p50, p90 }, … }], away: [...] } }`
 */
export function buildNbaProgressRows({ box = null, frozen }) {
  const live = new Map((box?.ok ? box.players : []).map((p) => [p.providerAthleteId, p]));
  const rows = [];
  for (const side of ["home", "away"]) {
    for (const fp of frozen?.players?.[side] ?? []) {
      const id = fp?.providerAthleteId != null ? String(fp.providerAthleteId) : null;
      if (!id) continue;
      const lp = live.get(id) ?? null;
      const participation = !lp ? "NOT_IN_BOX" : lp.didNotPlay ? "DNP" : lp.appeared ? "APPEARED" : "NOT_YET_APPEARED";
      for (const stat of NBA_PROGRESS_STATS) {
        const q = fp?.[stat];
        if (!q) continue;
        const liveValue = participation === "APPEARED" ? (lp.stats[stat] ?? null) : null;
        rows.push({
          providerAthleteId: id,
          player: fp.name ?? lp?.name ?? null,
          side,
          stat,
          statLabel: NBA_STAT_LABEL[stat],
          liveValue,
          liveDisplay: displayLiveValue(liveValue),
          liveMinutes: participation === "APPEARED" ? lp.stats.minutes : null,
          participation,
          dnpReason: lp?.dnpReason ?? null,
          projection: {
            label: FROZEN_PROJECTION_LABEL,
            p50: fin(q.p50),
            p10: fin(q.p10),
            p90: fin(q.p90),
            frozenAt: frozen?.inputAsOf ?? null,
            modelVersion: frozen?.modelVersion ?? null,
          },
          marketLine: null,
          marketLineReason: "no NBA player-prop line is captured",
        });
      }
    }
  }
  return rows;
}
