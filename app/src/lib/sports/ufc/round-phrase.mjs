/**
 * THE ROUND LABEL, WITH THE NUMBER THAT MAKES IT MEAN SOMETHING (P282).
 *
 * The card printed the argmax of {round 1, round 2, round 3-or-later} as the model's pick, and on
 * 2026-09-12 it read "round 3 or later" for ELEVEN of eleven bouts. That is not the head being
 * confident; it is a bucket that structurally cannot lose. "3 or later" holds rounds 3, 4, 5 AND
 * every decision, so it carried 51%–81% of the mass on every bout on the card — the argmax over
 * those three is "3+" almost by construction.
 *
 * What actually varies is the mass itself: a fight with a 32% chance of ending in round one is a
 * different fight from one at 8.8%, and the old label erased that difference completely. So the
 * phrase now carries the probability of the bucket it names. The head is a validated one (it cleared
 * its preregistered bar at 60.6% against a 55.3% base rate); this changes how it is PRESENTED, not
 * what it says.
 */

/** "round 3 or later (51%)" / "round 1 (44%)" — the bucket, and how much of the distribution it holds. */
export function roundPhrase(rounds) {
  if (!rounds || rounds.endsIn == null) return null;
  const p = rounds.probabilities ?? {};
  const mass = rounds.endsIn === "3+" ? p.round3plus : rounds.endsIn === "2" ? p.round2 : p.round1;
  const label = rounds.endsIn === "3+" ? "round 3 or later" : `round ${rounds.endsIn}`;
  return Number.isFinite(mass) ? `${label} (${Math.round(mass * 100)}%)` : label;
}

/*
 * ONE ROUND READ, EVERYWHERE (Batch 1 · fix #4, 2026-10-29).
 *
 * Production contradicted itself: Cage Chaos printed "R3 or later · distance 47%" while the bout page printed
 * "Round 3 or later 56.4%" — 47% was the DECISION share (goes the distance), not the round-3-or-later mass. The hub
 * paired "Goes the distance 37%" with "Decision · round 3 or later (57%)". Two different quantities sat under labels a
 * reader could not tell apart, at two different roundings.
 *
 * Every UFC surface (the hub card, /cage-chaos, the bout report and its story) now reads its round figures from this
 * accessor, so one label always carries one number:
 *
 *   "Goes the distance"          = rounds.goesTheDistance (the method head's decision probability)
 *   "Ends in round 3 or later"   = rounds.probabilities.round3plus (rounds 3, 4, 5 AND every decision)
 *   "Ends in round 1" / "… 2"    = rounds.probabilities.round1 / round2
 *
 * Nothing is computed: each value is the artifact's own field, formatted once — one decimal, the format the method
 * bars (distribution-chart ProbabilityBar) already print, so "Decision 47.0%" and "Goes the distance 47.0%" match.
 */

/** The one UFC percentage format: 0.5636 → "56.4%", 0.47 → "47.0%". */
export function ufcPct(p) {
  return Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : null;
}

export const UFC_ROUND_LABEL = Object.freeze({
  goesTheDistance: "Goes the distance",
  round1: "Ends in round 1",
  round2: "Ends in round 2",
  round3plus: "Ends in round 3 or later",
});

const ENDS_IN_KEY = { "1": "round1", "2": "round2", "3+": "round3plus" };

/**
 * The round quantities of one bout's published `prediction.rounds`, each with its label and formatted value.
 * @returns {null | Record<"goesTheDistance"|"round1"|"round2"|"round3plus"|"likeliest", null | { key: string, label: string, p: number, pct: string, text: string }>}
 */
export function ufcRoundRead(rounds) {
  if (!rounds || typeof rounds !== "object") return null;
  const probs = rounds.probabilities ?? {};
  const item = (key, v) => (Number.isFinite(v)
    ? { key, label: UFC_ROUND_LABEL[key], p: v, pct: ufcPct(v), text: `${UFC_ROUND_LABEL[key]} ${ufcPct(v)}` }
    : null);
  const likeliestKey = ENDS_IN_KEY[String(rounds.endsIn ?? "")] ?? null;
  return {
    goesTheDistance: item("goesTheDistance", rounds.goesTheDistance),
    round1: item("round1", probs.round1),
    round2: item("round2", probs.round2),
    round3plus: item("round3plus", probs.round3plus),
    likeliest: likeliestKey ? item(likeliestKey, probs[likeliestKey]) : null,
  };
}

const METHOD_NAME = { KO: "KO / TKO", SUB: "Submission", DEC: "Decision" };
const METHOD_KEY = { KO: "ko", SUB: "submission", DEC: "decision" };

/**
 * The likeliest method with ITS OWN probability: "Decision 37.5%". The decision share is the same field "Goes the
 * distance" reads, so the two can never print different numbers.
 */
export function ufcMethodRead(method) {
  if (!method?.most) return null;
  const label = METHOD_NAME[method.most] ?? String(method.most);
  const p = method.probabilities?.[METHOD_KEY[method.most]];
  return { label, p: Number.isFinite(p) ? p : null, text: Number.isFinite(p) ? `${label} ${ufcPct(p)}` : label };
}

/** The verdict line under a model pick: "Decision 37.5% · Ends in round 3 or later 57%". */
export function ufcEndingLine(prediction) {
  const m = ufcMethodRead(prediction?.method);
  const r = ufcRoundRead(prediction?.rounds)?.likeliest;
  if (!m || !r) return null;
  return `${m.text} · ${r.text}`;
}
