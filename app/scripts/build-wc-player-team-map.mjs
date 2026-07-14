#!/usr/bin/env node
/**
 * Build a reliable player→national-team map for the current World Cup slate, from API-Football squads.
 *
 * WHY: the Odds API goalscorer/shots feed carries player NAMES but no team, so the projection generator
 * defaults every player in a fixture to the HOME team (bug: Spain's Lamine Yamal tagged "France" in
 * France vs Spain). This map lets the game-detail join assign each prop its CORRECT team by name — no
 * hardcoded names, a real data source (official 26-man squads).
 *
 * Reads: app/public/data/world-cup/projections/latest.json (the slate's fixtures → distinct teams).
 * Writes: app/public/data/world-cup/player-team-map.json  (display reference; touches no money).
 *
 * Usage: node app/scripts/build-wc-player-team-map.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const DATA = path.join(REPO, "app/public/data/world-cup");
const KEY = (fs.readFileSync(path.join(REPO, ".env"), "utf8").match(/^API_FOOTBALL_KEY=(.*)$/m)?.[1] || "").trim().replace(/['"]/g, "");
if (!KEY) { console.error("no API_FOOTBALL_KEY"); process.exit(1); }

// Normalized keys for matching Odds-API names to squad names: accent-stripped, lowercased. We index by BOTH
// the full name and the surname (last token) so "Kylian Mbappe" ↔ "K. Mbappé" ↔ "Mbappe" all resolve.
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.'-]/g, " ").replace(/\s+/g, " ").trim();
const surname = (s) => { const t = norm(s).split(" "); return t[t.length - 1]; };

const af = (p) => fetch(`https://v3.football.api-sports.io/${p}`, { headers: { "x-apisports-key": KEY } }).then((r) => r.json());

const proj = JSON.parse(fs.readFileSync(path.join(DATA, "projections/latest.json"), "utf8"));
const teams = [...new Set((proj.matches || []).flatMap((m) => [m.homeTeam, m.awayTeam, ...String(m.fixture || "").split(" vs ")]).map((t) => String(t || "").trim()).filter(Boolean))];
console.log("slate teams:", teams.join(", "));

const byFull = {};
const bySurname = {}; // surname → Set of teams (to detect collisions)
const teamMeta = {};
for (const team of teams) {
  const ts = await af(`teams?name=${encodeURIComponent(team)}`);
  const nat = (ts.response || []).find((x) => x.team?.national === true) || (ts.response || [])[0];
  const id = nat?.team?.id;
  if (!id) { console.log(`  ${team}: NO team id (${JSON.stringify(ts.errors)})`); continue; }
  const sq = await af(`players/squads?team=${id}`);
  const players = sq.response?.[0]?.players || [];
  teamMeta[team] = { id, squad: players.length };
  for (const p of players) {
    byFull[norm(p.name)] = team;
    const sn = surname(p.name);
    (bySurname[sn] ??= new Set()).add(team);
  }
  console.log(`  ${team}: id=${id} squad=${players.length}`);
}

// Surname index: keep only UNAMBIGUOUS surnames (one team) — ambiguous ones must match on full name.
const surnameMap = {};
for (const [sn, set] of Object.entries(bySurname)) if (set.size === 1) surnameMap[sn] = [...set][0];

const artifact = {
  _source: "API-Football players/squads (official 26-man national squads)",
  _purpose: "Correct the WC player-prop team join — Odds API feed has names but no team.",
  _public: true, _officialMoneyRecordAffected: false,
  generatedAt: proj.generatedAt || proj.date, slate: proj.date, teams: teamMeta,
  byFullName: byFull, bySurname: surnameMap,
};
fs.writeFileSync(path.join(DATA, "player-team-map.json"), JSON.stringify(artifact, null, 2));
console.log(`✓ player-team-map.json — ${Object.keys(byFull).length} names, ${Object.keys(surnameMap).length} unambiguous surnames`);
