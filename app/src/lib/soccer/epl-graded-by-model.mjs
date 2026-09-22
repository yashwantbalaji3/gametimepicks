/**
 * THE GRADED LEDGER, SPLIT BY THE MODEL THAT MADE EACH FORECAST — v1.7 F2 evidence repair (G1).
 *
 * graded-forecasts.jsonl is ONE append-only ledger shared by every EPL match model that has ever
 * published. When P304 (epl-model-v2-elo-poisson) replaced the split Poisson on 2026-09-14, the
 * forecast builder kept counting the whole ledger as "graded under this model": 36 rows, every one
 * forecast by epl-model-v1-split-poisson, printed on /epl beside P304's numbers as if they were its
 * live record — while P304's own forward receipt honestly said n = 0 of 60. Two true statements on
 * one page that, read together, credited a model with a record it had not earned.
 *
 * The raw history is untouched. Only the INTERPRETATION changes: every count, mean and calibration
 * figure attributed to the live model is computed over rows whose `modelId` is the live model's, and
 * everything else is kept visible as a separately labelled prior-model bucket. A ledger with zero
 * rows for the live model yields n = 0 and NULL for every figure — never 0.0, which would be a
 * calibration claim.
 *
 * Pure: no fs, no clock. The caller supplies the rows and the model id.
 */

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r6 = (v) => (v == null ? null : Number(v.toFixed(6)));

/** Figures for one bucket of graded rows. Every figure is null at n = 0; nothing here is ever a bare zero. */
function summarise(modelId, rows) {
  const logLoss = rows.map((r) => num(r?.scores?.logLoss)).filter((v) => v != null);
  const brier = rows.map((r) => num(r?.scores?.brier)).filter((v) => v != null);
  const over25 = rows.map((r) => num(r?.scores?.over25?.brier)).filter((v) => v != null);
  const paired = rows.filter((r) => num(r?.market?.scores?.logLoss) != null);
  const kickoffs = rows.map((r) => Date.parse(r?.kickoffUtc ?? "")).filter(Number.isFinite);
  return {
    modelId,
    n: rows.length,
    hits: rows.filter((r) => r?.scores?.hit === true).length,
    meanLogLoss: r6(mean(logLoss)),
    meanBrier: r6(mean(brier)),
    over25Brier: r6(mean(over25)),
    pairedWithMarket: paired.length,
    firstKickoffUtc: kickoffs.length ? new Date(Math.min(...kickoffs)).toISOString() : null,
    lastKickoffUtc: kickoffs.length ? new Date(Math.max(...kickoffs)).toISOString() : null,
  };
}

/**
 * @param {Array<object>} rows   graded-forecasts.jsonl entries, any order
 * @param {{ modelId: string }} opts  the LIVE model — the only one whose rows are "under this model"
 * @returns {{ modelId: string, current: object, prior: object[], unattributed: number, total: number }}
 */
export function splitEplGradedByModel(rows, { modelId }) {
  if (typeof modelId !== "string" || !modelId) throw new Error("splitEplGradedByModel: a live modelId is required — an unlabelled split would count every row as the live model's");
  const all = Array.isArray(rows) ? rows.filter((r) => r && typeof r === "object") : [];
  const mine = all.filter((r) => r.modelId === modelId);
  const others = new Map();
  let unattributed = 0;
  for (const r of all) {
    if (r.modelId === modelId) continue;
    if (typeof r.modelId !== "string" || !r.modelId) { unattributed += 1; continue; }
    if (!others.has(r.modelId)) others.set(r.modelId, []);
    others.get(r.modelId).push(r);
  }
  return {
    modelId,
    current: summarise(modelId, mine),
    /* Oldest-adopted first is unknowable from the ledger alone; sorted by id so the output is stable. */
    prior: [...others.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, rs]) => summarise(id, rs)),
    unattributed,
    total: all.length,
  };
}

/**
 * The public sentence about the live model's record, derived from the split and nothing else.
 *
 * Refuses to quote an accuracy figure at any sample size, exactly as before; what changes is that the
 * count it states is the LIVE model's, and rows graded under a previous model are named as such
 * rather than folded in. The phrases "no track record to cite" and "graded under this model" are
 * pinned by public-route-inventory.test.mjs — keep them.
 */
export function eplTrackRecordSentence(split, { adopted = false } = {}) {
  if (split == null) return "The graded record could not be read, so no accuracy claim is made here.";
  const n = split.current.n;
  const priorN = split.prior.reduce((s, p) => s + p.n, 0);
  const priorClause = priorN > 0
    ? ` ${priorN} match${priorN === 1 ? " was" : "es were"} graded under the model this one replaced; that record is kept separately and is not evidence for this model.`
    : "";
  if (n === 0) {
    return "No Premier League match has been graded under this model. There is no win/loss record, no accuracy figure, and no track record to cite." + priorClause;
  }
  return `${n} Premier League match${n === 1 ? " has" : "es have"} been graded under this model — far too few to support any accuracy claim. ` +
    (adopted
      ? "No live win rate or accuracy figure is quoted until its season record is large enough to mean something."
      : "No win rate or accuracy figure is quoted, and this model has not been validated out of sample.") +
    priorClause;
}

/** The artifact field that travels beside the sentence, so a reader can check the count it states. */
export function eplGradedRecordField(split) {
  if (split == null) return null;
  return {
    modelId: split.modelId,
    gradedUnderThisModel: split.current.n,
    priorModels: split.prior.map((p) => ({ modelId: p.modelId, graded: p.n })),
    unattributed: split.unattributed,
    ledgerTotal: split.total,
    note: "Counts by the modelId on each graded row. Figures for the live model exist only over its own rows; a previous model's record is not this model's evidence.",
  };
}
