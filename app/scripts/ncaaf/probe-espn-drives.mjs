/**
 * NCAAF · drive/play availability sample (NCAAF-001.8). PRIVATE_RESEARCH.
 *
 * Before any efficiency/drive feature is designed, measure whether the ESPN game summary actually carries
 * drives and plays across seasons and divisions. Sample = per season, the FBS-FBS and the FCS-FCS corpus game
 * whose FNV-1a hash of its event id is smallest (deterministic, not cherry-picked). One summary request per
 * sampled game, capped, throttled, cached under .cache/. Output: counts only.
 *
 * Run: node scripts/ncaaf/probe-espn-drives.mjs --now 2026-10-09T18:00:00Z --seasons 2016-2025
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fnv1a64 } from "../../src/lib/forecast-ledger/identity.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const CORPUS = path.join(ROOT, "data", "internal", "research", "ncaaf", "corpus", "v1");
const CACHE = path.join(ROOT, "data", "internal", "research", "ncaaf", ".cache", "raw", "espn", "summary");
const OUT = path.join(ROOT, "data", "internal", "research", "ncaaf", "capability", "espn-drive-sample-v1.json");

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const m = /^(\d{4})-(\d{4})$/.exec(arg("--seasons", ""));
if (!m) { console.error("REFUSED: --seasons YYYY-YYYY required"); process.exit(1); }
const SEASONS = Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);
const MAX = 40;
let requests = 0;

async function summary(eventId) {
  const f = path.join(CACHE, `${eventId}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  if (requests >= MAX) throw new Error(`request cap ${MAX} reached`);
  requests++;
  await new Promise((r) => setTimeout(r, 300));
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${eventId}`;
  const res = await fetch(url);
  const w = { url, capturedAt: new Date().toISOString(), status: res.status, body: res.ok ? await res.json() : null };
  fs.mkdirSync(CACHE, { recursive: true });
  if (res.ok) fs.writeFileSync(f, JSON.stringify(w));
  return w;
}

const samples = [];
for (const season of SEASONS) {
  const rows = fs.readFileSync(path.join(CORPUS, `games-${season}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  for (const pairing of ["FBS-FBS", "FCS-FCS"]) {
    const pick = rows.filter((r) => r.pairing === pairing).sort((a, b) => fnv1a64(a.eventId).localeCompare(fnv1a64(b.eventId)))[0];
    if (!pick) { samples.push({ season, pairing, eventId: null, reason: "no game in corpus" }); continue; }
    const w = await summary(pick.eventId);
    const drives = w.body?.drives?.previous ?? [];
    const plays = drives.flatMap((d) => d.plays ?? []);
    const driveScore = drives.length ? drives.filter((d) => d.isScore === true).length : null;
    samples.push({
      season, pairing, eventId: pick.eventId, httpStatus: w.status,
      drives: drives.length,
      plays: plays.length,
      playsWithWallclock: plays.filter((p) => typeof p.wallclock === "string").length,
      playsWithStartYardLine: plays.filter((p) => Number.isFinite(p.start?.yardLine)).length,
      scoringDrives: driveScore,
      boxscoreTeams: w.body?.boxscore?.teams?.length ?? 0,
      boxscoreTeamStatRows: w.body?.boxscore?.teams?.[0]?.statistics?.length ?? 0,
      pickcenterEntries: w.body?.pickcenter?.length ?? 0,
      injuriesEntries: (w.body?.injuries ?? []).reduce((s, t) => s + (t.injuries?.length ?? 0), 0),
    });
  }
}

const withDrives = samples.filter((s) => s.drives > 0);
const artifact = {
  schemaVersion: 1,
  sport: "ncaaf",
  dataClass: "PROVIDER_COVERAGE_PROBE",
  authorization: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  method: "per season × {FBS-FBS, FCS-FCS}: corpus game with the smallest fnv1a64(eventId); ESPN summary?event=<id>",
  network: { requests, cap: MAX },
  sampled: samples.length,
  withDrives: withDrives.length,
  samples,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`${withDrives.length}/${samples.length} sampled games carry drives · ${requests} requests`);
for (const s of samples) console.log(`${s.season} ${s.pairing} ${s.eventId} drives=${s.drives} plays=${s.plays} wall=${s.playsWithWallclock} yard=${s.playsWithStartYardLine} box=${s.boxscoreTeamStatRows} odds=${s.pickcenterEntries} inj=${s.injuriesEntries}`);
