/**
 * WILL THIS CADENCE SURVIVE THE SEASON?
 *
 * The EPL odds receipt authorises 500 credits cumulative — a circuit breaker, not a wallet. The
 * capture enforces it per call: it refuses the request that would breach the ceiling. That is the
 * right place for a last line of defence and the wrong place to FIND OUT, because the answer
 * arrives in February, mid-season, as every remaining fixture quietly falling to READY_EXCEPT_ODDS.
 *
 * The cadence in the workflow decides the bill months before the ledger notices. Eleven weekly
 * slots at two credits each is 836 credits across 38 matchweeks; the ceiling is 500. Nothing in the
 * repository said so, because nothing multiplied the crons by the season.
 *
 * So the projection is computed from the three real sources and checked: the workflow's OWN cron
 * lines, the committed fixture capture, and the ledger's actual spend to date. No second copy of the
 * cadence, no assumed matchweek shape, no estimated fixture count.
 *
 * THE OTHER HALF — WHY A WINDOW EXISTS AT ALL. The capture had no fixture guard. Every slot called
 * the provider whether or not a match was coming, so a week with no Friday and no Monday fixture
 * still bought prices for both. Buying a price for a slate that does not exist is waste with no
 * upside whatsoever, and it is most of the gap between 836 and 500.
 */

/** Crons of the form `- cron: "M H * * D"`, read from the workflow itself. */
export function parseWeeklySlots(workflowSrc) {
  return [...String(workflowSrc ?? "").matchAll(/-\s*cron:\s*"(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(\d)"/g)]
    .map((m) => ({ minute: Number(m[1]), hour: Number(m[2]), dow: Number(m[3]) }));
}

/** Every instant a weekly slot fires between two times, inclusive of the start. */
export function slotFirings(slot, fromMs, toMs) {
  const out = [];
  const d = new Date(fromMs);
  d.setUTCHours(slot.hour, slot.minute, 0, 0);
  // Step a day at a time and keep the matching weekday. Cheap, and immune to the DST reasoning that
  // makes "add 7 days" wrong twice a year — these are UTC crons, but the fixtures are not.
  for (let t = d.getTime(); t <= toMs; t += 86_400_000) {
    if (t < fromMs) continue;
    if (new Date(t).getUTCDay() === slot.dow) out.push(t);
  }
  return out;
}

/**
 * Would a firing at `atMs` buy anything?
 *
 * Yes only when some fixture kicks off strictly after it and within `windowHours`. Strictly after,
 * because the capture excludes an event already under way — a price for a match in progress is not
 * a pregame price, and the receipt permits pregame only.
 */
export function firingSpends(atMs, kickoffsMs, windowHours) {
  const limit = atMs + windowHours * 3_600_000;
  return kickoffsMs.some((k) => k > atMs && k <= limit);
}

/**
 * Season projection for one cadence.
 *
 * @param fixtures        rows carrying kickoffIso — the committed capture, not a guessed calendar
 * @param slots           weekly cron slots, parsed from the workflow
 * @param creditsPerCall  the provider's own formula: markets x regions. Never hardcoded upstream.
 * @param windowHours     null models the CURRENT behaviour — no fixture guard, every slot spends
 */
export function projectSeasonSpend(fixtures, slots, { fromIso, creditsPerCall, windowHours = null, alreadySpent = 0, ceiling }) {
  const kickoffs = (fixtures ?? []).map((f) => Date.parse(f?.kickoffIso ?? "")).filter(Number.isFinite).sort((a, b) => a - b);
  if (!kickoffs.length) return null;
  const from = Date.parse(fromIso);
  const to = kickoffs[kickoffs.length - 1];

  let firings = 0;
  let spending = 0;
  for (const s of slots) {
    for (const at of slotFirings(s, from, to)) {
      firings += 1;
      if (windowHours == null || firingSpends(at, kickoffs, windowHours)) spending += 1;
    }
  }
  const projectedCredits = spending * creditsPerCall;
  const total = alreadySpent + projectedCredits;
  return {
    remainingFixtures: kickoffs.filter((k) => k > from).length,
    firings,
    spendingFirings: spending,
    skippedFirings: firings - spending,
    creditsPerCall,
    projectedCredits,
    alreadySpent,
    projectedTotal: total,
    ceiling,
    headroom: ceiling - total,
    // The whole question in one word. A cadence that cannot finish the season is a defect that
    // presents months later as a product quietly losing its prices.
    verdict: total <= ceiling ? "WITHIN_CEILING" : "BREACHES_CEILING",
  };
}
