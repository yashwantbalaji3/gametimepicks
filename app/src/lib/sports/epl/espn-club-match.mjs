/**
 * ESPN ↔ EPL CLUB MATCHING for the player-projection lane — exact canonical identity, never containment.
 *
 * ESPN spells one club "AFC Bournemouth" while every EPL artifact says "Bournemouth". The player scripts used to
 * bridge that two ways, both wrong: event lookup accepted SUBSTRING containment ("never guess identity", broken),
 * and the lineup's home/away side was an exact letters-only compare, so "afcbournemouth" !== "bournemouth" sent BOTH
 * lineups to "away". On Bournemouth v Brentford (2026-09-12) every Bournemouth player was allocated Brentford's
 * goal distribution. docs/EPL_PLAYER_PROJECTION_IDENTITY.md records the published rows that carry it.
 *
 * Every comparison here goes through ONE resolver — `buildEplClubIndex().resolve` from lib/soccer/epl-clubs.ts,
 * the canonical alias table — injected so this module stays pure. A name the table cannot place resolves to null
 * and the match is refused; nothing is inferred from partial strings.
 */

/** Canonical club name for a provider spelling, or null when the table cannot place it (unknown or ambiguous). */
function canonicalOf(resolve, name) {
  return resolve(name)?.canonical ?? null;
}

/**
 * The scoreboard event for a fixture: exactly one event whose home AND away clubs resolve to the fixture's clubs.
 * Zero or several candidates → null. Returns { id, home, away } with ESPN's own spellings.
 *
 * @param {Array<object>} events      ESPN scoreboard `events`
 * @param {{ homeClub: string, awayClub: string }} fixture
 * @param {(name: string) => ({ canonical: string } | null)} resolve
 */
export function matchEspnEvent(events, fixture, resolve) {
  const home = canonicalOf(resolve, fixture?.homeClub);
  const away = canonicalOf(resolve, fixture?.awayClub);
  if (!home || !away || home === away) return null;
  const hits = [];
  for (const ev of events ?? []) {
    const c = ev?.competitions?.[0];
    const h = c?.competitors?.find((x) => x.homeAway === "home")?.team?.displayName;
    const a = c?.competitors?.find((x) => x.homeAway === "away")?.team?.displayName;
    if (!h || !a) continue;
    if (canonicalOf(resolve, h) === home && canonicalOf(resolve, a) === away) hits.push({ id: String(ev.id), home: h, away: a });
  }
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The side ("home" | "away") of each posted lineup, by canonical club. The two lineups must resolve to exactly the
 * fixture's home club and away club, one each; otherwise null — the caller treats the lineup as not usable rather
 * than allocate a team's goals to the wrong eleven.
 *
 * @param {Array<{ teamName: string }>} lineup
 * @param {{ homeClub: string, awayClub: string }} fixture
 * @param {(name: string) => ({ canonical: string } | null)} resolve
 * @returns {Array<"home"|"away"> | null}  one side per lineup entry, in order
 */
export function lineupSides(lineup, fixture, resolve) {
  const home = canonicalOf(resolve, fixture?.homeClub);
  const away = canonicalOf(resolve, fixture?.awayClub);
  if (!home || !away || home === away || !Array.isArray(lineup) || lineup.length !== 2) return null;
  const sides = lineup.map((t) => {
    const c = canonicalOf(resolve, t?.teamName);
    return c === home ? "home" : c === away ? "away" : null;
  });
  if (sides.includes(null) || sides[0] === sides[1]) return null;
  return sides;
}

/**
 * The squad for a fixture club, keyed by canonical club. `squads` is the squads artifact's array; a club the table
 * cannot place, or one claimed by two squads, gives null.
 */
export function squadForClub(squads, club, resolve) {
  const want = canonicalOf(resolve, club);
  if (!want) return null;
  const hits = (squads ?? []).filter((s) => canonicalOf(resolve, s?.teamName) === want);
  return hits.length === 1 ? hits[0] : null;
}
