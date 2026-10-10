/**
 * WHAT THE BOUT PAGE MAY SAY ABOUT "WHY" (UFC-001 UX Phase B, 2026-10-10).
 *
 * Copy only. Nothing here reads a probability or a weight.
 *
 * The winner head is a logistic regression over the inputs listed below (`WIN_F_TOTT` in
 * `scripts/ufc/lib/fight-model.mjs`), recalibrated with Platt scaling. Its fitted weights exist while the card builder
 * runs but are not written to the card, so the page can name the INPUTS and must not rank, weigh or attribute them for
 * a bout. Exact per-bout contributions are Phase D, and need the builder to emit its coefficients (a separate producer
 * change with its own test). Until then: no attribution, in any wording.
 *
 * `bout-page-sections.test.mjs` pins that every key in `WIN_F_TOTT` is described here, so the list cannot drift from
 * the model.
 */

/** The method distribution's exact meaning. Fight-level, for either fighter. */
export const METHOD_DIST_LABEL = "P(method | the bout ends with a winner)";
export const METHOD_DIST_NOTE =
  "How the bout ends, whichever fighter wins it. It is not the chance that the pick wins by that method: no model joins " +
  "the winner and the method. A draw or no contest falls outside this sample, so the three add to 100%.";

export const METHOD_LEAN_NOTE =
  "The likeliest way the bout ends, for either fighter. Experimental: method forecasts are not graded yet.";

export const ROUND_NOTES = [
  "R3+ includes every bout that reaches the judges, as well as every finish in round 3 or later.",
  "“Goes the distance” is the method head’s decision probability, not a separate model, so it cannot disagree with the method bars.",
];

/** The winner head's inputs, in plain words. `keys` are the feature names in fight-model.mjs. */
export const WINNER_INPUTS = Object.freeze([
  { keys: ["winDiff"], text: "Win rate: the difference between the two tracked UFC records, shrunk toward 50% so a short record cannot swing it." },
  { keys: ["finishDiff"], text: "Finish wins: how often each fighter’s tracked bouts end in their KO / TKO or submission win, shrunk toward the corpus rate." },
  { keys: ["durabilityDiff"], text: "Finished in bouts: how often each fighter has been stopped (KO / TKO or submission) in tracked bouts, shrunk toward the corpus rate." },
  { keys: ["expDiff"], text: "Experience: the difference in the number of tracked UFC bouts (on a log scale)." },
  { keys: ["reachDiff", "heightDiff"], text: "Reach and height differences, from the ESPN tale of the tape." },
  { keys: ["ageDiff"], text: "Age difference on the day of the bout, from the listed dates of birth." },
  { keys: ["stanceMismatch"], text: "Stance mismatch: whether the two listed stances differ." },
  { keys: ["hasTott"], text: "Whether both fighters have a tale of the tape on file, so a missing measurement is never read as an equal one." },
]);

export const OTHER_HEADS_NOTE =
  "The method and round heads use different inputs: the pair’s combined finish and decision tendencies, the " +
  "division’s finish rates and whether the bout is scheduled for five rounds. They do not use the tale of the tape.";

export const NOT_USED_NOTE =
  "Not used by any head: betting odds, striking or grappling statistics (strikes per minute, takedowns, submission " +
  "attempts), injuries, camps or news.";

export const ATTRIBUTION_HEADLINE = "Per-fight attributions are not published yet.";
export const ATTRIBUTION_STATUS =
  "The page can say what the winner head reads, but not how much each " +
  "input counted for this bout: that needs the card builder to publish the model’s fitted coefficients, which is a " +
  "separate change to the producer. Until then, nothing on this page ranks or weighs the inputs for this bout.";
