/**
 * NBA SIMULATION THEATER · POSSESSION EVENT LOG CODEC — one engine event log (nba-possession-sim-v0 events.mjs
 * vocabulary) as a compact LEDGER, and back. PURE, DETERMINISTIC, LOSSLESS, and import-free (browser-safe), so the
 * same module serves the stored artifact and the client island's props (PR 1167 page weight).
 *
 * Packed form (plain JSON, self-describing):
 *   { schema: "nba-possession-events@1", types: [type…], cols: [[column…] per type], ids: [providerAthleteId…],
 *     words: [word…], rows: [[typeIndex, c, poss, ...cols[typeIndex]] per event] }
 * Encodings: player ids (player, assist, block, steal, on, in, out, lineups) → index into `ids` (first-appearance
 * order; `null` stays `null`); booleans (made, fouledOut) → 1 / 0; `kind` → index into `words` (first-appearance
 * order); every other value (c, poss, team, value, n, of, q) verbatim.
 * Fields NOT stored, because the log's own fold rebuilds them (events.mjs header; box.mjs foldRun scores the log the
 * same way): `i` = the row's index; `q` = the last period_start's `q` (stored on period_start only); `s`, the score
 * after the event = the running sum of made shots (`value`) and made free throws (1) by `team`; game_end `final` =
 * that running score.
 * `packEvents` REFUSES (throws) any log it cannot rebuild byte for byte: an unknown type or field, a non-boolean flag,
 * a stored `i` / `q` / `s` / `final` the fold does not reproduce — and it finishes by unpacking its own output and
 * comparing JSON.stringify of the two (key order included), so a stored or shown value can never differ.
 * `unpackEvents` rebuilds each event with the engine's key order: i, q, c, type, poss, the type's fields, (final), s.
 * Pinned for every stored run of every game by possession-wire.test.mjs.
 */
export const EVENT_CODEC_SCHEMA = "nba-possession-events@1";

/** Column header per event type, in the engine's field order. Every row starts [typeIndex, c, poss]. */
export const EVENT_LEDGER = Object.freeze([
  ["period_start", ["q", "lineups"]],
  ["period_end", []],
  ["game_end", []],
  ["jump_ball", ["team"]],
  ["sub", ["team", "in", "out"]],
  ["shot", ["team", "player", "value", "made", "assist", "block"]],
  ["free_throw", ["team", "player", "made", "n", "of"]],
  ["rebound", ["team", "player", "kind"]],
  ["turnover", ["team", "player", "steal"]],
  ["foul", ["team", "player", "on", "kind", "fouledOut"]],
].map(([t, c]) => Object.freeze([t, Object.freeze(c)])));
const BASE = ["i", "q", "c", "type", "poss", "s"];
const PLAYER_COLS = new Set(["player", "assist", "block", "steal", "on", "in", "out"]);
const BOOL_COLS = new Set(["made", "fouledOut"]);
const scores = (type, x) => (type === "shot" || type === "free_throw") && x.made === true;
const refuse = (msg) => { throw new Error(`packEvents: ${msg}`); };
const pair = (a) => Array.isArray(a) && a.length === 2 ? `${a[0]},${a[1]}` : JSON.stringify(a);

/**
 * @param {object[]} events  one stored run's event log, in log order
 * @returns {{ schema: string, types: string[], cols: string[][], ids: string[], words: string[], rows: any[][] }}
 */
export function packEvents(events) {
  if (!Array.isArray(events)) refuse("events must be an array");
  const ids = [], words = [];
  const idAt = new Map(), wordAt = new Map();
  const intern = (list, at, v) => { let k = at.get(v); if (k == null) { k = list.length; at.set(v, k); list.push(v); } return k; };
  const pid = (k, f, v) => {
    if (v == null) return null;
    if (typeof v !== "string") refuse(`event ${k}: ${f} is not a providerAthleteId string`);
    return intern(ids, idAt, v);
  };
  const typeAt = new Map(EVENT_LEDGER.map(([t], k) => [t, k]));
  const s = [0, 0];
  let q = 0;
  const rows = events.map((e, k) => {
    const ti = typeAt.get(e?.type);
    if (ti == null) refuse(`event ${k}: unknown type ${e?.type}`);
    const cols = EVENT_LEDGER[ti][1];
    for (const f of Object.keys(e)) if (!BASE.includes(f) && !cols.includes(f) && !(e.type === "game_end" && f === "final")) refuse(`event ${k} (${e.type}): unknown field ${f}`);
    if (e.i !== k) refuse(`event ${k}: i = ${e.i}`);
    if (e.type === "period_start") q = e.q;
    else if (e.q !== q) refuse(`event ${k}: q = ${e.q}, the period is ${q}`);
    if (scores(e.type, e)) s[e.team] += e.type === "shot" ? e.value : 1;
    if (pair(e.s) !== pair(s)) refuse(`event ${k}: stored score ${JSON.stringify(e.s)} ≠ the fold's [${s}]`);
    if (e.type === "game_end" && pair(e.final) !== pair(s)) refuse(`event ${k}: game_end final ${JSON.stringify(e.final)} ≠ the fold's [${s}]`);
    return [ti, e.c, e.poss, ...cols.map((f) => {
      const v = e[f];
      if (f === "lineups") { if (!Array.isArray(v) || v.length !== 2 || !v.every(Array.isArray)) refuse(`event ${k}: lineups is not [[home], [away]]`); return v.map((side) => side.map((id) => pid(k, f, id))); }
      if (PLAYER_COLS.has(f)) return pid(k, f, v);
      if (BOOL_COLS.has(f)) { if (typeof v !== "boolean") refuse(`event ${k}: ${f} is not a boolean`); return v ? 1 : 0; }
      if (f === "kind") { if (typeof v !== "string") refuse(`event ${k}: kind is not a string`); return intern(words, wordAt, v); }
      return v;
    })];
  });
  const packed = { schema: EVENT_CODEC_SCHEMA, types: EVENT_LEDGER.map(([t]) => t), cols: EVENT_LEDGER.map(([, c]) => [...c]), ids, words, rows };
  if (JSON.stringify(unpackEvents(packed)) !== JSON.stringify(events)) refuse("the packed log does not rebuild the events byte for byte");
  return packed;
}

/**
 * @param {{ schema: string, types: string[], cols: string[][], ids: string[], words: string[], rows: any[][] }} packed
 * @returns {object[]} the event log, field for field and in the engine's key order
 */
export function unpackEvents(packed) {
  if (packed?.schema !== EVENT_CODEC_SCHEMA) throw new Error(`unpackEvents: schema ${packed?.schema} is not ${EVENT_CODEC_SCHEMA}`);
  const { types, cols: header, ids, words, rows } = packed;
  const id = (k) => (k == null ? null : ids[k]);
  const s = [0, 0];
  let q = 0;
  return rows.map((row, i) => {
    const type = types[row[0]];
    const cols = header[row[0]];
    const x = {};
    cols.forEach((f, j) => {
      const v = row[3 + j];
      x[f] = f === "lineups" ? v.map((side) => side.map(id)) : PLAYER_COLS.has(f) ? id(v) : BOOL_COLS.has(f) ? v === 1 : f === "kind" ? words[v] : v;
    });
    if (type === "period_start") q = x.q;
    if (scores(type, x)) s[x.team] += type === "shot" ? x.value : 1;
    const { q: _q, ...fields } = x;
    return { i, q, c: row[1], type, poss: row[2], ...fields, ...(type === "game_end" ? { final: [s[0], s[1]] } : {}), s: [s[0], s[1]] };
  });
}
