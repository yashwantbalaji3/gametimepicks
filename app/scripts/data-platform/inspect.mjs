#!/usr/bin/env node
/**
 * Inspect the committed Data Platform store (read-only).
 *
 *   node scripts/data-platform/inspect.mjs --coverage     sport / season coverage table + declared gaps
 *   node scripts/data-platform/inspect.mjs --golden       golden query examples (future Team/Player Research read patterns)
 *   node scripts/data-platform/inspect.mjs --bench        read-layer init + query timings, store sizes
 *   node scripts/data-platform/inspect.mjs --resolve <SPORT> <provider> <entityType> <providerId>
 */
import fs from "node:fs";
import path from "node:path";
import { openPlatform } from "../../src/lib/data-platform/readers.mjs";
import { SPORT_IDS } from "../../src/lib/data-platform/contract.mjs";
import { PLATFORM_DIR } from "./sources.mjs";

const args = process.argv.slice(2);
if (!args.length) { console.error("usage: inspect.mjs --coverage | --golden | --bench | --resolve <SPORT> <provider> <entityType> <id>"); process.exit(64); }
const t0 = performance.now();
const P = openPlatform(PLATFORM_DIR);

if (args.includes("--coverage")) {
  const m = P.manifest();
  console.log("| Sport | Teams | Players | Games | Team-game rows | Player-game rows | Seasons | Unresolved | Dropped | Excluded |");
  console.log("|---|---:|---:|---:|---:|---:|---|---:|---:|---:|");
  for (const s of SPORT_IDS) {
    const x = m.sports[s];
    console.log(`| ${s} | ${x.teams || "—"} | ${x.players} | ${x.games} | ${x.teamGameRows || "—"} | ${x.playerGameRows} | ${x.seasons[0]} … ${x.seasons.at(-1)} | ${x.unresolvedIdentityRows} | ${x.droppedRows} | ${x.excludedRows} |`);
  }
  for (const s of SPORT_IDS) {
    const c = P.getCoverage(s);
    console.log(`\n${s}`);
    for (const [sid, v] of Object.entries(c.seasons)) console.log(`  ${sid.padEnd(12)} games ${String(v.games).padStart(4)} · final ${String(v.finalGames).padStart(4)} · no start ${String(v.gamesMissingStartUtc).padStart(4)} · no team ids ${String(v.gamesMissingTeamIds).padStart(3)} · team rows ${JSON.stringify(v.teamGameRows)} · player rows ${JSON.stringify(v.playerGameRows)}`);
    for (const d of c.declaredSlices) console.log(`  [${d.status}] ${d.category} — ${d.reason}`);
  }
}

if (args.includes("--golden")) {
  const show = (label, v) => console.log(`\n▸ ${label}\n${JSON.stringify(v, null, 1).split("\n").slice(0, 24).join("\n")}`);
  show("resolve ESPN NFL event 401872929 → canonical NFL game", { alias: P.resolveAlias("NFL", "espn", "game", "401872929"), game: P.getGame("NFL", "401872929") });
  show("resolve StatsAPI gamePk 745844 → canonical MLB game", P.getGame("MLB", P.resolveAlias("MLB", "mlb_statsapi", "game", "745844").id));
  const mets = P.listGamesForTeam("mlb-team-121", { seasonId: "MLB-2025", finalOnly: true });
  show("New York Mets 2025: games, record from factual finals", {
    games: mets.length,
    wins: mets.filter((g) => { const me = P.getTeamGameStat("MLB", g.id, "mlb-team-121")?.stats.runs; const opp = P.getTeamGameStat("MLB", g.id, g.homeTeamId === "mlb-team-121" ? g.awayTeamId : g.homeTeamId)?.stats.runs; return me > opp; }).length,
  });
  show("Keenan Allen — last 5 ESPN receiving lines (game date, team of that game)", P.listPlayerGameStats("nfl-athlete-15818", { family: "nfl.espn-player-lines", order: "desc", limit: 5 }).map((r) => ({ date: P.getGame("NFL", r.gameId).startUtc, team: r.teamId, receptions: r.stats.receptions, receivingYards: r.stats.receivingYards })));
  show("Chiefs vs Chargers — when did they last play", P.listHeadToHead("nfl-team-12", "nfl-team-24", { finalOnly: true, limit: 2 }).map((g) => ({ id: g.id, date: g.startUtc ?? g.officialDate, neutralSite: g.neutralSite })));
  show("Arsenal 2025-26 match count + player lines available", { games: P.listGamesForTeam("epl-team-359", { seasonId: "EPL-2025-26" }).length, finalScoresSupported: P.getCoverage("EPL").rows.teamGame > 0 });
  show("Alexandre Pantoja (UFC) bouts with factual results", P.listGamesForPlayer("ufc-athlete-2560746", { order: "desc", limit: 4 }).map((g) => ({ bout: g.id, card: g.card?.name, won: P.getPlayerGameStat("UFC", g.id, "ufc-athlete-2560746")?.stats.won ?? null })));
}

if (args.includes("--bench")) {
  const init = performance.now() - t0;
  const time = (label, fn, n = 50) => { const s = performance.now(); let out; for (let i = 0; i < n; i++) out = fn(); console.log(`  ${label.padEnd(58)} ${((performance.now() - s) / n).toFixed(3)} ms/call`); return out; };
  const first = {};
  for (const s of SPORT_IDS) { const t = performance.now(); P.listGamesForSeason(`${s}-2025`); first[s] = Math.round(performance.now() - t); }
  console.log(`open ${Math.round(init)} ms · first read per sport (lazy load + indexes) ${JSON.stringify(first)} ms · rss ${Math.round(process.memoryUsage().rss / 1048576)} MB`);
  time("resolveAlias(NFL espn game)", () => P.resolveAlias("NFL", "espn", "game", "401872929"));
  time("listGamesForTeam(mlb-team-121, MLB-2025)", () => P.listGamesForTeam("mlb-team-121", { seasonId: "MLB-2025" }));
  time("listPlayerGameStats(nfl-athlete-15818, desc, 10)", () => P.listPlayerGameStats("nfl-athlete-15818", { order: "desc", limit: 10 }));
  time("listHeadToHead(nfl-team-12, nfl-team-24)", () => P.listHeadToHead("nfl-team-12", "nfl-team-24"));
  time("getTeamGameStat(MLB 745844)", () => P.getTeamGameStat("MLB", "745844", "mlb-team-121"), 20);
  const sizes = {};
  const walk = (d, rel = "") => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`); else { const top = rel.split("/")[0] || e.name; sizes[top] = (sizes[top] ?? 0) + fs.statSync(path.join(d, e.name)).size; } } };
  walk(PLATFORM_DIR);
  console.log("stored bytes by area:", JSON.stringify(sizes));
}

const r = args.indexOf("--resolve");
if (r >= 0) {
  const [sport, provider, type, id] = args.slice(r + 1, r + 5);
  const res = P.resolveAlias(sport, provider, type, id);
  console.log(JSON.stringify(res));
  if (res.status === "RESOLVED") console.log(JSON.stringify(type === "game" ? P.getGame(sport, res.id) : type === "team" ? P.getTeam(res.id) : P.getPlayer(res.id), null, 1));
}
