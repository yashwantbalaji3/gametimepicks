/**
 * NBA SIMULATION THEATER · ADAPTER (nba-sim-v1 artifact → theater manifest). Pure: no I/O.
 *
 * INPUT: an NBA forecast artifact of the v0.2 shape (`artifact: "nba-experimental-forecasts"`, `games[]` keyed by
 * `providerEventId`, `home`/`away` team info) whose game forecast carries the nba-sim-v1 additions (contract draft 1,
 * 2026-10-19): `modelVersion: "nba-sim-v1-coherent"`, `engine`, `sim.totalHistogram`, `representativeSamples`,
 * `invariants`. The forecast block is read from `game.forecast` (the v0.2 layout) or, if absent, from the game itself.
 *
 * A TEST FIXTURE is an artifact with `fixture: true`. The manifest carries `fixture`, and the theater refuses to render a
 * fixture without its "TEST FIXTURE — not model output" banner (nba-gate.ts). A file under `__fixtures__/` that is NOT
 * marked `fixture: true` is rejected (FIXTURE_UNMARKED) UNLESS the loader verified it as a byte-for-byte DEV COPY of real
 * engine output (a provenance sidecar whose sha256 matches: `opts.provenance.verified`), so nothing synthetic can pass for
 * model output and a dev copy always says where it came from.
 *
 * Every representative sample is re-validated (validate-sample.mjs). Only samples PRESENT in the artifact are listed, in
 * the order typical, close, high, low, upset; an absent label (often `upset`) is simply not offered.
 */
import { SAMPLE_LABELS, validateSample } from "./validate-sample.mjs";

export const NBA_ENGINE_ID = "nba-sim-v1-coherent";
export const NBA_ARTIFACT = "nba-experimental-forecasts";
export const FIXTURE_BANNER = "TEST FIXTURE — not model output";
export const LABEL_TITLES = Object.freeze({ typical: "Typical", close: "Close", high: "High-scoring", low: "Low-scoring", upset: "Upset" });

/** What the engine does not model: shown verbatim on the evidence panel and the final card. */
export const NOT_MODELLED = Object.freeze([
  "Possessions, shots, passes, rebounds as events, player movement, ball position and shot locations are not modelled.",
  "Player stats exist only as each player's game total in a sample; per-quarter player splits are not modelled.",
  "No possession arrow: who has the ball is not modelled.",
  "Score progress inside a quarter is not model output; only quarter-end scores are recorded.",
]);
export const NBA_DISCLOSURE = "SIMULATED · quarter checkpoints only · scoring between checkpoints illustrative · experimental model";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function teamInfo(t) {
  if (!isObj(t) || typeof t.abbr !== "string" || !t.abbr) return null;
  return { abbr: t.abbr.toUpperCase(), name: typeof t.name === "string" ? t.name : t.abbr, providerTeamId: t.providerTeamId ?? null };
}

/** Histogram check: integer values, probabilities ≥ 0 summing to 1 (±1e-3, rounding in the artifact). */
export function checkHistogram(h) {
  if (!Array.isArray(h) || !h.length) return { ok: false, reason: "no histogram" };
  let sum = 0;
  for (const b of h) {
    if (!b || !Number.isInteger(b.value) || !(num(b.probability) >= 0)) return { ok: false, reason: "malformed bin" };
    sum += b.probability;
  }
  if (Math.abs(sum - 1) > 1e-3) return { ok: false, reason: `probabilities sum to ${sum.toFixed(4)}` };
  return { ok: true, reason: null };
}

/**
 * @param {any} artifact  the parsed forecast artifact
 * @param {string} eventId providerEventId
 * @param {{ file?: string|null }} opts
 * @returns {{ ok: boolean, error: {code: string, reason: string}|null, manifest: object|null }}
 */
