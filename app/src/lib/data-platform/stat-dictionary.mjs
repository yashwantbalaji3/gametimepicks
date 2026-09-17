/**
 * Stat dictionaries — one common envelope, sport-specific versioned stat FAMILIES.
 *
 * A family is "one source's factual stat line at one grain". Families are never merged silently: when two
 * sources describe the same player-game (ESPN summary lines and nflverse stat rows for NFL 2023–25), each
 * keeps its own family row and the builder receipts disagreements on the shared fields.
 *
 * MISSINGNESS CONTRACT (docs/GAMETIME_DATA_PLATFORM.md §Missingness):
 *   - a row carries EVERY key its family declares;
 *   - `0` means the source recorded zero;
 *   - `null` means the source row did not record that category for this player-game (e.g. a kicker's
 *     ESPN summary line has no rushing block) — never "zero";
 *   - no row at all means the source has no line for that player-game — not "did not play", not zero.
 *
 * Only factual source fields are normalized. No derived or advanced metric is introduced here.
 */

/**
 * @typedef {{ key: string, label: string, type: "integer"|"number"|"boolean"|"string", unit: string|null,
 *   min: number|null, enum?: string[], aggregation: "sum"|null, sourceField: string }} StatDef
 * @typedef {{ id: string, version: number, sportId: string, level: "team"|"player", description: string,
 *   coverage: string, stats: StatDef[] }} StatFamily
 */

const count = (key, label, sourceField, unit = "count") => ({ key, label, type: "integer", unit, min: 0, aggregation: "sum", sourceField });
const yards = (key, label, sourceField) => ({ key, label, type: "integer", unit: "yards", min: null, aggregation: "sum", sourceField });
const bool = (key, label, sourceField) => ({ key, label, type: "boolean", unit: null, min: null, aggregation: null, sourceField });
const str = (key, label, sourceField, values) => ({ key, label, type: "string", unit: null, min: null, aggregation: null, sourceField, ...(values ? { enum: values } : {}) });

/** @type {StatFamily[]} */
const FAMILIES = [
  {
    id: "mlb.final-score", version: 1, sportId: "MLB", level: "team",
    description: "Official final runs per club (StatsAPI schedule linescore projection).",
    coverage: "2023–2025 regular-season finals archive; 2026 from the committed nightly linescores (2026-07-04 onward).",
    stats: [count("runs", "Runs", "homeRuns|awayRuns", "runs")],
  },
  {
    id: "mlb.prop-actuals", version: 1, sportId: "MLB", level: "player",
    description: "Box-score actuals recorded by the settlement pipeline for player markets a sportsbook priced.",
    coverage: "PARTIAL BY CONSTRUCTION: only players and categories that carried a priced market that day (2026-05-16 onward). Absence is not zero and not 'did not play'.",
    stats: [
      count("hits", "Hits", "batter_hits.actual"),
      count("totalBases", "Total bases", "batter_total_bases.actual"),
      count("hitsRunsRbis", "Hits + runs + RBIs (as the source totals it)", "batter_hits_runs_rbis.actual"),
      count("pitcherStrikeouts", "Strikeouts (pitching)", "pitcher_strikeouts.actual"),
    ],
  },
  {
    id: "nfl.final-score", version: 1, sportId: "NFL", level: "team",
    description: "Official final points per team.",
    coverage: "1999–2025 REG+POST from nflverse games history; 2026 from ESPN results captures (FINAL rows only).",
    stats: [count("points", "Points", "homeScore|awayScore|ftHome|ftAway", "points")],
  },
  {
    id: "nfl.espn-player-lines", version: 1, sportId: "NFL", level: "player",
    description: "ESPN game-summary box-score lines per athlete (all positions that appear in the summary).",
    coverage: "2023–2025 (REG+POST; preseason games excluded — their team sides are name-only). null = the summary line had no such block for that athlete.",
    stats: [
      count("passCompletions", "Pass completions", "passCmp"), count("passAttempts", "Pass attempts", "passAtt"),
      yards("passingYards", "Passing yards", "passYds"), count("passingTds", "Passing TDs", "passTd"),
      count("interceptionsThrown", "Interceptions thrown", "passInt"), count("sacksTaken", "Sacks taken", "sacks"),
      count("rushingAttempts", "Rushing attempts", "rushAtt"), yards("rushingYards", "Rushing yards", "rushYds"),
      count("rushingTds", "Rushing TDs", "rushTd"), count("targets", "Targets", "targets"),
      count("receptions", "Receptions", "rec"), yards("receivingYards", "Receiving yards", "recYds"),
      count("receivingTds", "Receiving TDs", "recTd"), count("fumbles", "Fumbles", "fumbles"),
      count("fumblesLost", "Fumbles lost", "fumblesLost"),
    ],
  },
  {
    id: "nfl.nflverse-skill-lines", version: 1, sportId: "NFL", level: "player",
    description: "nflverse weekly stat rows joined to snap counts, skill positions only (QB/RB/WR/TE/FB).",
    coverage: "2013–2025 REG+POST. Players are mapped gsis/PFR → ESPN through the committed exact id bridge; rows with no ESPN id are counted UNRESOLVED_PLAYER and not emitted. participation PLAYED_NO_ROW = offensive snaps with no nflverse stat row, which the source records as zeros (it had no stat to record); UNKNOWN = stat row with no snap match.",
    stats: [
      str("participation", "Participation class (source)", "participation", ["PLAYED", "PLAYED_NO_ROW", "UNKNOWN"]),
      count("offenseSnaps", "Offensive snaps", "offenseSnaps", "snaps"), count("targets", "Targets", "targets"),
      count("receptions", "Receptions", "receptions"), yards("receivingYards", "Receiving yards", "recYds"),
      count("carries", "Carries", "carries"), yards("rushingYards", "Rushing yards", "rushYds"),
      count("passAttempts", "Pass attempts", "passAtt"), count("passCompletions", "Pass completions", "passCmp"),
      yards("passingYards", "Passing yards", "passYds"), count("rushingTds", "Rushing TDs", "rushTd"),
      count("receivingTds", "Receiving TDs", "recTd"), count("otherTds", "Other TDs (special teams + fumble recovery)", "otherTd"),
    ],
  },
  {
    id: "epl.espn-player-match", version: 1, sportId: "EPL", level: "player",
    description: "ESPN match-summary line per squad player listed for the match.",
    coverage: "2022-23 … 2025-26 (1,520 matches). No committed id-keyed team totals or final scores exist for these matches.",
    stats: [
      str("position", "Position (source code)", "position"), str("formationPlace", "Formation place (source)", "formationPlace"),
      bool("started", "Started", "started"), bool("subbedIn", "Came on", "subbedIn"), bool("subbedOut", "Taken off", "subbedOut"),
      bool("appeared", "Appeared", "appeared"), count("goals", "Goals", "goals"), count("assists", "Assists", "assists"),
      count("shots", "Shots", "shots"), count("shotsOnGoal", "Shots on target", "shotsOnGoal"),
      count("yellowCards", "Yellow cards", "yellow"), count("redCards", "Red cards", "red"), count("fouls", "Fouls", "fouls"),
      count("offsides", "Offsides", "offsides"), count("saves", "Saves", "saves"), count("goalsAgainst", "Goals against (goalkeeper line)", "goalsAgainst"),
    ],
  },
  {
    id: "ufc.bout-result", version: 1, sportId: "UFC", level: "player",
    description: "Per-fighter winner flag from the ESPN MMA scoreboard. No method, round or strike data.",
    coverage: "Final bouts in the committed ESPN history (2023-08 onward) and results captures. Method/round/strikes UNSUPPORTED (only name-keyed GPL source exists).",
    stats: [bool("won", "Won (provider winner flag)", "competitor.winner"), bool("boutHadWinner", "Bout had a winner (false = draw or no contest)", "any competitor.winner")],
  },
];

