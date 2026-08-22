/**
 * EPL current-season results capture — ESPN eng.1 scoreboard → results artifact
 * (Program 154 · Release A). Registered source (espn_scoreboard, results-candidate role).
 *
 * THE HONEST EMPTY STATE: before the first completed 2026-27 league fixture this artifact is
 * state NO_RESULTS_YET with FRESH stamps and zero rows — never a failure, never 0-0 scores,
 * never a fabricated matchweek. A source failure writes NOTHING (last-known-good stands) and
 * exits 0 with SOURCE_STALE on stdout — an outage must never look like an empty slate.
 *
 * Rows keep RAW provider statuses; grading happens downstream through the FT-only settlement
 * contract, joined by the canonical kickoff-based event identity — never by fuzzy names.
 *
 * Run: node scripts/epl/capture-epl-results.mjs --now <ISO> [--season-start 2026-08-21]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "soccer", "epl", "results");

const arg = (n, f) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const SEASON_START = arg("--season-start", "2026-08-21");

const fmt = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const from = fmt(new Date(Date.parse(`${SEASON_START}T00:00:00Z`)));
const to = fmt(new Date(Date.parse(NOW)));
const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${from}-${to}&limit=1000`;

let data = null;
if (Date.parse(NOW) < Date.parse(`${SEASON_START}T00:00:00Z`)) {
  data = { events: [] }; // the season has not started — an empty window is the truth, no fetch needed
} else {
  try {
    const res = await fetch(url);
    const body = await res.text();
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed.events)) throw new Error("no events array");
    data = parsed;
  } catch (err) {
    console.log(`SOURCE_STALE: eng.1 scoreboard unavailable (${String(err?.message ?? err).slice(0, 80)}) — last-known-good artifact stands, nothing written`);
    process.exit(0);
  }
}

const rows = (data.events ?? []).map((e) => {
  const c = e.competitions?.[0];
  const side = (role) => c?.competitors?.find((x) => x.homeAway === role);
  const H = side("home"), A = side("away");
  return {
    providerEventId: String(e.id ?? ""),
    dateUtc: e.date ?? null,
    home: H?.team?.displayName ?? null,
    away: A?.team?.displayName ?? null,
    ftHome: H?.score != null && H.score !== "" ? Number(H.score) : null,
    ftAway: A?.score != null && A.score !== "" ? Number(A.score) : null,
    statusRaw: e.status?.type?.name ?? null,
    capturedAt: NOW,
  };
}).filter((r) => r.providerEventId && r.dateUtc && r.home && r.away);

const isComplete = (r) => /^STATUS_FULL_TIME|^STATUS_FINAL/.test(r?.statusRaw ?? "") && Number.isInteger(r?.ftHome) && Number.isInteger(r?.ftAway);

/*
 * ── A FINISHED MATCH NEVER BECOMES UNFINISHED ───────────────────────────────────────────────────
 *
 * This script was a pure snapshot: it wrote whatever the scoreboard said, over the top of whatever
 * was there. On 2026-08-22 at 00:12 UTC a run did exactly that to a settled result — Arsenal 3-0
 * Coventry City went from STATUS_FULL_TIME back to STATUS_SECOND_HALF, and the artifact's state
 * regressed from RESULTS to NO_RESULTS_YET. Only the append-only ledger saved the grade. Had the
 * regression landed BEFORE grading, the first Premier League match this project ever settled would
 * have been silently skipped, and the next run would have reported a quiet matchday.
 *
 * Two distinct protections, because two different things go wrong:
 *
 *   1. STATUS REGRESSION. A provider that reports an earlier stage for a match that has already
 *      finished is wrong, and its wrongness must not propagate. A row previously complete with
 *      integer goals stays complete. If the new capture is ALSO complete, the new one wins — that is
 *      the corrections path in docs/EPL_CORRECTIONS_RUNBOOK.md, and a genuine score correction has
 *      to be able to land.
 *
 *   2. WINDOW ROLL. The scoreboard is date-windowed, so yesterday's completed matches simply leave
 *      it. A snapshot-only capture therefore DELETES results by doing nothing wrong at all. Recently
 *      completed fixtures are retained for a bounded window; beyond it the graded ledger and the
 *      research corpus are the permanent record, and this artifact goes back to meaning what it says
 *      — a current capture.
 *
 * Both are reported rather than applied in silence. A capture that quietly preserved rows would be
 * indistinguishable from one that had captured them.
 */
const RETAIN_COMPLETED_DAYS = 7;
const previous = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, "latest.json"), "utf8")); } catch { return null; } })();
const priorById = new Map((previous?.rows ?? []).filter(isComplete).map((r) => [r.providerEventId, r]));

const regressionsBlocked = [];
const merged = rows.map((r) => {
  const prior = priorById.get(r.providerEventId);
  if (prior && !isComplete(r)) {
    regressionsBlocked.push({
      providerEventId: r.providerEventId, matchup: `${r.home} v ${r.away}`,
      was: prior.statusRaw, provider: r.statusRaw,
      note: "kept the completed record; a finished match does not become unfinished",
    });
    return prior;
  }
  return r;
});

/* Completed fixtures the window has moved past, kept for a bounded time so a roll cannot delete them. */
const seen = new Set(merged.map((r) => r.providerEventId));
const retained = [...priorById.values()].filter((r) => {
  if (seen.has(r.providerEventId)) return false;
  const k = Date.parse(r.dateUtc ?? "");
  return Number.isFinite(k) && (Date.parse(NOW) - k) / 86_400_000 <= RETAIN_COMPLETED_DAYS;
});

const allRows = [...merged, ...retained].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)) || String(a.home).localeCompare(String(b.home)));
const completed = allRows.filter(isComplete);
const artifact = {
  schemaVersion: 1,
  competition: "epl",
  season: "2026-27",
  dataClass: "RESULTS_CAPTURE",
  generatedAt: NOW,
  sourceAsOf: NOW,
  state: completed.length > 0 ? "RESULTS" : Date.parse(NOW) < Date.parse(`${SEASON_START}T00:00:00Z`) ? "PRESEASON" : "NO_RESULTS_YET",
  seasonStart: SEASON_START,
  source: { id: "espn_scoreboard", name: "ESPN eng.1 public scoreboard", license: "public JSON endpoint, no key; point-in-time snapshot with attribution" },
  rowCount: allRows.length,
  completedCount: completed.length,
  /* Published, not silent: a capture that quietly preserved rows would be indistinguishable
     from one that had actually captured them. */
  regressionsBlocked,
  retainedFromEarlierWindow: retained.length,
  retainWindowDays: RETAIN_COMPLETED_DAYS,
  rows: allRows,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(artifact, null, 1));
console.log(
  `results/latest.json: state ${artifact.state}, rows ${allRows.length}, completed ${completed.length}`
  + (regressionsBlocked.length ? `, ${regressionsBlocked.length} status regression(s) BLOCKED` : "")
  + (retained.length ? `, ${retained.length} retained from an earlier window` : ""),
);
for (const r of regressionsBlocked) console.log(`  BLOCKED ${r.matchup}: provider said ${r.provider}, record says ${r.was}`);
