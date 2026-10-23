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
 *
 * This module is pure and does no I/O (public pages import it; its paths are provenance labels). The matchers that
 * read committed files, and the git-history evidence, live in provenance-evidence.mjs (ledger builder only).
 */
export const PROVENANCE_STATE = Object.freeze({
  RECEIPT: "RECEIPT",
  GIT_HISTORY: "GIT_HISTORY",
  LEGACY_UNKNOWN: "LEGACY_UNKNOWN",
});
const RANK = { LEGACY_UNKNOWN: 0, GIT_HISTORY: 1, RECEIPT: 2 };

export const PROVENANCE_FIELDS = Object.freeze(["modelId", "eventStart", "publishedAt"]);
const TIME_FIELDS = new Set(["eventStart", "publishedAt"]);

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

const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
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
