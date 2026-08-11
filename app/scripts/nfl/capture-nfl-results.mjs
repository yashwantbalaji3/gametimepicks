/**
 * NFL current-season results capture — ESPN public scoreboard → results artifact
 * (Program 161 · Release D). Registered source: espn_scoreboard (same id space as the schedule
 * capture, which is what makes the downstream join id-based instead of name-based).
 *
 * THE HONEST EMPTY STATE: before the first captured final the artifact is state NO_RESULTS_YET
 * with FRESH stamps and zero completed rows — never a failure, never 0-0 scores. A source failure
 * writes NOTHING (last-known-good stands) and exits 0 with SOURCE_STALE on stdout — an outage must
 * never look like an empty slate.
 *
 * Rows keep RAW provider statuses and integer scores only where the provider supplied them;
 * grading happens downstream through the FINAL-only settlement contract. The window looks BACK
 * (--days before --now): results are things that already happened.
 *
 * Run: node scripts/nfl/capture-nfl-results.mjs --now <ISO> [--days 9]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "nfl", "results");

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DAYS = Math.min(31, Math.max(1, Number(arg("--days", "9"))));

const fmt = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const from = fmt(new Date(Date.parse(NOW) - DAYS * 86400_000));
const to = fmt(new Date(Date.parse(NOW)));
const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${from}-${to}`;

let data = null;
try {
  const res = await fetch(url);
  const parsed = JSON.parse(await res.text());
  if (!Array.isArray(parsed.events)) throw new Error("no events array");
  data = parsed;
} catch (err) {
  console.log(`SOURCE_STALE: nfl scoreboard unavailable (${String(err?.message ?? err).slice(0, 80)}) — last-known-good artifact stands, nothing written`);
  process.exit(0);
}

const rows = (data.events ?? []).map((e) => {
  const c = e.competitions?.[0];
  const side = (role) => {
    const x = c?.competitors?.find((t) => t.homeAway === role);
    return x ? { abbr: x.team?.abbreviation ?? null, name: x.team?.displayName ?? null, providerTeamId: x.team?.id ?? null, score: x.score != null && x.score !== "" ? Number(x.score) : null } : null;
  };
  const H = side("home"), A = side("away");
  return {
    providerEventId: String(e.id ?? ""),
    shortName: e.shortName ?? null,
    dateUtc: e.date ?? null,
    statusRaw: e.status?.type?.name ?? null,
    seasonType: e.season?.type ?? null, // 1 = preseason, 2 = regular, 3 = post
    week: e.week?.number ?? null,
    home: H ? { abbr: H.abbr, name: H.name, providerTeamId: H.providerTeamId } : null,
    away: A ? { abbr: A.abbr, name: A.name, providerTeamId: A.providerTeamId } : null,
    ftHome: H?.score ?? null,
    ftAway: A?.score ?? null,
    capturedAt: NOW,
  };
}).filter((r) => r.providerEventId && r.dateUtc && r.home && r.away);

const completed = rows.filter((r) => /^STATUS_FINAL/.test(r.statusRaw ?? ""));
const artifact = {
  schemaVersion: 1,
  sport: "nfl",
  dataClass: "RESULTS_CAPTURE",
  generatedAt: NOW,
  sourceAsOf: NOW,
  windowDays: DAYS,
  state: completed.length > 0 ? "RESULTS" : "NO_RESULTS_YET",
  source: { id: "espn_scoreboard", name: "ESPN NFL public scoreboard", license: "public JSON endpoint, no key; used as a point-in-time snapshot with attribution — same class of usage as the schedule capture" },
  rowCount: rows.length,
  completedCount: completed.length,
  rows,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(artifact, null, 1));
console.log(`nfl results/latest.json: state ${artifact.state}, rows ${rows.length}, completed ${completed.length}`);
