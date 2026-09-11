/**
 * Dixon-Coles v2 forward shadow — the record's rules. Pure (hashing aside), PRIVATE research.
 * The runner is scripts/soccer/dixon-coles-shadow.mjs; the rules it enforces live here, testable.
 *
 *   · FROZEN REGISTRATION: preregistration-dixon-coles-v2.json carries `frozenSha256`, the sha256 of its own
 *     canonical JSON (keys sorted recursively, no whitespace, UTF-8) with that one field removed. The same
 *     value is pinned below. The runner refuses to forecast or grade when the document, its pinned source
 *     files, or the model's parameters no longer match — nothing is decided on an altered registration.
 *   · APPEND-ONLY: one forecast per match, keyed by (season, home, away) in corpus names — unique in a double
 *     round-robin, and stable if ESPN re-issues an event id for a rescheduled match. The first forecast
 *     written is the forecast; a re-run adds nothing and rewrites nothing.
 *   · GRADING goes through grading.mjs (lastPreKickoffForecasts → gradeMatch → mergeGraded → summarize) against
 *     the football-data.co.uk final score in the league corpus, and metrics come from walk-forward.mjs
 *     scorePredictions, so `drawEce` here is the exact statistic the v1.2 verdicts used.
 *   · Bars, sample floor, resampling settings and horizon are read from the registration's own text by the
 *     caller and passed in; none is typed twice.
 */
import crypto from "node:crypto";
import { lastPreKickoffForecasts, gradeMatch, mergeGraded, summarize } from "./grading.mjs";
import { scorePredictions } from "./walk-forward.mjs";

export const DC_V2_PREREGISTRATION = Object.freeze({
  path: "data/internal/research/soccer/preregistration-dixon-coles-v2.json",
  sha256: "e670858640e70fc29deb1b117fcf7c0fb5046876ffe976265287fe06844171f0",
});

export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export const sha256Hex = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

/** sha256 of the registration's canonical content, `frozenSha256` excluded (a document cannot contain its own hash). */
export function preregistrationSha256(doc) {
  const { frozenSha256: _omit, ...content } = doc ?? {};
  return sha256Hex(Buffer.from(canonicalJson(content), "utf8"));
}

/**
 * Everything that must hold before a single forecast or grade is written.
 * sourceBytes: { [repoRelativePath]: Buffer } for every path the registration pins.
 */
export function verifyPreregistration({ doc, pinnedSha256 = DC_V2_PREREGISTRATION.sha256, sourceBytes, modelParams }) {
  const problems = [];
  const computed = preregistrationSha256(doc);
  if (computed !== doc?.frozenSha256) problems.push(`registration content hash ${computed} ≠ its own frozenSha256 ${doc?.frozenSha256}`);
  if (computed !== pinnedSha256) problems.push(`registration content hash ${computed} ≠ the pinned ${pinnedSha256}`);
  for (const [p, want] of Object.entries(doc?.sourceHashes ?? {})) {
    const bytes = sourceBytes?.[p];
    if (!bytes) { problems.push(`pinned source ${p} could not be read`); continue; }
    const got = sha256Hex(bytes);
    if (got !== want) problems.push(`pinned source ${p} hash ${got} ≠ registered ${want}`);
  }
  if (canonicalJson(modelParams) !== canonicalJson(doc?.model?.parameters)) problems.push("model parameters in dixon-coles.mjs differ from the registration's model.parameters");
  return { ok: problems.length === 0, computed, problems };
}

