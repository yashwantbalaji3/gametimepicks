/**
 * NBA FORECAST RECEIPTS — WRITE-ONCE, PRE-TIP, WITH THE INPUTS THEY USED (Session 10 · G2 / G4 / G7). PURE, no I/O.
 *
 * Until Session 10 the experimental forecast file for a date was a single document rewritten whole by every
 * run, and a game that had already tipped at the run's instant was still forecast (only counted, in
 * `manifest.gamesAlreadyStartedAtNow`). The preregistration (docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md §8)
 * only accepts evidence "with the artifact written before tip-off", so three things were missing:
 *
 *   G7  WRITE-ONCE. A game, once written, is frozen: a later run never rewrites it — not its probability,
 *       not its score projection, not the inputs it records. Each game carries a receipt whose payloadSha256
 *       covers every byte of the game and of the receipt (except that field), so a silent replacement is
 *       detectable.
 *   G2  PRE-TIP ONLY. A game whose tip is at or before the run's instant is REFUSED (never forecast late);
 *       a game not yet forecast and still ahead is ADDED, so more than one run a day can only fill gaps.
 *   G4  INPUT PROVENANCE. The receipt names the injury snapshot (and roster / schedule / corpus) it was
 *       built from, with a content hash and the snapshot's age at the forecast instant. A snapshot captured
 *       AFTER the forecast instant is refused outright (it would be leakage in any replay).
 *
 * Nothing here changes model math: the game object the builder produces is stored byte-for-byte; the receipt
 * sits beside it.
 */
import crypto from "node:crypto";

export const RECEIPT_SCHEMA = "nba-forecast-receipt@1";

/**
 * The injuries freshness bound already used for the injury feeds (24 h, the daily capture cadence — see
 * lib/ops/daily-owners.mjs). Here it only LABELS a snapshot; it withholds nothing.
 */
export const INJURY_SNAPSHOT_MAX_AGE_HOURS = 24;

export const INPUT_STATE = Object.freeze({ CURRENT: "CURRENT", STALE: "STALE", MISSING: "MISSING" });

export const RUN_OUTCOME = Object.freeze({
  ADDED: "ADDED",                                       // forecast written for the first time, before tip
  ALREADY_FROZEN: "ALREADY_FROZEN",                     // a receipt already exists — kept byte-identical
  STARTED_BEFORE_FIRST_FORECAST: "STARTED_BEFORE_FIRST_FORECAST", // tip <= run instant and never forecast: refused
  OUTSIDE_HORIZON: "OUTSIDE_HORIZON",                   // a windowed run only forecasts games tipping within its horizon
});

/*
 * OVERNIGHT TIPS (Session 13 · #963; Session 14 NBA dept). A tip whose UTC hour falls in [OVERNIGHT_FROM, OVERNIGHT_TO)
 * sits in the overnight hole where scheduled clocks rarely deliver, so a windowed run owes it from
 * OVERNIGHT_HORIZON_HOURS out instead of its own horizon. The decider AND the builder must apply the same rule:
 * #963 widened only the decider, so the evening run decided BUILD and the builder (still on 8 h) skipped the game
 * as OUTSIDE_HORIZON. Timing only — model, inputs and the write-once rule are unchanged.
 */
export const OVERNIGHT_FROM = 6;
export const OVERNIGHT_TO = 14;
export const OVERNIGHT_HORIZON_HOURS = 18;
export const isOvernightTip = (tipUtc) => {
  const t = Date.parse(tipUtc);
  if (!Number.isFinite(t)) return false;
  const h = new Date(t).getUTCHours();
  return h >= OVERNIGHT_FROM && h < OVERNIGHT_TO;
};
/** A windowed run's horizon for one tip: its own horizon, widened to the overnight horizon for an overnight tip. */
export const horizonForTip = (tipUtc, horizonHours) =>
  horizonHours == null ? null : isOvernightTip(tipUtc) ? Math.max(horizonHours, OVERNIGHT_HORIZON_HOURS) : horizonHours;

/** Deterministic JSON: object keys sorted at every depth, arrays kept in order. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");

/**
 * The hash that freezes a game: every byte of the game AND of its receipt (inputs, instant, version) except
 * the hash field itself. So a later change to the probability, the score projection, or the recorded input
 * snapshot all break it.
 */
export function gamePayloadHash(game) {
  const { receipt, ...payload } = game ?? {};
  if (!receipt) return sha256(canonicalJson(payload));
  const { payloadSha256: _self, ...receiptBody } = receipt;
  return sha256(canonicalJson({ ...payload, receipt: receiptBody }));
}

/**
 * The injury snapshot a forecast reads, described rather than trusted.
 * @param {{ doc: object|null, text: string|null, now: string, maxAgeHours?: number }} o
 * @returns {{ ok: boolean, reason?: string, provenance: object }}
 */
