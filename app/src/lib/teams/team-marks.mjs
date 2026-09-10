/**
 * TEAM MARKS — resolve a team NAME as it appears in a leg to the ABBREVIATION a logo needs.
 *
 * WHY THIS EXISTS. The Bank Builder ladder drew a soccer ball beside "New York Yankees to win". Its
 * avatar resolver only understood World Cup country codes — a leftover from a product that has been
 * retired since — so every MLB and NFL leg fell through to a generic emoji. TeamLogo was right
 * there and could not be called, because it needs an abbreviation and a leg carries prose: a
 * selection string, and a matchup like "Colorado Rockies @ New York Yankees".
 *
 * BUILT FROM LIVE ARTIFACTS, NOT TYPED. The MLB board already publishes `homeTeamName` beside
 * `homeTeamAbbr` for every game, and the NFL schedule does the same. Reading the pairing from the
 * data that will actually be rendered means the map cannot drift from the feed, cannot go stale
 * when a team is renamed, and needs no 62-row table anybody has to maintain. A name this index has
 * never seen resolves to null and the caller falls back — a missing crest is a small blemish, a
 * WRONG crest is a lie about which team a leg is on.
 *
 * MATCHING IS DELIBERATELY CONSERVATIVE. Selections are prose ("New York Yankees to win", "Houston
 * Astros +1.5"), so the longest team name contained in the string wins. Longest matters: "New York
 * Yankees" and "New York Mets" share a prefix, and a shorter accidental match would put the wrong
 * logo on the row — the exact failure this whole file is meant to avoid.
 */

/** Normalise a team name or abbreviation to a comparison key. */
export function normaliseTeam(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Build the index from whatever artifacts a caller has.
 *
 * @param {object} sources
 * @param {Array<{homeTeamName?:string,homeTeamAbbr?:string,awayTeamName?:string,awayTeamAbbr?:string}>} [sources.mlbGames]
 * @param {Array<{home?:{name?:string,abbr?:string},away?:{name?:string,abbr?:string}}>} [sources.nflRows]
 * @returns {Map<string,{abbr:string,sport:string,name:string}>}
 */
export function buildTeamMarkIndex({ mlbGames = [], nflRows = [] } = {}) {
  const index = new Map();
  const put = (name, abbr, sport) => {
    if (!name || !abbr) return;
    const mark = { abbr: String(abbr).toLowerCase(), sport, name: String(name) };
    const key = normaliseTeam(name);
    if (key && !index.has(key)) index.set(key, mark);
    /* The ABBREVIATION is indexed too, because half this project's surfaces render "DET @ IND"
       rather than full club names. It is only ever matched EXACTLY (see resolveTeamMark) — a
       three-letter substring scan would find "TB" inside "TBD" and put a crest on a row about a
       pitcher nobody has named yet. */
    const abbrKey = normaliseTeam(abbr);
    if (abbrKey && !index.has(abbrKey)) index.set(abbrKey, mark);
  };
  for (const g of mlbGames ?? []) {
    put(g?.homeTeamName, g?.homeTeamAbbr, "mlb");
    put(g?.awayTeamName, g?.awayTeamAbbr, "mlb");
  }
  for (const r of nflRows ?? []) {
    put(r?.home?.name, r?.home?.abbr, "nfl");
    put(r?.away?.name, r?.away?.abbr, "nfl");
  }
  return index;
}

/**
 * Find the team a selection is about.
 *
 * Prefers the longest name contained in the selection, so "New York Yankees" cannot lose to a
 * shorter sibling. Returns null when nothing matches — never a guess.
 */
export function resolveTeamMark(selection, index) {
  const hay = normaliseTeam(selection);
  if (!hay || !index?.size) return null;
  /* An EXACT hit is unambiguous at any length, which is how a bare abbreviation resolves without
     opening the door to short substring matches below. */
  const exact = index.get(hay);
  if (exact) return exact;
  let best = null;
  for (const [key, mark] of index) {
    if (key.length < 4) continue; // too short to be a safe substring match
    if (!hay.includes(key)) continue;
    if (!best || key.length > normaliseTeam(best.name).length) best = mark;
  }
  return best;
}

/**
 * The two teams in a matchup string, in order, when both can be resolved.
 *
 * Used for a leg whose selection names no team — a total, say — where the honest mark is the two
 * clubs playing rather than nothing at all.
 */
export function resolveMatchupMarks(matchup, index) {
  const raw = String(matchup ?? "");
  // "@", "vs", "v" and "at" — the sports hub writes "X at Y" where the boards write "X @ Y".
  const parts = raw.split(/\s+(?:@|vs\.?|v|at)\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const marks = parts.map((p) => resolveTeamMark(p, index));
  return marks[0] && marks[1] ? { away: marks[0], home: marks[1] } : null;
}
