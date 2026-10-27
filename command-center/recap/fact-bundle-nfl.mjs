/**
 * NFL RECAP FACT BUNDLE — the complete list of things the graphic and captions are allowed to say.
 *
 * Built only from a candidate that passed the integrity gate. Every claim carries the exact `display` string a
 * template may print and an evidenceRef (repo path + sha256 of that file's bytes + forecastId), so any number on
 * a graphic or in a caption can be traced to one ledger row. Captions are validated against this list
 * (caption-validator.mjs): a number that is not here cannot be published.
 *
 * Probabilities print to one decimal as a percentage of the side the forecast favoured, exactly as published
 * (no re-rounding of the tie mass into either side — the receipt keeps ~3% for a tie).
 */
import { digestOf } from "../lib/util.mjs";

const ET_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});
/** "Oct 25, 6:36 PM ET" */
export const etDisplay = (iso) => `${ET_TIME.format(new Date(iso)).replace(" at ", ", ")} ET`;

const pct = (p) => `${(Math.round(p * 1000) / 10).toFixed(1)}%`;
const nickname = (name) => String(name).split(" ").at(-1);

/** @param {object} c  a gate-passed candidate from select-game.enrichCandidate */
export function buildFactBundle(c) {
  const rc = c.receipt;
  const home = rc.home;
  const away = rc.away;
  const homeScore = c.teamScores.find((r) => r.teamId === home.abbr);
  const awayScore = c.teamScores.find((r) => r.teamId === away.abbr);
  if (!homeScore || !awayScore) throw new Error(`team-score rows do not match ${away.abbr} @ ${home.abbr}`);

  const favouredSide = c.winner.direction === "AWAY_WIN" ? "away" : "home";
  const favoured = favouredSide === "home" ? home : away;
  const finalCategory = c.winner.settlement.finalCategory; // HOME | AWAY | TIE
  const result = finalCategory === "TIE" ? "TIE" : c.winner.measurement?.directionalResult ?? (finalCategory === c.winner.categoryPrediction ? "WIN" : "LOSS");
  const frozenAt = rc.sideDecision?.frozenAt ?? rc.generatedAt;
  const totalFinal = c.total.settlement.finalValue;
  const totalInside = totalFinal >= c.total.rangeLow && totalFinal <= c.total.rangeHigh;

  const ledgerRef = (row) => ({ path: c.ledgerPath, sha256: c.ledgerSha, forecastId: row.forecastId });
  const receiptRef = { path: c.receiptPath, sha256: c.receiptSha };

  const claims = [
    { key: "matchup", value: `${away.abbr} @ ${home.abbr}`, display: `${away.abbr} @ ${home.abbr}`, family: "nfl_game_winner", evidenceRef: ledgerRef(c.winner) },
    { key: "frozenAt", value: frozenAt, display: etDisplay(frozenAt), family: "nfl_game_winner", evidenceRef: receiptRef },
    { key: "kickoff", value: c.eventStart, display: etDisplay(rc.kickoffUtc ?? c.eventStart), family: "nfl_game_winner", evidenceRef: receiptRef },
    { key: "favoured.team", value: favoured.abbr, display: favoured.name, family: "nfl_game_winner", evidenceRef: ledgerRef(c.winner) },
    { key: "favoured.winProbability", value: c.winner.probability, display: pct(c.winner.probability), family: "nfl_game_winner", evidenceRef: ledgerRef(c.winner) },
    { key: "projected.home", value: homeScore.projection, display: String(homeScore.projection), family: "nfl_team_score", evidenceRef: ledgerRef(homeScore) },
    { key: "projected.away", value: awayScore.projection, display: String(awayScore.projection), family: "nfl_team_score", evidenceRef: ledgerRef(awayScore) },
    { key: "projected.total", value: c.total.projection, display: String(c.total.projection), family: "nfl_game_total", evidenceRef: ledgerRef(c.total) },
    { key: "projected.totalRange", value: [c.total.rangeLow, c.total.rangeHigh], display: `${c.total.rangeLow}–${c.total.rangeHigh}`, family: "nfl_game_total", evidenceRef: ledgerRef(c.total) },
    { key: "final.home", value: homeScore.settlement.finalValue, display: String(homeScore.settlement.finalValue), family: "nfl_team_score", evidenceRef: ledgerRef(homeScore) },
    { key: "final.away", value: awayScore.settlement.finalValue, display: String(awayScore.settlement.finalValue), family: "nfl_team_score", evidenceRef: ledgerRef(awayScore) },
    { key: "final.total", value: totalFinal, display: String(totalFinal), family: "nfl_game_total", evidenceRef: ledgerRef(c.total) },
    { key: "total.absError", value: Math.abs(totalFinal - c.total.projection), display: String(Math.abs(totalFinal - c.total.projection)), family: "nfl_game_total", evidenceRef: ledgerRef(c.total) },
    { key: "result.side", value: result, display: result, family: "nfl_game_winner", evidenceRef: ledgerRef(c.winner) },
    { key: "result.totalInsideRange", value: totalInside, display: totalInside ? "inside" : "outside", family: "nfl_game_total", evidenceRef: ledgerRef(c.total) },
  ];

  const bundle = {
    schema: "gtp.cc.fact-bundle@1",
    sport: "NFL",
    eventId: c.eventId,
    contentKind: "nfl-postgame-recap",
    snapshotId: c.winner.forecastId,
    teams: {
      home: { abbr: home.abbr, name: home.name, nickname: nickname(home.name) },
      away: { abbr: away.abbr, name: away.name, nickname: nickname(away.name) },
    },
    favouredSide,
    week: rc.week ?? null,
    model: { id: c.winner.modelId, version: c.winner.modelVersion, statusAtPublish: c.winner.modelStatusAtPublish },
    disclaimer: rc.disclaimer ?? "Educational and paper-only — not betting advice.",
    settlementSource: c.winner.settlement.source,
    claims,
    sources: {
      ledger: { path: c.ledgerPath, sha256: c.ledgerSha },
      receipt: { path: c.receiptPath, sha256: c.receiptSha },
    },
  };
  return { bundle, digest: digestOf(bundle) };
}

export const claimOf = (bundle, key) => bundle.claims.find((c) => c.key === key);
export const display = (bundle, key) => claimOf(bundle, key)?.display;
