/**
 * NBA research corpus builder (Program 152 · Release A) — PRIVATE RESEARCH ARTIFACT.
 *
 * NBA semantics, not NFL's copied: season types are 1 preseason · 2 regular · 3 playoffs ·
 * 5 play-in (ESPN slug "play-in-season"); membership is exactly 30 franchises; a REGULAR season is
 * exactly 1,230 finals (82×30/2) or the build refuses; basketball has NO ties — a drawn final is a
 * data defect that REFUSES the build, never a quarantine. Preseason rows are kept phase-tagged but
 * evaluation membership excludes them mechanically (the evaluator re-asserts this).
 *
 * Run: node scripts/nba/build-nba-research-corpus.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nba");
const RAW = path.join(ROOT, "raw");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !Number.isFinite(Date.parse(process.argv[argNow + 1] ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const NOW = process.argv[argNow + 1];

const PHASES = { 1: "preseason", 2: "regular", 3: "playoffs", 5: "play-in", "cup-final": "cup-final" };
const seen = new Map();
const quarantined = [];
const rows = [];

for (const file of fs.readdirSync(RAW).filter((f) => f.startsWith("espn-") && f.endsWith(".json")).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(RAW, file), "utf8"));
  for (const e of d.events ?? []) {
    const id = String(e.id ?? "");
    const c = e.competitions?.[0];
    const side = (role) => c?.competitors?.find((x) => x.homeAway === role);
    const H = side("home"), A = side("away");
    const rec = {
      providerEventId: id,
      season: e.season?.year ?? null,           // ESPN: 2024 = the 2023-24 season's label year
      phase: e.season?.type ?? null,
      dateUtc: e.date ?? null,
      home: H?.team?.displayName ?? null,
      away: A?.team?.displayName ?? null,
      ftHome: H?.score != null && H.score !== "" ? Number(H.score) : null,
      ftAway: A?.score != null && A.score !== "" ? Number(A.score) : null,
      neutralSite: c?.neutralSite === true,
      overtime: (c?.status?.period ?? e.status?.period ?? 4) > 4,
      statusRaw: e.status?.type?.name ?? null,
      sourceFile: file,
    };
    if (!id || !rec.dateUtc || !rec.home || !rec.away) { quarantined.push({ id, file, reason: "missing identity fields" }); continue; }
    // All-Star exhibitions ride as season-type 2 in this feed under BOTH formats: conference
    // squads ("Eastern Conf All-Stars") and the 2024-25 mini-tournament ("Team Chuck" etc.).
    // Excluded like the NFL Pro Bowl — the exactly-1230 refusal caught each format in turn.
    const exhibition = (n) => /All-Stars$/.test(n) || /^Team [A-Z][a-z]+$/.test(n);
    if (exhibition(rec.home) || exhibition(rec.away)) {
      quarantined.push({ id, file, reason: "All-Star exhibition — excluded from competitive results" }); continue;
    }
    if (!PHASES[rec.phase]) { quarantined.push({ id, file, reason: `unsupported season type ${rec.phase}` }); continue; }
    // The NBA Cup (In-Season Tournament) FINAL is a real competitive game that does NOT count in
    // regular-season standings; the feed marks it via a notes headline. Own phase, kept for
    // fitting, excluded from the exactly-1230 regular count.
    const notes = JSON.stringify(c?.notes ?? "");
    if (rec.phase === 2 && /Tournament Championship|NBA Cup Championship/i.test(notes)) rec.phase = "cup-final";
    if (seen.has(id)) {
      const prev = seen.get(id);
      if (JSON.stringify({ ...prev, sourceFile: null }) !== JSON.stringify({ ...rec, sourceFile: null })) {
        console.error(`REFUSED: conflicting duplicate provider id ${id}`); process.exit(1);
      }
      continue;
    }
    seen.set(id, rec);
    if (!/^STATUS_FINAL/.test(rec.statusRaw ?? "")) { quarantined.push({ id, file, reason: `status ${rec.statusRaw} is not FINAL` }); continue; }
    if (!Number.isInteger(rec.ftHome) || !Number.isInteger(rec.ftAway) || rec.ftHome < 0 || rec.ftAway < 0) {
      quarantined.push({ id, file, reason: `non-integer final ${rec.ftHome}-${rec.ftAway}` }); continue;
    }
    if (rec.ftHome === rec.ftAway) { console.error(`REFUSED: drawn NBA final ${id} (${rec.ftHome}-${rec.ftAway}) — basketball has no ties; this is a source defect`); process.exit(1); }
    rows.push({ ...rec, result: rec.ftHome > rec.ftAway ? "H" : "A" });
  }
}

rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.providerEventId.localeCompare(b.providerEventId));
const seasons = [...new Set(rows.map((r) => r.season))].sort();
const byPhase = {};
for (const s of seasons) {
  byPhase[s] = {};
  for (const r of rows.filter((x) => x.season === s)) byPhase[s][PHASES[r.phase]] = (byPhase[s][PHASES[r.phase]] ?? 0) + 1;
  if (byPhase[s].regular !== 1230) { console.error(`REFUSED: season ${s} has ${byPhase[s].regular} regular finals, expected exactly 1230`); process.exit(1); }
}
const franchises = new Set(rows.filter((r) => r.phase === 2).flatMap((r) => [r.home, r.away]));
if (franchises.size !== 30) { console.error(`REFUSED: ${franchises.size} franchises in regular-season play, the league has exactly 30`); process.exit(1); }

const corpus = {
  schemaVersion: 1,
  artifact: "nba-research-corpus",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  sourceManifest: "raw/CAPTURE_MANIFEST.json",
  phaseTaxonomy: PHASES,
  seasons: byPhase,
  totalFinals: rows.length,
  neutralSiteGames: rows.filter((r) => r.neutralSite).length,
  overtimeGames: rows.filter((r) => r.overtime).length,
  quarantinedCount: quarantined.length,
  quarantined: quarantined.slice(0, 200),
  rows,
};
fs.writeFileSync(path.join(ROOT, "corpus-v1.json"), JSON.stringify(corpus, null, 1));
console.log(`corpus-v1.json: ${rows.length} finals; ${JSON.stringify(byPhase)}; neutral ${corpus.neutralSiteGames}; OT ${corpus.overtimeGames}; quarantined ${quarantined.length}`);
