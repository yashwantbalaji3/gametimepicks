/**
 * SIMULATION THEATER · OFFICIAL REPRESENTATIVE vs WHAT-IF — the client-safe labels and helpers (both sports). Pure.
 *
 * Founder rule (Cross-Product Prediction Consistency, 2026-10-20): the Theater opens on the OFFICIAL REPRESENTATIVE
 * SIMULATION — one real stored run, the one closest to the official forecast (lib/consistency/representative.mjs
 * selectOfficialRepresentative) — shown with the official expectations beside its box score. Every other stored run is a
 * WHAT-IF: real, playable, with its own box score, and labelled "Hypothetical" wherever it appears. A selected simulated
 * outcome is never presented as the model's expected result.
 *
 * The server attaches `manifest.representative` (official-representative.mjs representativeBlock); everything here reads
 * only that plain-JSON block, so the client islands (NFL and NBA) import no engine id, artifact name or data path.
 *
 * RECONCILIATION. Official expectations are means over every simulated game and are shown unrounded to two decimals
 * (fmtExpectation); a simulated game's box score is whole numbers. Neither is ever rounded into, or substituted for, the
 * other: the comparison rows print both and their signed difference.
 */

import { NBA_THEATER_GATE_POLICY } from "../consistency/theater-gate-policy.mjs";

/* Track C (2026-10-29): a stored run is a SIMULATED SCENARIO, never "official". The run the Theater opens on is the
   central scenario (the stored run closest to the Official Forecast, by the rule below); the Official Forecast numbers
   print only in their own card, from the canonical accessor, and never under a run's title. */
export const SCENARIO_LABEL = "Simulated scenario (hypothetical)";
export const OFFICIAL_RUN_TITLE = `${SCENARIO_LABEL} · central run`;
/** NBA under LABELLED_SUPPORTING_RUNS: the run the Theater opens on is one run of the supporting engine, never official. */
export const SUPPORTING_RUN_TITLE = "Simulated game · one supporting-simulation run";
export const SUPPORTING_RUN_SUBTITLE = "an individual run of a different simulation engine; the official projection beside it never changes";
export const OFFICIAL_RUN_SUBTITLE = "the stored run closest to the Official Forecast, chosen by rule; one simulated game, not the forecast";
export const WHAT_IF_TAG = `${SCENARIO_LABEL} · what-if`;
export const WHAT_IF_BANNER = "Hypothetical scenario — not the forecast";
export const OFFICIAL_FORECAST_TITLE = "Official Forecast";
export const RECONCILIATION_NOTE = "The Official Forecast column repeats the numbers the game page publishes (its score for each team, median margin and median total). A simulated scenario is one game; neither is adjusted toward the other.";
export const NO_OFFICIAL_NBA = "No official forecast receipt for this game yet";
export const NO_OFFICIAL_NFL = "No official forecast of record for this game yet";
export const NO_OFFICIAL_RUNS_NOTE = "No stored run can be the official representative, so every run below is a hypothetical what-if, not the forecast.";
export const OFFICIAL_BOX_TITLE = `Box score · ${SCENARIO_LABEL} · central run`;
export const SUPPORTING_BOX_TITLE = "Projected box score · official projection beside one simulated run";
export const WHAT_IF_BOX_TITLE = "What-if box score · hypothetical";
export const WHAT_IF_BOX_WATERMARK = "SIMULATED · HYPOTHETICAL SCENARIO · NOT THE FORECAST · NOT ACTUAL GAME STATISTICS";
export const COMPARISON_TITLE = "Official Forecast vs this simulated scenario";
export const CENTRAL_ROLE_TAG = "Central scenario (hypothetical)";
/** NBA players: the official per-player expectation is the receipt's mean CONDITIONAL on playing (minutes > 0). */
export const NBA_PLAYER_EXPECTATION_NOTE = "Small figures are the official average per game played (the forecast's mean over the simulated games in which the player played, with how often he played). A DNP in this run is one whole-number outcome of that same forecast.";
export const NFL_PLAYERS_NOT_MODELED_NOTE = "Player expectations are not compared: this engine records drives, not players.";

export const ROLE = Object.freeze({ OFFICIAL: "OFFICIAL_REPRESENTATIVE", SUPPORTING_RUN: "SUPPORTING_RUN", WHAT_IF: "WHAT_IF" });

