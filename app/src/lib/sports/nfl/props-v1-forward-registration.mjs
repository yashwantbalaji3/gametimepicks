/**
 * NFL props-v1 RECEIVING YARDS — REGISTERED FORWARD TEST (ledger N8). PURE: no I/O, no clock. PRIVATE_RESEARCH.
 *
 * Protocol of record: data/internal/research/nfl/reports/player-props-v1-reception-yds-forward-protocol.json.
 * This module holds the counting rules the protocol states, so the weekly grader and its tests share one copy:
 *
 *   - registration instant  = git committer time of the commit that ADDED the protocol file (the script reads it);
 *   - firstWeek             = the first regular-season week whose FIRST kickoff is strictly after registration,
 *                             computed from the committed ESPN schedule captures (never a literal);
 *   - an event counts only through the last board revision COMMITTED and GENERATED strictly before kickoff, whose
 *     receiving-yards family names the props-v1 engine and whose frozen served-pipeline files give this series'
 *     pipelineVersion (any other version is another series: never pooled);
 *   - every regular-season event of a counted week is GRADED or carries an exclusion code (the denominator closes);
 *   - a week is written once, when every one of its events is terminal; a written week is never rewritten.
 *
 * Grading mechanics (settlement, baselines, P(over), bars, verdict) are the as-served retrospective's
 * (props-v1-forward-receipt.mjs) — one copy, so the forward test cannot quietly grade differently.
 */
import crypto from "node:crypto";
import { MARKET, pointMetrics, judgePropsV1, clusteredIntervals, r4, stableJson } from "./props-v1-forward-receipt.mjs";

export const REGISTRATION_SCHEMA_VERSION = 1;

/** Event outcome codes. GRADED is the only counted one; PENDING_* hold the whole week back; the rest are terminal. */
export const EVENT_CODE = Object.freeze({
  GRADED: "GRADED",
  NO_BOARD: "NO_BOARD",                                   // a scheduled event with no player board at the grading commit
  NO_PRE_KICKOFF_REVISION: "NO_PRE_KICKOFF_REVISION",     // no revision both committed and generated before kickoff
  FAMILY_ABSENT: "FAMILY_ABSENT",                         // the pre-kickoff revision carries no receiving-yards family
  SHARE_LEVEL_SERVED: "SHARE_LEVEL_SERVED",               // the family named the share-level model, not props-v1
  NOT_PROPS_V1: "NOT_PROPS_V1",                           // the family names some other model / no model
  OTHER_PIPELINE_VERSION: "OTHER_PIPELINE_VERSION",       // the revision's frozen pipeline files give another version: another series
  NO_SERVED_ROWS: "NO_SERVED_ROWS",                       // props-v1 family present but no player row carried the market
  PENDING_KICKOFF: "PENDING_KICKOFF",                     // kickoff not yet passed at the grading commit
  PENDING_NOT_FINAL: "PENDING_NOT_FINAL",                 // not final in the committed ESPN corpus
  PENDING_NO_SNAP_SHEET: "PENDING_NO_SNAP_SHEET",         // final, but a team's nflverse snap sheet is not committed
});
export const EXCLUSION_REASON = Object.freeze({
  NO_BOARD: "no app/public/data/nfl/player-board/<eventId>.json at the grading commit",
  NO_PRE_KICKOFF_REVISION: "no board revision was both committed (git committer time) and generated before kickoff",
  FAMILY_ABSENT: "the last pre-kickoff revision has no player_reception_yds family",
  SHARE_LEVEL_SERVED: "the last pre-kickoff revision served the share-level model for this family, not props-v1",
  NOT_PROPS_V1: "the last pre-kickoff revision's family names a model other than props-v1",
  OTHER_PIPELINE_VERSION: "the served pipeline at the revision commit (engine, fit, evaluator, role-share builder, orchestrator) is a different version from this series' registered one — it belongs to another series and is never pooled here",
  NO_SERVED_ROWS: "props-v1 family present but no served player row carried player_reception_yds",
});

