/**
 * UFC winner model v1 — the abstaining Elo baseline PROMOTED to a pure adapter (Program 167 ·
 * Release F). PRIVATE. Winner-only, exactly the committed baseline's arithmetic
 * (scripts/ufc/evaluate-ufc-baseline.mjs: K=32, start 1500, decisive-only updates, no corner
 * advantage) so the live path and the historical evaluation can never disagree.
 *
 * ABSTENTION IS THE PRODUCT: the baseline's 25.6% coverage semantics are preserved verbatim —
 *   IDENTITY   a current bout's fighter resolves by provider id when present, else by a UNIQUE
 *              normalized corpus name; zero or 2+ matches ABSTAIN (identity is never guessed —
 *              the Sprint-045 UFC join lesson)
 *   SPARSE     either fighter with < 3 prior decisive corpus bouts ABSTAINS
 *   IDLE       either fighter idle > 540 days at bout time ABSTAINS
 * Method/round/prop outputs are UNSUPPORTED by the corpus shape and do not exist here.
 *
 * No odds parameter exists in fit or predict — market comparison happens beside the forecast in
 * the shadow run, never inside it.
 */

export const UFC_MODEL_VERSION = 1;
export const UFC_MODEL_ID = "ufc-model-v1-abstaining-elo";
export const UFC_ELO_PARAMS = Object.freeze({ K: 32, START: 1500, SPARSE_FLOOR: 3, IDLE_DAYS: 540 });

