/**
 * NFL player-event corpus capture (Program 170 · Release A). PRIVATE RESEARCH.
 *
 * SOURCE + RIGHTS (the walk-forward rights review the registry demanded): ESPN site API game
 * summaries — registry entry `espn_site_api_nfl`, the SAME public-JSON usage class this repo has
 * used for schedules/rosters/scoreboards for months: keyless, point-in-time, attributed, FACTS
 * only. We store COMPACT DERIVED player stat lines (never a raw payload mirror): a durable
 * athlete id, a name for presentation, and the stat categories the prop/TD models need.
 *
 * FAIL-CLOSED SHAPE RULES: an absent stat group is typed absent for that game (missing is never
 * zero); a malformed player row quarantines ITSELF; a failed game fetch quarantines the GAME and
 * the run reports coverage — it never aborts the slate or writes an empty season.
 *
 * RECONCILIATION (per game, before a row is accepted):
 *   R1  Σ receiving TD == Σ passing TD      (one scoring event, two credit sides — exact)
 *   R2  Σ receiving yards == Σ passing yards (ESPN's own accounting convention — exact)
 *   R3  6 × (passTD + rushTD) ≤ official final points (the corpus final is the authority)
 * Violations quarantine the game with the failing identity named.
 *
 * DETERMINISM: rows sort by (gameId, playerId); the partition hash is fnv1a over the stamp-
 * stripped rows array, so two captures of unchanged source bytes produce identical hashes.
 *
 * Usage: node scripts/nfl/capture-nfl-player-events.mjs --now <iso> [--season 2025] [--limit N]
 * Writes: data/internal/research/nfl/player-events-v1/<season>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fnv1a } from "../../src/lib/sports/research/replay-runner.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const SEASON = arg("--season") ? Number(arg("--season")) : null;
const LIMIT = arg("--limit") ? Number(arg("--limit")) : null;

const corpus = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/nfl/corpus-v1.json"), "utf8"));
let games = corpus.rows.filter((g) => (SEASON ? g.season === SEASON : true));
if (LIMIT) games = games.slice(0, LIMIT);

const int = (s) => { const n = Number(String(s ?? "").replace(/[^0-9-]/g, "")); return Number.isFinite(n) && String(s ?? "").trim() !== "" ? n : null; };
const slash = (s, i) => int(String(s ?? "").split("/")[i]);

/** Extract one team's player stat lines from a summary boxscore block. */
function extractTeam(block) {
  const rows = new Map(); // playerId → row
  const quarantined = [];
  const row = (a) => {
    const id = a?.athlete?.id != null ? String(a.athlete.id) : null;
    if (!id || !/^\d+$/.test(id)) return null; // negative/non-numeric ids are TEAM aggregates, not players (P170-A guard catch)
    if (!rows.has(id)) rows.set(id, { playerId: `nfl-athlete-${id}`, name: a.athlete.displayName ?? a.athlete.fullName ?? null });
    return rows.get(id);
  };
  for (const group of block?.statistics ?? []) {
    const labels = group?.labels ?? [];
    const at = (stats, label) => { const i = labels.indexOf(label); return i === -1 ? null : stats[i]; };
    for (const a of group?.athletes ?? []) {
      const r = row(a);
      if (!r) { quarantined.push({ group: group?.name, reason: "athlete without durable id — never minted from a name" }); continue; }
      const s = a?.stats ?? [];
      if (group.name === "passing") {
        r.passCmp = slash(at(s, "C/ATT"), 0); r.passAtt = slash(at(s, "C/ATT"), 1);
        r.passYds = int(at(s, "YDS")); r.passTd = int(at(s, "TD")); r.passInt = int(at(s, "INT"));
        r.sacks = slash(at(s, "SACKS-YDSLOST"), 0);
      } else if (group.name === "rushing") {
        r.rushAtt = int(at(s, "CAR")); r.rushYds = int(at(s, "YDS")); r.rushTd = int(at(s, "TD"));
      } else if (group.name === "receiving") {
        r.rec = int(at(s, "REC")); r.recYds = int(at(s, "YDS")); r.recTd = int(at(s, "TD")); r.targets = int(at(s, "TGTS"));
      } else if (group.name === "fumbles") {
        r.fumbles = int(at(s, "FUM")); r.fumblesLost = int(at(s, "LOST"));
      }
    }
  }
  return { rows: [...rows.values()], quarantined };
}

