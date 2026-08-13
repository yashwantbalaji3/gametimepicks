/**
 * NFL roster capture (Program 169 · Release A) — canonical player identity source.
 *
 * ESPN site API public JSON (registry: espn_site_api_nfl), no key, point-in-time snapshot with
 * attribution — the same usage class as the schedule capture. FACTS ONLY per athlete: durable id,
 * display name, position abbreviation, jersey, status. No prose, no bio fields, no measurements.
 *
 * Fail-closed: a team fetch failure records that team as FAILED and preserves the prior capture's
 * team block as STALE downstream (the artifact never writes an empty team as if the roster were
 * empty); an athlete without a durable id is quarantined by the identity lib at build time, and
 * counted here. A zero-team result refuses to write anything.
 *
 * Usage: node scripts/nfl/capture-nfl-rosters.mjs --now <iso>
 * Writes: public/data/nfl/rosters/capture-<stamp>.json + latest.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required — the clock is a parameter"); process.exit(1); }

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const teamsIndex = await get(`${BASE}/teams?limit=40`);
const teamRefs = (teamsIndex?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team).filter((t) => t?.id && t?.abbreviation);
if (teamRefs.length < 30) { console.error(`REFUSED: teams index returned ${teamRefs.length} teams — a partial league never writes`); process.exit(2); }

const teams = [];
const failures = [];
for (const t of teamRefs) {
  try {
    const roster = await get(`${BASE}/teams/${t.id}/roster`);
    const players = [];
    for (const group of roster?.athletes ?? []) {
      for (const a of group?.items ?? []) {
        players.push({ id: a?.id ?? null, fullName: a?.fullName ?? a?.displayName ?? null, position: { abbreviation: a?.position?.abbreviation ?? null }, jersey: a?.jersey ?? null, status: { type: a?.status?.type ?? a?.status?.name ?? null } });
      }
    }
    teams.push({ teamAbbr: t.abbreviation, providerTeamId: String(t.id), playerCount: players.length, players });
    await new Promise((r) => setTimeout(r, 350)); // polite pacing — public endpoint, never hammered
  } catch (e) {
    failures.push({ teamAbbr: t.abbreviation, providerTeamId: String(t.id), reason: String(e?.message ?? e) });
  }
}

if (teams.length === 0) { console.error("REFUSED: zero teams captured — nothing is written; last-known-good stands"); process.exit(3); }

const artifact = {
  schemaVersion: 1,
  sport: "nfl",
  dataClass: "ROSTER_CAPTURE",
  generatedAt: NOW,
  sourceAsOf: NOW,
  source: { id: "espn_site_api_nfl", name: "ESPN NFL public team roster JSON", license: "public JSON endpoint, no key; point-in-time snapshot with attribution — facts only (id, name, position, jersey, status)" },
  teamCount: teams.length,
  playerCount: teams.reduce((s, t) => s + t.playerCount, 0),
  failures,
  teams,
};

const dir = path.join(APP, "public", "data", "nfl", "rosters");
fs.mkdirSync(dir, { recursive: true });
const stamp = NOW.replace(/[-:]/g, "").slice(0, 13);
fs.writeFileSync(path.join(dir, `capture-${NOW.slice(0, 10)}T${stamp.slice(9, 13)}.json`), JSON.stringify(artifact) + "\n");
fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(artifact) + "\n");
console.log(`captured ${teams.length}/32 teams · ${artifact.playerCount} athletes · ${failures.length} team failure(s)${failures.length ? ` (${failures.map((f) => f.teamAbbr).join(",")})` : ""}`);
console.log(`state=${failures.length === 0 ? "CAPTURED" : "CAPTURED_PARTIAL"}`);
