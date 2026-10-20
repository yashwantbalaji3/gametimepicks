/**
 * NBA EXPERIMENTAL GRADING — inputs + APPEND-ONLY LEDGER (grader v2). PURE, no I/O. PRIVATE research only.
 *
 * Four defects in grader v1 (grade-nba-experimental-forecasts.mjs, audit of origin/main 0894582617) are fixed here:
 *
 *   1. ROLLING WINDOW. v1 read finals from `results/latest.json` (a 9-day scoreboard window) and corpus-v1 only, so a
 *      game not graded within nine days stayed pending forever. `finalLookup` reads the WRITE-ONCE season record
 *      (`results/finals-<season>.json`, finals-record.mjs) FIRST; the rolling window is only a same-night fallback
 *      for a final the record has not taken yet, and corpus-v1 covers history. A record final under review
 *      (`conflicts`) is graded with the RECORDED score and flagged — the record's rule is that it stands.
 *   2. STAT CORRECTIONS. A box score was fetched once. `recheckDue` bounds a re-check window after tip; a changed
 *      payload is stored beside the original (never over it) and logged as a BOXSCORE_CORRECTION with old/new
 *      content hashes; the re-grade it causes is a CORRECTION ledger entry that supersedes, never an overwrite.
 *   3. OVERTIME. Live finals carry no period detail, so `overtime.actual` was null for every 2026-27 game.
 *      `resolveOvertime` derives it: summary period count (recorded at fetch) → box-score team minutes
 *      (240 regulation + 25 per OT per team, both sides must agree; on the 4,179 historical corpus games it agrees with
 *      corpus-v1's period-derived flag on all 4,167 it determines and leaves 12 undetermined — one side short of 240
 *      from missing rows) → corpus flag. Undeterminable stays null (NOT_MEASURED), never "no overtime".
 *   4. REPLACE-ON-REGRADE. v1 replaced a date's entry when it re-graded. Schema 2 keeps the v1 `entries` array
 *      content-identical (canonical JSON; frozen legacy history) and appends per-GAME entries to `gradeEntries` with lineage
 *      INITIAL | PENDING_RESOLVED | CORRECTION (`supersedes` = the prior seq), like top-board-grading.mjs. An identical
 *      re-grade appends nothing. `experimentalLedgerAppendOnlyViolations` is the post-write guard.
 */
import { canonicalJson, sha256 } from "./forecast-receipt.mjs";
import { finalFor, nbaSeasonLabel, etDateOf } from "./finals-record.mjs";

export const GRADER_VERSION = "nba-experimental-grader-2";
export const LEDGER_SCHEMA_VERSION = 2;
export const LINEAGE = Object.freeze({ INITIAL: "INITIAL", PENDING_RESOLVED: "PENDING_RESOLVED", CORRECTION: "CORRECTION" });
export const CORRECTION_CAUSE = Object.freeze({ BOXSCORE_CORRECTION: "BOXSCORE_CORRECTION", BOXSCORE_ADDED: "BOXSCORE_ADDED", FINAL_CHANGED: "FINAL_CHANGED", GRADER_CHANGE: "GRADER_CHANGE", OTHER: "OTHER" });

/* ─────────────────────────── 1. finals ─────────────────────────── */

/**
 * One lookup over every final source, in authority order. Returns
 *   { state: "FINAL"|"FINAL_UNDER_REVIEW", ftHome, ftAway, source, season, overtime?, periods? } or { state: "PENDING" }.
 *
 * @param finalsRecords  { [season]: finals-<season>.json doc }
 * @param resultsRows    rows of results/latest.json (rolling window; STATUS_FINAL rows only are used)
 * @param corpusRows     rows of corpus-v1.json (history, carries the period-derived overtime flag)
 */
