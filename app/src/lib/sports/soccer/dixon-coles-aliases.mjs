/**
 * ESPN club → football-data.co.uk club, for the Dixon-Coles v2 forward shadow ONLY
 * (data/internal/research/soccer/preregistration-dixon-coles-v2.json freezes this file by sha256).
 *
 * Keyed by ESPN TEAM ID, which does not change when ESPN restyles a display name (accents, "Club", "SV");
 * the ESPN display name sits beside each id for reading. Built by hand on 2026-09-11 from
 *   site.api.espn.com/apis/site/v2/sports/soccer/<esp.1|ita.1|ger.1>/teams
 * against the club names in each league's corpus-football-data-v1.json 2026-27 rows; every one of the 20 / 20 /
 * 18 clubs is listed, identical names included, so no fixture depends on a fallback. The test beside
 * dixon-coles.mjs checks that every target exists in the league corpus and that the table covers every 2026-27
 * corpus club.
 *
 * A club missing from this table is REFUSED by the shadow runner with its name and id — never guessed and never
 * given league-average strength. leagues.mjs is deliberately not touched: its Ligue 1 alias table belongs to the
 * published pipeline and is keyed by display name.
 */
const t = (entries) => Object.freeze(Object.fromEntries(entries.map(([id, espn, footballData]) => [id, Object.freeze({ espn, footballData })])));

export const DC_V2_ESPN_CLUBS = Object.freeze({
  laliga: t([
    ["96", "Alavés", "Alaves"],
    ["93", "Athletic Club", "Ath Bilbao"],
    ["1068", "Atlético Madrid", "Ath Madrid"],
    ["83", "Barcelona", "Barcelona"],
    ["85", "Celta Vigo", "Celta"],
    ["90", "Deportivo", "La Coruna"],
    ["3751", "Elche", "Elche"],
    ["88", "Espanyol", "Espanol"],
    ["2922", "Getafe", "Getafe"],
    ["1538", "Levante", "Levante"],
    ["99", "Málaga", "Malaga"],
    ["97", "Osasuna", "Osasuna"],
    ["87", "Racing Santander", "Santander"],
    ["101", "Rayo Vallecano", "Vallecano"],
    ["244", "Real Betis", "Betis"],
    ["86", "Real Madrid", "Real Madrid"],
    ["89", "Real Sociedad", "Sociedad"],
    ["243", "Sevilla", "Sevilla"],
    ["94", "Valencia", "Valencia"],
    ["102", "Villarreal", "Villarreal"],
  ]),
  "serie-a": t([
    ["103", "AC Milan", "Milan"],
    ["104", "AS Roma", "Roma"],
    ["105", "Atalanta", "Atalanta"],
    ["107", "Bologna", "Bologna"],
    ["2925", "Cagliari", "Cagliari"],
    ["2572", "Como", "Como"],
    ["109", "Fiorentina", "Fiorentina"],
    ["4057", "Frosinone", "Frosinone"],
    ["3263", "Genoa", "Genoa"],
    ["110", "Internazionale", "Inter"],
    ["111", "Juventus", "Juventus"],
    ["112", "Lazio", "Lazio"],
    ["113", "Lecce", "Lecce"],
    ["4007", "Monza", "Monza"],
    ["114", "Napoli", "Napoli"],
    ["115", "Parma", "Parma"],
    ["3997", "Sassuolo", "Sassuolo"],
    ["239", "Torino", "Torino"],
    ["118", "Udinese", "Udinese"],
    ["17530", "Venezia", "Venezia"],
  ]),
  bundesliga: t([
    ["598", "1. FC Union Berlin", "Union Berlin"],
    ["131", "Bayer Leverkusen", "Leverkusen"],
    ["132", "Bayern Munich", "Bayern Munich"],
    ["124", "Borussia Dortmund", "Dortmund"],
    ["268", "Borussia Mönchengladbach", "M'gladbach"],
    ["125", "Eintracht Frankfurt", "Ein Frankfurt"],
    ["3841", "FC Augsburg", "Augsburg"],
    ["122", "FC Cologne", "FC Koln"],
    ["127", "Hamburg SV", "Hamburg"],
    ["2950", "Mainz", "Mainz"],
    ["11420", "RB Leipzig", "RB Leipzig"],
    ["126", "SC Freiburg", "Freiburg"],
    ["3307", "SC Paderborn 07", "Paderborn"],
    ["10388", "SV Elversberg", "Elversberg"],
    ["133", "Schalke 04", "Schalke 04"],
    ["7911", "TSG Hoffenheim", "Hoffenheim"],
    ["134", "VfB Stuttgart", "Stuttgart"],
    ["137", "Werder Bremen", "Werder Bremen"],
  ]),
});

/** ESPN competitor team ({ id, displayName }) → the corpus club name, or null (the caller refuses the fixture). */
export function footballDataClub(leagueKey, espnTeam) {
  const table = DC_V2_ESPN_CLUBS[leagueKey];
  if (!table) throw new Error(`no ESPN club table for league "${leagueKey}" in dixon-coles-aliases.mjs`);
  const id = espnTeam?.id == null ? null : String(espnTeam.id);
  return id && Object.prototype.hasOwnProperty.call(table, id) ? table[id].footballData : null;
}