export function injurySnapshotProvenance({ doc, text, now, maxAgeHours = INJURY_SNAPSHOT_MAX_AGE_HOURS }) {
  if (!doc) return { ok: true, provenance: { state: INPUT_STATE.MISSING, generatedAt: null, sourceAsOf: null, entries: null, sha256: null, ageMinutesAtForecast: null } };
  const capturedAt = doc.generatedAt ?? null;
  const capMs = Date.parse(capturedAt ?? "");
  const nowMs = Date.parse(now);
  const provenance = {
    state: INPUT_STATE.STALE,
    generatedAt: capturedAt,
    sourceAsOf: doc.sourceAsOf ?? null,
    entries: Array.isArray(doc.entries) ? doc.entries.length : null,
    sha256: text != null ? sha256(text) : null,
    ageMinutesAtForecast: Number.isFinite(capMs) ? Math.round((nowMs - capMs) / 60000) : null,
  };
  // FAIL CLOSED: a snapshot from after the forecast instant is not an input this forecast could have had.
  if (Number.isFinite(capMs) && capMs > nowMs) {
    return { ok: false, reason: `injury snapshot captured ${capturedAt} is AFTER the forecast instant ${now} — refused (leakage)`, provenance };
  }
  if (Number.isFinite(capMs) && nowMs - capMs <= maxAgeHours * 3_600_000) provenance.state = INPUT_STATE.CURRENT;
  return { ok: true, provenance };
}

/**
 * Attach a receipt to one freshly built game. The game object itself is not modified (a copy is returned).
 * @param {object} game  artifact games[] entry, exactly as buildForecastArtifact produced it
 * @param {{ family: string, modelVersion: string, now: string, inputs: object }} o
 */
export function stampReceipt(game, { family, modelVersion, now, inputs }) {
  const { receipt: _old, ...payload } = game;
  const stamped = {
    ...payload,
    receipt: {
      schema: RECEIPT_SCHEMA,
      eventId: String(payload.providerEventId),
      family,
      modelVersion,
      generatedAt: now,
      tipUtc: payload.dateUtc,
      preTip: Date.parse(now) < Date.parse(payload.dateUtc),
      inputs,
    },
  };
  stamped.receipt.payloadSha256 = gamePayloadHash(stamped);
  return stamped;
}

/**
 * Does a stored game still match its own receipt? Legacy games (written before receipts existed) have none
 * and are reported as such — they are kept untouched, never re-stamped (re-stamping would launder them).
 */
export function receiptIntegrity(game) {
  const r = game?.receipt;
  if (!r) return { state: "LEGACY_NO_RECEIPT" };
  const problems = [];
  if (r.schema !== RECEIPT_SCHEMA) problems.push(`schema ${r.schema}`);
  if (String(r.eventId) !== String(game.providerEventId)) problems.push(`eventId ${r.eventId} ≠ ${game.providerEventId}`);
  if (r.payloadSha256 !== gamePayloadHash(game)) problems.push("payloadSha256 does not match the stored payload");
  if (!(Date.parse(r.generatedAt) < Date.parse(r.tipUtc))) problems.push(`generatedAt ${r.generatedAt} is not before tip ${r.tipUtc}`);
  if (r.tipUtc !== game.dateUtc) problems.push(`receipt tip ${r.tipUtc} ≠ game dateUtc ${game.dateUtc}`);
  return problems.length ? { state: "BROKEN", problems } : { state: "OK" };
}

/**
 * Which schedule rows of `date` may this run forecast? Pure: decides, builds nothing.
 * @param {{ scheduleRows: object[], date: string, etDateOf: (iso: string) => string, existingIds: Set<string>, now: string, horizonHours?: number|null }} o
 */
export function planRun({ scheduleRows, date, etDateOf, existingIds, now, horizonHours = null }) {
  const nowMs = Date.parse(now);
  const plan = { build: [], outcomes: [] };
  const rows = (scheduleRows ?? []).filter((r) => r?.providerEventId && r?.dateUtc && etDateOf(r.dateUtc) === date);
  const seen = new Set();
  for (const r of rows) {
    const id = String(r.providerEventId);
    if (seen.has(id)) continue; // one row per event, even if the schedule capture repeats one
    seen.add(id);
    const tipMs = Date.parse(r.dateUtc);
    if (existingIds.has(id)) plan.outcomes.push({ providerEventId: id, outcome: RUN_OUTCOME.ALREADY_FROZEN });
    else if (!(tipMs > nowMs)) plan.outcomes.push({ providerEventId: id, outcome: RUN_OUTCOME.STARTED_BEFORE_FIRST_FORECAST, tipUtc: r.dateUtc });
    else if (horizonHours != null && tipMs - nowMs > horizonForTip(r.dateUtc, horizonHours) * 3_600_000) plan.outcomes.push({ providerEventId: id, outcome: RUN_OUTCOME.OUTSIDE_HORIZON, tipUtc: r.dateUtc });
    else { plan.build.push(id); plan.outcomes.push({ providerEventId: id, outcome: RUN_OUTCOME.ADDED, tipUtc: r.dateUtc }); }
  }
  return plan;
}