export function finalLookup({ finalsRecords = {}, resultsRows = [], corpusRows = [] } = {}) {
  const results = new Map(resultsRows.filter((r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "")).map((r) => [String(r.providerEventId), r]));
  const corpus = new Map(corpusRows.map((r) => [String(r.providerEventId), r]));
  const records = Object.entries(finalsRecords ?? {}).filter(([, d]) => d);
  return (providerEventId, { dateUtc = null } = {}) => {
    const id = String(providerEventId);
    // The record for the game's own season first (cheap), then any other loaded season (a mis-dated forecast).
    const season = dateUtc ? nbaSeasonLabel(etDateOf(dateUtc)) : null;
    const ordered = [...records].sort(([a], [b]) => (a === season ? -1 : b === season ? 1 : 0));
    for (const [s, rec] of ordered) {
      const f = finalFor(rec, id);
      if (f.state === "PENDING") continue;
      return { state: f.state, ftHome: f.ftHome, ftAway: f.ftAway, source: `finals-record:${s}`, season: s, underReview: f.state === "FINAL_UNDER_REVIEW" };
    }
    const r = results.get(id);
    if (r && Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway)) return { state: "FINAL", ftHome: r.ftHome, ftAway: r.ftAway, source: "results-capture", underReview: false };
    const c = corpus.get(id);
    if (c && Number.isInteger(c.ftHome) && Number.isInteger(c.ftAway)) {
      return { state: "FINAL", ftHome: c.ftHome, ftAway: c.ftAway, source: "corpus-v1", underReview: false, ...(typeof c.overtime === "boolean" ? { overtime: c.overtime, overtimeSource: "corpus-v1" } : {}) };
    }
    return { state: "PENDING", providerEventId: id };
  };
}

/* ─────────────────────────── 3. overtime ─────────────────────────── */

export const REGULATION_TEAM_MINUTES = 240; // 5 players × 48 minutes
export const OT_TEAM_MINUTES = 25;          // 5 players × 5 minutes per overtime period
/** Largest |team minutes − (240 + 25·OT)| accepted. ESPN rounds each player's minutes; on the 4,167 determined historical games the max was 4. */
export const MINUTES_TOLERANCE = 6;

/** Period count from a raw ESPN summary payload (header status period, then the competitors' linescores). */
export function periodsFromSummary(summary) {
  const comp = summary?.header?.competitions?.[0] ?? {};
  const p = comp?.status?.period ?? summary?.header?.status?.period;
  if (Number.isInteger(p) && p >= 4) return p;
  const ls = (comp?.competitors ?? []).map((c) => (Array.isArray(c?.linescores) ? c.linescores.length : null));
  if (ls.length === 2 && ls.every((n) => Number.isInteger(n) && n >= 4) && ls[0] === ls[1]) return ls[0];
  return null;
}

/**
 * Overtime from box-score team minutes. Both sides must independently imply the same OT count within tolerance,
 * otherwise null (an incomplete box score is not "no overtime").
 */
export function overtimeFromBoxscore(doc) {
  if (!doc?.boxscoreAvailable) return null;
  const byTeam = new Map();
  for (const p of doc.players ?? []) {
    if (!Number.isInteger(p?.minutes)) continue;
    const t = String(p.providerTeamId);
    byTeam.set(t, (byTeam.get(t) ?? 0) + p.minutes);
  }
  if (byTeam.size !== 2) return null;
  const sums = [...byTeam.values()];
  const ots = sums.map((m) => Math.round((m - REGULATION_TEAM_MINUTES) / OT_TEAM_MINUTES));
  if (ots[0] !== ots[1] || ots[0] < 0) return null;
  if (sums.some((m) => Math.abs(m - REGULATION_TEAM_MINUTES - OT_TEAM_MINUTES * ots[0]) > MINUTES_TOLERANCE)) return null;
  return { periods: 4 + ots[0], overtime: ots[0] > 0, source: "boxscore-minutes", teamMinutes: Object.fromEntries(byTeam) };
}

/** The overtime fact for a graded final: summary periods → box-score minutes → corpus flag → null. */
export function resolveOvertime({ final, boxscore }) {
  if (Number.isInteger(boxscore?.periods?.count) && boxscore.periods.count >= 4) {
    return { overtime: boxscore.periods.count > 4, periods: boxscore.periods.count, overtimeSource: boxscore.periods.source ?? "espn-summary-period" };
  }
  const m = overtimeFromBoxscore(boxscore);
  if (m) return { overtime: m.overtime, periods: m.periods, overtimeSource: m.source };
  if (typeof final?.overtime === "boolean") return { overtime: final.overtime, periods: null, overtimeSource: final.overtimeSource ?? final.source ?? null };
  return { overtime: null, periods: null, overtimeSource: null };
}

