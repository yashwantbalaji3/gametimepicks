/**
 * ONE RULE FOR SPLITTING A MATCHUP LABEL.
 *
 * ⚠ ESPN DOES NOT ALWAYS WRITE "AWAY @ HOME". For a neutral-site game it writes `VS`:
 *
 *     BAL VS DAL   away BAL · home DAL · Maracanã Stadium
 *     IND VS WSH   away IND · home WSH · Tottenham Hotspur Stadium
 *
 * Four places split this label on `@`, and every one of them broke on that form — each in its own
 * way, which is why no single symptom would have found them:
 *
 *   build-nfl-weekly-boards  `opponentOf` returned the WHOLE STRING, so a public board would print
 *                            both teams' opponent as "BAL VS DAL"
 *   share-level-board        failed closed and returned null — a feature silently absent
 *   probe-nfl-live-odds      `matchEvent` returned false, so the ONE authorized 3-credit Phase H
 *                            probe could be spent on a game it then could not find, recording a
 *                            false LIVE_MARKET_UNSUPPORTED and closing the lane
 *   capture-nfl-live-odds    the same failed join in the pilot, plus a latent throw: without the
 *                            probe's both-halves guard, a label with no separator at all reaches
 *                            `home.slice(0, 5)` with `home` undefined
 *
 * ⚠ THE ORDER IS AWAY-FIRST IN BOTH FORMS, AND THAT IS VERIFIED, NOT ASSUMED. A `VS` label that
 * happened to be home-first would invert two clubs silently, which is far worse than a blank. The
 * schedule capture carries structured `home.abbr` / `away.abbr` beside every `shortName`, so
 * `matchupAgreesWithRow` below checks the label against the row's own truth — and a test runs it over
 * every row of the committed capture. If ESPN ever ships a home-first form, that guard goes red
 * instead of this file quietly swapping two teams.
 *
 * PREFER THE STRUCTURED FIELDS. Where a caller holds the schedule row or the board's two clubs, it
 * should read those and never come here. This exists for the callers that only have the label.
 */

/** Every separator ESPN has been observed to use, longest first so `vs.` wins over `vs`. */
const SEPARATOR = /\s+(?:@|vs\.|vs|at)\s+/i;

/**
 * Split a matchup label into its two clubs.
 *
 * @returns `{ away, home }` — both strings, or both `null` when the label does not name two clubs.
 *          Never a partial result: a caller that got a truthy `away` and an undefined `home` is
 *          exactly how the weekly board came to print a whole label as an opponent.
 */
export function splitMatchup(matchup) {
  const parts = String(matchup ?? "").trim().split(SEPARATOR).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2 || parts[0] === parts[1]) return { away: null, home: null };
  return { away: parts[0], home: parts[1] };
}

/** The opponent of `team` in `matchup`, or null when the label cannot be read. */
export function opponentIn(matchup, team) {
  const { away, home } = splitMatchup(matchup);
  if (!away || !home) return null;
  if (team === away) return home;
  if (team === home) return away;
  return null;
}

/**
 * Does a label agree with the structured row it came from?
 *
 * This is the guard that keeps the away-first claim honest. It is deliberately strict: a label that
 * names the right two clubs in the WRONG ORDER fails, because that is the failure that would publish
 * a road team as the host.
 *
 * @returns `{ ok: true }`, or `{ ok: false, reason }`.
 */
export function matchupAgreesWithRow(row) {
  const label = row?.shortName ?? null;
  const away = row?.away?.abbr ?? null;
  const home = row?.home?.abbr ?? null;
  if (!label) return { ok: false, reason: "the row carries no shortName" };
  if (!away || !home) return { ok: false, reason: "the row carries no structured home/away abbreviations" };
  const split = splitMatchup(label);
  if (!split.away || !split.home) return { ok: false, reason: `"${label}" does not split into two clubs — an unrecognised separator` };
  if (split.away === home && split.home === away) return { ok: false, reason: `"${label}" is HOME-FIRST — it names ${home} before ${away}, and away-first is assumed everywhere` };
  if (split.away !== away || split.home !== home) return { ok: false, reason: `"${label}" splits to ${split.away}/${split.home} but the row says away ${away}, home ${home}` };
  return { ok: true };
}