export const normalizeFighterName = (n) =>
  String(n ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isFinal = (r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "");

/**
 * Fold corpus rows chronologically into per-fighter Elo histories. Caller passes rows strictly
 * before the cutoff (runner semantics); this function sorts, filters to decisive finals, folds.
 */
export function fitUfcV1(rows) {
  const { K, START } = UFC_ELO_PARAMS;
  const byId = new Map(); // fighterId -> { rating, n, lastIso, names:Set }
  const get = (id) => byId.get(id) ?? { rating: START, n: 0, lastIso: null, names: new Set() };
  const eligible = (rows ?? [])
    .filter((r) => isFinal(r) && (r.outcome === "R" || r.outcome === "B"))
    .filter((r) => r.red?.id && r.blue?.id)
    .sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
  for (const bout of eligible) {
    const red = get(bout.red.id);
    const blue = get(bout.blue.id);
    const pRed = 1 / (1 + 10 ** (-(red.rating - blue.rating) / 400));
    const redWon = bout.outcome === "R" ? 1 : 0;
    red.names.add(normalizeFighterName(bout.red.name));
    blue.names.add(normalizeFighterName(bout.blue.name));
    byId.set(bout.red.id, { ...red, rating: red.rating + K * (redWon - pRed), n: red.n + 1, lastIso: bout.dateUtc });
    byId.set(bout.blue.id, { ...blue, rating: blue.rating + K * ((1 - redWon) - (1 - pRed)), n: blue.n + 1, lastIso: bout.dateUtc });
  }
  const nameIndex = new Map(); // normalized name -> Set(fighterId)
  for (const [id, h] of byId) for (const nm of h.names) {
    if (!nameIndex.has(nm)) nameIndex.set(nm, new Set());
    nameIndex.get(nm).add(id);
  }
  return {
    modelId: UFC_MODEL_ID,
    version: UFC_MODEL_VERSION,
    params: UFC_ELO_PARAMS,
    foldedBouts: eligible.length,
    fighters: byId,
    nameIndex,
  };
}

/**
 * Walk forward chronologically: for each decisive final, record the PRE-BOUT view (probability
 * and abstention rule under the same SPARSE/IDLE rules the live path uses), then fold the bout.
 * This is the evaluation's spine AND provably the same arithmetic as fitUfcV1 — both fold the
 * identical eligible list in the identical order with the identical update.
 */
export function walkForwardUfcObservations(rows) {
  const { K, START, SPARSE_FLOOR, IDLE_DAYS } = UFC_ELO_PARAMS;
  const byId = new Map();
  const get = (id) => byId.get(id) ?? { rating: START, n: 0, lastIso: null };
  const obs = [];
  const eligible = (rows ?? [])
    .filter((r) => isFinal(r) && (r.outcome === "R" || r.outcome === "B"))
    .filter((r) => r.red?.id && r.blue?.id)
    .sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
  for (const bout of eligible) {
    const t = Date.parse(bout.dateUtc);
    const hr = get(bout.red.id);
    const hb = get(bout.blue.id);
    const idle = (h) => (h.lastIso ? (t - Date.parse(h.lastIso)) / 86_400_000 > IDLE_DAYS : false);
    let abstainRule = null;
    if (hr.n < SPARSE_FLOOR || hb.n < SPARSE_FLOOR) abstainRule = "SPARSE";
    else if (idle(hr) || idle(hb)) abstainRule = "IDLE";
    const pRed = 1 / (1 + 10 ** (-(hr.rating - hb.rating) / 400));
    obs.push({
      providerBoutId: bout.providerBoutId,
      dateUtc: bout.dateUtc,
      weightClass: bout.weightClass ?? null,
      abstainRule,
      pRed: abstainRule ? null : Number(pRed.toFixed(6)),
      redWon: bout.outcome === "R",
      favoriteIsRed: hr.rating >= hb.rating,
    });
    const redWon = bout.outcome === "R" ? 1 : 0;
    byId.set(bout.red.id, { rating: hr.rating + K * (redWon - pRed), n: hr.n + 1, lastIso: bout.dateUtc });
    byId.set(bout.blue.id, { rating: hb.rating + K * ((1 - redWon) - (1 - pRed)), n: hb.n + 1, lastIso: bout.dateUtc });
  }
  return obs;
}

/** Resolve a current-card fighter to ONE corpus history, or say exactly why not. */
export function resolveFighter(fit, { providerId = null, name = null }) {
  if (providerId != null && fit.fighters.has(String(providerId))) {
    return { ok: true, fighterId: String(providerId), basis: "provider-id" };
  }
  const nm = normalizeFighterName(name);
  if (!nm) return { ok: false, reason: "no provider id and no usable name" };
  const ids = fit.nameIndex.get(nm);
  if (!ids || ids.size === 0) return { ok: false, reason: `no corpus history under "${name}" — debut or naming drift; identity is never guessed` };
  if (ids.size > 1) return { ok: false, reason: `"${name}" matches ${ids.size} distinct corpus fighters — ambiguous identity abstains` };
  return { ok: true, fighterId: [...ids][0], basis: "unique-normalized-name" };
}

/**
 * Predict ONE bout. Pure. Returns PREDICTED with two-way probs, or ABSTAIN with the named rule.
 * `boutIso` is the scheduled start used for the idle rule — always a parameter.
 */
export function predictUfcV1({ fit, bout, boutIso }) {
  const t = Date.parse(boutIso ?? bout?.dateUtc ?? "");
  if (!Number.isFinite(t)) return { state: "ABSTAIN", rule: "IDENTITY", reason: "bout has no parseable start time — nothing about it can be assessed" };
  const red = resolveFighter(fit, { providerId: bout?.redProviderId, name: bout?.red });
  const blue = resolveFighter(fit, { providerId: bout?.blueProviderId, name: bout?.blue });
  if (!red.ok || !blue.ok) {
    return { state: "ABSTAIN", rule: "IDENTITY", reason: [!red.ok ? `red: ${red.reason}` : null, !blue.ok ? `blue: ${blue.reason}` : null].filter(Boolean).join(" · ") };
  }
  const hr = fit.fighters.get(red.fighterId);
  const hb = fit.fighters.get(blue.fighterId);
  const { SPARSE_FLOOR, IDLE_DAYS } = fit.params;
  if (hr.n < SPARSE_FLOOR || hb.n < SPARSE_FLOOR) {
    return { state: "ABSTAIN", rule: "SPARSE", reason: `prior decisive bouts red=${hr.n} blue=${hb.n} — floor is ${SPARSE_FLOOR} for both` };
  }
  const idleDays = (h) => (h.lastIso ? (t - Date.parse(h.lastIso)) / 86_400_000 : Infinity);
  if (idleDays(hr) > IDLE_DAYS || idleDays(hb) > IDLE_DAYS) {
    return { state: "ABSTAIN", rule: "IDLE", reason: `idle days red=${Math.round(idleDays(hr))} blue=${Math.round(idleDays(hb))} — bound is ${IDLE_DAYS}` };
  }
  const pRed = 1 / (1 + 10 ** (-(hr.rating - hb.rating) / 400));
  return {
    state: "PREDICTED",
    modelId: fit.modelId,
    modelVersion: fit.version,
    probs: { red: Number(pRed.toFixed(6)), blue: Number((1 - pRed).toFixed(6)) },
    features: {
      redFighterId: red.fighterId, blueFighterId: blue.fighterId,
      redBasis: red.basis, blueBasis: blue.basis,
      redElo: Number(hr.rating.toFixed(1)), blueElo: Number(hb.rating.toFixed(1)),
      redPriorBouts: hr.n, bluePriorBouts: hb.n,
    },
  };
}
