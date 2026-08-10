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

const completed = rows.filter((r) => /^STATUS_FULL_TIME|^STATUS_FINAL/.test(r.statusRaw ?? ""));
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
  rowCount: rows.length,
  completedCount: completed.length,
  rows,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(artifact, null, 1));
console.log(`results/latest.json: state ${artifact.state}, rows ${rows.length}, completed ${completed.length}`);