/**
 * The served-pipeline version of a set of frozen files: sha256 over the sorted "path sha256" lines, first 16 hex.
 * `fileShas` = {path: sha256 | "MISSING"}. Any change to any frozen file gives a different version (a new series).
 */
export function pipelineVersionOf(fileShas) {
  const lines = Object.keys(fileShas).sort().map((p) => `${p} ${fileShas[p]}`).join("\n");
  return `pv1-${crypto.createHash("sha256").update(lines).digest("hex").slice(0, 16)}`;
}
/** The version the protocol's own frozen file list defines (the script refuses if series.pipelineVersion differs). */
export const registeredPipelineVersion = (protocol) => pipelineVersionOf(Object.fromEntries(protocol.model.frozenFiles.map((f) => [f.path, f.sha256])));

const kickMs = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The committed schedule: the union of ESPN schedule captures, the LATEST capture of each providerEventId winning
 * (captures ordered by generatedAt, then by name). Returns Map eventId → {eventId, week, seasonType, kickoffUtc, matchup}.
 */
export function scheduleFromCaptures(captures) {
  const ordered = [...(captures ?? [])].sort((a, b) => byStr(String(a.generatedAt), String(b.generatedAt)) || byStr(String(a.name ?? ""), String(b.name ?? "")));
  const out = new Map();
  for (const c of ordered) {
    for (const r of c.rows ?? []) {
      out.set(String(r.providerEventId), { eventId: String(r.providerEventId), week: r.week, seasonType: r.seasonType, kickoffUtc: r.dateUtc, matchup: r.shortName ?? null });
    }
  }
  return out;
}

/**
 * Regular-season weeks of the season that contains `registeredAt`: seasonType 2 rows, cut at the next season's
 * Week 1 (the first seasonType-2 week-1 kickoff after registration), grouped by week, kickoff-ordered.
 */
export function regularSeasonWeeks(schedule, registeredAt) {
  const reg = kickMs(registeredAt);
  const rows = [...schedule.values()].filter((e) => e.seasonType === 2 && Number.isFinite(kickMs(e.kickoffUtc)));
  const nextSeason = rows.filter((e) => e.week === 1 && kickMs(e.kickoffUtc) > reg).map((e) => kickMs(e.kickoffUtc)).sort((a, b) => a - b)[0] ?? Infinity;
  const weeks = new Map();
  for (const e of rows.filter((x) => kickMs(x.kickoffUtc) < nextSeason)) {
    if (!weeks.has(e.week)) weeks.set(e.week, []);
    weeks.get(e.week).push(e);
  }
  return new Map([...weeks.entries()].sort(([a], [b]) => a - b).map(([w, es]) => {
    const sorted = es.sort((a, b) => kickMs(a.kickoffUtc) - kickMs(b.kickoffUtc) || byStr(a.eventId, b.eventId));
    return [w, { week: w, firstKickoffUtc: sorted[0].kickoffUtc, events: sorted }];
  }));
}

/** The first week whose first kickoff is strictly after the registration instant (null if none is scheduled yet). */
export function firstWeekAfter(weeks, registeredAt) {
  const reg = kickMs(registeredAt);
  if (!Number.isFinite(reg)) throw new Error(`firstWeekAfter: unreadable registration time ${registeredAt}`);
  for (const w of weeks.values()) if (kickMs(w.firstKickoffUtc) > reg) return w.week;
  return null;
}

/**
 * Classify one event. `ev` = {eventId, kickoffUtc, hasBoard, revision|null, final, sheetMissing[], servedRows}
 * where revision = {commit, committedAt, generatedAt, family|null, servedModel, pipelineVersion, identityMismatches[]}.
 * Throws if a revision handed in was not committed AND generated before kickoff (no postgame inputs, ever).
 */
