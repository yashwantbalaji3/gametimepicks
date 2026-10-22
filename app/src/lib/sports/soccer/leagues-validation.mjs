/**
 * SERVER-ONLY · soccer league validation evidence (Housekeeping 10-22).
 *
 * Each competition's stage is backed by evidence: for a league that went through the preregistered backtest, the
 * preregistration and its walk-forward report; for the live Premier League, the module that owns the model choice.
 * These were the registry's `validation` field in leagues.mjs until Production's site-wide layout chunk was found
 * carrying the five data/internal paths below — leagues.mjs is reached from the client navigation (command-rail.tsx
 * → lib/navigation.ts → lib/sports/catalog.ts), so every string in it ships to every visitor.
 *
 * Import this module ONLY from build scripts and tests — never from a "use client" module or anything a client
 * module imports (lib/client-graph-internal-paths.test.mjs fails if a client graph reaches a data/internal string).
 */
import { league } from "./leagues.mjs";

const PREREG = "data/internal/research/soccer/preregistration-league-expansion-v1.json";
const report = (key) => `data/internal/research/soccer/${key}/reports/walk-forward-v1.json`;

/** league key → { preregistration, report } evidence paths (repo-relative), or { modelOwner }. Absent ⇒ none. */
export const LEAGUE_VALIDATION = Object.freeze({
  epl: Object.freeze({ modelOwner: "app/src/lib/sports/epl/match-model.mjs" }),
  laliga: Object.freeze({ preregistration: PREREG, report: report("laliga") }),
  "serie-a": Object.freeze({ preregistration: PREREG, report: report("serie-a") }),
  bundesliga: Object.freeze({ preregistration: PREREG, report: report("bundesliga") }),
  "ligue-1": Object.freeze({ preregistration: PREREG, report: report("ligue-1") }),
});

/** The validation evidence for a registered league, or null when it has none. Throws on an unknown key. */
export function leagueValidation(key) {
  return LEAGUE_VALIDATION[league(key).key] ?? null;
}

/** The league's research directory (repo-relative). */
export const leagueDir = (key) => `data/internal/research/soccer/${league(key).key}`;
