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
