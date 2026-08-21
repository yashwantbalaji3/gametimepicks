#!/usr/bin/env node
/**
 * CAPTURE 2026-27 EPL SQUADS from ESPN — who is actually AT each club right now.
 *
 *   node scripts/epl/capture-epl-squads.mjs [--write]
 *
 * History alone cannot answer this. A player's fitted rate is a fact about matches he has played;
 * whether he is still at the club that is playing on Friday is a fact about the transfer window, and
 * no amount of last-season data supplies it. Projecting a departed striker onto his old club is the
 * simplest way for a player model to be confidently wrong in public.
 *
 * ESPN serves the current squad per club, free and keyless, from the same host the player corpus and
 * the results capture already use — 20 requests for the league.
 *
 * REFUSES rather than half-writes. A club that returns no squad, or a league that does not return 20
 * clubs, aborts the run: a squad file silently missing three clubs would quietly drop every one of
 * their players from projection and read as "those players have no rate", which is a different and
 * invisible failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const OUT = path.join(REPO, "data/internal/research/epl/players");

const WRITE = process.argv.includes("--write");
const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
};

const teamsDoc = await get(`${SITE}/teams`);
const teams = (teamsDoc?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team);
if (teams.length !== 20) {
  console.error(`REFUSED — ESPN returned ${teams.length} clubs, not 20. A partial league would drop whole squads silently.`);
  process.exit(2);
}
console.log(`clubs: ${teams.length}`);

const squads = [];
for (const t of teams) {
  let doc;
  try { doc = await get(`${SITE}/teams/${t.id}/roster`); }
  catch (e) { console.error(`REFUSED — ${t.displayName}: ${e.message}`); process.exit(3); }

  const athletes = doc.athletes ?? [];
  /* ESPN returns either a flat list or position groups; both shapes are accepted, neither assumed. */
  const items = athletes.length && athletes[0]?.items ? athletes.flatMap((g) => g.items ?? []) : athletes;
  if (items.length === 0) {
    console.error(`REFUSED — ${t.displayName} returned an empty squad. Publishing a league with a hole in it is worse than publishing none.`);
    process.exit(4);
  }
  squads.push({
    teamId: String(t.id),
    teamName: t.displayName,
    abbreviation: t.abbreviation ?? null,
    players: items.map((p) => ({
      playerId: String(p.id),
      name: p.displayName ?? p.fullName ?? null,
      position: p.position?.abbreviation ?? null,
      jersey: p.jersey ?? null,
    })),
  });
  process.stdout.write(`\r  ${squads.length}/20 squads · ${squads.reduce((n, s) => n + s.players.length, 0)} players`);
  await sleep(200);
}
process.stdout.write("\n");

const artifact = {
  schemaVersion: 1,
  artifact: "epl-squads",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  season: "2026-27",
  provider: "espn",
  endpoint: `${SITE}/teams/{id}/roster`,
  licence: "ESPN public JSON endpoints, no key. Point-in-time snapshot with attribution.",
  capturedAt: new Date().toISOString(),
  clubs: squads.length,
  players: squads.reduce((n, s) => n + s.players.length, 0),
  squads,
};

if (WRITE) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "squads-2026-27.json"), JSON.stringify(artifact, null, 1) + "\n");
  console.log(`wrote squads-2026-27.json — ${artifact.clubs} clubs, ${artifact.players} players`);
} else {
  console.log(`dry run — ${artifact.clubs} clubs, ${artifact.players} players NOT written.`);
}
