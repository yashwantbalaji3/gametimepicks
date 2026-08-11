/**
 * NFL current-results adapter (Program 161 · Release D) — the operational bridge from the results
 * capture to the FINAL-only settlement contract, deployed before the first preseason final flows.
 *
 * States, honest by construction (the EPL adapter's design, P154):
 *   NOT_CONFIGURED   no capture artifact exists (adapter says so; never invents an empty slate)
 *   NO_RESULTS_YET   capture fresh, no completed game in the window yet — zero rows, the truth
 *   SOURCE_STALE     capture exists but its stamps exceed the freshness window
 *   RESULTS          finals exist — each joins by PROVIDER EVENT ID to a committed schedule
 *                    capture row, passes the integer-score gate, exercises the settlement
 *                    contract, and reconciles exactly once
 *
 * Join discipline: the schedule capture and the results capture use the SAME provider id space
 * (espn_scoreboard), so the join is id-based — stronger than the EPL name-normalization bridge.
 * The schedule side is the UNION of all committed snapshots plus latest: the schedule window rolls
 * forward daily, so a final from three days ago may have left latest.json while its snapshot still
 * proves it was a scheduled game. A final with no schedule lineage QUARANTINES with its reason —
 * unjoined results never settle anything (Sprint 045 lineage rule).
 */
import fs from "node:fs";
import path from "node:path";

import { gradeNflLeg } from "./settlement-contract.mjs";

const RESULTS_PATH = () => path.join(process.cwd(), "public", "data", "nfl", "results", "latest.json");
const SCHEDULE_DIR = () => path.join(process.cwd(), "public", "data", "nfl", "schedule");

/** Union of every committed schedule capture (snapshots + latest), keyed by providerEventId. */
function scheduleIndexFromDisk() {
  const byId = new Map();
  try {
    const files = fs.readdirSync(SCHEDULE_DIR()).filter((f) => f.endsWith(".json")).sort();
    for (const f of files) {
      try {
        const cap = JSON.parse(fs.readFileSync(path.join(SCHEDULE_DIR(), f), "utf8"));
        for (const r of cap.rows ?? []) if (r?.providerEventId) byId.set(r.providerEventId, r);
      } catch { /* one unreadable snapshot must not hide the others */ }
    }
  } catch { /* no schedule directory — the join below quarantines everything, loudly */ }
  return byId;
}

export function loadCurrentNflResults({ nowIso, artifact: artifactOverride, scheduleIndex: scheduleOverride, freshWindowHours = 36 } = {}) {
  // `artifact: null` means "none exists" (tests, unconfigured); only UNDEFINED falls to disk.
  const artifact = artifactOverride !== undefined ? artifactOverride : (() => { try { return JSON.parse(fs.readFileSync(RESULTS_PATH(), "utf8")); } catch { return null; } })();
  if (!artifact) {
    return { state: "NOT_CONFIGURED", results: [], quarantined: [], note: "no results capture artifact exists — run scripts/nfl/capture-nfl-results.mjs" };
  }
  const ageH = (Date.parse(nowIso) - Date.parse(artifact.sourceAsOf ?? artifact.generatedAt ?? "")) / 3_600_000;
  const stale = !Number.isFinite(ageH) || ageH < 0 || ageH > freshWindowHours;

  const completed = (artifact.rows ?? []).filter((r) => /^STATUS_FINAL/.test(r.statusRaw ?? ""));
  if (completed.length === 0) {
    return { state: stale ? "SOURCE_STALE" : "NO_RESULTS_YET", results: [], quarantined: [], sourceAsOf: artifact.sourceAsOf, ageHours: Number.isFinite(ageH) ? Number(ageH.toFixed(1)) : null };
  }

  const scheduleById = scheduleOverride ?? scheduleIndexFromDisk();
  const quarantined = [];
  const results = [];
  const consumed = new Set();
  for (const r of completed) {
    const id = r.providerEventId;
    const scheduled = scheduleById.get(id);
    if (!scheduled) { quarantined.push({ providerEventId: id, reason: "no committed schedule capture carries this event id — a result without schedule lineage never settles" }); continue; }
    if (consumed.has(id)) { quarantined.push({ providerEventId: id, reason: "event already consumed — a result settles exactly once" }); continue; }
    consumed.add(id);
    if (!Number.isInteger(r.ftHome) || !Number.isInteger(r.ftAway)) { quarantined.push({ providerEventId: id, reason: "FINAL status without integer points — the StatsAPI lesson, quarantined" }); continue; }
    const settlementResult = { status: r.statusRaw, homePointsFT: r.ftHome, awayPointsFT: r.ftAway };
    results.push({
      providerEventId: id,
      seasonType: scheduled.seasonType ?? r.seasonType ?? null,
      week: scheduled.week ?? r.week ?? null,
      home: scheduled.home?.abbr ?? null,
      away: scheduled.away?.abbr ?? null,
      ftHome: r.ftHome,
      ftAway: r.ftAway,
      settlementResult,
      // The contract is exercised here so a defective row surfaces NOW, not on settle day.
      contractCheck: gradeNflLeg({ market: "moneyline", side: "home" }, settlementResult).outcome,
    });
  }
  return {
    state: stale ? "SOURCE_STALE" : "RESULTS",
    results, quarantined,
    reconciliation: { completedRows: completed.length, joined: results.length, quarantined: quarantined.length, exact: completed.length === results.length + quarantined.length },
    sourceAsOf: artifact.sourceAsOf,
    ageHours: Number.isFinite(ageH) ? Number(ageH.toFixed(1)) : null,
  };
}
