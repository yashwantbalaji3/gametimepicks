/**
 * FEED SETTLED RESULTS BACK TO THE MODEL — the mechanism that makes it learn.
 *
 * Reads the committed results capture, resolves clubs through the SAME club table the historical
 * corpus used, and appends full-time matches to the current-season corpus exactly once. The next
 * forecast run fits on them automatically, because fitEplStrength reads base + current through one
 * loader.
 *
 * Usage: npx tsx scripts/epl/accrete-epl-corpus.mjs --now <iso> [--write]
 * Writes: data/internal/research/epl/corpus-current-season.json  (PRIVATE research)
 *
 * REFUSALS, all deliberate:
 *   - a club the table does not know is QUARANTINED, never auto-minted — the corpus has never
 *     invented a club and this must not be the thing that starts;
 *   - only STATUS_FULL_TIME with INTEGER goals enters. "Final without scores" is a real state that
 *     postponed fixtures reach, and a 0-0 inferred from a null is a fabricated result;
 *   - a match the BASE corpus already holds is refused rather than duplicated;
 *   - re-running adds nothing. Idempotency is the property that lets this run on every cron.
 *
 * NO LEAKAGE FILTER HERE, ON PURPOSE. Every row is written the moment it is settled, and
 * fitEplStrength excludes anything at or after its cutoff. Filtering on write would make the file's
 * contents depend on when the script happened to run, which is a far harder property to reason
 * about than "everything we know, and the fit decides what it may see".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEplClubIndex } from "../../src/lib/soccer/epl-clubs.ts";
import { corpusKey, BASE_CORPUS, CURRENT_CORPUS } from "../../src/lib/sports/epl/corpus.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (f) => process.argv.includes(f);
const NOW = arg("--now");
const WRITE = has("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/*
 * The club table, IMPORTED from the committed source of truth.
 *
 * The historical corpus builder scrapes this table out of the .ts file with a regex, because it runs
 * under plain node and cannot load TypeScript. This script runs under tsx, so it imports the real
 * index and gets the real resolver — including its refusal to guess on an ambiguous alias, which a
 * regex copy of the alias list would silently lose. Reproducing the scrape here would have been
 * copying a workaround instead of the thing it works around, and the first attempt failed outright
 * rather than quietly resolving a subset, which is the better of the two ways to be wrong.
 */
const clubIndex = buildEplClubIndex();
if (!clubIndex.isSound) {
  console.error(`REFUSED: the club table has ${clubIndex.collisions.length} alias collision(s) — a corpus must not be built on an ambiguous naming table`);
  process.exit(1);
}
const resolve = (raw) => clubIndex.resolve(raw)?.canonical ?? null;

const results = read(path.join(APP, "public/data/soccer/epl/results/latest.json"));
if (!results || !Array.isArray(results.rows)) { console.error("REFUSED: no results capture to accrete from"); process.exit(1); }

const base = read(path.join(REPO, BASE_CORPUS));
if (!base?.rows) { console.error("REFUSED: base corpus unreadable"); process.exit(1); }
const baseKeys = new Set(base.rows.map(corpusKey));

const existing = read(path.join(REPO, CURRENT_CORPUS));
const kept = Array.isArray(existing?.rows) ? existing.rows : [];
const keptKeys = new Set(kept.map(corpusKey));

const SEASON = existing?.season ?? results.season ?? "2026-27";
const added = [];
const quarantined = [];

for (const r of results.rows) {
  if (!/^STATUS_FULL_TIME/.test(String(r.statusRaw ?? ""))) continue;
  // The StatsAPI lesson, applied to soccer: a completed fixture without integer goals is not a
  // result. Postponed matches report "Final" with no score, and a 0-0 read from a null is invented.
  if (!Number.isInteger(r.ftHome) || !Number.isInteger(r.ftAway)) {
    quarantined.push({ home: r.home, away: r.away, dateUtc: r.dateUtc, reason: "full time without integer goals" });
    continue;
  }
  const home = resolve(r.home);
  const away = resolve(r.away);
  if (!home || !away) {
    quarantined.push({ home: r.home, away: r.away, dateUtc: r.dateUtc, reason: `unresolved club: ${!home ? r.home : r.away}` });
    continue;
  }
  const row = {
    season: SEASON,
    dateUtc: r.dateUtc,
    matchday: null,
    home, away,
    ftHome: r.ftHome, ftAway: r.ftAway,
    result: r.ftHome > r.ftAway ? "H" : r.ftHome < r.ftAway ? "A" : "D",
    providerRef: r.providerEventId ?? null,
    sourceFile: "public/data/soccer/epl/results/latest.json",
  };
  const key = corpusKey(row);
  if (baseKeys.has(key)) {
    quarantined.push({ home, away, dateUtc: r.dateUtc, reason: "already present in the frozen base corpus" });
    continue;
  }
  if (keptKeys.has(key)) continue;   // exactly once — a re-run adds nothing
  keptKeys.add(key);
  added.push(row);
}

const rows = [...kept, ...added].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)) || String(a.home).localeCompare(String(b.home)));

const out = {
  schemaVersion: 1,
  artifact: "epl-corpus-current-season",
  dataClass: "RESEARCH_CORPUS",
  public: false,
  season: SEASON,
  generatedAt: NOW,
  note: "Settled 2026-27 results, appended exactly once. The frozen base corpus is never written to; " +
        "fitEplStrength reads base + current through lib/sports/epl/corpus.mjs and excludes anything at or after its cutoff.",
  totalMatches: rows.length,
  quarantinedCount: quarantined.length,
  quarantined,
  rows,
};

console.log(`epl corpus accretion: ${added.length} new · ${rows.length} current-season total · ${quarantined.length} quarantined`);
for (const q of quarantined.slice(0, 5)) console.log(`  quarantined: ${q.home} v ${q.away} — ${q.reason}`);
if (!WRITE) { console.log("dry run — pass --write to persist."); process.exit(0); }

fs.mkdirSync(path.dirname(path.join(REPO, CURRENT_CORPUS)), { recursive: true });
fs.writeFileSync(path.join(REPO, CURRENT_CORPUS), `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${CURRENT_CORPUS}`);
