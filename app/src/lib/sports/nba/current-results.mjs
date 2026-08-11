/**
 * NBA current-results adapter (Program 162 · Release A) — the operational bridge from the results
 * capture to the FINAL-only settlement contract, deployed while the sport is still off-season so
 * the first preseason final (schedule says Oct 3) flows without a code change.
 *
 * States, honest by construction (the EPL/NFL adapter design):
 *   NOT_CONFIGURED   no capture artifact exists (adapter says so; never invents an empty slate)
 *   NO_RESULTS_YET   capture fresh, no completed game in the window — zero rows, the truth
 *   SOURCE_STALE     capture exists but its stamps exceed the freshness window
 *   RESULTS          finals exist — each joins by PROVIDER EVENT ID to a committed schedule
 *                    capture row and reconciles exactly once
 *
 * NBA-specific rules on top of the shared skeleton:
 *   - a TIED final quarantines (impossible after overtime — source defect, same rule as the
 *     contract) instead of flowing to results;
 *   - seasonType must AGREE between the scheduled row and the result row — a mismatch quarantines,
 *     because preseason results must never masquerade as regular-season truth;
 *   - neutralSite metadata is preserved on every joined row;
 *   - reconciliation covers the WHOLE source population: sourceRows = nonFinal + joined +
 *     quarantined, so ignored in-progress/scheduled rows are counted, never silently dropped.
 */
import fs from "node:fs";
import path from "node:path";

import { gradeNbaLeg } from "./settlement-contract.mjs";

const RESULTS_PATH = () => path.join(process.cwd(), "public", "data", "nba", "results", "latest.json");
const SCHEDULE_DIR = () => path.join(process.cwd(), "public", "data", "nba", "schedule");

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

export function loadCurrentNbaResults({ nowIso, artifact: artifactOverride, scheduleIndex: scheduleOverride, freshWindowHours = 36 } = {}) {
  // `artifact: null` means "none exists" (tests, unconfigured); only UNDEFINED falls to disk.
  const artifact = artifactOverride !== undefined ? artifactOverride : (() => { try { return JSON.parse(fs.readFileSync(RESULTS_PATH(), "utf8")); } catch { return null; } })();
  if (!artifact) {
    return { state: "NOT_CONFIGURED", results: [], quarantined: [], note: "no results capture artifact exists — run scripts/nba/capture-nba-results.mjs" };
  }
  const ageH = (Date.parse(nowIso) - Date.parse(artifact.sourceAsOf ?? artifact.generatedAt ?? "")) / 3_600_000;
  const stale = !Number.isFinite(ageH) || ageH < 0 || ageH > freshWindowHours;

  const sourceRows = artifact.rows ?? [];
  const completed = sourceRows.filter((r) => /^STATUS_FINAL/.test(r.statusRaw ?? ""));
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
    if (r.ftHome === r.ftAway) { quarantined.push({ providerEventId: id, reason: `final ${r.ftHome}-${r.ftAway}: an NBA game cannot end tied — source defect, nothing settles` }); continue; }
    if (scheduled.seasonType != null && r.seasonType != null && scheduled.seasonType !== r.seasonType) {
      quarantined.push({ providerEventId: id, reason: `seasonType disagrees (schedule ${scheduled.seasonType}, result ${r.seasonType}) — preseason and regular season must never blend` });
      continue;
    }
    const settlementResult = { status: r.statusRaw, homePointsFT: r.ftHome, awayPointsFT: r.ftAway };
    results.push({
      providerEventId: id,
      seasonType: scheduled.seasonType ?? r.seasonType ?? null,
      neutralSite: scheduled.neutralSite ?? r.neutralSite ?? null,
      home: scheduled.home?.abbr ?? null,
      away: scheduled.away?.abbr ?? null,
      ftHome: r.ftHome,
      ftAway: r.ftAway,
      settlementResult,
      // The contract is exercised here so a defective row surfaces NOW, not on settle day.
      contractCheck: gradeNbaLeg({ market: "moneyline", side: "home" }, settlementResult).outcome,
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
