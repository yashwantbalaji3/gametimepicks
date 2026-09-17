/**
 * RESEARCH STAT GROUPS (v1.3) — which factual platform stats a research page may show, per sport.
 *
 * Every column maps to exactly ONE declared platform family key (lib/data-platform/stat-dictionary.mjs). Nothing
 * is derived except an explicitly labelled windowed average with its sample size. No rate, no hit rate, no grade.
 *
 * NFL has two factual families for the same player-game (ESPN summary lines 2023–25, nflverse skill lines 2013–25).
 * They are NEVER mixed inside one row: a game log row takes ESPN's line when ESPN recorded any value, otherwise
 * nflverse's, and says which (`fam`). nflverse `carries` IS its rushing-attempts field, so it fills that column;
 * nflverse has no interceptions field, so that cell stays not-recorded (never 0) on an nflverse row.
 *
 * Pure: no filesystem, no clock.
 */

export const NFL_ESPN = "nfl.espn-player-lines";
export const NFL_NFLVERSE = "nfl.nflverse-skill-lines";
export const MLB_PROPS = "mlb.prop-actuals";
export const EPL_MATCH = "epl.espn-player-match";
export const UFC_RESULT = "ufc.bout-result";

/** Team result families. EPL is deliberately absent: its platform has no id-keyed final scores (§31). */
export const TEAM_RESULT_FAMILY = Object.freeze({ MLB: "mlb.final-score", NFL: "nfl.final-score" });
export const TEAM_SCORE_KEY = Object.freeze({ MLB: "runs", NFL: "points" });
export const TEAM_SCORE_UNIT = Object.freeze({ MLB: "runs", NFL: "points" });

/**
 * Column definitions. `src` maps a platform family to the key read for this column (absent family ⇒ the
 * column is not recorded on rows from that family).
 * @typedef {{ key: string, label: string, short: string, unit: string, src: Record<string, string> }} Column
 * @typedef {{ key: string, label: string, primary: string, columns: Column[] }} Group
 */
const col = (key, label, short, unit, src) => ({ key, label, short, unit, src });

/** @type {Record<string, Group[]>} display order is the tie-break order */
export const PLAYER_GROUPS = Object.freeze({
  NFL: [
    { key: "receiving", label: "Receiving", primary: "targets", columns: [
      col("targets", "Targets", "TGT", "targets", { [NFL_ESPN]: "targets", [NFL_NFLVERSE]: "targets" }),
      col("receptions", "Receptions", "REC", "receptions", { [NFL_ESPN]: "receptions", [NFL_NFLVERSE]: "receptions" }),
      col("receivingYards", "Receiving yards", "YDS", "yards", { [NFL_ESPN]: "receivingYards", [NFL_NFLVERSE]: "receivingYards" }),
      col("receivingTds", "Receiving TDs", "TD", "touchdowns", { [NFL_ESPN]: "receivingTds", [NFL_NFLVERSE]: "receivingTds" }),
    ] },
    { key: "rushing", label: "Rushing", primary: "rushingAttempts", columns: [
      col("rushingAttempts", "Rushing attempts", "ATT", "attempts", { [NFL_ESPN]: "rushingAttempts", [NFL_NFLVERSE]: "carries" }),
      col("rushingYards", "Rushing yards", "YDS", "yards", { [NFL_ESPN]: "rushingYards", [NFL_NFLVERSE]: "rushingYards" }),
      col("rushingTds", "Rushing TDs", "TD", "touchdowns", { [NFL_ESPN]: "rushingTds", [NFL_NFLVERSE]: "rushingTds" }),
    ] },
    { key: "passing", label: "Passing", primary: "passAttempts", columns: [
      col("passCompletions", "Completions", "CMP", "completions", { [NFL_ESPN]: "passCompletions", [NFL_NFLVERSE]: "passCompletions" }),
      col("passAttempts", "Pass attempts", "ATT", "attempts", { [NFL_ESPN]: "passAttempts", [NFL_NFLVERSE]: "passAttempts" }),
      col("passingYards", "Passing yards", "YDS", "yards", { [NFL_ESPN]: "passingYards", [NFL_NFLVERSE]: "passingYards" }),
      col("passingTds", "Passing TDs", "TD", "touchdowns", { [NFL_ESPN]: "passingTds" }),
      col("interceptionsThrown", "Interceptions thrown", "INT", "interceptions", { [NFL_ESPN]: "interceptionsThrown" }),
    ] },
  ],
  MLB: [
    { key: "batting", label: "Batting (captured categories)", primary: "hits", columns: [
      col("hits", "Hits", "H", "hits", { [MLB_PROPS]: "hits" }),
      col("totalBases", "Total bases", "TB", "bases", { [MLB_PROPS]: "totalBases" }),
      col("hitsRunsRbis", "Hits + runs + RBIs", "H+R+RBI", "count", { [MLB_PROPS]: "hitsRunsRbis" }),
    ] },
    { key: "pitching", label: "Pitching (captured categories)", primary: "pitcherStrikeouts", columns: [
      col("pitcherStrikeouts", "Strikeouts (pitching)", "K", "strikeouts", { [MLB_PROPS]: "pitcherStrikeouts" }),
    ] },
  ],
  EPL: [
    { key: "attacking", label: "Attacking", primary: "shots", columns: [
      col("goals", "Goals", "G", "goals", { [EPL_MATCH]: "goals" }),
      col("assists", "Assists", "A", "assists", { [EPL_MATCH]: "assists" }),
      col("shots", "Shots", "SH", "shots", { [EPL_MATCH]: "shots" }),
      col("shotsOnGoal", "Shots on target", "SOT", "shots", { [EPL_MATCH]: "shotsOnGoal" }),
    ] },
    { key: "discipline", label: "Discipline", primary: "fouls", columns: [
      col("fouls", "Fouls", "FC", "fouls", { [EPL_MATCH]: "fouls" }),
      col("yellowCards", "Yellow cards", "YC", "cards", { [EPL_MATCH]: "yellowCards" }),
      col("redCards", "Red cards", "RC", "cards", { [EPL_MATCH]: "redCards" }),
    ] },
    { key: "goalkeeping", label: "Goalkeeping", primary: "saves", columns: [
      col("saves", "Saves", "SV", "saves", { [EPL_MATCH]: "saves" }),
      col("goalsAgainst", "Goals against", "GA", "goals", { [EPL_MATCH]: "goalsAgainst" }),
    ] },
  ],
  UFC: [],
});

/** All columns of a sport in a fixed order (the packed value order of a game-log row). */
export function sportColumns(sportId) {
  return (PLAYER_GROUPS[sportId] ?? []).flatMap((g) => g.columns);
}

/** Which families a sport's player research reads, in precedence order for one row. */
export const PLAYER_FAMILY_PRECEDENCE = Object.freeze({
  NFL: [NFL_ESPN, NFL_NFLVERSE],
  MLB: [MLB_PROPS],
  EPL: [EPL_MATCH],
  UFC: [UFC_RESULT],
});

/** Short family code stored per row so every cell stays traceable to its platform family. */
export const FAMILY_CODE = Object.freeze({ [NFL_ESPN]: "E", [NFL_NFLVERSE]: "V", [MLB_PROPS]: "M", [EPL_MATCH]: "P", [UFC_RESULT]: "U" });
