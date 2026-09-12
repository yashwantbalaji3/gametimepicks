/**
 * A PITCHER PROP THAT IS KNOWABLY THE PROBABLE PITCHER OF ITS OWN GAME (P286).
 *
 * The odds provider names players; MLB Stats API numbers them. A board carries both — the game's
 * `awayProbablePitcherId`/`Name` from Stats API, and prop rows whose `playerName` is the provider's
 * spelling and whose `playerId` is null until something joins them. When the two spellings differ
 * only in the short form or punctuation of a given name — "Zach Thornton" against "Zac Thornton",
 * "Samuel Aldegheri" against "Sam Aldegheri", "JT Ginn" against "J.T. Ginn" — a normalised-name
 * join returns nothing, and the row carries the same empty identity as a prop for a player we
 * genuinely cannot place.
 *
 * That is the actual harm: the gap is INVISIBLE. 163 pitcher props across the committed corpus
 * carry a null id, and nothing distinguishes the 30 whose subject is named, with an id, in the
 * same file — three people, one of them appearing on sixteen rows.
 *
 * This module only DETECTS. It does not join, and it must not: the producer of these boards is not
 * in this repository, so a merge performed here would be a guess applied after the fact to an
 * artifact its own generator will overwrite. The right repair is an alias keyed by the Stats API
 * id at ingest. Until that exists, the set of affected people is bounded, recorded by id, and a
 * third one cannot arrive unnoticed.
 *
 * Deliberately strict, because a false join is worse than no join:
 *   · the surname must match exactly after normalisation,
 *   · the given names must be prefix-related one way or the other (Sam ⊂ Samuel; Zac ⊂ Zach),
 *   · the game must have exactly ONE probable pitcher the row could mean — two candidates with the
 *     same surname is precisely the case where guessing picks the wrong brother.
 * An exact name match is not reported: that row either joined or failed for some other reason, and
 * this detector is about the spelling gap alone.
 */

/** Accent-folded, lower-case, letters and single spaces only. */
export function normaliseName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const parts = (name) => {
  const n = normaliseName(name);
  if (!n) return null;
  const words = n.split(" ");
  return { full: n, given: words[0], surname: words[words.length - 1] };
};

const prefixRelated = (a, b) => a !== b && (a.startsWith(b) || b.startsWith(a));

/**
 * @param {{games?: Array<Record<string, any>>, leans?: Array<Record<string, any>>, date?: string}} board
 * @returns {Array<{date: string|null, gamePk: any, statsApiId: any, statsApiName: string, providerName: string, marketKey: string|null}>}
 */
export function nearMissPitcherIdentities(board) {
  /** gamePk → the probable pitchers Stats API named for that game. */
  const probables = new Map();
  for (const g of board?.games ?? []) {
    for (const side of ["away", "home"]) {
      const id = g?.[`${side}ProbablePitcherId`];
      const name = g?.[`${side}ProbablePitcherName`];
      if (id == null || !name) continue;
      const list = probables.get(g.gamePk) ?? [];
      list.push({ id, name });
      probables.set(g.gamePk, list);
    }
  }

  const found = [];
  for (const row of board?.leans ?? []) {
    if (row?.playerId != null) continue;          // already carries an identity
    if (row?.playerRole !== "pitcher") continue;  // only the probable-pitcher pairing is knowable
    const rowName = parts(row?.playerName);
    if (!rowName) continue;

    const candidates = (probables.get(row.gamePk) ?? [])
      .map((c) => ({ ...c, p: parts(c.name) }))
      .filter((c) => c.p && c.p.surname === rowName.surname);
    // Exactly one candidate, or we would be choosing between people.
    if (candidates.length !== 1) continue;
    const c = candidates[0];
    if (c.p.full === rowName.full) continue;                  // the spellings agree; not this defect
    if (!prefixRelated(c.p.given, rowName.given)) continue;   // a different given name is a different person

    found.push({
      date: board?.date ?? null,
      gamePk: row.gamePk,
      statsApiId: c.id,
      statsApiName: c.name,
      providerName: row.playerName,
      marketKey: row.marketKey ?? null,
    });
  }
  return found;
}
