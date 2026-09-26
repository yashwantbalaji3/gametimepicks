/**
 * P700 — THE ESPN ↔ FPL PLAYER CROSSWALK (candidate generation only).
 *
 * WHY THIS EXISTS. `EPL_AVAILABILITY_PROVIDER_MATRIX.md` settled the provider question: the
 * Premier League's own FPL API publishes injury, doubt, suspension and unavailability for all 667
 * registered players, free, keyless, typed and timestamped. The remaining cost was identity — our
 * EPL corpus is ESPN-keyed, FPL is keyed by its own id plus an Opta code.
 *
 * ⚠ THIS IS NOT A RUNTIME MATCHER, and must never become one. It builds a COMMITTED artifact of
 * candidates, once, so that a human can review it. Per §9.1 the canonical mapping is the reviewed
 * crosswalk; an exact name match inside the same club is strong deterministic evidence and is
 * labelled `AUTO_EXACT`, not `REVIEWED`. Nothing here applies an availability state to anyone.
 *
 * ⚠ AND UNRESOLVED STAYS UNRESOLVED. The failure this design exists to prevent is attaching an
 * injury to the wrong player. Every path that cannot produce exactly one match inside one club
 * emits `UNRESOLVED` with its reason and, where they exist, the candidates a reviewer should look
 * at. A candidate is never promoted to a mapping by this code.
 *
 * ⚠ ONE CLUB MAP, EXPLICIT. Eighteen of twenty clubs share a three-letter code across the two
 * providers; Manchester City (FPL `MCI` / ESPN `MNC`) and Manchester United (`MUN` / `MAN`) do
 * not. That is an override table of two entries, asserted complete — not a fuzzy club matcher.
 * A club that does not resolve REFUSES rather than dropping its squad silently.
 */

/** The only two clubs whose three-letter code differs between the providers. FPL → ESPN. */
export const FPL_TO_ESPN_CLUB = Object.freeze({ MCI: "MNC", MUN: "MAN" });

/**
 * Three states, ordered by evidence.
 *   AUTO_EXACT    identical normalised full name, unique inside the club — deterministic.
 *   REVIEW_PREFIX one name's tokens are a prefix of the other's, unique inside the club. FPL
 *                 carries the full legal name where ESPN carries the common one ("Mikel Merino
 *                 Zazón" / "Mikel Merino"), so this is strong — and it is still NOT a mapping.
 *                 It is excluded from `availabilityByEspnId` by default: a review queue, sorted
 *                 by strength, not a second auto-matcher wearing a label.
 *   UNRESOLVED    everything else, with whatever candidates a reviewer should look at.
 */
export const ROW_STATES = Object.freeze(["AUTO_EXACT", "REVIEW_PREFIX", "UNRESOLVED"]);

/** Token lists where one is a leading prefix of the other, and neither is a single token. */
export function isTokenPrefix(a, b) {
  const [x, y] = [a.split(" ").filter(Boolean), b.split(" ").filter(Boolean)];
  if (x.length < 2 || y.length < 2 || x.length === y.length) return false;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.every((t, i) => long[i] === t);
}

/** The FPL availability vocabulary, stated rather than inferred. */
export const FPL_STATUS = Object.freeze({
  a: "AVAILABLE", i: "INJURED", d: "DOUBTFUL", s: "SUSPENDED", u: "UNAVAILABLE",
});

/**
 * ⚠ NFD DOES NOT DECOMPOSE A STROKED LETTER. `Ø`, `Đ`, `Ł`, `Æ` and friends are single codepoints
 * carrying no combining mark, so NFD leaves them whole and a bare `[^a-z]` strip DELETES them:
 * "Ødegaard" became "degaard", "Đorđe Petrović" became "or e petrovic". Scandinavian and Slavic
 * names, quietly mangled into non-matches — the same family as the unaccented-provider defect that
 * once produced thousands of "— vs —" rows. Transliterate them explicitly instead of dropping them.
 */
