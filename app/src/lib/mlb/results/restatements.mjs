/**
 * TRUTH-001 · STAGE B — MLB forecast-of-record RESTATEMENTS, applied at read time. PURE and FAIL-CLOSED.
 *
 * Founder decision 2 (2026-10-10). The MLB grade logs (game-predictions-graded.jsonl, game-projected-scores-graded.jsonl)
 * are append-only by contract and are NEVER rewritten. A committed restatement log
 * (data/internal/mlb/forecast-of-record-restatements/<id>.json) states, per affected row, the EXACT stored row (the
 * before-state, asserted byte for byte) and what replaces it:
 *   - SERVED_DIFFERENT_REVISION: the row regraded from the revision the public site actually served before first pitch
 *     (re-derived by the production grading functions when the log is built and in --check);
 *   - NOT_SERVED: the graded forecast was never public; the row is kept but marked, and is excluded from verified
 *     public forecast-performance reporting (never a loss, never substituted).
 * Every other row passes through untouched. Any mismatch — a before-state that no longer matches, a key that matches
 * no row or two rows, an id restated twice — throws: no reader may silently carry a partial restatement.
 *
 * Games classified UNVERIFIED are not in any log: they keep their stored grade and their distinct classification.
 */

export const RESTATEMENT_SCHEMA = "gtp.mlb.forecast-of-record-restatement@1";
export const RESTATEMENT_KIND = Object.freeze({ SERVED_DIFFERENT_REVISION: "SERVED_DIFFERENT_REVISION", NOT_SERVED: "NOT_SERVED" });
export const PUBLICATION_NOT_SERVED = "NOT_SERVED";

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const keyOf = (log, r) => (log === "game-projected-scores-graded" ? `${r.date}|${r.gamePk}` : `${r.date}|${r.gamePk}|${r.market}`);

/**
 * Index committed logs (sorted by file name). Throws on a wrong schema or the same row restated twice.
 * @param {Array<{ file: string, doc: object }>} logs
 * @returns {Map<string, { log: string, kind: string, before: object, after: object|null, restatementId: string, gameKey: string, evidence: object, file: string }>}
 */
export function indexRestatements(logs) {
  const out = new Map();
  for (const { file, doc } of [...(logs ?? [])].sort((a, b) => String(a.file).localeCompare(String(b.file)))) {
    if (doc?.schema !== RESTATEMENT_SCHEMA) throw new Error(`mlb restatements: ${file} is not ${RESTATEMENT_SCHEMA}`);
    for (const g of doc.games ?? []) {
      if (!Object.values(RESTATEMENT_KIND).includes(g.kind)) throw new Error(`mlb restatements: ${file} ${g.gamePk} has unknown kind ${g.kind}`);
      for (const r of g.rows ?? []) {
        const k = `${r.log}|${keyOf(r.log, r.before)}`;
        if (out.has(k)) throw new Error(`mlb restatements: ${k} restated twice (${out.get(k).file}, ${file})`);
        if (g.kind === RESTATEMENT_KIND.SERVED_DIFFERENT_REVISION && !r.after) throw new Error(`mlb restatements: ${k} has no after-state`);
        if (g.kind === RESTATEMENT_KIND.NOT_SERVED && r.after != null) throw new Error(`mlb restatements: ${k} is NOT_SERVED but carries a replacement`);
        out.set(k, { log: r.log, kind: g.kind, before: r.before, after: r.after ?? null, restatementId: doc.restatementId, gameKey: `${g.date}|${g.gamePk}`, evidence: g.evidence ?? null, file });
      }
    }
  }
  return out;
}

/**
 * The rows OF RECORD for one grade log. Restated rows carry `restatement: { id, kind, replacedSource }`; NOT_SERVED rows
 * keep their stored values and carry `publication: "NOT_SERVED"`.
 * @param {"game-predictions-graded"|"game-projected-scores-graded"} log
 * @param {object[]} stored  the log's rows exactly as committed
 * @param {ReturnType<typeof indexRestatements>} index
 */
export function rowsOfRecord(log, stored, index) {
  const wanted = [...index.values()].filter((e) => e.log === log);
  if (!wanted.length) return stored;
  const seen = new Map();
  const out = stored.map((row) => {
    const k = `${log}|${keyOf(log, row)}`;
    const e = index.get(k);
    if (!e) return row;
    if (seen.has(k)) throw new Error(`mlb restatements: ${k} matches more than one stored row`);
    seen.set(k, true);
    if (stable(row) !== stable(e.before)) throw new Error(`mlb restatements: ${k} stored row no longer matches the asserted before-state (${e.file})`);
    if (e.kind === RESTATEMENT_KIND.NOT_SERVED) {
      return { ...row, publication: PUBLICATION_NOT_SERVED, restatement: { id: e.restatementId, kind: e.kind, replacedSource: null } };
    }
    return { ...e.after, restatement: { id: e.restatementId, kind: e.kind, replacedSource: row.forecastSource } };
  });
  for (const e of wanted) {
    const k = `${log}|${keyOf(log, e.before)}`;
    if (!seen.has(k)) throw new Error(`mlb restatements: ${k} (${e.file}) matches no stored row`);
  }
  return out;
}

/** Whether a row of record counts in VERIFIED public forecast-performance reporting. NOT_SERVED never does. */
export const countsAsPublicForecast = (row) => row?.publication !== PUBLICATION_NOT_SERVED;
