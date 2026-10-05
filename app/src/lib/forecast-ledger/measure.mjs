/**
 * FAMILY-APPROPRIATE MEASUREMENT (Session 13 · Phase H, D1–D5). Pure.
 *
 * One forecast observation carries ONE measurement object, whose fields depend on what kind of claim it was:
 *   CONTINUOUS  → absoluteError, squaredError, signedError (projection − actual: positive = over-projected),
 *                 insideRange (only if a range was printed)
 *   BINARY      → brier, logLoss, observed (the 0/1 outcome scored)
 *   MULTICLASS  → brier (sum over classes), logLoss, topClassHit
 * plus, on any kind, the OWNER's directional word (WIN / LOSS / PUSH / VOID) — carried only when the owner graded a
 * directional claim that was actually published, with `directionalBasis` naming that claim. A continuous projection
 * never receives a W/L from this module: there is no line here to invent one against.
 *
 * Nothing here decides an outcome. `finalValue` / `observed` / `finalCategory` come from the owner's settlement.
 */

const EPS = 1e-6;
const clamp01 = (p) => Math.min(1 - EPS, Math.max(EPS, p));
const r6 = (v) => (v == null ? null : Number(v.toFixed(6)));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const EMPTY_MEASUREMENT = Object.freeze({
  type: null,
  absoluteError: null,
  squaredError: null,
  signedError: null,
  insideRange: null,
  brier: null,
  logLoss: null,
  topClassHit: null,
  observed: null,
  directionalResult: null,
  directionalBasis: null,
});

export function measureContinuous({ projection, rangeLow = null, rangeHigh = null, finalValue }) {
  if (!isNum(projection) || !isNum(finalValue)) return { ...EMPTY_MEASUREMENT };
  const e = projection - finalValue;
  return {
    ...EMPTY_MEASUREMENT,
    type: "CONTINUOUS_ERROR",
    absoluteError: r6(Math.abs(e)),
    squaredError: r6(e * e),
    signedError: r6(e),
    insideRange: isNum(rangeLow) && isNum(rangeHigh) ? finalValue >= rangeLow && finalValue <= rangeHigh : null,
  };
}

export function measureBinary({ probability, observed }) {
  if (!isNum(probability) || (observed !== 0 && observed !== 1)) return { ...EMPTY_MEASUREMENT };
  const p = clamp01(probability);
  return {
    ...EMPTY_MEASUREMENT,
    type: "PROBABILITY_SCORE",
    observed,
    brier: r6((p - observed) ** 2),
    logLoss: r6(observed === 1 ? -Math.log(p) : -Math.log(1 - p)),
  };
}

export function measureMulticlass({ classProbabilities, finalCategory }) {
  const cp = classProbabilities;
  if (!cp || typeof cp !== "object" || !(finalCategory in cp)) return { ...EMPTY_MEASUREMENT };
  const keys = Object.keys(cp);
  if (!keys.every((k) => isNum(cp[k]))) return { ...EMPTY_MEASUREMENT };
  let brier = 0;
  for (const k of keys) brier += (cp[k] - (k === finalCategory ? 1 : 0)) ** 2;
  // Top class: ties for the maximum are not a hit for any one class.
  const max = Math.max(...keys.map((k) => cp[k]));
  const top = keys.filter((k) => cp[k] === max);
  return {
    ...EMPTY_MEASUREMENT,
    type: "MULTICLASS_SCORE",
    brier: r6(brier),
    logLoss: r6(-Math.log(clamp01(cp[finalCategory]))),
    topClassHit: top.length === 1 ? top[0] === finalCategory : null,
  };
}

/** Attach the owner's directional word. Refuses words the contract does not know. */
export function withDirectional(measurement, { result, basis }) {
  const allowed = ["WIN", "LOSS", "PUSH", "VOID"];
  if (result == null) return measurement;
  if (!allowed.includes(result)) throw new Error(`directional result ${result} is not an owner settlement word`);
  if (!basis) throw new Error("a directional result needs the published claim it grades (basis)");
  return { ...measurement, directionalResult: result, directionalBasis: basis };
}