export function classifyEvent(ev, { asOf, model, series }) {
  const k = kickMs(ev.kickoffUtc);
  if (!Number.isFinite(k)) throw new Error(`event ${ev.eventId}: unreadable kickoff ${ev.kickoffUtc}`);
  if (!(k < kickMs(asOf))) return EVENT_CODE.PENDING_KICKOFF;
  if (!ev.hasBoard) return EVENT_CODE.NO_BOARD;
  const rev = ev.revision;
  if (!rev) return EVENT_CODE.NO_PRE_KICKOFF_REVISION;
  if (!(Date.parse(rev.committedAt) < k) || !(Date.parse(rev.generatedAt) < k)) {
    throw new Error(`event ${ev.eventId}: revision ${rev.commit} committed ${rev.committedAt} / generated ${rev.generatedAt} is not before kickoff ${ev.kickoffUtc}`);
  }
  if (!rev.family) return EVENT_CODE.FAMILY_ABSENT;
  if (rev.servedModel === model.shareLevelModelId) return EVENT_CODE.SHARE_LEVEL_SERVED;
  if (rev.servedModel !== model.servedModelId) return EVENT_CODE.NOT_PROPS_V1;
  if (rev.pipelineVersion !== series.pipelineVersion) return EVENT_CODE.OTHER_PIPELINE_VERSION;
  if (!ev.final) return EVENT_CODE.PENDING_NOT_FINAL;
  if ((ev.sheetMissing ?? []).length) return EVENT_CODE.PENDING_NO_SNAP_SHEET;
  if (!(ev.servedRows > 0)) return EVENT_CODE.NO_SERVED_ROWS;
  return EVENT_CODE.GRADED;
}

export const isPending = (code) => String(code).startsWith("PENDING_");

export const ROW_COLUMNS = Object.freeze(["eventId", "gameId", "playerId", "name", "team", "participation", "mean", "p10", "p25", "median", "p75", "p90", "state", "actual", "rolling4", "line", "shareVol", "pOver", "pOverLo", "pOverHi", "baselineStateAtTeam", "pipelineVersion"]);
export const ROW_STATES = Object.freeze(["SCORED", "VOID_ZERO_OPPORTUNITY", "VOID_NO_OFFENSE_SNAPS", "EXCLUDED_NO_SHEET"]);

/**
 * Rows (column arrays, four-decimal rounded) → the scoring points pointMetrics reads. Only SCORED rows score, and
 * only rows of `pipelineVersion`: a row of any other version throws — series are never pooled.
 */
export function pointsFromRows(rows, week, pipelineVersion) {
  const c = Object.fromEntries(ROW_COLUMNS.map((k, i) => [k, i]));
  for (const r of rows) if (r[c.pipelineVersion] !== pipelineVersion) throw new Error(`week ${week}: row ${r[c.eventId]}/${r[c.playerId]} is pipeline ${r[c.pipelineVersion]}, not ${pipelineVersion} — never pooled`);
  return rows.filter((r) => r[c.state] === "SCORED").map((r) => ({
    gameId: r[c.gameId], week, actual: r[c.actual], mean: r[c.mean], p10: r[c.p10], p25: r[c.p25], median: r[c.median], p75: r[c.p75], p90: r[c.p90],
    rolling4: r[c.rolling4], line: r[c.line], shareVol: r[c.shareVol], stateAtTeam: r[c.baselineStateAtTeam],
    pOver: r[c.pOver] == null ? null : { p: r[c.pOver], lo: r[c.pOverLo], hi: r[c.pOverHi] },
  }));
}

/**
 * One week's receipt, or {pending} when any event is not terminal yet. `events` are the week's events with their
 * classification inputs; GRADED events carry `rows` (ROW_COLUMNS order). Refuses a week before firstWeek.
 */
