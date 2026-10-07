/**
 * WHO TOOK PART IN A GAME-LEVEL FORECAST (2026-10-05 audit, A1) — so "how have your Arsenal forecasts done?" can reach
 * the ~2,850 game-level ledger rows (MLB moneyline / run line / total, NFL winner / total / margin, EPL 1X2 / over 2.5,
 * UFC winner). Those rows are keyed by the GAME: their `teamId` is null, so a team or fighter filter matched nothing.
 *
 * THE JOIN IS BY CODE, NOT BY GUESS. Each side of the row's own `matchup` is mapped to an Ask entity by a key that names
 * exactly one entity in that sport, or not at all:
 *
 *   MLB, NFL   "AWAY @ HOME" abbreviations → the team entity whose `hint` is that abbreviation. Cross-checked in the
 *              tests against independent ids for the same game: MLB StatsAPI's away/home team ids by gamePk, and the
 *              ledger's own NFL team-score rows for the same event (every checked game agreed on both sides).
 *   EPL        "HOME v AWAY" club names → the club entity whose folded label is exactly that name.
 *   UFC        "A vs B" fighter names → the fighter entity whose folded label is exactly that name. Many fighters have
 *              no Ask entity (no research page); their side is simply left out, never matched loosely.
 *
 * FAIL CLOSED. A key that names zero or several entities joins nothing. Both sides naming the same entity joins nothing.
 * A row this cannot join stays reachable by its game exactly as before; it is never attached to a guessed team.
 */

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SHAPES = {
  MLB: { re: /^(\S+) @ (\S+)$/, kind: "team", key: (e) => e.hint, norm: (s) => s },
  NFL: { re: /^(\S+) @ (\S+)$/, kind: "team", key: (e) => e.hint, norm: (s) => s },
  EPL: { re: /^(.+) v (.+)$/, kind: "team", key: (e) => fold(e.label), norm: fold },
  UFC: { re: /^(.+) vs (.+)$/, kind: "player", key: (e) => fold(e.label), norm: fold },
};

/** Build a reusable joiner over the Ask entity list. Keys shared by several entities are dropped up front. */
export function makeParticipantJoiner(entities) {
  const tables = {};
  for (const [sport, shape] of Object.entries(SHAPES)) {
    const counts = new Map();
    const byKey = new Map();
    for (const e of entities ?? []) {
      if (e.sport !== sport || e.kind !== shape.kind) continue;
      const k = shape.key(e);
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      byKey.set(k, e);
    }
    tables[sport] = new Map([...byKey].filter(([k]) => counts.get(k) === 1));
  }

  /**
   * The joined sides of one ledger row, as [[entityId, label], …], or null when the row is not a game-level row or
   * no side joined. Sides that do not join are omitted.
   */
  return function participantsOf(row) {
    if (!row || (row.subjectType !== "GAME" && row.subjectType !== "BOUT")) return null;
    const sport = String(row.sport ?? "").toUpperCase();
    const shape = SHAPES[sport];
    if (!shape) return null;
    const m = shape.re.exec(String(row.matchup ?? ""));
    if (!m) return null;
    const sides = [m[1], m[2]].map((s) => tables[sport].get(shape.norm(s.trim())) ?? null);
    if (sides[0] && sides[1] && sides[0].id === sides[1].id) return null;
    const joined = sides.filter(Boolean).map((e) => [e.id, e.label]);
    return joined.length ? joined : null;
  };
}

/*
 * THE SIDE A PROBABILITY ROW IS FOR, IN WORDS. A readable direction ("SEA (home)", "UNDER 9", "Jacobe Smith wins") is
 * returned as is — the Results family page shows it beside the percentage. Of the enum directions, only the two
 * GAME-level ones are put in words; the ledger's probability is of that event (its observed / finalCategory agree:
 * HOME_WIN observed 1 ⇔ finalCategory HOME), so a team's history can say WHICH side 20.1% was for. Every other enum
 * (SCORES_TD, HITS_HOME_RUN …) is a player's own event and returns null, so the evidence keeps "gave it".
 */
const ENUM_CALLS = {
  HOME_WIN: (r) => {
    const home = /^\S+ @ (\S+)$/.exec(r.matchup ?? "")?.[1];
    return home ? `${home} (home) to win` : null;
  },
  OVER_2_5_GOALS: () => "over 2.5 goals",
};

export function readableCall(row) {
  if (row?.forecastKind !== "BINARY_PROBABILITY" || !row.direction) return null;
  if (!/^[A-Z0-9_]+$/.test(row.direction)) return row.direction;
  return row.subjectType === "GAME" && ENUM_CALLS[row.direction] ? ENUM_CALLS[row.direction](row) : null;
}