/**
 * Merge this run's freshly stamped games into the stored artifact for the date — WRITE-ONCE.
 *
 *   · every stored game is carried over byte-for-byte (a stored game that fails its own receipt check
 *     REFUSES the whole write: the file is not ours to repair silently);
 *   · a built game whose event is already stored is DROPPED (the stored one wins);
 *   · a built game whose tip is not after the run instant is REFUSED (post-tip forecasts are never written);
 *   · the document's first-run fields (generatedAt, inputAsOf, ratings, roster, manifest, inputs) are the
 *     first run's and never change; each run appends one entry to `runs`.
 *
 * @param {{ existing: object|null, built: object, stampedGames: object[], now: string, runManifest: object }} o
 * @returns {{ ok: true, artifact: object, added: string[] } | { ok: false, errors: string[] }}
 */
export function mergeForecastArtifact({ existing, built, stampedGames, now, runManifest }) {
  const errors = [];
  const nowMs = Date.parse(now);
  const stored = existing?.games ?? [];
  const storedIds = new Set();
  for (const g of stored) {
    const id = String(g.providerEventId);
    if (storedIds.has(id)) errors.push(`stored artifact holds event ${id} twice`);
    storedIds.add(id);
    const integrity = receiptIntegrity(g);
    if (integrity.state === "BROKEN") errors.push(`stored game ${id} fails its receipt: ${integrity.problems.join("; ")}`);
  }
  if (existing && built && existing.modelVersion !== built.modelVersion) errors.push(`stored modelVersion ${existing.modelVersion} ≠ this run's ${built.modelVersion} — a date file never mixes versions`);
  const added = [];
  const addedGames = [];
  for (const g of stampedGames ?? []) {
    const id = String(g.providerEventId);
    if (storedIds.has(id) || added.includes(id)) continue;
    if (!(Date.parse(g.dateUtc) > nowMs)) { errors.push(`refusing to write event ${id}: tip ${g.dateUtc} is not after the run instant ${now}`); continue; }
    if (receiptIntegrity(g).state !== "OK") { errors.push(`new game ${id} carries no valid receipt`); continue; }
    added.push(id);
    addedGames.push(g);
  }
  if (errors.length) return { ok: false, errors };

  const base = existing ?? { ...built, games: [] };
  const games = [...stored, ...addedGames].sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
  const runs = [...(existing?.runs ?? []), { at: now, added, ...runManifest }];
  const artifact = { ...base, labels: [...new Set(games.map((g) => g.label))].sort(), games, writeOnce: { schema: RECEIPT_SCHEMA, rule: "a game, once written, is never rewritten; only games not yet forecast and still before tip are added" }, runs };
  return { ok: true, artifact, added };
}

/**
 * The post-write guard: every game present BEFORE must be byte-identical (canonically) AFTER, and no game may
 * disappear. Used by the writer and by the workflow commit step against the committed (HEAD) file.
 * @returns {string[]} violations (empty = frozen games intact)
 */
export function frozenGameViolations({ before, after }) {
  const v = [];
  const afterById = new Map((after?.games ?? []).map((g) => [String(g.providerEventId), g]));
  for (const g of before?.games ?? []) {
    const id = String(g.providerEventId);
    const now = afterById.get(id);
    if (!now) { v.push(`event ${id} was removed`); continue; }
    if (canonicalJson(now) !== canonicalJson(g)) v.push(`event ${id} was rewritten after it was frozen`);
  }
  const ids = (after?.games ?? []).map((g) => String(g.providerEventId));
  if (new Set(ids).size !== ids.length) v.push("an event appears twice");
  return v;
}

/**
 * Which ET dates owe a forecast right now? (The windowed run's free pre-check — reads schedule + stored ids only.)
 * @param {{ scheduleRows: object[], etDateOf: (iso: string) => string, storedIdsByDate: (date: string) => Set<string>, now: string, horizonHours: number }} o
 * @returns {Array<{ date: string, eventIds: string[] }>}
 */
export function owedForecastDates({ scheduleRows, etDateOf, storedIdsByDate, now, horizonHours }) {
  const nowMs = Date.parse(now);
  const byDate = new Map();
  for (const r of scheduleRows ?? []) {
    const tipMs = Date.parse(r?.dateUtc ?? "");
    if (!r?.providerEventId || !Number.isFinite(tipMs)) continue;
    if (!(tipMs > nowMs) || tipMs - nowMs > horizonHours * 3_600_000) continue;
    const date = etDateOf(r.dateUtc);
    if (storedIdsByDate(date).has(String(r.providerEventId))) continue;
    if (!byDate.has(date)) byDate.set(date, new Set());
    byDate.get(date).add(String(r.providerEventId));
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, ids]) => ({ date, eventIds: [...ids].sort() }));
}
