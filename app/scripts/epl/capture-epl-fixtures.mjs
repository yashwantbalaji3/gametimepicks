/**
 * EPL 2026-27 fixture capture — openfootball txt → the documented soccer/epl artifact schema
 * (Program 149 · Release 3). Run under tsx (NOT plain node): identity and validation come from the
 * canonical TypeScript modules, so the capture cannot drift from what the lane later enforces.
 *
 *   npx tsx scripts/epl/capture-epl-fixtures.mjs --now 2026-08-09T22:45:00Z \
 *       [--from ../data/internal/research/epl/raw/openfootball-2026-27-premierleague.txt]
 *
 * MEMBERSHIP RULE, satisfied before this script existed: the 2026-27 promoted clubs entered
 * EPL_CLUB_ALIASES only after two independent sources agreed fixture-by-fixture (ESPN eng.1
 * opening round vs openfootball — receipts in docs/EPL_SOURCE_DECISION.md). This script still
 * fail-closes: EVERY row must resolve through the club table, the season must be exactly 380
 * fixtures over exactly 20 distinct clubs, and any miss REFUSES the whole capture — a partial
 * matchday would look complete on the page and lie by omission.
 *
 * TIME RULE: openfootball kickoffs are Europe/London wall clock. Conversion to UTC handles
 * BST/GMT via an Intl inverse lookup — never a fixed offset (the season crosses the October
 * clock change). The ESPN cross-check pins the conversion: 20:00 BST → 19:00Z on Aug 21.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { identityFromFixture } from "../../src/lib/soccer/epl-identity.ts";
import { buildEplClubIndex, EPL_SEASON_CLUB_COUNT } from "../../src/lib/soccer/epl-clubs.ts";
import { validateFixtureArtifact, assertArtifactPublishable } from "../../src/lib/soccer/epl-artifacts.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const SRC = path.resolve(APP, arg("--from", "../data/internal/research/epl/raw/openfootball-2026-27-premierleague.txt"));

/** Europe/London wall time → UTC ISO (minute precision), DST-correct via Intl inverse lookup. */
function londonToUtcIso(dateStr, timeStr) {
  const guess = Date.parse(`${dateStr}T${timeStr}:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const g = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const wallAtGuess = Date.parse(`${g.year}-${g.month}-${g.day}T${g.hour === "24" ? "00" : g.hour}:${g.minute}:00Z`);
  const utc = guess - (wallAtGuess - guess); // one iteration suffices for the UK's ±1h offsets
  return new Date(utc).toISOString().slice(0, 16) + ":00Z";
}

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const txt = fs.readFileSync(SRC, "utf8");
const seasonStartYear = 2026;

let matchday = null, curDate = null, curTime = null;
const parsed = [];
for (const line of txt.split("\n")) {
  const md = line.match(/(?:Matchday|Regular Season -)\s*(\d+)/);
  if (md) { matchday = Number(md[1]); curDate = null; curTime = null; continue; }
  const dl = line.match(/^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\/?\s*(\d{1,2})(?:\s+(\d{4}))?\s*$/);
  if (dl) {
    const mo = MONTHS[dl[1]];
    const year = dl[3] ? Number(dl[3]) : mo >= 7 ? seasonStartYear : seasonStartYear + 1;
    curDate = `${year}-${String(mo).padStart(2, "0")}-${String(dl[2]).padStart(2, "0")}`;
    curTime = null;
    continue;
  }
  // Unplayed fixture rows: optional HH:MM, "Home v Away". Rows without a time inherit the last one.
  const m = line.match(/^\s+(?:(\d{2}:\d{2})\s+)?(\S.*?)\s+v\s+(\S.*?)\s*$/);
  if (m && curDate && matchday != null) {
    if (m[1]) curTime = m[1];
    if (!curTime) { console.error(`REFUSED: fixture row with no inherited kickoff time (${line.trim()})`); process.exit(1); }
    parsed.push({ matchday, dateLocal: curDate, timeLocal: curTime, homeRaw: m[2], awayRaw: m[3] });
  }
}

if (parsed.length !== 380) { console.error(`REFUSED: parsed ${parsed.length} fixtures, expected exactly 380`); process.exit(1); }

const index = buildEplClubIndex();
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clubs = new Set();
const rows = [];
for (const f of parsed) {
  const kickoffIso = londonToUtcIso(f.dateLocal, f.timeLocal);
  const out = identityFromFixture({ homeClub: f.homeRaw, awayClub: f.awayRaw, kickoffIso, status: "SCHEDULED" }, NOW, index);
  if (!("identity" in out)) { console.error(`REFUSED: ${out.rejection.code} for "${f.homeRaw}" v "${f.awayRaw}" — a capture with unresolved identity does not publish`); process.exit(1); }
  const home = index.resolve(f.homeRaw), away = index.resolve(f.awayRaw);
  clubs.add(home.canonical); clubs.add(away.canonical);
  rows.push({
    eventId: out.identity.eventId,
    homeClub: home.canonical,
    awayClub: away.canonical,
    kickoffIso,
    matchweek: f.matchday,
    lifecycle: "SCHEDULED",
    providerRefs: [{ provider: "openfootball", id: `2026-27:md${f.matchday}:${slug(home.canonical)}-v-${slug(away.canonical)}`, kind: "event" }],
    capturedAt: NOW,
  });
}
if (clubs.size !== EPL_SEASON_CLUB_COUNT) { console.error(`REFUSED: ${clubs.size} distinct clubs, a Premier League season has exactly ${EPL_SEASON_CLUB_COUNT}`); process.exit(1); }

const artifact = {
  schemaVersion: 1,
  competition: "epl",
  season: "2026-27",
  dataClass: "FIXTURE_CAPTURE",
  generatedAt: NOW,
  source: "openfootball/england 2026-27 (public domain) — membership cross-verified against ESPN eng.1 opening round 2026-08-09; kickoff conversion Europe/London→UTC pinned by the ESPN cross-check (20:00 BST = 19:00Z)",
  sourceAsOf: NOW,
  public: true,
  membershipVerification: {
    method: "two independent sources agree fixture-by-fixture",
    sources: ["openfootball/england@master 2026-27 file", "ESPN eng.1 scoreboard opening round (20 distinct clubs incl. COV @ ARS, MAN @ HUL)"],
    verifiedAt: NOW,
    receipts: "docs/EPL_SOURCE_DECISION.md",
  },
  rows,
};

const validation = validateFixtureArtifact(artifact);
assertArtifactPublishable(validation, "fixture");

const OUT = path.join(APP, "public", "data", "soccer", "epl", "fixtures");
const file = `capture-2026-27-${NOW.replace(/[:]/g, "").slice(0, 15)}.json`;
fs.writeFileSync(path.join(OUT, file), JSON.stringify(artifact, null, 1));
console.log(`${file}: 380 fixtures, ${clubs.size} clubs, matchweeks 1-${Math.max(...rows.map((r) => r.matchweek))}, all identities resolved, validation clean`);
console.log(`first: ${rows[0].eventId} @ ${rows[0].kickoffIso}`);