export function buildWeekReceipt({ week, firstWeek, firstKickoffUtc, events, asOf, protocol, protocolRef, registration, builtFromCommit, inputs }) {
  if (!(Number.isInteger(firstWeek) && week >= firstWeek)) throw new Error(`week ${week} is before the registered first week ${firstWeek}: it never counts`);
  const model = protocol.model;
  const series = protocol.series;
  const ledger = [];
  const pending = {};
  for (const ev of [...events].sort((a, b) => kickMs(a.kickoffUtc) - kickMs(b.kickoffUtc) || byStr(a.eventId, b.eventId))) {
    const code = classifyEvent(ev, { asOf, model, series });
    if (isPending(code)) { pending[code] = (pending[code] ?? 0) + 1; continue; }
    const rev = ev.revision;
    ledger.push({
      eventId: ev.eventId, matchup: ev.matchup ?? null, kickoffUtc: ev.kickoffUtc, inSchedule: ev.inSchedule !== false, code,
      reason: code === EVENT_CODE.GRADED ? null : EXCLUSION_REASON[code],
      attribution: rev ? {
        boardRevision: rev.commit, committedAt: rev.committedAt, boardGeneratedAt: rev.generatedAt,
        familyState: rev.family?.state ?? null, familyBasis: rev.family?.basis ?? rev.family?.reason ?? null,
        servedModel: rev.servedModel ?? null,
        engine: code === EVENT_CODE.GRADED ? model.engineId : null,
        pipelineVersion: rev.pipelineVersion ?? null,
        identityMismatches: rev.identityMismatches ?? [],
        roleSharesArtifactSha256: rev.roleSharesSha256 ?? null,
        boardBuilderSha256: rev.boardBuilderSha256 ?? null,
        committedBeforeKickoff: Date.parse(rev.committedAt) < kickMs(ev.kickoffUtc),
        generatedBeforeKickoff: Date.parse(rev.generatedAt) < kickMs(ev.kickoffUtc),
      } : null,
      gameId: code === EVENT_CODE.GRADED ? ev.gameId : null,
    });
  }
  if (Object.keys(pending).length) return { pending };

  const rows = [];
  for (const ev of [...events].filter((e) => ledger.find((l) => l.eventId === e.eventId)?.code === EVENT_CODE.GRADED).sort((a, b) => byStr(a.eventId, b.eventId))) {
    for (const r of [...ev.rows].sort((a, b) => byStr(String(a[2]), String(b[2])))) rows.push(r.map(r4));
  }
  const rowTally = Object.fromEntries(ROW_STATES.map((s) => [s, 0]));
  for (const r of rows) rowTally[r[ROW_COLUMNS.indexOf("state")]] += 1;
  const byCode = {};
  for (const l of ledger) byCode[l.code] = (byCode[l.code] ?? 0) + 1;
  const denominator = {
    scheduledEvents: events.filter((e) => e.inSchedule !== false).length,
    boardOnlyEvents: events.filter((e) => e.inSchedule === false).length,
    events: ledger.length,
    graded: byCode.GRADED ?? 0,
    excluded: Object.fromEntries(Object.entries(byCode).filter(([k]) => k !== EVENT_CODE.GRADED).sort(([a], [b]) => byStr(a, b))),
    servedRows: rows.length,
    rowStates: rowTally,
  };
  denominator.closes = denominator.events === denominator.scheduledEvents + denominator.boardOnlyEvents
    && denominator.graded + Object.values(denominator.excluded).reduce((s, n) => s + n, 0) === denominator.events
    && Object.values(rowTally).reduce((s, n) => s + n, 0) === rows.length;
  if (!denominator.closes) throw new Error(`week ${week}: denominator does not close ${JSON.stringify(denominator)}`);
  const points = pointsFromRows(rows, week, series.pipelineVersion);
  return {
    receipt: {
      schemaVersion: REGISTRATION_SCHEMA_VERSION,
      artifact: "props-v1-reception-yds-forward-week",
      dataClass: "PRIVATE_RESEARCH",
      ledgerRow: "N8",
      market: MARKET,
      season: protocol.season,
      week,
      firstKickoffUtc,
      evidenceTier: "REGISTERED_FORWARD — counted toward the forward n: the week's first kickoff is after the protocol's registration commit, and every graded number is the last board revision committed and generated before its kickoff",
      protocol: protocolRef,
      registration,
      firstWeek,
      series: { id: series.id, pipelineVersion: series.pipelineVersion },
      builtFromCommit,
      inputs,
      engine: { id: model.engineId, servedModelId: model.servedModelId },
      pOverMethod: protocol.pOver.method,
      denominator,
      events: ledger,
      columns: [...ROW_COLUMNS],
      rows,
      weekMetrics: pointMetrics(points, protocol.bars.propsV1Promotion),
    },
  };
}

