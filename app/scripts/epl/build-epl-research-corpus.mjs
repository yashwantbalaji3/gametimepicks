/**
 * EPL research corpus builder (Program 148 · Release C) — PRIVATE RESEARCH ARTIFACT.
 *
 * Normalizes the four captured historical seasons into ONE chronologically ordered corpus:
 *   2022-23 / 2023-24 / 2024-25  from api-football (founder's free plan, seasons 2022-2024 —
 *                                the free tier REFUSES 2026, receipt in the capture manifest)
 *   2025-26                      from openfootball/football.json (public domain)
 *
 * Honesty rules, enforced not implied:
 *   - club names resolve through the committed club table (epl-clubs.ts) and NOTHING else —
 *     an unknown spelling QUARANTINES the match; the corpus never auto-mints a club;
 *   - only FULL-TIME results with integer goals enter (the StatsAPI "Final without scores" lesson,
 *     applied to soccer exactly as lib/sports/epl/settlement-contract.mjs specifies);
 *   - every row carries its source file + the capture stamp, so any later question about a match
 *     has a provenance answer;
 *   - the output is DETERMINISTIC given the raw inputs: rows sort by (dateUtc, home), and the
 *     builder takes --now for its own stamp rather than reading a clock.
 *
 * The corpus lives under data/internal/research/ — never the public export. It feeds baselines and
 * evaluation only; nothing here is a pick, a prediction surface, or a money input.
 *
 * Run: node scripts/epl/build-epl-research-corpus.mjs --now 2026-08-09T21:30:00Z
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = path.resolve(APP, "..", "data", "internal", "research", "epl", "raw");
const OUT = path.resolve(APP, "..", "data", "internal", "research", "epl");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !process.argv[argNow + 1]) {
  console.error("REFUSED: --now <ISO> is required (deterministic stamp, never a live clock)");
  process.exit(1);
}
const NOW = process.argv[argNow + 1];
if (!Number.isFinite(Date.parse(NOW))) { console.error(`REFUSED: --now "${NOW}" is not parseable`); process.exit(1); }

// The committed club table is TypeScript; scripts run under plain node. The alias table is data,
// so it is re-read HERE from the .ts source via a narrow extraction that fails closed if the
// table's shape ever changes (a parse miss = empty table = every match quarantines = loud).
function loadClubAliases() {
  const src = fs.readFileSync(path.join(APP, "src", "lib", "soccer", "epl-clubs.ts"), "utf8");
  const start = src.indexOf("EPL_CLUB_ALIASES");
  // Skip the `: readonly EplClub[]` TYPE annotation — the table starts at the `[` after `=`.
  const open = src.indexOf("[", src.indexOf("=", start));
  let depth = 0, end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "[") depth++;
    if (src[i] === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  // The slice is a TS array literal of plain object literals — valid JS after `return`.
  const table = new Function(`return ${src.slice(open, end)}`)();
  if (!Array.isArray(table) || table.length < 20) throw new Error("club table extraction failed — refusing to guess");
  return table;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/\bafc\b|\bfc\b/g, "").replace(/&/g, "and").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

function buildResolver() {
  const table = loadClubAliases();
  const map = new Map();
  for (const club of table) for (const a of club.aliases) {
    const k = norm(a);
    if (map.has(k) && map.get(k) !== club.canonical) throw new Error(`alias collision on "${k}"`);
    map.set(k, club.canonical);
  }
  return (raw) => map.get(norm(raw)) ?? null;
}

const resolve = buildResolver();
const quarantined = [];
const rows = [];

function push({ season, dateUtc, matchday, homeRaw, awayRaw, ftHome, ftAway, sourceFile, providerRef }) {
  const home = resolve(homeRaw);
  const away = resolve(awayRaw);
  if (!home || !away) {
    quarantined.push({ season, dateUtc, homeRaw, awayRaw, reason: `unresolved club: ${!home ? homeRaw : ""} ${!away ? awayRaw : ""}`.trim(), sourceFile });
    return;
  }
  if (!Number.isInteger(ftHome) || !Number.isInteger(ftAway) || ftHome < 0 || ftAway < 0) {
    quarantined.push({ season, dateUtc, homeRaw, awayRaw, reason: `non-integer FT goals ${ftHome}-${ftAway} — quarantined, never guessed`, sourceFile });
    return;
  }
  rows.push({
    season, dateUtc, matchday: matchday ?? null, home, away, ftHome, ftAway,
    result: ftHome > ftAway ? "H" : ftHome < ftAway ? "A" : "D",
    sourceFile, providerRef: providerRef ?? null,
  });
}

// ── api-football seasons (fixture.status.short FT only) ─────────────────────────────────────────
for (const s of [2022, 2023, 2024]) {
  const file = `api-football-fixtures-${s}.json`;
  const d = JSON.parse(fs.readFileSync(path.join(RAW, file), "utf8"));
  for (const r of d.response ?? []) {
    if (r.fixture?.status?.short !== "FT") {
      quarantined.push({ season: `${s}-${(s + 1) % 100}`, dateUtc: r.fixture?.date ?? null, homeRaw: r.teams?.home?.name, awayRaw: r.teams?.away?.name, reason: `status ${r.fixture?.status?.short} is not FT`, sourceFile: file });
      continue;
    }
    push({
      season: `${s}-${String((s + 1) % 100).padStart(2, "0")}`,
      dateUtc: r.fixture.date,
      matchday: Number(String(r.league?.round ?? "").match(/(\d+)$/)?.[1] ?? NaN) || null,
      homeRaw: r.teams.home.name, awayRaw: r.teams.away.name,
      ftHome: r.goals?.home, ftAway: r.goals?.away,
      sourceFile: file, providerRef: { provider: "api-football", id: String(r.fixture.id), kind: "fixture" },
    });
  }
}

// ── openfootball 2025-26 — from the ENGLAND SOURCE REPO txt, which carries all 380 results.
// (The football.json mirror is missing 27 results; the refusal below caught that on first run —
// receipt in raw/CAPTURE_MANIFEST.json. The mirror file is retained as evidence, not parsed.)
{
  const file = "openfootball-2025-26-premierleague.txt";
  const txt = fs.readFileSync(path.join(RAW, file), "utf8");
  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  let matchday = null, curDate = null;
  for (const line of txt.split("\n")) {
    // openfootball headers vary by season: "▪ Matchday 38" (2026-27) vs "▪ Regular Season - 38" (2025-26).
    const md = line.match(/(?:Matchday|Regular Season -)\s*(\d+)/);
    if (md) { matchday = Number(md[1]); continue; }
    const dl = line.match(/^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\/?\s*(\d{1,2})(?:\s+(\d{4}))?\s*$/);
    if (dl) {
      const mo = MONTHS[dl[1]];
      // Season-year inference: Aug–Dec belong to 2025, Jan–Jul to 2026 (explicit year wins).
      const year = dl[3] ? Number(dl[3]) : mo >= 8 ? 2025 : 2026;
      curDate = `${year}-${String(mo).padStart(2, "0")}-${String(dl[2]).padStart(2, "0")}`;
      continue;
    }
    // Match rows only — a strict score shape so goalscorer continuation lines can never match.
    const m = line.match(/^\s+(?:\d{2}:\d{2}\s+)?(\S.*?)\s+(\d+)-(\d+)\s+\(\d+-\d+\)\s+(\S.*?)\s*$/);
    if (m && curDate) {
      push({
        season: "2025-26",
        // The txt gives UK-local times; noon UTC on the match DATE is the chronological ORDER KEY
        // only (evaluation fits strictly on prior dates, so intra-day order never crosses a fit
        // boundary). Kickoff-precision timestamps arrive with a real provider in a later release.
        dateUtc: `${curDate}T12:00:00Z`,
        matchday,
        homeRaw: m[1], awayRaw: m[4],
        ftHome: Number(m[2]), ftAway: Number(m[3]),
        sourceFile: file, providerRef: null,
      });
    }
  }
}

rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.home.localeCompare(b.home));

const seasons = [...new Set(rows.map((r) => r.season))].sort();
const bySeason = Object.fromEntries(seasons.map((s) => [s, rows.filter((r) => r.season === s).length]));

const corpus = {
  schemaVersion: 1,
  artifact: "epl-research-corpus",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  sourceManifest: "raw/CAPTURE_MANIFEST.json",
  seasons: bySeason,
  totalMatches: rows.length,
  quarantinedCount: quarantined.length,
  quarantined,
  rows,
};

// Every season of a 20-club league has exactly 380 matches. Anything else is a capture defect —
// refuse to write a corpus that silently misses matches.
for (const [s, n] of Object.entries(bySeason)) {
  if (n !== 380) { console.error(`REFUSED: season ${s} has ${n} matches, expected exactly 380`); process.exit(1); }
}

fs.writeFileSync(path.join(OUT, "corpus-v1.json"), JSON.stringify(corpus, null, 1));
console.log(`corpus-v1.json written: ${rows.length} matches across ${seasons.length} seasons; quarantined ${quarantined.length}`);
for (const q of quarantined.slice(0, 5)) console.log("  quarantined:", JSON.stringify(q));
