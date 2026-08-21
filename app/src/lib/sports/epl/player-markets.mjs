/**
 * EPL PLAYER MARKETS — the state, which CHANGED on 2026-08-21.
 *
 * This module exists so that "we do not publish EPL player props" is a stated position with a
 * reason and an exit condition, rather than an absence a reader has to infer. Program 182 established
 * the pattern for the NFL participation problem: a named module IS the refusal, because a refusal
 * nobody can find reads as an oversight, and an oversight invites someone to quietly fill it in.
 *
 * THE PREVIOUS VERSION OF THIS FILE WAS WRONG, and the way it was wrong is worth keeping.
 *
 * It said: "there is no player-level Premier League data in this repository... Both are PAID
 * endpoints on the providers we already use." The first half was true of what was COMMITTED. The
 * second half was an inference, and it was false. It came from checking ONE provider's plan gates —
 * api-football, whose free tier refuses any season after 2024 — and never asking whether ESPN, whose
 * public endpoints this repository already reads for free on three other sports, carried the same
 * thing. It does, for nothing, with no rate limit, for every season including the current one.
 *
 * The lesson is not "we found a cheaper vendor". It is that a REFUSAL IS A CLAIM, and this one was
 * published on a live page and used to defer a purchase, having never been tested against the
 * sources already in the building.
 *
 * WHAT NOW EXISTS (data/internal/research/epl/players/espn-players-v1.jsonl):
 *   · 380 of 380 fixtures for 2025-26 — 15,189 player rows, 677 players, all 20 clubs
 *   · per player per match: goals, assists, shots, shots on goal, cards, fouls, offsides,
 *     keeper saves and goals against
 *   · PARTICIPATION, which is the term that actually decides a soccer player prop and the one whose
 *     absence killed the NFL player families in Programs 182 and 183: started / subbedIn /
 *     subbedOut / formationPlace. 8,360 starts and 3,132 substitute appearances are OBSERVED.
 *   · sanity: 2.64 goals per match and 10.6% shot conversion, both correct for this league
 *
 * ALSO AVAILABLE FREE FROM THE SAME HOST, and not yet captured:
 *   · 2026-27 squad membership (/teams/{id}/roster) — the "who is even at this club" problem that
 *     no amount of history solves, since players transfer between seasons
 *   · pre-kickoff lineups with starter flags (/summary?event=... rosters[]). The block is present
 *     before kickoff and EMPTY until roughly an hour before, so that it populates in time is
 *     STRUCTURALLY LIKELY AND STILL UNOBSERVED — it is not claimed here until seen.
 *
 * SO WHY IS NOTHING PUBLISHED YET. Because a corpus is not a model, and this repository has rejected
 * five model improvements against preregistered bars. Shipping player numbers tonight, unbacktested,
 * would break the standard that makes every other number on this site worth reading. The remaining
 * work is a rate model, a preregistered bar, and a walk-forward backtest that the model may well
 * fail — and if it fails, nothing ships, which is the same rule the team model lives under.
 *
 * Until that bar is cleared, every consumer must publish NOTHING about an individual player — not a
 * placeholder, not a "coming soon" projection with numbers in it, and not a team total divided among
 * a squad.
 */

/**
 * DATA_READY_MODEL_UNVALIDATED — the corpus exists; no model has been fitted or backtested on it, so
 * nothing is published. Deliberately NOT "coming soon": the model may fail its bar, as five before it
 * have, and in that case nothing ships.
 */
export const EPL_PLAYER_MARKET_STATE = "DATA_READY_MODEL_UNVALIDATED";

/** The reason, in the words a reader should see if a surface ever needs to explain the absence. */
export const EPL_PLAYER_MARKET_REASON =
  "A full season of Premier League player data now exists here — every appearance, goal, shot and card from all 380 matches of 2025-26, including who started and who came off the bench. What does not exist yet is a model fitted to it and tested against results it has not seen. Until that test is run and passed, nothing about an individual player is published, because a number nobody has checked is not a prediction.";

/**
 * The candidate markets, each with what the corpus can now support and what it still cannot. Kept
 * explicit so nobody re-derives the list later and quietly ships the easy-looking half of it.
 * `history` is AVAILABLE across the board; every one of them still waits on the same two things.
 */
export const EPL_PLAYER_MARKETS_CANDIDATE = Object.freeze([
  { market: "anytime_goalscorer", history: "AVAILABLE", stillNeeds: ["fitted rate model", "preregistered bar cleared", "expected lineup"] },
  { market: "shots", history: "AVAILABLE", stillNeeds: ["fitted rate model", "preregistered bar cleared", "expected lineup"] },
  { market: "shots_on_target", history: "AVAILABLE", stillNeeds: ["fitted rate model", "preregistered bar cleared", "expected lineup"] },
  { market: "assists", history: "AVAILABLE", stillNeeds: ["fitted rate model", "preregistered bar cleared", "expected lineup"] },
  { market: "cards", history: "AVAILABLE", stillNeeds: ["fitted rate model", "preregistered bar cleared", "referee assignment"] },
]);

/** The inputs that are missing, each with the state the rest of the codebase uses for such things. */
export const EPL_PLAYER_INPUTS = Object.freeze({
  playerCorpus: { state: "AVAILABLE", note: "ESPN, free and unmetered: 380/380 fixtures of 2025-26, 15,189 rows, 677 players, with participation flags" },
  playerIdentity: { state: "AVAILABLE", note: "ESPN athlete ids are stable and captured verbatim on every row" },
  squadMembership: { state: "REACHABLE", note: "ESPN /teams/{id}/roster returns the 2026-27 squad free; not yet captured" },
  lineups: { state: "REACHABLE_UNOBSERVED", note: "the summary rosters[] block exists pre-kickoff and is empty until ~1h before; that it fills in time is structurally likely and has not yet been seen" },
  model: { state: "MISSING", note: "no rate model fitted, no preregistered bar, no walk-forward backtest — this is the only thing between the corpus and a published projection" },
});

/**
 * The single question every consumer should ask. Always false today, and deliberately a FUNCTION so
 * that the day a corpus lands there is exactly one place to change and one guard to satisfy.
 */
export function eplPlayerMarketsAvailable() {
  /*
   * Still false, and for a DIFFERENT reason than before: the data is here, the validated model is
   * not. This flips when a backtest clears a preregistered bar, and not when the corpus lands.
   */
  return false;
}

/** Structural summary for a surface that needs to render the refusal honestly. */
export function eplPlayerMarketStatus() {
  return {
    available: eplPlayerMarketsAvailable(),
    state: EPL_PLAYER_MARKET_STATE,
    reason: EPL_PLAYER_MARKET_REASON,
    missingInputs: EPL_PLAYER_INPUTS,
    candidates: EPL_PLAYER_MARKETS_CANDIDATE,
  };
}