/** Append-only write: a week file that exists is NEVER rewritten. Returns "written" | "unchanged" | "kept-existing". */
export function appendWeekReceipt({ fs, path, dir, week, season, receipt }) {
  const file = path.join(dir, weekFileName(season, week));
  const text = stableJson(receipt);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8") === text ? "unchanged" : "kept-existing";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, text, { flag: "wx" }); // wx: fail rather than clobber if another writer got there first
  return "written";
}
export const weekFileName = (season, week) => `${season}-wk${String(week).padStart(2, "0")}.json`;

/**
 * The cumulative forward state from the written week receipts only (never from pre-registration weeks). The
 * `families` entry has the shape the product gate reads ({state, n, needed, metrics}).
 */
export function summarize({ protocol, protocolRef, registration, firstWeek, firstWeekFirstKickoffUtc, weekReceipts, pendingWeeks, retrospective }) {
  const series = protocol.series;
  const counted = [...weekReceipts].filter((w) => w.week >= firstWeek).sort((a, b) => a.week - b.week);
  if (counted.length !== weekReceipts.length) throw new Error("a week before the registered first week was handed to the summary: it never counts");
  for (const w of counted) {
    if (w.series?.id !== series.id || w.series?.pipelineVersion !== series.pipelineVersion) throw new Error(`week ${w.week} belongs to series ${w.series?.id}/${w.series?.pipelineVersion}, not ${series.id}/${series.pipelineVersion} — series are never pooled`);
  }
  const bars = protocol.bars.propsV1Promotion;
  const points = counted.flatMap((w) => pointsFromRows(w.rows, w.week, series.pipelineVersion));
  const verdict = judgePropsV1(pointMetrics(points, bars), bars);
  const lvl = protocol.bars.shareLevelLevel;
  const level = verdict.metrics?.level ?? null;
  return {
    schemaVersion: REGISTRATION_SCHEMA_VERSION,
    artifact: "props-v1-reception-yds-forward-summary",
    dataClass: "PRIVATE_RESEARCH",
    ledgerRow: "N8",
    market: MARKET,
    season: protocol.season,
    evidenceTier: "REGISTERED_FORWARD — only weeks whose first kickoff is after the registration commit; derived from the week receipts in this directory",
    protocol: protocolRef,
    registration,
    firstWeek,
    firstWeekFirstKickoffUtc,
    series: { id: series.id, pipelineVersion: series.pipelineVersion },
    verdictRule: protocol.verdictRule,
    weeksCounted: counted.map((w) => ({ week: w.week, file: weekFileName(protocol.season, w.week), n: pointsFromRows(w.rows, w.week, series.pipelineVersion).length, graded: w.denominator.graded, excluded: w.denominator.excluded })),
    pendingWeeks,
    families: {
      [MARKET]: { state: verdict.state, n: verdict.n, needed: bars.minimumN, metrics: verdict.metrics ?? null, bars: verdict.bars ?? null, engine: protocol.model.engineId },
    },
    shareLevelLevelBar: {
      reportedSeparately: "not part of the verdict — the props-v1 promotion bars have no level clause",
      levelBand: lvl.levelBand, source: lvl.source, level,
      pass: verdict.n >= bars.minimumN && level != null ? level >= lvl.levelBand[0] && level <= lvl.levelBand[1] : null,
    },
    intervals: points.length ? clusteredIntervals(points, bars) : null,
    retrospective,
    consequence: "Research evidence only. The board's PUBLISHED label and every public number are unchanged; family eligibility reads this file only behind GTP_NFL_PROPS_V1_FORWARD_ELIGIBILITY (default OFF). A label change is a founder decision.",
  };
}