/** Football season label of a kickoff: July onward belongs to the season starting that year. */
export function seasonOf(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getUTCFullYear(), start = d.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export const pairingKey = (season, home, away) => `${season}|${home}|${away}`;

/** Candidates whose match has no forecast yet — the first forecast written is the only one. */
export function newForecastsOnly(existingRows, candidates) {
  const have = new Set((existingRows ?? []).map((r) => r.pairingKey));
  const fresh = [], alreadyForecast = [];
  for (const c of candidates ?? []) {
    if (have.has(c.pairingKey)) { alreadyForecast.push(c.pairingKey); continue; }
    have.add(c.pairingKey);
    fresh.push(c);
  }
  return { fresh, alreadyForecast };
}

/**
 * The day file after this run, or null when there is nothing new (so a re-run changes no byte). Rows already
 * in the file are carried verbatim; new rows are appended; each run that added rows is logged in `runs`.
 */
export function appendToDayFile(existing, freshRows, { at, header }) {
  if (!freshRows?.length) return null;
  const rows = [...(existing?.rows ?? []), ...freshRows];
  const next = {
    ...(existing ?? { ...header, firstWrittenAt: at, runs: [] }),
    rows,
    runs: [...(existing?.runs ?? []), { at, added: freshRows.length }],
  };
  next.counts = { forecasts: rows.length };
  assertAppendOnly(existing?.rows ?? [], next.rows);
  return next;
}

/** Throws unless every earlier row survives, byte-for-byte in canonical form, under its own key. */
export function assertAppendOnly(beforeRows, afterRows) {
  const after = new Map((afterRows ?? []).map((r) => [r.pairingKey, canonicalJson(r)]));
  if (after.size !== (afterRows ?? []).length) throw new Error("append-only violation: two forecasts for one match");
  for (const r of beforeRows ?? []) {
    if (after.get(r.pairingKey) !== canonicalJson(r)) throw new Error(`append-only violation: the forecast for ${r.pairingKey} was changed or dropped`);
  }
}

const to3 = (p) => (p ? { H: p.home, D: p.draw, A: p.away } : null);

/** walk-forward.mjs scorePredictions over graded matches, for the probabilities `pick` returns. */
export function scoreGraded(matches, pick) {
  const preds = [];
  for (const m of matches ?? []) { const q = to3(pick(m)); if (q) preds.push({ result: m.result, probs: { m: q } }); }
  return scorePredictions(preds, "m");
}

/** mulberry32 — a fixed seed makes the resampling null reproducible to the last digit. */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Consistency-resampling null for draw ECE: redraw every graded match's result from ITS OWN forecast
 * (H/D/A), score draw ECE exactly as scorePredictions does, repeat. The q-quantile (the ⌈q·R⌉-th smallest of
 * R replicates) is how large draw ECE gets from sampling noise alone when the forecasts are calibrated.
 */
export function drawEceNullQuantile(matches, { quantile, replicates, seed }) {
  const list = (matches ?? []).filter((m) => m.probs);
  if (!list.length) return null;
  const rnd = mulberry32(seed);
  const vals = new Float64Array(replicates);
  for (let b = 0; b < replicates; b++) {
    const preds = list.map((m) => {
      const q = to3(m.probs), u = rnd();
      return { result: u < q.H ? "H" : u < q.H + q.D ? "D" : "A", probs: { m: q } };
    });
    vals[b] = scorePredictions(preds, "m").drawEce;
  }
  vals.sort();
  return vals[Math.min(replicates - 1, Math.ceil(quantile * replicates) - 1)];
}

/**
 * The preregistered decision for one league. `rules` comes from the registration's acceptance block;
 * `due` is true only at the single preregistered look (season complete, or the deadline passed).
 */
export function decide({ matches, rules, due }) {
  const n = (matches ?? []).length;
  const dc = scoreGraded(matches, (m) => m.probs);
  const empirical = scoreGraded(matches, (m) => m.comparators?.empirical);
  const nullQ = n ? drawEceNullQuantile(matches, rules.resampling) : null;
  const skill = n && empirical.n === n ? dc.logLoss <= empirical.logLoss - rules.skillMargin : null;
  const drawPass = n ? dc.drawEce <= rules.drawEceMax : null;
  const drawBeyondNoise = n ? dc.drawEce > nullQ : null;
  let state, why;
  if (!due) { state = "INTERIM_DECIDES_NOTHING"; why = "before the single preregistered look — these figures are reported and decide nothing"; }
  else if (n < rules.minimumSample) { state = "NO_VERDICT_INSUFFICIENT_SAMPLE"; why = `${n}/${rules.minimumSample} graded forward matches at the look — no verdict in either direction, and no second look`; }
  else if (skill === false) { state = "FAIL"; why = `log loss ${dc.logLoss} is not below the empirical baseline ${empirical.logLoss} by ${rules.skillMargin}`; }
  else if (skill === null) { state = "NO_VERDICT_INSUFFICIENT_SAMPLE"; why = "the empirical comparator is missing on some graded match — the skill bar cannot be judged"; }
  else if (drawPass) { state = "PASS"; why = `draw ECE ${dc.drawEce} ≤ ${rules.drawEceMax} and the skill bar holds — eligible for a separate promotion review; nothing changes here`; }
  else if (drawBeyondNoise) { state = "FAIL"; why = `draw ECE ${dc.drawEce} exceeds the ${rules.resampling.quantile} resampling bound ${nullQ} — miscalibration beyond sampling noise`; }
  else { state = "INCONCLUSIVE"; why = `draw ECE ${dc.drawEce} is above ${rules.drawEceMax} but within sampling noise (bound ${nullQ}) — neither bar is met`; }
  return {
    state, why, n,
    figures: { dixonColes: dc, empirical, drawEceNullBound: nullQ, bars: { skill, drawEcePass: drawPass, drawEceBeyondNoise: drawBeyondNoise } },
  };
}

/**
 * Grade a league's shadow forecasts against the corpus. files: the shadow day files ({ firstWrittenAt, rows }).
 * Returns the merged, append-only graded list plus what was excluded (with reasons) and what is still pending.
 */
export function gradeShadow({ files, corpusRows, frozenAt, season, previous }) {
  const archives = (files ?? []).map((f) => ({ generatedAt: f.firstWrittenAt, rows: f.rows }));
  const latest = lastPreKickoffForecasts(archives);
  const results = new Map();
  for (const r of corpusRows ?? []) if (r.season === season) results.set(pairingKey(r.season, r.home, r.away), r);
  const fresh = [], excluded = [], pending = [];
  for (const { row, forecastAt } of latest.values()) {
    const res = results.get(row.pairingKey);
    if (!res || !Number.isInteger(res.ftHome) || !Number.isInteger(res.ftAway)) { pending.push(row.pairingKey); continue; }
    const reasons = [];
    if (!(Date.parse(row.kickoffUtc) > Date.parse(frozenAt))) reasons.push("scheduled kickoff not after frozenAt");
    if (!(Date.parse(forecastAt) >= Date.parse(frozenAt))) reasons.push("forecast made before frozenAt");
    if (!(Date.parse(forecastAt) < Date.parse(res.dateUtc))) reasons.push("forecast not before the actual kickoff");
    if (reasons.length) { excluded.push({ pairingKey: row.pairingKey, eventId: row.eventId, reasons }); continue; }
    const g = gradeMatch({ row, forecastAt }, { home: res.ftHome, away: res.ftAway });
    const mc = res.market?.close1x2;
    fresh.push({
      ...g,
      pairingKey: row.pairingKey,
      actualKickoffUtc: res.dateUtc,
      rescheduled: Math.abs(Date.parse(res.dateUtc) - Date.parse(row.kickoffUtc)) > 6 * 3.6e6,
      comparators: {
        v1SplitPoisson: row.comparators?.v1SplitPoisson ?? null,
        empirical: row.comparators?.empirical ?? null,
        marketClose: mc ? { home: mc.home, draw: mc.draw, away: mc.away } : null,
      },
    });
  }
  const { matches, added } = mergeGraded(previous ?? [], fresh);
  return { matches, added, excluded, pending, summary: summarize(matches) };
}
