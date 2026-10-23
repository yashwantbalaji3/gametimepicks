/**
 * FORECAST PROVENANCE — model identity, event start and publication evidence for every ledger row (audit 2026-10-23,
 * A-T07 · F01). Pure, except for the reader the caller passes in.
 *
 * Three fields decide whether a row can be attributed and checked for leakage:
 *
 *   modelId      which model published it
 *   eventStart   when the event started (point in time, as recorded before it started)
 *   publishedAt  when the forecast was stamped, as the publishing file recorded it
 *
 * Each field of each row has ONE provenance state:
 *
 *   RECEIPT         a committed file in this repository records the value — the owner's record the row was read from,
 *                   or a committed forecast file / pre-start snapshot that matches the row exactly (see the matchers)
 *   GIT_HISTORY     the value comes from a past revision of the file that published the forecast, named by commit
 *   LEGACY_UNKNOWN  nothing committed substantiates a value. It stays empty: never a guess, never "now", never 0
 *
 * A row's state is the weakest of its three fields (LEGACY_UNKNOWN < GIT_HISTORY < RECEIPT). Promotion evaluations
 * exclude LEGACY_UNKNOWN rows; the Forecast Record page and the CSVs show the count per family.
 *
 * WHERE A RECOVERED VALUE LIVES. The row's own fields (`modelId`, `eventStart`, `publishedAt`) are IMMUTABLE: they hold
 * what the owner recorded when the row entered the ledger, and they never change (append-only.mjs). A value recovered
 * later goes into `provenance.recovered.<field>` = { value, state, source[, committedAt] } instead. Once there it is
 * frozen too: the builder carries it forward even if the file it came from is later overwritten, and the append-only
 * guard refuses any change to it.
 *
 * `modelVersion` is not one of the three. Most owners record one model identity string (e.g. "nfl-player-share-level-v1",
 * "ufc-fight-model@e657fc40b64d") and no separate version; the export leaves modelVersion empty there rather than
 * splitting the string.
 *
 * "Published" here means "stamped by the publishing file, and (for git evidence) committed, before the start". It is
 * not proof that a READY Production deployment served it (Option B, 2026-10-09) — that evidence is a separate check.
 */
import { PLAYER_PROPS } from "../sports/nfl/week-reconciliation.mjs";

export const PROVENANCE_STATE = Object.freeze({
  RECEIPT: "RECEIPT",
  GIT_HISTORY: "GIT_HISTORY",
  LEGACY_UNKNOWN: "LEGACY_UNKNOWN",
});
const RANK = { LEGACY_UNKNOWN: 0, GIT_HISTORY: 1, RECEIPT: 2 };

export const PROVENANCE_FIELDS = Object.freeze(["modelId", "eventStart", "publishedAt"]);
const TIME_FIELDS = new Set(["eventStart", "publishedAt"]);

/** The committed git-history evidence (written by scripts/results/recover-forecast-provenance-git.mjs, full clone only). */
export const GIT_EVIDENCE_REL = "data/internal/forecast-ledger/v1/evidence/git-history.json";
export const GIT_EVIDENCE_SCHEMA = "forecast-ledger-evidence@1";

/** The committed record each owner's rows are read from — the source of every value a row carries itself. */
export const OWNER_RECORDS = Object.freeze({
  "nfl-experimental-settlement": "data/internal/nfl/experimental-settlement/ + data/internal/nfl/forecast-receipts/",
  "nfl-prop-settlement": "data/internal/nfl/prop-settlement/",
  "results-top-board": "app/public/data/results/top-boards/",
  "nfl-week-reconciliation": "app/public/data/nfl/reconciliation/",
  "mlb-game-grades": "app/public/data/mlb/results/game-predictions-graded.jsonl",
  "mlb-projected-score-grades": "app/public/data/mlb/results/game-projected-scores-graded.jsonl",
  "mlb-homer-nukes-settled": "app/public/data/mlb/homer-nukes/",
  "epl-match-grades": "app/public/data/soccer/epl/results/graded-forecasts.jsonl",
  "epl-player-grades": "app/public/data/soccer/epl/results/graded-player-projections.jsonl",
  "epl-derived-market-grades": "app/public/data/soccer/epl/results/graded-derived-markets.jsonl",
  "ligue-1-grades": "app/public/data/soccer/ligue-1/results/graded.json",
  "ufc-model-vs-market-grades": "data/internal/research/ufc/model-vs-market/graded.jsonl",
});

