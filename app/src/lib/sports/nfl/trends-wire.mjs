/**
 * NFL TRENDS WIRE FORMAT — the /nfl/trends rows as the client table receives them. PURE, no imports, client-safe.
 *
 * WHY: the table is a client island (filters run in the browser), so every row ships in the page's RSC payload. As
 * plain objects a 13-game slate (561 rows, build instant 2026-11-13) was 272 KB of row JSON (~312 KB escaped in the
 * HTML). Packed: games, players and families are listed once and referenced by index; each row is a short array of the
 * fields the table renders; trailing nulls are dropped; the constant "nfl-athlete-" id prefix and the dominant
 * "ELIGIBLE" eligibility are implied; a line state is an index into `s`, and a line caption ("55.5 at DraftKings,
 * captured Nov 15, 12:00 PM ET") travels as [line text, index of its repeated " at <book>, captured <time>" tail in
 * `s`]. NOT sent, because the row already determines them: games5 / recorded5 / noStatLine5 / tdGames5 (the length,
 * non-null count, null count and count above zero of last5 — summary() over the same five entries) and the opponent
 * (the other side of the game's "AWAY @ HOME" matchup, as trends-rows.mjs derives it); packTrendRows THROWS if a row
 * ever disagrees. A zero push count beside an observed line is implied. Every other number is the server's.
 * unpackTrendRows(packTrendRows(rows)) returns the rendered fields of every row unchanged, and the table renders the
 * same bytes from either (components/nfl/trends-weight.test.mjs).
 */

const ID_PREFIX = "nfl-athlete-";
/** observed-line states (trends-rows.mjs OBSERVED_LINE_STATES): their rows always carry a push count */
const OBSERVED = ["COMPLETE", "INCOMPLETE", "SHORT_SAMPLE"];
/** the row fields after (game, player, family), in wire order */
const FIELDS = ["last5", "median5", "median10", "projection", "probability", "vsProjection", "lineState", "line", "badge", "pushes"];
/** trends-rows.mjs: `const [away, home] = matchup.split(" @ "); opponent = team === home ? away : home` */
const opponentOf = (matchup, team) => { const [away, home] = String(matchup ?? "").split(" @ "); return (team === home ? away : home) ?? null; };
/** the counts last5 determines (summary(log, family, 5) over the same entries) */
const counts = (last5, family) => {
  const recorded = last5.filter((v) => v != null);
  return { games5: last5.length, recorded5: recorded.length, noStatLine5: last5.length - recorded.length, tdGames5: family === "anytime_td" ? recorded.filter((v) => v > 0).length : null };
};

/**
 * @param {any[]} rows buildTrendRows output (kickoff order)
 * @returns {{ v: 1, g: [string, string][], p: [string, string, string, string, string?][], f: [string, string][], s: string[], r: any[][] }}
 */
export function packTrendRows(rows) {
  const g = [], p = [], f = [], s = [], gi = new Map(), pi = new Map(), fi = new Map(), si = new Map();
  const str = (v) => idx(si, s, v, () => v);
  const idx = (map, list, key, make) => { if (!map.has(key)) { map.set(key, list.length); list.push(make()); } return map.get(key); };
  const r = (rows ?? []).map((x) => {
    const id = String(x.playerId);
    const c = counts(x.last5 ?? [], x.family);
    for (const k of Object.keys(c)) if ((x[k] ?? null) !== c[k]) throw new Error(`trends-wire: ${x.playerId} ${x.family} ${k}=${x[k]} is not what last5 implies (${c[k]})`);
    const a = [
      idx(gi, g, x.eventId, () => [String(x.eventId), x.matchup ?? ""]),
      idx(pi, p, `${x.eventId}|${id}`, () => {
        if ((x.opponent ?? null) !== opponentOf(x.matchup, x.team)) throw new Error(`trends-wire: ${x.playerId} opponent ${x.opponent} is not the other side of ${x.matchup}`);
        const t = [id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : `=${id}`, x.name ?? "", x.team ?? ""];
        if (x.eligibility !== "ELIGIBLE") t.push(x.eligibility ?? null);
        return t;
      }),
      idx(fi, f, x.family, () => [x.family, x.label]),
      ...FIELDS.map((k) => {
        const v = x[k] === undefined ? null : x[k];
        if (v == null) return null;
        if (k === "lineState") return str(v);
        if (k === "line") { const i = v.indexOf(" at "); return i < 0 ? [v, -1] : [v.slice(0, i), str(v.slice(i))]; }
        if (k === "pushes" && v === 0 && x.lineState != null) return null; // implied below
        return v;
      }),
    ];
    while (a.length > 3 && a[a.length - 1] == null) a.pop();
    return a;
  });
  return { v: 1, g, p, f, s, r };
}

/** @param {ReturnType<typeof packTrendRows>} w @returns {any[]} rows with the fields the table renders */
export function unpackTrendRows(w) {
  if (!w || w.v !== 1) return [];
  return w.r.map((a) => {
    const [eventId, matchup] = w.g[a[0]];
    const [pid, name, team, elig] = w.p[a[1]];
    const [family, label] = w.f[a[2]];
    const row = {
      eventId, matchup, playerId: pid.startsWith("=") ? pid.slice(1) : ID_PREFIX + pid, name, team, opponent: opponentOf(matchup, team),
      eligibility: w.p[a[1]].length > 3 ? elig : "ELIGIBLE", family, label,
    };
    FIELDS.forEach((k, i) => {
      const v = a[3 + i] === undefined ? null : a[3 + i];
      row[k] = v == null ? null : k === "lineState" ? w.s[v] : k === "line" ? (v[1] < 0 ? v[0] : v[0] + w.s[v[1]]) : v;
    });
    if (row.last5 == null) row.last5 = [];
    Object.assign(row, counts(row.last5, family));
    if (row.pushes == null && OBSERVED.includes(row.lineState)) row.pushes = 0;
    return row;
  });
}
