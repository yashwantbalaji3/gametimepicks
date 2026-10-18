/**
 * SIMULATION THEATER V2 · TRANSPORT PACK (`theater-pack@1`). Pure, lossless.
 *
 * The adapter's TheaterManifest is verbose JSON (≈67 KB for one receipt's five samples, almost all of it repeated
 * field names). The island receives it as a server → client prop, so every byte is inlined into the page's RSC payload.
 * This codec ships the SAME values in a columnar form and rebuilds the manifest on the client:
 *
 *   - drive events become fixed-order rows of numbers; strings (offense, result, result label) go through one string
 *     table; booleans become 0/1
 *   - fields the adapter itself derives from neighbouring rows are NOT shipped and are rebuilt exactly:
 *       index = row position · kind = "DRIVE_SUMMARY" · participants = null
 *       scoreBefore = the previous row's scoreAfter (0–0 for the first) · delta = scoreAfter − scoreBefore
 *     `pack` REFUSES (throws) any manifest where one of those identities does not hold, so a future adapter change can
 *     never be silently "corrected" by the decoder
 *   - batch histograms become two parallel arrays
 *
 * unpackTheater(packTheater(m)) is byte-identical to m under JSON.stringify (same keys, same order, same values): the
 * receipt id, receipt hash and every drive field are unchanged. theater-pack.test.mjs proves it for every receipt on disk.
 */

export const PACK_VERSION = "theater-pack@1";

/** Row columns, in the adapter's key order. `t`: n number · b boolean · s string-table index · side home/away/null. */
const EV_COLS = Object.freeze([
  ["engineQ", "n"], ["inOT", "b"], ["period", "n"], ["periodClockStart", "n"], ["periodEnd", "n"], ["periodClockEnd", "n"],
  ["clockStart", "n"], ["clockEnd", "n"], ["scorePeriod", "n"], ["offense", "side"], ["fieldStart", "n"], ["fieldEnd", "n"],
  ["plays", "n"], ["netYards", "n"], ["seconds", "n"], ["outcome", "s"], ["outcomeLabel", "s"], ["scoring", "b"],
  ["scoringSide", "side"],
]);
const SIDE = ["home", "away"];
const encSide = (v) => (v === null ? -1 : SIDE.indexOf(v));
const decSide = (v) => (v === -1 ? null : SIDE[v]);

function fail(msg) {
  throw new Error(`theater-pack: ${msg}`);
}

/**
 * @param {object} manifest an adapted TheaterManifest (adapter-nfl-sim-v2.mjs)
 * @returns {object} the pack (plain JSON)
 */
export function packTheater(manifest) {
  const strings = [];
  const str = (s) => {
    if (typeof s !== "string") fail(`expected a string, got ${JSON.stringify(s)}`);
    let i = strings.indexOf(s);
    if (i < 0) { i = strings.length; strings.push(s); }
    return i;
  };
  const samples = manifest.samples.map((s) => {
    const rows = [];
    const notes = [];
    let prev = { home: 0, away: 0 };
    s.events.forEach((ev, i) => {
      if (ev.index !== i || ev.kind !== "DRIVE_SUMMARY" || ev.participants !== null) fail(`event ${i} of run ${s.runIndex}: index/kind/participants not derivable`);
      if (ev.scoreBefore.home !== prev.home || ev.scoreBefore.away !== prev.away) fail(`event ${i} of run ${s.runIndex}: scoreBefore is not the previous scoreAfter`);
      if (ev.delta.home !== ev.scoreAfter.home - ev.scoreBefore.home || ev.delta.away !== ev.scoreAfter.away - ev.scoreBefore.away) fail(`event ${i} of run ${s.runIndex}: delta is not after − before`);
      const keys = Object.keys(ev).join(",");
      if (keys !== EVENT_KEYS) fail(`event ${i} of run ${s.runIndex}: unexpected keys ${keys}`);
      const row = EV_COLS.map(([k, t]) => (t === "b" ? (ev[k] ? 1 : 0) : t === "s" ? str(ev[k]) : t === "side" ? encSide(ev[k]) : ev[k]));
      row.push(ev.scoreAfter.home, ev.scoreAfter.away);
      rows.push(row);
      if (ev.notes.length) notes.push([i, ev.notes]);
      prev = ev.scoreAfter;
    });
    const { events: _e, lanes, ...head } = s;
    return { h: head, E: rows, N: notes, L: lanes };
  });
  const { samples: _s, batch, ...rest } = manifest;
  const { totalHistogram, marginHistogram, ...batchRest } = batch ?? {};
  const hist = (h) => [h.map((x) => x.value), h.map((x) => x.probability)];
  return {
    v: PACK_VERSION,
    m: rest, // every manifest field except samples and batch, verbatim
    k: Object.keys(manifest), // the manifest's key order, restored on decode
    b: batch ? { ...batchRest, th: hist(totalHistogram), mh: hist(marginHistogram), bk: Object.keys(batch) } : null,
    s: strings,
    r: samples,
  };
}

const EVENT_KEYS = "index,kind,engineQ,inOT,period,periodClockStart,periodEnd,periodClockEnd,clockStart,clockEnd,scorePeriod,offense,fieldStart,fieldEnd,plays,netYards,seconds,outcome,outcomeLabel,scoring,scoringSide,delta,scoreBefore,scoreAfter,notes,participants";

/** Rebuild one sample (events in the adapter's exact key order). */
export function unpackSample(pack, i) {
  const p = pack.r[i];
  const notes = new Map(p.N.map(([idx, n]) => [idx, n]));
  let prev = { home: 0, away: 0 };
  const events = p.E.map((row, idx) => {
    const ev = { index: idx, kind: "DRIVE_SUMMARY" };
    EV_COLS.forEach(([k, t], c) => {
      const v = row[c];
      ev[k] = t === "b" ? v === 1 : t === "s" ? pack.s[v] : t === "side" ? decSide(v) : v;
    });
    const after = { home: row[EV_COLS.length], away: row[EV_COLS.length + 1] };
    ev.delta = { home: after.home - prev.home, away: after.away - prev.away };
    ev.scoreBefore = { home: prev.home, away: prev.away };
    ev.scoreAfter = after;
    ev.notes = notes.get(idx) ?? [];
    ev.participants = null;
    prev = after;
    return ev;
  });
  return { ...p.h, events, lanes: p.L };
}

/** Rebuild the whole manifest. */
export function unpackTheater(pack) {
  if (!pack || pack.v !== PACK_VERSION) throw new Error(`theater-pack: unsupported pack ${pack?.v}`);
  const samples = pack.r.map((_, i) => unpackSample(pack, i));
  let batch;
  if (pack.b) {
    const { th, mh, bk, ...rest } = pack.b;
    const hist = ([vals, probs]) => vals.map((value, j) => ({ value, probability: probs[j] }));
    const filled = { ...rest, totalHistogram: hist(th), marginHistogram: hist(mh) };
    batch = Object.fromEntries(bk.map((k) => [k, filled[k]]));
  }
  const filled = { ...pack.m, samples, batch };
  return Object.fromEntries(pack.k.map((k) => [k, filled[k]]));
}
