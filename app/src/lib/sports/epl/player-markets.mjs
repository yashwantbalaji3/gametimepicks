/**
 * EPL PLAYER MARKETS — a DOCUMENTED REFUSAL, not a gap.
 *
 * This module exists so that "we do not publish EPL player props" is a stated position with a
 * reason and an exit condition, rather than an absence a reader has to infer. Program 182 established
 * the pattern for the NFL participation problem: a named module IS the refusal, because a refusal
 * nobody can find reads as an oversight, and an oversight invites someone to quietly fill it in.
 *
 * WHY IT IS REFUSED, in one sentence: there is no EPL player data in this repository.
 *
 * Not "not enough". None. The research corpus (data/internal/research/epl/corpus-v1.json) is 1,520
 * matches carrying exactly six fields — home, away, ftHome, ftAway, date, matchday — and the raw
 * provider payloads it was built from (api-football fixtures) carry only `fixture`, `goals`,
 * `league`, `score` and `teams`. No lineups, no appearances, no minutes, no events, no scorers, no
 * shots. The model card has recorded this as a scope boundary since v1:
 * "NOT_REQUIRED_FOR_TEAM_V1 — team-level forecasting only; no lineup parameter exists".
 *
 * SO THE BLOCKER IS A DATASET, NOT A MODEL. The Poisson matrix could in principle be extended to
 * player-level scoring rates; there is simply nothing to fit them on. Anything published today would
 * be a number invented from a team total and a guess about who takes the shots — which is precisely
 * what Programs 182 and 183 rejected for the NFL, twice, after measuring it.
 *
 * WHAT WOULD ACTUALLY LIFT THIS, stated so it is a decision rather than a mystery:
 *   1. A rights-cleared player corpus with, per match: the players who appeared, their minutes, and
 *      their goals/assists/shots. Several seasons, because a prop model needs usage history.
 *   2. A pre-kickoff LINEUP or expected-lineup feed. Minutes are the dominant term in any soccer
 *      player prop, and a player who does not start has a different distribution, not a scaled one.
 *      Without this the same defect returns that killed the NFL families: playing time is a coaching
 *      decision, and no amount of historical usage predicts a rotation.
 *   3. Both are PAID endpoints on the providers we already use. New spend and new quota are founder
 *      decisions under the charter, so nothing here can be unblocked by writing more code.
 *
 * Until (1) and (2) exist, every consumer must treat EPL player markets as UNAVAILABLE_NO_DATA and
 * publish nothing — not a placeholder, not a "coming soon" projection with numbers in it, and not a
 * team total divided among a squad.
 */

export const EPL_PLAYER_MARKET_STATE = "UNAVAILABLE_NO_DATA";

/** The reason, in the words a reader should see if a surface ever needs to explain the absence. */
export const EPL_PLAYER_MARKET_REASON =
  "No player-level Premier League data exists in this system. The model is fitted on match results only — final scores, nothing else — so it has no basis for any claim about an individual player. Publishing one would mean inventing it.";

/**
 * Markets that WOULD be in scope once a player corpus and a lineup feed exist. Listed so the refusal
 * is specific about what is missing rather than vague about the whole category — and so nobody
 * re-derives the list later and quietly ships the easy-looking half of it.
 */
export const EPL_PLAYER_MARKETS_OUT_OF_SCOPE = Object.freeze([
  { market: "anytime_goalscorer", requires: ["player goals history", "expected lineup", "minutes"] },
  { market: "shots", requires: ["player shots history", "expected lineup", "minutes"] },
  { market: "shots_on_target", requires: ["player shots-on-target history", "expected lineup", "minutes"] },
  { market: "assists", requires: ["player assists history", "expected lineup", "minutes"] },
  { market: "cards", requires: ["player disciplinary history", "expected lineup", "referee assignment"] },
]);

/** The inputs that are missing, each with the state the rest of the codebase uses for such things. */
export const EPL_PLAYER_INPUTS = Object.freeze({
  playerCorpus: { state: "MISSING", note: "no player appearance/minutes/goals history committed anywhere in the repo" },
  lineups: { state: "MISSING", note: "no pre-kickoff lineup or expected-lineup feed; minutes dominate every soccer player prop" },
  playerIdentity: { state: "MISSING", note: "no EPL player identity map — clubs resolve canonically, players have never been modelled" },
});

/**
 * The single question every consumer should ask. Always false today, and deliberately a FUNCTION so
 * that the day a corpus lands there is exactly one place to change and one guard to satisfy.
 */
export function eplPlayerMarketsAvailable() {
  return false;
}

/** Structural summary for a surface that needs to render the refusal honestly. */
export function eplPlayerMarketStatus() {
  return {
    available: eplPlayerMarketsAvailable(),
    state: EPL_PLAYER_MARKET_STATE,
    reason: EPL_PLAYER_MARKET_REASON,
    missingInputs: EPL_PLAYER_INPUTS,
    outOfScope: EPL_PLAYER_MARKETS_OUT_OF_SCOPE,
  };
}
