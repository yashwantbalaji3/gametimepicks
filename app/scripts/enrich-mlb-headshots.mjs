/**
 * enrich-mlb-headshots.mjs — joins the ingested MLB props to the FREE MLB Stats API to add real player
 * headshots + team for each prop. Reads `mlb/home-run-props/<date>.json` + `mlb/player-props/<date>.json`,
 * matches each player by normalized name to a real MLB player id, and writes back `photoUrl`, `playerId`,
 * `team`, `teamAbbr`. No Odds-API credits (statsapi is free); never touches bankroll/crown/results.
 *
 *   npx tsx app/scripts/enrich-mlb-headshots.mjs --date 2026-06-23
 *
 * Sources: https://statsapi.mlb.com/api/v1/sports/1/players?season=YYYY  (players)
 *          https://statsapi.mlb.com/api/v1/teams?sportId=1               (team abbreviations)
 *          headshot: https://midfield.mlbstatic.com/v1/people/{id}/spots/120
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DATE = getArg("date", new Date().toISOString().slice(0, 10));
const SEASON = DATE.slice(0, 4);
const DATA = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app", "public", "data", "mlb");
const log = (...m) => console.log("[enrich-mlb]", ...m);
const norm = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const headshot = (id) => `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`;

async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.json(); }

async function main() {
  log(`enriching slate ${DATE}`);
  const teams = await getJson(`https://statsapi.mlb.com/api/v1/teams?sportId=1`);
  const teamAbbr = new Map();        // id → abbreviation
  const abbrByName = new Map();      // normalized full team name → abbreviation (for opponent resolution)
  for (const t of teams.teams ?? []) {
    teamAbbr.set(t.id, t.abbreviation);
    if (t.name) abbrByName.set(norm(t.name), t.abbreviation);
  }

  // Resolve home/away + opponent abbr from the real matchup string ("Away Team @ Home Team") and the
  // batter's own teamAbbr. Pure parse of real data — never fabricated; returns nulls if a side can't be
  // mapped (e.g. an unexpected matchup format), so the UI simply omits the opponent logo.
  const resolveOpponent = (matchup, ownAbbr) => {
    const m = String(matchup ?? "").split(/\s+@\s+/);
    if (m.length !== 2 || !ownAbbr) return { opponentAbbr: null, homeAway: null };
    const awayAbbr = abbrByName.get(norm(m[0])) ?? null;
    const homeAbbr = abbrByName.get(norm(m[1])) ?? null;
    if (ownAbbr === awayAbbr) return { opponentAbbr: homeAbbr, homeAway: "away" };
    if (ownAbbr === homeAbbr) return { opponentAbbr: awayAbbr, homeAway: "home" };
    return { opponentAbbr: null, homeAway: null };
  };

  const players = await getJson(`https://statsapi.mlb.com/api/v1/sports/1/players?season=${SEASON}`);
  const byName = new Map();
  for (const p of players.people ?? []) {
    const team = p.currentTeam?.name ?? null;
    const abbr = p.currentTeam?.id ? teamAbbr.get(p.currentTeam.id) ?? null : null;
    byName.set(norm(p.fullName), { id: p.id, photoUrl: headshot(p.id), team, teamAbbr: abbr });
    // also index "First Last" without middle/suffix for looser matching
    const parts = (p.fullName ?? "").split(/\s+/);
    if (parts.length > 2) byName.set(norm(`${parts[0]} ${parts[parts.length - 1]}`), { id: p.id, photoUrl: headshot(p.id), team, teamAbbr: abbr });
  }
  log(`indexed ${byName.size} player-name keys, ${teamAbbr.size} teams`);

  for (const file of ["home-run-props", "player-props"]) {
    const fp = path.join(DATA, file, `${DATE}.json`);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(fp, "utf8")); } catch { log(`skip ${file} (not present)`); continue; }
    let matched = 0, oppResolved = 0;
    for (const prop of doc.props ?? []) {
      const hit = byName.get(norm(prop.player));
      if (hit) { prop.playerId = hit.id; prop.photoUrl = hit.photoUrl; prop.team = hit.team; prop.teamAbbr = hit.teamAbbr; matched++; }
      const opp = resolveOpponent(prop.matchup, prop.teamAbbr);
      prop.opponentAbbr = opp.opponentAbbr; prop.homeAway = opp.homeAway;
      if (opp.opponentAbbr) oppResolved++;
    }
    fs.writeFileSync(fp, JSON.stringify(doc, null, 2));
    log(`${file}: matched ${matched}/${doc.props?.length ?? 0} props → headshots/team; opponent resolved ${oppResolved}/${doc.props?.length ?? 0}`);
  }
  log("done.");
}
main().catch((e) => { console.error("[enrich-mlb] FAILED:", e.message); process.exit(1); });
