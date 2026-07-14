/**
 * WC player → national-team resolver. The Odds API goalscorer/shots feed has player names but no team, so the
 * projection generator defaults every player in a fixture to the HOME team. This resolves each player's CORRECT
 * team from `player-team-map.json` (built from official API-Football squads), constrained to the fixture's two
 * sides so it can never assign a team that isn't in the match. Returns null when not confidently resolvable —
 * we'd rather show no team than the wrong one.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "data", "world-cup");

interface PlayerTeamMap {
  byFullName: Record<string, string>;
  bySurname: Record<string, string>;
}

let cache: PlayerTeamMap | null | undefined;
function loadMap(): PlayerTeamMap | null {
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(path.join(DIR, "player-team-map.json"), "utf8")) as PlayerTeamMap;
  } catch {
    cache = null;
  }
  return cache;
}

/** For tests: reset the memoized map (after writing a fixture). */
export function _resetPlayerTeamMapCache(): void {
  cache = undefined;
}

const norm = (s: string) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.'-]/g, " ").replace(/\s+/g, " ").trim();
const surnameKey = (s: string) => {
  const t = norm(s).split(" ");
  return t[t.length - 1];
};
const normTeam = (s: string) => norm(s).replace(/&/g, "and");

/**
 * Resolve a player's team from the squad map, CONSTRAINED to the fixture's two sides. Returns homeTeam or
 * awayTeam (the caller's spelling), or null if the player isn't confidently in either squad.
 */
export function resolveWcPlayerTeam(name: string | null | undefined, homeTeam: string, awayTeam: string): string | null {
  if (!name) return null;
  const map = loadMap();
  if (!map) return null;
  const resolved = map.byFullName[norm(name)] ?? map.bySurname[surnameKey(name)] ?? null;
  if (!resolved) return null;
  const r = normTeam(resolved);
  if (homeTeam && r === normTeam(homeTeam)) return homeTeam;
  if (awayTeam && r === normTeam(awayTeam)) return awayTeam;
  return null; // resolved to a team not in this fixture → don't trust it
}
