/**
 * UFC current-results adapter (Program 162 · Release J) — the operational bridge from the results
 * capture to the winner-only settlement contract.
 *
 * States, honest by construction (the EPL/NFL/NBA adapter design):
 *   NOT_CONFIGURED   no capture artifact exists
 *   NO_RESULTS_YET   capture fresh, no completed bout in the window — zero rows, the truth
 *   SOURCE_STALE     capture stamps exceed the freshness window
 *   RESULTS          finals exist — each joins by PROVIDER BOUT ID to a committed bout capture
 *                    row and reconciles exactly once
 *
 * UFC-specific rules on top of the shared skeleton:
 *   - the join is BOUT-id based against the UNION of committed schedule snapshots (bouts array),
 *     because the forward window rolls while snapshots keep the lineage;
 *   - a no-winner final flows to results with contractCheck VOID_PENDING_REVIEW — visible for
 *     review, never silently settled (draw/NC ambiguity is the contract's named refusal);
 *   - a both-winners final is a source defect and QUARANTINES;
 *   - card↔bout separation: results carry both providerCardId and providerBoutId.
 */
import fs from "node:fs";
import path from "node:path";

import { gradeUfcBout } from "./settlement-contract.mjs";

const RESULTS_PATH = () => path.join(process.cwd(), "public", "data", "ufc", "results", "latest.json");
const SCHEDULE_DIR = () => path.join(process.cwd(), "public", "data", "ufc", "schedule");

/** Union of every committed bout capture (snapshots + latest), keyed by providerBoutId. */
function boutIndexFromDisk() {
  const byId = new Map();
  try {
    const files = fs.readdirSync(SCHEDULE_DIR()).filter((f) => f.endsWith(".json")).sort();
    for (const f of files) {
      try {
        const cap = JSON.parse(fs.readFileSync(path.join(SCHEDULE_DIR(), f), "utf8"));
        for (const b of cap.bouts ?? []) if (b?.providerBoutId) byId.set(b.providerBoutId, b);
      } catch { /* one unreadable snapshot must not hide the others */ }
    }
  } catch { /* no schedule directory — the join below quarantines everything, loudly */ }
  return byId;
}

export function loadCurrentUfcResults({ nowIso, artifact: artifactOverride, boutIndex: boutOverride, freshWindowHours = 36 } = {}) {
  // `artifact: null` means "none exists" (tests, unconfigured); only UNDEFINED falls to disk.
  const artifact = artifactOverride !== undefined ? artifactOverride : (() => { try { return JSON.parse(fs.readFileSync(RESULTS_PATH(), "utf8")); } catch { return null; } })();
  if (!artifact) {
    return { state: "NOT_CONFIGURED", results: [], quarantined: [], note: "no results capture artifact exists — run scripts/ufc/capture-ufc-results.mjs" };
  }
  const ageH = (Date.parse(nowIso) - Date.parse(artifact.sourceAsOf ?? artifact.generatedAt ?? "")) / 3_600_000;
  const stale = !Number.isFinite(ageH) || ageH < 0 || ageH > freshWindowHours;

  const sourceRows = artifact.rows ?? [];
  const completed = sourceRows.filter((r) => /^STATUS_FINAL/.test(r.statusRaw ?? ""));
  if (completed.length === 0) {
    return { state: stale ? "SOURCE_STALE" : "NO_RESULTS_YET", results: [], quarantined: [], sourceAsOf: artifact.sourceAsOf, ageHours: Number.isFinite(ageH) ? Number(ageH.toFixed(1)) : null };
  }

  const boutById = boutOverride ?? boutIndexFromDisk();
  const quarantined = [];
  const results = [];
  const consumed = new Set();
  for (const r of completed) {
    const id = r.providerBoutId;
    const scheduled = boutById.get(id);
    if (!scheduled) { quarantined.push({ providerBoutId: id, reason: "no committed bout capture carries this bout id — a result without schedule lineage never settles" }); continue; }
    if (consumed.has(id)) { quarantined.push({ providerBoutId: id, reason: "bout already consumed — a result settles exactly once" }); continue; }
    consumed.add(id);
    if (r.redWinner === true && r.blueWinner === true) { quarantined.push({ providerBoutId: id, reason: "both corners marked winner — source defect, nothing settles" }); continue; }
    const settlementResult = { status: r.statusRaw, redWinner: r.redWinner === true, blueWinner: r.blueWinner === true };
    results.push({
      providerBoutId: id,
      providerCardId: r.providerCardId ?? scheduled.eventProviderId ?? null,
      red: scheduled.red ?? r.red?.name ?? null,
      blue: scheduled.blue ?? r.blue?.name ?? null,
      weightClass: scheduled.weightClass ?? r.weightClass ?? null,
      settlementResult,
      // Exercised at ingest: a no-winner final surfaces as VOID_PENDING_REVIEW for review NOW.
      contractCheck: gradeUfcBout({ market: "bout_winner", side: "red" }, settlementResult).outcome,
    });
  }
  return {
    state: stale ? "SOURCE_STALE" : "RESULTS",
    results, quarantined,
    reconciliation: {
      sourceRows: sourceRows.length,
      nonFinal: sourceRows.length - completed.length,
      completedRows: completed.length,
      joined: results.length,
      quarantined: quarantined.length,
      exact: sourceRows.length === (sourceRows.length - completed.length) + results.length + quarantined.length,
    },
    sourceAsOf: artifact.sourceAsOf,
    ageHours: Number.isFinite(ageH) ? Number(ageH.toFixed(1)) : null,
  };
}
