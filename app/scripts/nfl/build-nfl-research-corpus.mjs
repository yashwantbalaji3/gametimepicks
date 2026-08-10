/**
 * NFL research corpus builder (Program 151 · Release A) — PRIVATE RESEARCH ARTIFACT.
 *
 * Normalizes three captured seasons of ESPN monthly scoreboard responses into one chronologically
 * ordered corpus. Rules, enforced not implied:
 *   - FINAL results only (STATUS_FINAL / STATUS_FINAL_OVERTIME); everything else quarantines with
 *     its reason — a scheduled or in-progress row is not a result;
 *   - integer scores or quarantine; ties are a REAL outcome ("T"), never flattened;
 *   - phase kept per game (1 preseason · 2 regular · 3 postseason) and the REGULAR season must
 *     count exactly 272 games per season or the build refuses — a silent gap biases every baseline;
 *   - duplicate provider ids across window boundaries dedupe by id (first occurrence wins,
 *     byte-equal duplicates only — a conflicting duplicate REFUSES);
 *   - team identity = ESPN displayName (stable 32-team league across 2023-2025; the builder
 *     refuses if the distinct-team count is not exactly 32).
 *
 * Run: node scripts/nfl/build-nfl-research-corpus.mjs --now 2026-08-10T03:00:00Z
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nfl");
const RAW = path.join(ROOT, "raw");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !Number.isFinite(Date.parse(process.argv[argNow + 1] ?? ""))) {
  console.error("REFUSED: --now <ISO> required"); process.exit(1);
}
const NOW = process.argv[argNow + 1];

const seen = new Map();
const quarantined = [];
const rows = [];

const files = fs.readdirSync(RAW).filter((f) => f.startsWith("espn-") && f.endsWith(".json")).sort();
for (const file of files) {
  const d = JSON.parse(fs.readFileSync(path.join(RAW, file), "utf8"));
  for (const e of d.events ?? []) {
    const id = String(e.id ?? "");
    const c = e.competitions?.[0];
    const sideOf = (role) => c?.competitors?.find((x) => x.homeAway === role);
    const H = sideOf("home"), A = sideOf("away");
    const record = {
      providerEventId: id,
      season: e.season?.year ?? null,
      phase: e.season?.type ?? null,
      week: e.week?.number ?? null,
      dateUtc: e.date ?? null,
      home: H?.team?.displayName ?? null,
      away: A?.team?.displayName ?? null,
      ftHome: H?.score != null && H.score !== "" ? Number(H.score) : null,
      ftAway: A?.score != null && A.score !== "" ? Number(A.score) : null,
      neutralSite: c?.neutralSite === true,
      overtime: /overtime/i.test(e.status?.type?.name ?? "") || /OT/.test(e.status?.type?.shortDetail ?? ""),
      statusRaw: e.status?.type?.name ?? null,
      sourceFile: file,
    };
    if (!id || !record.dateUtc || !record.home || !record.away) { quarantined.push({ id, file, reason: "missing identity fields" }); continue; }
    // The Pro Bowl renders as AFC/NFC — an exhibition all-star game, not a competitive result.
    // (This exclusion exists because the 32-team refusal caught exactly these rows on first run.)
    if (["AFC", "NFC"].includes(record.home) || ["AFC", "NFC"].includes(record.away)) {
      quarantined.push({ id, file, reason: "Pro Bowl exhibition (AFC/NFC) — excluded from competitive results" }); continue;
    }
    if (seen.has(id)) {
      const prev = seen.get(id);
      if (JSON.stringify({ ...prev, sourceFile: null }) !== JSON.stringify({ ...record, sourceFile: null })) {
        console.error(`REFUSED: conflicting duplicate provider id ${id} (${prev.sourceFile} vs ${file})`); process.exit(1);
      }
      continue; // byte-equal boundary duplicate — first occurrence stands
    }
    seen.set(id, record);
    if (!/^STATUS_FINAL/.test(record.statusRaw ?? "")) { quarantined.push({ id, file, reason: `status ${record.statusRaw} is not FINAL` }); continue; }
    if (!Number.isInteger(record.ftHome) || !Number.isInteger(record.ftAway) || record.ftHome < 0 || record.ftAway < 0) {
      quarantined.push({ id, file, reason: `non-integer final score ${record.ftHome}-${record.ftAway}` }); continue;
    }
    rows.push({ ...record, result: record.ftHome > record.ftAway ? "H" : record.ftHome < record.ftAway ? "A" : "T" });
  }
}

rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.providerEventId.localeCompare(b.providerEventId));

const seasons = [...new Set(rows.map((r) => r.season))].sort();
const byPhase = {};
for (const s of seasons) {
  byPhase[s] = { 1: 0, 2: 0, 3: 0 };
  for (const r of rows.filter((x) => x.season === s)) byPhase[s][r.phase] = (byPhase[s][r.phase] ?? 0) + 1;
  if (byPhase[s][2] !== 272) { console.error(`REFUSED: season ${s} has ${byPhase[s][2]} regular-season finals, expected exactly 272`); process.exit(1); }
}
const teams = new Set(rows.flatMap((r) => [r.home, r.away]));
if (teams.size !== 32) { console.error(`REFUSED: ${teams.size} distinct teams, the league has exactly 32`); process.exit(1); }

const corpus = {
  schemaVersion: 1,
  artifact: "nfl-research-corpus",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  sourceManifest: "raw/CAPTURE_MANIFEST.json",
  seasons: byPhase,
  totalGames: rows.length,
  ties: rows.filter((r) => r.result === "T").length,
  neutralSiteGames: rows.filter((r) => r.neutralSite).length,
  quarantinedCount: quarantined.length,
  quarantined: quarantined.slice(0, 200),
  rows,
};
fs.writeFileSync(path.join(ROOT, "corpus-v1.json"), JSON.stringify(corpus, null, 1));
console.log(`corpus-v1.json: ${rows.length} finals across ${seasons.join("/")}; phases ${JSON.stringify(byPhase)}; ties ${corpus.ties}; neutral ${corpus.neutralSiteGames}; quarantined ${quarantined.length}`);
