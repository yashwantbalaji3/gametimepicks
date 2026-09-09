/**
 * REPORT VOCABULARY FALLBACK (P250-W2).
 *
 * `MlbSimulationReportV2` renders one report for every sport and takes its nouns from the
 * simulation artifact's own `vocabulary`. The component's documented default when that is absent
 * is baseball — correct when it was baseball-only, and wrong the moment another sport reached it
 * WITHOUT a full-game simulation: an NFL archive game (no full-game sim exists for preseason)
 * rendered "ARI @ GB · MLB · 2026-08-28" and "run line" on a football page.
 *
 * The artifact stays the authority whenever it speaks. This supplies the words when it does not,
 * keyed on the one fact the page always knows — which sport it is — so no surface can silently
 * fall back to another sport's nouns again.
 */
export interface ReportWords {
  sportCode: string;
  scoreUnit: string;
  /** The handicap market's name in this sport ("Run line", "Spread"). */
  spreadLabel: string;
  /** What the scheduled kickoff/first pitch is called ("first pitch", "kickoff", "start"). */
  startLabel: string;
}

const WORDS: Record<string, ReportWords> = {
  mlb: { sportCode: "MLB", scoreUnit: "runs", spreadLabel: "run line", startLabel: "first pitch" },
  nfl: { sportCode: "NFL", scoreUnit: "points", spreadLabel: "spread", startLabel: "kickoff" },
  nba: { sportCode: "NBA", scoreUnit: "points", spreadLabel: "spread", startLabel: "tip-off" },
  ufc: { sportCode: "UFC", scoreUnit: "rounds", spreadLabel: "handicap", startLabel: "first bell" },
  epl: { sportCode: "EPL", scoreUnit: "goals", spreadLabel: "handicap", startLabel: "kick-off" },
  world_cup: { sportCode: "World Cup", scoreUnit: "goals", spreadLabel: "handicap", startLabel: "kick-off" },
};

/** The sport's own report words. Never guesses another sport's nouns. */
export function reportWordsFor(sport: string): ReportWords {
  return WORDS[String(sport)] ?? { sportCode: String(sport).toUpperCase(), scoreUnit: "points", spreadLabel: "spread", startLabel: "start" };
}
