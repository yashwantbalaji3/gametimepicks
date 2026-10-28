/**
 * THE UNASSIGNED TIE SHARE, STATED — NEVER REALLOCATED.
 *
 * The NFL Official Forecast publishes a home and an away win chance that sum to about 97%: the rest is
 * the model's chance of a tie after regulation, which it does not hand to either team. How (or whether)
 * to fold that share into the two sides is a pending founder decision, so nothing here changes either
 * number. These helpers only measure what is left over and say so in one plain line wherever the two
 * win-chance bars render — a reader who adds the bars up should not have to wonder where 3% went.
 *
 * The threshold is 99.5%: below it the gap is large enough to be seen by eye in a rounded display.
 */

/** Below this sum the remainder is stated. */
export const TIE_NOTE_THRESHOLD = 0.995;

/**
 * The share of the outcome assigned to neither team, or null when there is nothing to state
 * (sides missing, not probabilities, or summing to at least the threshold).
 * @param {{ home?: number | null, away?: number | null } | null | undefined} wp
 * @returns {number | null}
 */
export function unassignedTieShare(wp) {
  const home = wp?.home, away = wp?.away;
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  if (home < 0 || away < 0 || home > 1 || away > 1) return null;
  const sum = home + away;
  if (sum >= TIE_NOTE_THRESHOLD || sum > 1) return null;
  return 1 - sum;
}

/** "about 3%" — a whole percent (never below 1), because the share is itself a model estimate. */
function aboutPct(share) {
  return `${Math.max(1, Math.round(share * 100))}%`;
}

/**
 * One game's note. Null when nothing is unassigned.
 * @param {{ home?: number | null, away?: number | null } | null | undefined} wp
 */
export function tieNote(wp) {
  const share = unassignedTieShare(wp);
  if (share == null) return null;
  return `About ${aboutPct(share)} chance of a tie after regulation is not assigned to either team.`;
}

/**
 * One note for a list of games (a hub or a week page), stated once under the bars rather than on every
 * row. The range is the smallest and largest whole-percent share across the games that have one.
 * @param {Array<{ home?: number | null, away?: number | null } | null | undefined>} list
 */
export function tieNoteForList(list) {
  const shares = (list ?? []).map(unassignedTieShare).filter((s) => s != null);
  if (!shares.length) return null;
  const lo = aboutPct(Math.min(...shares)), hi = aboutPct(Math.max(...shares));
  const range = lo === hi ? lo : `${lo.replace("%", "")}–${hi}`;
  return `Win chances add up to less than 100%: about ${range} chance of a tie after regulation is not assigned to either team.`;
}
