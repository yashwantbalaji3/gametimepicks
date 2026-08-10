/**
 * Shared replay/synthetic runner — ONE harness, sport adapters plug in (Program 149 · Release 1).
 *
 * runReplay({ sportAdapter, cutoffIso, targetMarket, mode, nowIso }) → a mode-stamped research
 * artifact plus an evaluation receipt. The runner owns the two disciplines every sport keeps
 * getting wrong separately, so no adapter can skip them:
 *
 *   THE CUTOFF: every training row and every input timestamp must precede cutoffIso. Violations
 *   QUARANTINE with reasons (never silently dropped, never included). A replay that saw the future
 *   is not "slightly optimistic" — it is invalid, and the runner refuses to emit it as clean.
 *
 *   THE MODE: the artifact self-declares HISTORICAL_REPLAY or SYNTHETIC_TEST through the closed
 *   contract in artifact-modes.mjs; the runner never emits CURRENT_PRE_EVENT (the live pipeline
 *   does that under its own gates, not the research harness).
 *
 * The adapter interface (pure, no IO — the caller loads data):
 *   { sport, trainingRows(cutoffIso), slate(cutoffIso), predict(fitContext, event) }
 *   trainingRows: rows with a dateUtc BEFORE the cutoff (runner re-verifies, quarantines rest)
 *   slate:        events to predict, each { eventKey, dateUtc, ...adapter fields }
 *   predict:      returns { probs: {..sums to 1..}, ...explanation fields }
 *
 * Determinism: deterministicId = FNV-1a over (sport, mode, cutoff, target, training row keys,
 * slate keys) — same inputs, same id, same bytes. No Date.now(), no randomness anywhere.
 */
import { validateResearchArtifact } from "./artifact-modes.mjs";

/** FNV-1a 64-bit over a string, hex — deterministic id without crypto imports. */
export function fnv1a(str) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function runReplay({ sportAdapter, cutoffIso, targetMarket, mode = "HISTORICAL_REPLAY", nowIso }) {
  if (!nowIso || !Number.isFinite(Date.parse(nowIso))) throw new Error("runReplay: nowIso is required (no live clocks)");
  if (!cutoffIso || !Number.isFinite(Date.parse(cutoffIso))) throw new Error("runReplay: cutoffIso is required");
  if (mode === "CURRENT_PRE_EVENT") throw new Error("runReplay: the research harness never emits CURRENT_PRE_EVENT — that mode belongs to the live pipeline under its own gates");
  const cutoff = Date.parse(cutoffIso);

  // Two different exclusions, deliberately separate: rows at/after the cutoff are EXCLUDED BY
  // DESIGN (callers may pass the full corpus; keeping them out of the fit IS the enforcement, not
  // a defect), while unparseable rows are QUARANTINED defects that make the replay ineligible.
  const quarantined = [];
  const excludedAtOrAfterCutoff = [];
  const rawTraining = sportAdapter.trainingRows(cutoffIso) ?? [];
  const training = rawTraining.filter((r) => {
    const t = Date.parse(r.dateUtc ?? "");
    if (!Number.isFinite(t)) { quarantined.push({ key: r.eventKey ?? `${r.home} v ${r.away}`, reason: "unparseable dateUtc" }); return false; }
    if (t >= cutoff) { excludedAtOrAfterCutoff.push(r.eventKey ?? `${r.home} v ${r.away}`); return false; }
    return true;
  });

  const fitContext = sportAdapter.fit(training);
  const slate = sportAdapter.slate(cutoffIso) ?? [];
  const predictions = [];
  for (const ev of slate) {
    const out = sportAdapter.predict(fitContext, ev);
    const probs = out?.probs ?? {};
    const sum = Object.values(probs).reduce((s, p) => s + p, 0);
    if (!Number.isFinite(sum) || Math.abs(sum - 1) > 0.001 || Object.values(probs).some((p) => p < 0 || p > 1)) {
      quarantined.push({ key: ev.eventKey, reason: `impossible probabilities (sum ${sum}) — rejected, not renormalized` });
      continue;
    }
    predictions.push({ eventKey: ev.eventKey, dateUtc: ev.dateUtc, ...out });
  }

  const deterministicId = fnv1a([
    sportAdapter.sport, mode, cutoffIso, targetMarket,
    training.map((r) => r.eventKey ?? `${r.home}|${r.away}|${r.dateUtc}`).join(","),
    slate.map((e) => e.eventKey).join(","),
  ].join("::"));

  const artifact = {
    schemaVersion: 1,
    artifact: `${sportAdapter.sport}-replay-${targetMarket}`,
    sport: sportAdapter.sport,
    mode,
    targetMarket,
    generatedAt: nowIso,
    sourceCutoffIso: cutoffIso,
    inputsAsOfIso: training.length ? training[training.length - 1].dateUtc : null,
    deterministicId,
    trainingCount: training.length,
    excludedAtOrAfterCutoffCount: excludedAtOrAfterCutoff.length,
    quarantinedCount: quarantined.length,
    quarantined,
    predictions,
    evaluationEligible: mode === "HISTORICAL_REPLAY" && quarantined.length === 0,
    provenance: `replay-runner v1 over ${sportAdapter.sport} adapter; fit on ${training.length} rows strictly before ${cutoffIso}`,
  };

  const check = validateResearchArtifact(artifact);
  if (!check.ok) throw new Error(`runner emitted an invalid artifact — refusing: ${check.errors.join("; ")}`);
  return artifact;
}