/** The exact committed file behind a row's own values: its receipt when the receipt is a repository path, else the owner record. */
export function ownerRecord(row) {
  const rid = String(row?.receiptId ?? "");
  if (/^data\/internal\/[^#]+\.json/.test(rid)) return rid;
  if (/^(mlb\/homer-nukes|nfl\/reconciliation)\/[^#]+\.json/.test(rid)) return `app/public/data/${rid}`;
  return OWNER_RECORDS[row?.provenance?.owner] ?? row?.provenance?.owner ?? null;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const sameInstant = (a, b) => isIso(a) && isIso(b) && Date.parse(a) === Date.parse(b);
const isGitRef = (s) => typeof s === "string" && s.startsWith("git:");

/** Is this a well-formed recovered entry? Returns a list of problems (empty = valid). */
export function validateRecovered(field, e) {
  const p = [];
  if (!PROVENANCE_FIELDS.includes(field)) p.push(`recovered field ${field} is not a provenance field`);
  if (!e || typeof e !== "object") return [...p, `recovered.${field} is not an object`];
  if (e.state !== PROVENANCE_STATE.RECEIPT && e.state !== PROVENANCE_STATE.GIT_HISTORY) p.push(`recovered.${field}.state ${e.state}`);
  if (typeof e.value !== "string" || !e.value) p.push(`recovered.${field}.value`);
  else if (TIME_FIELDS.has(field) && !isIso(e.value)) p.push(`recovered.${field}.value is not an instant`);
  if (typeof e.source !== "string" || !e.source) p.push(`recovered.${field}.source`);
  if (e.state === PROVENANCE_STATE.GIT_HISTORY && !isGitRef(e.source)) p.push(`recovered.${field}: git evidence must name its commit (git:<sha>:<path>)`);
  if (e.committedAt != null && !isIso(e.committedAt)) p.push(`recovered.${field}.committedAt`);
  return p;
}

/**
 * One field's provenance: { state, value, source[, committedAt] }. The row's own value first (RECEIPT — or GIT_HISTORY
 * when the owner read that forecast from a git revision), then a recovered value, else LEGACY_UNKNOWN.
 */
export function fieldProvenance(row, field) {
  const own = row?.[field];
  if (own != null && own !== "") {
    const viaGit = isGitRef(row.receiptId) && field !== "eventStart";
    const record = ownerRecord(row);
    return viaGit
      ? { state: PROVENANCE_STATE.GIT_HISTORY, value: own, source: `${row.receiptId} (recorded by ${record})` }
      : { state: PROVENANCE_STATE.RECEIPT, value: own, source: record };
  }
  const rec = row?.provenance?.recovered?.[field];
  if (rec) return { ...rec };
  return { state: PROVENANCE_STATE.LEGACY_UNKNOWN, value: null, source: null };
}

/** The row's state (weakest of the three fields) and each field's provenance. */
export function rowProvenance(row) {
  const fields = Object.fromEntries(PROVENANCE_FIELDS.map((f) => [f, fieldProvenance(row, f)]));
  const state = PROVENANCE_FIELDS.map((f) => fields[f].state).reduce((a, b) => (RANK[b] < RANK[a] ? b : a), PROVENANCE_STATE.RECEIPT);
  return { state, fields };
}

/** { RECEIPT, GIT_HISTORY, LEGACY_UNKNOWN } row counts, every key present. */
export function provenanceCounts(rows) {
  const c = { RECEIPT: 0, GIT_HISTORY: 0, LEGACY_UNKNOWN: 0 };
  for (const r of rows) c[rowProvenance(r).state] += 1;
  return c;
}

// ── RECEIPT matchers: a committed forecast file that matches the row EXACTLY substantiates a missing field ─────────
// Each takes (row, read) where read(relPath) returns the parsed committed file or null, and returns { field: entry }.
// A matcher that cannot match exactly returns {} — it never relaxes a check to fill a value.

const RECON_ROUND = new Map(PLAYER_PROPS.map((p) => [p.key, p.round]));
const nflBoardPath = (eventId) => `app/public/data/nfl/player-board/${eventId}.json`;

/**
 * NFL player board (`player-board/<eventId>.json`, the file the live-prop freeze and the week reconciliation read).
 *  - A frozen prop row (publishedAt = the board's generatedAt): the board on file must carry that SAME generatedAt and
 *    the same median / probability for the player. Then `families.<family>.model` is the model that published it.
 *  - A Weeks 1–2 reconciliation row (no publishedAt): the board on file must be generated before kickoff, carry the
 *    family in the same state, and round to exactly the printed values (the reconciliation's own rounding). Then its
 *    generatedAt is the publication stamp, and `families.<family>.model` (where the board names one) the model.
 */
export function nflBoardEvidence(row, read) {
  if (row.sport !== "NFL" || row.publicationSurface !== "nfl-player-board") return {};
  const path = nflBoardPath(row.eventId);
  const board = read(path);
  const player = (board?.players ?? []).find((p) => p?.playerId === row.subjectId);
  const m = player?.markets?.[row.family];
  const fam = board?.families?.[row.family];
  if (!board || !m || !fam || !isIso(board.generatedAt)) return {};
  const out = {};
  if (row.publishedAt != null) {
    if (!sameInstant(board.generatedAt, row.publishedAt)) return {};
    const same = row.forecastKind === "BINARY_PROBABILITY" ? m.probability === row.probability : m.median === row.projection;
    if (!same) return {};
  } else {
    if (!(Date.parse(board.generatedAt) < Date.parse(row.eventStart))) return {};
    if (row.forecastKind === "BINARY_PROBABILITY") {
      if (fam.state !== "PUBLISHED" || m.probability !== row.probability) return {};
    } else {
      const round = RECON_ROUND.get(row.family);
      if (!round || fam.state !== row.modelStatusAtPublish) return {};
      if (!(isNum(m.median) && isNum(m.p10) && isNum(m.p90))) return {};
      if (round(m.median) !== row.projection || round(m.p10) !== row.rangeLow || round(m.p90) !== row.rangeHigh) return {};
    }
    out.publishedAt = { value: board.generatedAt, state: PROVENANCE_STATE.RECEIPT, source: `${path}#generatedAt` };
  }
  if (row.modelId == null && typeof fam.model === "string" && fam.model) {
    out.modelId = { value: fam.model, state: PROVENANCE_STATE.RECEIPT, source: `${path}#families.${row.family}.model` };
  }
  return out;
}

/**
 * EPL player projections snapshot (the exact file the grader names). Only ANYTIME GOALSCORER: the snapshot's `model.id`
 * is the goal model. The shots-on-goal probability comes from a separate fit the snapshot does not identify, so those
 * rows get no model from here.
 */
export function eplPlayerSnapshotEvidence(row, read) {
  if (row.sport !== "EPL" || row.family !== "epl_anytime_goalscorer" || row.modelId != null || !row.receiptId) return {};
  if (!/^snapshot-\d{12}\.json$/.test(row.receiptId)) return {};
  const path = `app/public/data/soccer/epl/player-projections/${row.receiptId}`;
  const snap = read(path);
  if (!snap || !sameInstant(snap.generatedAt, row.publishedAt) || typeof snap.model?.id !== "string") return {};
  const playerId = String(row.subjectId).replace(/^epl-athlete-/, "");
  const hit = (snap.fixtures ?? []).some((f) => sameInstant(f.kickoffUtc, row.eventStart)
    && (f.players ?? []).some((p) => String(p.playerId) === playerId && p.probability === row.probability));
  return hit ? { modelId: { value: snap.model.id, state: PROVENANCE_STATE.RECEIPT, source: `${path}#model.id` } } : {};
}

/** Ligue 1 dated forecast archives: the row the grader graded (same event, same forecastAt, same 1X2) names its model. */
export function ligue1ArchiveEvidence(row, read, list) {
  if (row.sport !== "LIGUE_1" || row.modelId != null) return {};
  const dir = "app/public/data/soccer/ligue-1/forecasts";
  for (const f of list(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const doc = read(`${dir}/${f}`);
    for (const a of doc?.rows ?? []) {
      if (a.eventId !== row.eventId || !sameInstant(a.forecastAt, row.publishedAt)) continue;
      const cp = row.classProbabilities ?? {};
      if (!(a.probs && a.probs.home === cp.home && a.probs.draw === cp.draw && a.probs.away === cp.away)) continue;
      if (typeof a.modelId !== "string" || !a.modelId) continue;
      return { modelId: { value: a.modelId, state: PROVENANCE_STATE.RECEIPT, source: `${dir}/${f}#rows[eventId=${a.eventId}].modelId` } };
    }
  }
  return {};
}

/**
 * UFC pre-fight snapshot (the exact file the grader names): same capture instant, same bout, same model probability.
 * Its `event.startUtc` is the CARD's scheduled start, recorded before the card. Every bout starts at or after it, so it
 * is the event start the ledger can substantiate (the bout's own start was never recorded).
 */
export function ufcSnapshotEvidence(row, read) {
  if (row.sport !== "UFC" || row.eventStart != null || !/^snapshot-\d{12}\.json$/.test(String(row.receiptId))) return {};
  const path = `data/internal/research/ufc/model-vs-market/${row.receiptId}`;
  const snap = read(path);
  if (!snap || !sameInstant(snap.capturedAt, row.publishedAt) || !isIso(snap.event?.startUtc)) return {};
  const bout = (snap.rows ?? []).find((b) => String(b.providerBoutId) === row.eventId && b.modelProbability === row.probability);
  return bout ? { eventStart: { value: snap.event.startUtc, state: PROVENANCE_STATE.RECEIPT, source: `${path}#event.startUtc` } } : {};
}

export function receiptEvidence(row, read, list) {
  return { ...nflBoardEvidence(row, read), ...eplPlayerSnapshotEvidence(row, read), ...ligue1ArchiveEvidence(row, read, list), ...ufcSnapshotEvidence(row, read) };
}

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/**
 * Attach `provenance.recovered` to every row. For each of the three fields the row does not carry itself, in order:
 *   1. the value already recovered for this row in the committed ledger (frozen — carried forward, never re-derived);
 *   2. a RECEIPT matcher over committed files;
 *   3. the committed git-history evidence.
 * A candidate is dropped (and reported) if it is malformed, or if it would put publication at or after the start.
 *
 * @param rows        composed ledger rows
 * @param opts.read   (relPath) => parsed committed file | null
 * @param opts.list   (relDir) => file names
 * @param opts.git    Map<forecastId, { field: entry }> from the committed git-history evidence
 * @param opts.prior  Map<forecastId, recovered> from the committed ledger
 * @returns {{ rows, report: { conflicts: string[], refused: string[] } }}
 */
export function attachRecovered(rows, { read = () => null, list = () => [], git = new Map(), prior = new Map() } = {}) {
  const report = { conflicts: [], refused: [] };
  const out = rows.map((row) => {
    const kept = prior.get(row.forecastId) ?? {};
    const fresh = { ...(git.get(row.forecastId) ?? {}), ...receiptEvidence(row, read, list) };
    const recovered = {};
    for (const f of PROVENANCE_FIELDS) {
      if (row[f] != null) continue;
      if (kept[f] && fresh[f] && stable(kept[f]) !== stable(fresh[f])) report.conflicts.push(`${row.forecastId} ${f}: committed ${stable(kept[f])} kept over ${stable(fresh[f])}`);
      const e = kept[f] ?? fresh[f];
      if (!e) continue;
      const bad = validateRecovered(f, e);
      if (bad.length) { report.refused.push(`${row.forecastId}: ${bad.join("; ")}`); continue; }
      recovered[f] = e;
    }
    // Leakage: a publication stamp at or after the start is never evidence of a forecast of record.
    const pub = row.publishedAt ?? recovered.publishedAt?.value ?? null;
    const start = row.eventStart ?? recovered.eventStart?.value ?? null;
    if (pub && start && !(Date.parse(pub) < Date.parse(start)) && recovered.publishedAt) {
      report.refused.push(`${row.forecastId}: recovered publishedAt ${pub} is not before the start ${start}`);
      delete recovered.publishedAt;
    }
    const ordered = Object.fromEntries(PROVENANCE_FIELDS.filter((f) => recovered[f]).map((f) => [f, recovered[f]]));
    return { ...row, provenance: { ...row.provenance, recovered: ordered } };
  });
  return { rows: out, report };
}