/* ─────────────────────────── 2. stat corrections ─────────────────────────── */

const STAT_FIELDS = Object.freeze(["didNotPlay", "minutes", "pts", "reb", "ast", "threePm", "threePa", "fgm", "fga", "ftm", "fta", "stl", "blk", "tov", "oreb", "dreb", "pf", "plusMinus"]);

/** Content hash of a box score's FACTS (status, teams, player stat rows) — capture time and provenance excluded. */
export function boxscoreContentHash(doc) {
  if (!doc) return null;
  const players = [...(doc.players ?? [])]
    .map((p) => ({ id: p.providerAthleteId ?? null, team: p.providerTeamId ?? null, ...Object.fromEntries(STAT_FIELDS.map((k) => [k, p[k] ?? null])) }))
    .sort((a, b) => `${a.team}:${a.id}`.localeCompare(`${b.team}:${b.id}`));
  const teams = [...(doc.teams ?? [])].map((t) => ({ id: t.providerTeamId ?? null, homeAway: t.homeAway ?? null })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sha256(canonicalJson({ status: doc.status ?? null, boxscoreAvailable: doc.boxscoreAvailable === true, teams, players }));
}

/** Field-level differences between two box scores, per athlete (added / removed rows included). */
export function diffBoxscores(oldDoc, newDoc) {
  const key = (p) => `${p.providerTeamId}:${p.providerAthleteId}`;
  const a = new Map((oldDoc?.players ?? []).map((p) => [key(p), p]));
  const b = new Map((newDoc?.players ?? []).map((p) => [key(p), p]));
  const out = [];
  for (const [k, p] of b) {
    const q = a.get(k);
    if (!q) { out.push({ providerAthleteId: p.providerAthleteId, name: p.name ?? null, change: "ADDED" }); continue; }
    const fields = STAT_FIELDS.filter((f) => (q[f] ?? null) !== (p[f] ?? null)).map((f) => ({ field: f, old: q[f] ?? null, new: p[f] ?? null }));
    if (fields.length) out.push({ providerAthleteId: p.providerAthleteId, name: p.name ?? null, change: "CHANGED", fields });
  }
  for (const [k, q] of a) if (!b.has(k)) out.push({ providerAthleteId: q.providerAthleteId, name: q.name ?? null, change: "REMOVED" });
  if ((oldDoc?.status ?? null) !== (newDoc?.status ?? null)) out.push({ change: "STATUS", old: oldDoc?.status ?? null, new: newDoc?.status ?? null });
  return out;
}

/** Re-check bounds (founder-reviewable defaults; see PR "open decisions"). */
export const RECHECK = Object.freeze({ windowHours: 72, everyHours: 6 });

/**
 * Is a re-check of this game's box score due? Only inside `windowHours` after tip, and at most once per `everyHours`
 * since the last check (or the original capture). Outside the window the stored box score is final for grading.
 */
export function recheckDue({ tipUtc, now, lastCheckedAt, windowHours = RECHECK.windowHours, everyHours = RECHECK.everyHours }) {
  const tip = Date.parse(tipUtc ?? ""), t = Date.parse(now ?? ""), last = Date.parse(lastCheckedAt ?? "");
  if (!Number.isFinite(tip) || !Number.isFinite(t)) return { due: false, reason: "UNKNOWN_TIME" };
  if (t < tip) return { due: false, reason: "BEFORE_TIP" };
  if (t - tip > windowHours * 3_600_000) return { due: false, reason: "WINDOW_CLOSED" };
  if (Number.isFinite(last) && t - last < everyHours * 3_600_000) return { due: false, reason: "CHECKED_RECENTLY" };
  return { due: true, reason: "IN_WINDOW" };
}

/* ─────────────────────────── 4. append-only ledger ─────────────────────────── */

/** An empty schema-2 ledger for a family spec (experimental-forecast.mjs FAMILIES). */
export function emptyExperimentalLedger(spec) {
  return upgradeLedger({
    schemaVersion: 1, artifact: "nba-experimental-ledger", family: spec.family, modelVersion: spec.modelVersion, poolRule: spec.poolRule,
    dataClass: "PRIVATE_RESEARCH", productEligible: false, labels: null, entries: [],
  });
}

/**
 * Upgrade a schema-1 ledger to schema 2 WITHOUT touching its `entries` (they become frozen legacy history: the
 * date-level grades grader v1 wrote, including its replace-on-regrade results). Returns a new object.
 */
export function upgradeLedger(ledger) {
  if (ledger?.schemaVersion === LEDGER_SCHEMA_VERSION) return { ...ledger, gradeEntries: [...(ledger.gradeEntries ?? [])], boxscoreChecks: [...(ledger.boxscoreChecks ?? [])], boxscoreCorrections: [...(ledger.boxscoreCorrections ?? [])] };
  return {
    ...ledger,
    schemaVersion: LEDGER_SCHEMA_VERSION,
    rule: "append-only: `gradeEntries`, `boxscoreChecks` and `boxscoreCorrections` are only ever appended; a resolved PENDING appends PENDING_RESOLVED, a changed decided grade appends CORRECTION with `supersedes`. `entries` is the frozen schema-1 history (grader v1, date-level) and is never written again.",
    legacyEntries: { key: "entries", schemaVersion: 1, frozen: true, note: "grader v1 date entries, kept content-identical (canonical JSON); grader v1 replaced a date's entry on re-grade, so these are its LAST view per date, not a lineage" },
    gradeEntries: [],
    boxscoreChecks: [],
    boxscoreCorrections: [],
  };
}

/**
 * The grade minus what may legitimately move without the grade changing: the final's source label (rolling window →
 * season record) and `context` (rest days, cross-checks — slice keys derived from other games' records).
 */
const gradeBody = (g) => {
  const { final, context: _context, ...rest } = g ?? {};
  return canonicalJson({ ...rest, final: final ? { ftHome: final.ftHome ?? null, ftAway: final.ftAway ?? null } : null });
};
const isDecided = (e) => e?.status === "GRADED";

/** Latest gradeEntry per providerEventId (the ledger's CURRENT view). */
export function currentGradeEntries(ledger) {
  const m = new Map();
  for (const e of ledger?.gradeEntries ?? []) m.set(String(e.providerEventId), e);
  return m;
}

/** Current graded games (gradeForecastGame outputs) — what every metric reads. */
export function currentGrades(ledger) {
  return [...currentGradeEntries(ledger).values()].filter(isDecided).map((e) => e.grade);
}

/**
 * Append per-game results. Each item: { providerEventId, date, status: "GRADED"|"PENDING", grade?, pendingReason?,
 * inputs: { finalSource, finalState, boxscoreSource, boxscoreHash, boxscoreFile }, cause? }.
 * Returns { ledger, appended } (a NEW ledger; input untouched).
 */
export function appendGameResults(ledger, items, { gradedAt, graderVersion = GRADER_VERSION }) {
  const next = upgradeLedger(ledger);
  const latest = currentGradeEntries(next);
  let seq = next.gradeEntries.length ? Math.max(...next.gradeEntries.map((e) => e.seq)) : 0;
  const appended = [];
  for (const it of items) {
    const id = String(it.providerEventId);
    const prev = latest.get(id) ?? null;
    const body = it.status === "GRADED" ? gradeBody(it.grade) : canonicalJson({ pending: it.pendingReason ?? null });
    const prevBody = prev ? (prev.status === "GRADED" ? gradeBody(prev.grade) : canonicalJson({ pending: prev.pendingReason ?? null })) : null;
    if (prev && prevBody === body) continue;
    // A decided grade is never downgraded to PENDING by a later run that cannot see its inputs, and a PENDING that
    // stays pending (for whatever reason) appends nothing: the first PENDING entry already says "not graded yet".
    if (prev && it.status !== "GRADED") continue;
    const lineageReason = !prev ? LINEAGE.INITIAL : !isDecided(prev) ? LINEAGE.PENDING_RESOLVED : LINEAGE.CORRECTION;
    let cause = null;
    if (lineageReason === LINEAGE.CORRECTION && isDecided(prev)) {
      if (it.cause) cause = it.cause;
      else if (!prev.inputs?.boxscoreHash && it.inputs?.boxscoreHash) cause = CORRECTION_CAUSE.BOXSCORE_ADDED; // graded on the final alone first; player rows arrived later
      else if (prev.inputs?.boxscoreHash && it.inputs?.boxscoreHash && prev.inputs.boxscoreHash !== it.inputs.boxscoreHash) cause = CORRECTION_CAUSE.BOXSCORE_CORRECTION;
      else if (prev.grade?.final && it.grade?.final && (prev.grade.final.ftHome !== it.grade.final.ftHome || prev.grade.final.ftAway !== it.grade.final.ftAway)) cause = CORRECTION_CAUSE.FINAL_CHANGED;
      else if (prev.graderVersion !== graderVersion) cause = CORRECTION_CAUSE.GRADER_CHANGE;
      else cause = CORRECTION_CAUSE.OTHER;
    }
    seq += 1;
    const entry = {
      seq, providerEventId: id, date: it.date ?? null, gradedAt, graderVersion,
      status: it.status, ...(it.status === "GRADED" ? { grade: it.grade } : { pendingReason: it.pendingReason ?? null }),
      inputs: it.inputs ?? null,
      lineageReason, supersedes: prev ? prev.seq : null, cause,
      ...(cause === CORRECTION_CAUSE.BOXSCORE_CORRECTION ? { correction: { oldBoxscoreHash: prev.inputs?.boxscoreHash ?? null, newBoxscoreHash: it.inputs?.boxscoreHash ?? null } } : {}),
    };
    next.gradeEntries.push(entry);
    latest.set(id, entry);
    appended.push(entry);
  }
  return { ledger: next, appended };
}

/** Append one box-score re-check observation (UNCHANGED or CORRECTION). */
export function appendBoxscoreCheck(ledger, check) {
  const next = upgradeLedger(ledger);
  const seq = next.boxscoreChecks.length ? next.boxscoreChecks.at(-1).seq + 1 : 1;
  next.boxscoreChecks.push({ seq, ...check });
  if (check.outcome === "CORRECTION") {
    const cseq = next.boxscoreCorrections.length ? next.boxscoreCorrections.at(-1).seq + 1 : 1;
    const prior = [...next.boxscoreCorrections].reverse().find((c) => c.providerEventId === check.providerEventId) ?? null;
    next.boxscoreCorrections.push({
      seq: cseq, kind: "BOXSCORE_CORRECTION", providerEventId: check.providerEventId, detectedAt: check.checkedAt,
      old: check.old, new: check.new, changes: check.changes ?? [], supersedes: prior ? prior.seq : null,
      note: "the original box-score file is kept unchanged; the corrected payload is stored beside it and the game is re-graded as a CORRECTION ledger entry",
    });
  }
  return next;
}

/** The newest stored correction for an event (or null): which box-score file is current for grading. */
export function latestCorrection(ledger, providerEventId) {
  return [...(ledger?.boxscoreCorrections ?? [])].reverse().find((c) => c.providerEventId === String(providerEventId)) ?? null;
}
export function lastCheckAt(ledger, providerEventId) {
  return [...(ledger?.boxscoreChecks ?? [])].reverse().find((c) => c.providerEventId === String(providerEventId))?.checkedAt ?? null;
}

/**
 * Post-write guard. BEFORE's legacy `entries` are canonically identical in AFTER; every append-only array of BEFORE is an
 * unchanged prefix of AFTER's; seqs strictly increase; every CORRECTION/PENDING_RESOLVED supersedes an earlier entry
 * of the same event; no INITIAL for an event that already had one.
 */
export function experimentalLedgerAppendOnlyViolations({ before, after }) {
  const v = [];
  if (before?.entries && canonicalJson(before.entries) !== canonicalJson(after?.entries ?? null)) v.push("legacy `entries` changed — schema-1 history is frozen");
  for (const key of ["gradeEntries", "boxscoreChecks", "boxscoreCorrections"]) {
    const b = before?.[key] ?? [];
    const a = after?.[key] ?? [];
    if (a.length < b.length) v.push(`${key}: entries removed (${b.length} → ${a.length})`);
    for (let i = 0; i < b.length; i += 1) if (a[i] && canonicalJson(a[i]) !== canonicalJson(b[i])) v.push(`${key}: seq ${b[i].seq} was edited`);
    for (let i = 1; i < a.length; i += 1) if (!(a[i].seq > a[i - 1].seq)) v.push(`${key}: seq not increasing at ${a[i].seq}`);
  }
  const seen = new Map();
  for (const e of after?.gradeEntries ?? []) {
    const id = String(e.providerEventId);
    const prev = seen.get(id);
    if (e.lineageReason === LINEAGE.INITIAL && prev) v.push(`gradeEntries: second INITIAL for ${id} (seq ${e.seq})`);
    if (e.lineageReason !== LINEAGE.INITIAL && (!prev || e.supersedes !== prev.seq)) v.push(`gradeEntries: seq ${e.seq} (${e.lineageReason}) does not supersede the previous entry of ${id}`);
    seen.set(id, e);
  }
  return v;
}

/** Rest days before a game for one team, from every known final/forecast tip of that team (§9 slices). */
export function restDaysFor({ teamId, tipUtc, priorTips }) {
  const tip = Date.parse(tipUtc ?? "");
  if (!Number.isFinite(tip)) return null;
  const tipDay = etDateOf(tipUtc);
  let best = null;
  for (const t of priorTips.get(String(teamId)) ?? []) {
    const ms = Date.parse(t);
    if (!Number.isFinite(ms) || ms >= tip) continue;
    if (best == null || ms > Date.parse(best)) best = t;
  }
  if (!best) return null;
  const days = Math.round((Date.parse(`${tipDay}T00:00:00Z`) - Date.parse(`${etDateOf(best)}T00:00:00Z`)) / 86_400_000) - 1;
  return days < 0 ? null : days;
}

/**
 * Cross-check of a final against the box score's player points (both sides). `agrees` is null when the box score
 * cannot say (missing / null points). A disagreement is REPORTED (diagnostics); it never changes the graded final,
 * which stays the finals record's recorded score (finals-record.mjs: "the recorded final stands").
 */
export function boxscorePointsCheck(doc, { homeTeamId, awayTeamId, ftHome, ftAway }) {
  if (!doc?.boxscoreAvailable) return null;
  const sum = (tid) => {
    let s = 0, any = false;
    for (const p of doc.players ?? []) {
      if (String(p.providerTeamId) !== String(tid) || !Number.isInteger(p.minutes)) continue;
      if (!Number.isInteger(p.pts)) return null;
      s += p.pts; any = true;
    }
    return any ? s : null;
  };
  const home = sum(homeTeamId), away = sum(awayTeamId);
  return { home, away, agrees: home == null || away == null ? null : home === ftHome && away === ftAway };
}

/**
 * Current view as `{ providerEventId, date, status, grade }` for either schema: schema 2 → latest gradeEntry per
 * event; a schema-1 ledger (not yet re-graded by v2) → its date entries' graded games (latest date entry wins).
 */
export function currentEntriesAnySchema(ledger) {
  if (Array.isArray(ledger?.gradeEntries) && ledger.gradeEntries.length) return [...currentGradeEntries(ledger).values()];
  const m = new Map();
  for (const e of ledger?.entries ?? []) for (const g of e?.games ?? []) if (g?.graded) m.set(String(g.providerEventId), { providerEventId: String(g.providerEventId), date: e.date, status: "GRADED", grade: g, legacy: true });
  return [...m.values()];
}

const LINE_ARRAYS = new Set(["entries", "gradeEntries", "boxscoreChecks", "boxscoreCorrections"]);
/**
 * The ledger's on-disk text: top-level keys pretty-printed, every element of the append-only arrays (and the frozen
 * legacy `entries`) on ONE line — so an append is a one-line diff and the file stays ≈ compact-JSON size.
 * JSON.parse(ledgerText(doc)) deep-equals doc.
 */
export function ledgerText(doc) {
  const keys = Object.keys(doc).filter((k) => doc[k] !== undefined);
  const parts = keys.map((k) => {
    const v = doc[k];
    if (LINE_ARRAYS.has(k) && Array.isArray(v)) return ` ${JSON.stringify(k)}: ${v.length ? `[\n${v.map((x) => `  ${JSON.stringify(x)}`).join(",\n")}\n ]` : "[]"}`;
    return ` ${JSON.stringify(k)}: ${JSON.stringify(v, null, 1).split("\n").join("\n ")}`;
  });
  return `{\n${parts.join(",\n")}\n}\n`;
}