/** Is this an NBA manifest under the labelled-supporting-runs policy? (the server stamps `representative.policy`) */
export const labelledRuns = (manifest) => manifest?.representative?.sport === "NBA" && manifest?.representative?.policy === NBA_THEATER_GATE_POLICY.LABELLED_SUPPORTING_RUNS;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** An official expectation as printed: exact to two decimals, never rounded to a whole number. */
export const fmtExpectation = (v) => (isNum(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : "—");
export const fmtDistance = (d) => (isNum(d) ? d.toFixed(2) : "—");
export const fmtSignedDiff = (d) => (isNum(d) ? `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(2)}` : "—");
export const fmtPct = (p) => (isNum(p) ? `${(p * 100).toFixed(1)}%` : "—");

/** "Simulated scenario (hypothetical) · central run · the stored run closest to … · distance 0.03" */
export function officialRunLine(rep) {
  return `${OFFICIAL_RUN_TITLE} · ${OFFICIAL_RUN_SUBTITLE} · distance ${fmtDistance(rep?.distance)}`;
}

/** "Simulated scenario (hypothetical) · what-if · Upset" */
export function whatIfLine(kindTitle) {
  return kindTitle ? `${WHAT_IF_TAG} · ${kindTitle}` : WHAT_IF_TAG;
}

/** The run the Theater opens on: the official representative's runIndex, or null (then: first valid run, as a what-if). */
export function officialRunIndex(manifest) {
  const r = manifest?.representative;
  return r && r.state === "SELECTED" && Number.isInteger(r.officialRunIndex) ? r.officialRunIndex : null;
}

/**
 * The role of one run. Anything that is not the selected official representative — including every run when there is
 * no official forecast — is a hypothetical what-if.
 * @param {any} manifest
 * @param {number} runIndex
 * @param {string | null} [kindTitle]
 * @returns {{ role: string, hypothetical: boolean, distance: number|null, tag: string, line: string }}
 */
export function runRole(manifest, runIndex, kindTitle = null) {
  const rep = manifest?.representative ?? null;
  const official = officialRunIndex(manifest);
  if (official != null && runIndex === official) {
    if (labelledRuns(manifest)) {
      return { role: ROLE.SUPPORTING_RUN, hypothetical: false, distance: rep.distance, tag: SUPPORTING_RUN_TITLE, line: `${SUPPORTING_RUN_TITLE} · ${SUPPORTING_RUN_SUBTITLE}` };
    }
    return { role: ROLE.OFFICIAL, hypothetical: false, distance: rep.distance, tag: OFFICIAL_RUN_TITLE, line: officialRunLine(rep) };
  }
  const entry = rep?.runs?.find((r) => r.runIndex === runIndex) ?? null;
  return { role: ROLE.WHAT_IF, hypothetical: true, distance: entry?.distance ?? null, tag: WHAT_IF_TAG, line: whatIfLine(kindTitle) };
}

/**
 * The Official Forecast's game numbers AS THE GAME PAGE PUBLISHES THEM (lib/sports/nfl/forecast-view.mjs gameView
 * `record`): win probability (the published rounded pair), projected score (the published whole-number pair), margin
 * and total MEDIANS. The snapshot also carries unrounded means (`expected`, e.g. margin 5.78 beside the published median
 * 6); those are selection inputs only and are never printed under the Official Forecast heading, so no prop shows two
 * different "official" values. null where the forecast publishes nothing (NBA team terms are withheld).
 */
export function officialDisplay(official) {
  if (!official) return null;
  const t = official.team ?? {};
  const ps = official.projectedScore ?? {};
  return {
    winProbability: { home: isNum(official.pHomePublished) ? official.pHomePublished : num0(official.pHome), away: num0(official.pAway) },
    projectedScore: { home: num0(ps.home), away: num0(ps.away) },
    margin: num0(t.margin?.median),
    total: num0(t.total?.median),
  };
}
const num0 = (v) => (isNum(v) ? v : null);

/**
 * Team rows beside a run's final: home score, away score, home margin, total. `official` is the Official Forecast's
 * PUBLISHED number (officialDisplay: projected score, median margin, median total — the game page's numbers), `run` the
 * scenario's whole-number result, `diff` run − official. `median` is kept null (the published number already is the
 * median where one exists); no mean is printed beside it.
 */
export function teamComparison(manifest, final, teams) {
  const d = officialDisplay(manifest?.representative?.official);
  if (!d || !final || !isNum(final.home) || !isNum(final.away)) return [];
  const home = teams?.home?.abbr ?? "Home";
  const away = teams?.away?.abbr ?? "Away";
  const runOf = { home: final.home, away: final.away, margin: final.home - final.away, total: final.home + final.away };
  const label = { home: `${home} points`, away: `${away} points`, margin: `Margin (${home} − ${away})`, total: "Total points" };
  const officialOf = { home: d.projectedScore.home, away: d.projectedScore.away, margin: d.margin, total: d.total };
  if (Object.values(officialOf).every((v) => v == null)) return [];
  return ["away", "home", "margin", "total"].map((k) => {
    const official = officialOf[k];
    return { term: k, label: label[k], official, median: null, run: runOf[k], diff: official == null ? null : runOf[k] - official };
  });
}

/** NBA: the official per-player expectations for one athlete id, or null (never matched by name). */
export function playerExpectation(manifest, providerAthleteId) {
  if (providerAthleteId == null) return null;
  return manifest?.representative?.players?.[String(providerAthleteId)] ?? null;
}