const STROKED = Object.freeze({ "ø": "o", "đ": "d", "ð": "d", "ł": "l", "æ": "ae", "œ": "oe", "ß": "ss", "þ": "th", "ı": "i", "ŋ": "n", "ħ": "h", "ŧ": "t" });

/**
 * Accents stripped, stroked letters transliterated, punctuation dropped, case folded, spaces
 * collapsed. Deliberately conservative beyond that: it does not reorder names, drop particles or
 * take initials, because each of those turns a non-match into a WRONG match — and a wrong match
 * here puts an injury on the wrong player.
 */
export function normaliseName(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, (ch) => STROKED[ch] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** FPL club id → ESPN squad. Refuses unless every FPL club resolves to exactly one ESPN club. */
export function resolveClubs({ fplTeams = [], espnSquads = [] }) {
  const byAbbr = new Map();
  for (const s of espnSquads) {
    const a = String(s?.abbreviation ?? "").toUpperCase();
    if (!a) continue;
    if (byAbbr.has(a)) return { ok: false, reason: `two ESPN squads share the abbreviation ${a}` };
    byAbbr.set(a, s);
  }
  const map = new Map();
  const unresolved = [];
  for (const t of fplTeams) {
    const fplAbbr = String(t?.short_name ?? "").toUpperCase();
    const espnAbbr = FPL_TO_ESPN_CLUB[fplAbbr] ?? fplAbbr;
    const squad = byAbbr.get(espnAbbr);
    if (!squad) { unresolved.push(`${t?.name ?? "?"} (${fplAbbr} → ${espnAbbr})`); continue; }
    map.set(t.id, squad);
  }
  if (unresolved.length) return { ok: false, reason: `${unresolved.length} FPL club(s) did not resolve: ${unresolved.join(", ")}`, map };
  return { ok: true, map };
}

/**
 * One row per FPL element. `AUTO_EXACT` when exactly one ESPN player in the SAME club has the same
 * normalised full name; `UNRESOLVED` otherwise, always with a reason.
 */
export function buildCrosswalk({ fplElements = [], fplTeams = [], espnSquads = [] }) {
  const clubs = resolveClubs({ fplTeams, espnSquads });
  if (!clubs.ok) return { ok: false, reason: clubs.reason, rows: [] };

  /* Per club: normalised name → the ESPN players carrying it. A name shared by two squad members
     is AMBIGUOUS and resolves to neither — picking the first would be a coin flip on identity. */
  const indexByClub = new Map();
  for (const squad of espnSquads) {
    const idx = new Map();
    for (const p of squad?.players ?? []) {
      const k = normaliseName(p?.name);
      if (!k) continue;
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(p);
    }
    indexByClub.set(squad.teamId, idx);
  }

  const rows = [];
  for (const e of fplElements) {
    const squad = clubs.map.get(e?.team);
    const base = {
      fplId: e?.id ?? null,
      fplCode: e?.code ?? null,
      optaCode: e?.opta_code ?? null,
      fplName: `${e?.first_name ?? ""} ${e?.second_name ?? ""}`.trim(),
      fplWebName: e?.web_name ?? null,
      clubAbbr: squad?.abbreviation ?? null,
      espnTeamId: squad?.teamId ?? null,
      /* The availability the crosswalk exists to carry — typed, never the editorial prose.
         `news` is free text and is deliberately NOT stored, the same rule the NFL injuries
         contract applies to its own feed. `newsAddedAt` is a timestamp and is kept. */
      availability: FPL_STATUS[e?.status] ?? "UNKNOWN",
      chanceOfPlayingNextRound: e?.chance_of_playing_next_round ?? null,
      newsAddedAt: e?.news_added ?? null,
    };
    if (!squad) { rows.push({ ...base, espnPlayerId: null, state: "UNRESOLVED", reason: "FPL club did not resolve to an ESPN squad", candidates: [] }); continue; }

    const idx = indexByClub.get(squad.teamId) ?? new Map();
    const fplNorm = normaliseName(base.fplName);
    const hits = idx.get(fplNorm) ?? [];
    if (hits.length === 1) {
      rows.push({ ...base, espnPlayerId: String(hits[0].playerId), espnName: hits[0].name, state: "AUTO_EXACT", reason: "exact normalised full name, unique inside the club", candidates: [] });
      continue;
    }
    if (hits.length === 0) {
      const prefixed = (squad.players ?? []).filter((p) => isTokenPrefix(fplNorm, normaliseName(p.name)));
      if (prefixed.length === 1) {
        rows.push({ ...base, espnPlayerId: String(prefixed[0].playerId), espnName: prefixed[0].name, state: "REVIEW_PREFIX", reason: "one name's tokens are a leading prefix of the other's, unique inside the club — awaiting review", candidates: [] });
        continue;
      }
    }
    /* Candidates for a REVIEWER, never a mapping. FPL shortens display names (`Raya` for David
       Raya Martín), so the surname is the useful clue — and a surname that is unique inside the
       club is exactly the kind of evidence a human can confirm in a second. It is still not a
       match, and this code will not make it one. */
    /*
     * ⚠ A SHARED FIRST NAME IS NOT A CANDIDATE. The first cut accepted any one shared token and
     * proposed "Leon Goretzka → Leon Bailey" at Aston Villa. A reviewer shown that once stops
     * trusting the column, so the bar is either TWO shared tokens or one shared token that is not
     * the given name of both. Candidates are a reading order for a human, and a wrong one costs
     * more than a missing one.
     */
    const fplTokens = fplNorm.split(" ").filter((t) => t.length >= 3);
    const fplGiven = fplNorm.split(" ")[0];
    const fplSet = new Set(fplTokens);
    const candidates = (squad.players ?? [])
      .map((p) => ({ p, shared: normaliseName(p.name).split(" ").filter((t) => fplSet.has(t)) }))
      .filter(({ p, shared }) => shared.length >= 2 || shared.some((t) => t !== fplGiven || normaliseName(p.name).split(" ")[0] !== fplGiven))
      .map(({ p, shared }) => ({ espnPlayerId: String(p.playerId), name: p.name, position: p.position ?? null, sharedTokens: shared }));
    rows.push({
      ...base,
      espnPlayerId: null,
      state: "UNRESOLVED",
      reason: hits.length > 1 ? `${hits.length} ESPN players in ${squad.abbreviation} share this normalised name` : "no exact normalised full-name match inside the club",
      candidates,
    });
  }

  const autoExact = rows.filter((r) => r.state === "AUTO_EXACT").length;
  const reviewPrefix = rows.filter((r) => r.state === "REVIEW_PREFIX").length;
  return {
    ok: true,
    rows,
    counts: {
      fplElements: rows.length,
      autoExact,
      reviewPrefix,
      unresolved: rows.length - autoExact - reviewPrefix,
      unresolvedWithOneCandidate: rows.filter((r) => r.state === "UNRESOLVED" && r.candidates.length === 1).length,
      unresolvedWithNoCandidate: rows.filter((r) => r.state === "UNRESOLVED" && r.candidates.length === 0).length,
    },
  };
}

/**
 * THE FAIL-CLOSED READ. The only way availability may be looked up by ESPN id. An unresolved row
 * is absent from the index, so a caller gets `null` and must treat it as unknown — never as
 * available. `AUTO_EXACT` is admitted by default because it is deterministic and unique inside a
 * club; pass `require: ["REVIEWED"]` once a reviewed column exists to tighten it further.
 */
export function availabilityByEspnId(crosswalk, { require: accept = ["AUTO_EXACT", "REVIEWED"] } = {}) {
  const out = new Map();
  for (const r of crosswalk?.rows ?? []) {
    if (!r.espnPlayerId || !accept.includes(r.state)) continue;
    out.set(String(r.espnPlayerId), {
      availability: r.availability,
      chanceOfPlayingNextRound: r.chanceOfPlayingNextRound,
      newsAddedAt: r.newsAddedAt,
      via: { fplId: r.fplId, optaCode: r.optaCode, state: r.state },
    });
  }
  return out;
}