const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const bySeason = new Map();
const quarantinedGames = [];
let fetched = 0;
for (const g of games) {
  try {
    const sum = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${g.providerEventId}`);
    const blocks = sum?.boxscore?.players ?? [];
    if (blocks.length !== 2) throw new Error(`boxscore has ${blocks.length} team blocks`);
    const teams = blocks.map((b) => ({ teamAbbr: b?.team?.abbreviation ?? null, ...extractTeam(b) }));
    const all = teams.flatMap((t) => t.rows.map((r) => ({ ...r, teamAbbr: t.teamAbbr })));
    const sumOf = (k) => all.reduce((s, r) => s + (r[k] ?? 0), 0);
    const passTd = sumOf("passTd"), recTd = sumOf("recTd"), rushTd = sumOf("rushTd");
    const passYds = sumOf("passYds"), recYds = sumOf("recYds");
    const points = (g.ftHome ?? 0) + (g.ftAway ?? 0);
    if (recTd !== passTd) throw new Error(`R1: recTd ${recTd} ≠ passTd ${passTd}`);
    if (recYds !== passYds) throw new Error(`R2: recYds ${recYds} ≠ passYds ${passYds}`);
    if (6 * (passTd + rushTd) > points) throw new Error(`R3: 6×offTD ${6 * (passTd + rushTd)} > final points ${points}`);
    const gameRow = {
      providerEventId: g.providerEventId, season: g.season, seasonType: g.phase ?? g.seasonType, week: g.week, dateUtc: g.dateUtc,
      home: typeof g.home === "string" ? g.home : g.home?.abbr, away: typeof g.away === "string" ? g.away : g.away?.abbr,
      ftHome: g.ftHome, ftAway: g.ftAway,
      teamOffensiveTd: { pass: passTd, rush: rushTd },
      players: all.sort((a, b) => a.playerId.localeCompare(b.playerId)),
      quarantinedRows: teams.flatMap((t) => t.quarantined),
    };
    if (!bySeason.has(g.season)) bySeason.set(g.season, []);
    bySeason.get(g.season).push(gameRow);
  } catch (e) {
    quarantinedGames.push({ providerEventId: g.providerEventId, season: g.season, reason: String(e?.message ?? e) });
  }
  fetched += 1;
  if (fetched % 100 === 0) console.log(`…${fetched}/${games.length} (${quarantinedGames.length} quarantined)`);
  await new Promise((r) => setTimeout(r, 250));
}

const dir = path.join(APP, "..", "data/internal/research/nfl/player-events-v1");
fs.mkdirSync(dir, { recursive: true });
for (const [season, rows] of [...bySeason.entries()].sort()) {
  rows.sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)) || a.providerEventId.localeCompare(b.providerEventId));
  const contentHash = fnv1a(JSON.stringify(rows));
  const artifact = {
    schemaVersion: 1,
    artifact: "nfl-player-events",
    dataClass: "PRIVATE_RESEARCH",
    season,
    generatedAt: NOW,
    source: { id: "espn_site_api_nfl", name: "ESPN NFL public game-summary JSON", rights: "public keyless JSON; point-in-time snapshots with attribution; COMPACT DERIVED stat lines only — no raw payload mirror stored (registry walk-forward rights review, P170-A)" },
    reconciliation: { rules: ["R1 recTd==passTd", "R2 recYds==passYds", "R3 6×offTD ≤ official final points"], enforced: "per game before acceptance; violations quarantine the game" },
    accounting: { corpusGames: games.filter((g) => g.season === season).length, captured: rows.length, quarantined: quarantinedGames.filter((q) => q.season === season).length },
    contentHash,
    quarantinedGames: quarantinedGames.filter((q) => q.season === season),
    games: rows,
  };
  const exact = artifact.accounting.captured + artifact.accounting.quarantined === artifact.accounting.corpusGames;
  if (!exact) { console.error(`REFUSED: ${season} accounting not exact`); process.exit(2); }
  fs.writeFileSync(path.join(dir, `${season}.json`), JSON.stringify(artifact) + "\n");
  console.log(`${season}: ${rows.length}/${artifact.accounting.corpusGames} captured (${artifact.accounting.quarantined} quarantined) · hash ${contentHash}`);
}
console.log(`done: ${fetched} games processed, ${quarantinedGames.length} quarantined total`);