export const STAT_FAMILIES = Object.freeze(Object.fromEntries(FAMILIES.map((f) => [f.id, Object.freeze(f)])));

/**
 * Validate a stats object against its family. Never repairs a value.
 * @returns {string[]} errors
 */
export function validateStats(familyId, stats) {
  const fam = STAT_FAMILIES[familyId];
  if (!fam) return [`unknown stat family ${familyId}`];
  const errs = [];
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return [`${familyId}: stats must be an object`];
  const declared = new Set(fam.stats.map((s) => s.key));
  for (const k of Object.keys(stats)) if (!declared.has(k)) errs.push(`${familyId}: undeclared stat key ${k}`);
  for (const def of fam.stats) {
    if (!Object.hasOwn(stats, def.key)) { errs.push(`${familyId}: missing declared key ${def.key} (use null for not recorded)`); continue; }
    const v = stats[def.key];
    if (v === null) continue;
    if (def.type === "integer" && !Number.isInteger(v)) errs.push(`${familyId}.${def.key}: ${JSON.stringify(v)} is not an integer`);
    if (def.type === "number" && (typeof v !== "number" || !Number.isFinite(v))) errs.push(`${familyId}.${def.key}: ${JSON.stringify(v)} is not a finite number`);
    if (def.type === "boolean" && typeof v !== "boolean") errs.push(`${familyId}.${def.key}: ${JSON.stringify(v)} is not boolean`);
    if (def.type === "string" && typeof v !== "string") errs.push(`${familyId}.${def.key}: ${JSON.stringify(v)} is not a string`);
    if (def.min !== null && typeof v === "number" && v < def.min) errs.push(`${familyId}.${def.key}: ${v} is below ${def.min}`);
    if (def.enum && typeof v === "string" && !def.enum.includes(v)) errs.push(`${familyId}.${def.key}: ${JSON.stringify(v)} not in ${def.enum.join("|")}`);
  }
  return errs;
}

/**
 * Read a source value into a declared stat WITHOUT inventing zeros: absent/null/undefined → null.
 * Numbers that are integral floats (StatsAPI "4.0") become integers; anything else is returned verbatim
 * so validation — not this helper — decides whether it is acceptable.
 */
export function sourceValue(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "number" && Number.isFinite(v) && Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v);
  return v;
}