export function adaptNbaArtifact(artifact, eventId, { file = null, provenance = null } = {}) {
  const fail = (code, reason) => ({ ok: false, error: { code, reason }, manifest: null });
  if (!isObj(artifact)) return fail("MALFORMED", "not an artifact object");
  const fixture = artifact.fixture === true;
  const devCopy = !fixture && provenance?.verified === true;
  if (!fixture && !devCopy && file && /__fixtures__/.test(String(file))) return fail("FIXTURE_UNMARKED", `${file} sits under __fixtures__ but is neither marked fixture: true nor a verified dev copy of engine output`);
  if (artifact.artifact !== NBA_ARTIFACT) return fail("ARTIFACT_MISMATCH", `artifact ${artifact.artifact ?? "(none)"} is not ${NBA_ARTIFACT}`);
  if (!Array.isArray(artifact.games)) return fail("MALFORMED", "games[] missing");
  const g = artifact.games.find((x) => String(x?.providerEventId) === String(eventId));
  if (!g) return fail("NO_GAME", `event ${eventId} is not in this artifact`);
  const fc = isObj(g.forecast) ? g.forecast : g;
  if (fc.modelVersion !== NBA_ENGINE_ID) return fail("ENGINE_MISMATCH", `model ${fc.modelVersion ?? "(none)"} is not ${NBA_ENGINE_ID} (a v0 forecast has no representative samples)`);
  const home = teamInfo(g.home);
  const away = teamInfo(g.away);
  if (!home || !away) return fail("MALFORMED", "home/away team info missing");
  if (!isObj(fc.sim)) return fail("MALFORMED", "sim block missing");
  if (!Array.isArray(fc.representativeSamples)) return fail("NO_SAMPLES", "representativeSamples missing");
  if (isObj(fc.invariants) && fc.invariants.violations !== 0) return fail("ENGINE_INVARIANTS", `engine reports ${fc.invariants.violations} invariant violation(s)`);

  const simulations = Number.isInteger(fc.simulations) ? fc.simulations : Number.isInteger(fc.engine?.simulations) ? fc.engine.simulations : null;
  const seen = new Set();
  const samples = [];
  for (const raw of fc.representativeSamples) {
    const v = validateSample(raw, { simulations });
    if (raw && seen.has(raw.label)) v.errors.push({ code: "LABEL_DUPLICATE", detail: `second sample labelled ${raw.label}` });
    if (raw?.label) seen.add(raw.label);
    const validation = { ok: v.errors.length === 0, errors: v.errors, notes: v.notes ?? [] };
    samples.push({
      runIndex: raw?.runIndex ?? null,
      label: raw?.label ?? null,
      title: LABEL_TITLES[raw?.label] ?? String(raw?.label ?? "?"),
      selectionRule: raw?.selectionRule ?? "",
      final: raw?.final ?? null,
      periods: Array.isArray(raw?.periods) ? raw.periods : [],
      overtimePeriods: raw?.overtimePeriods ?? 0,
      team: raw?.team ?? null,
      players: raw?.players ?? null,
      validation,
    });
  }
  // only labels present in the data, in the canonical order; an unknown label stays last (and is unavailable)
  const order = (l) => { const i = SAMPLE_LABELS.indexOf(l); return i < 0 ? 99 : i; };
  samples.sort((a, b) => order(a.label) - order(b.label));
  if (!samples.length) return fail("NO_SAMPLES", "representativeSamples is empty");

  // v1 player rows are quantiles CONDITIONAL on playing; playRate (share of draws with minutes > 0) is shown beside them
  const playRates = { home: {}, away: {} };
  for (const side of ["home", "away"]) {
    for (const p of Array.isArray(fc.players?.[side]) ? fc.players[side] : []) {
      if (p?.providerAthleteId != null && num(p.playRate) != null) playRates[side][String(p.providerAthleteId)] = p.playRate;
    }
  }
  const hist = checkHistogram(fc.sim.totalHistogram);
  const q = (o) => (isObj(o) ? { p10: num(o.p10), p25: num(o.p25), p50: num(o.p50), p75: num(o.p75), p90: num(o.p90), mean: num(o.mean), sd: num(o.sd) } : null);
  const manifest = {
    eventId: String(eventId),
    fixture,
    fixtureNote: fixture ? String(artifact.fixtureNote ?? "") : null,
    file,
    role: typeof artifact.role === "string" ? artifact.role : null,
    provenance: devCopy ? { source: provenance.source ?? null, sha256: provenance.sha256 ?? null, copiedAt: provenance.copiedAt ?? null, knownDeviation: provenance.knownDeviation ?? null } : null,
    playRates,
    date: artifact.date ?? null,
    dateUtc: g.dateUtc ?? null,
    venue: g.venue ?? null,
    teams: { home, away },
    modelVersion: fc.modelVersion,
    inputAsOf: fc.inputAsOf ?? artifact.inputAsOf ?? null,
    generatedAt: artifact.generatedAt ?? null,
    simulations,
    seed: fc.seed ?? fc.engine?.seed ?? null,
    seedPolicy: fc.seedPolicy ?? fc.engine?.seedPolicy ?? null,
    structure: fc.engine?.structure ?? null,
    sim: {
      pHome: num(fc.sim.pHome), pAway: num(fc.sim.pAway), overtimeRate: num(fc.sim.overtimeRate),
      total: q(fc.sim.total), margin: q(fc.sim.margin), home: q(fc.sim.home), away: q(fc.sim.away),
      totalHistogram: hist.ok ? fc.sim.totalHistogram.map((b) => ({ value: b.value, probability: b.probability })) : null,
      histogramNote: hist.ok ? null : hist.reason,
    },
    invariants: isObj(fc.invariants) ? { checkedDraws: fc.invariants.checkedDraws ?? null, violations: fc.invariants.violations } : null,
    samples,
    disclosure: NBA_DISCLOSURE,
    notModelled: NOT_MODELLED,
  };
  return { ok: true, error: null, manifest };
}

/** The first sample that validated (typical when it did), or null. */
export const defaultSampleIndex = (manifest) => {
  const i = manifest?.samples?.findIndex((s) => s.validation.ok) ?? -1;
  return i < 0 ? null : i;
};
