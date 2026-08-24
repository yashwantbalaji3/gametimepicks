/**
 * ONE READER FOR UFC OFFICIAL RESULTS, ACROSS BOTH SOURCES WE ALREADY CAPTURE.
 *
 * We capture two independent records of what happened in a fight and every consumer read only one
 * of them — the slower one. On 2026-08-23 the settler and the model-vs-market grader both reported
 * that the 2026-08-22 card had no official result, while seven of its bouts sat on disk marked
 * STATUS_FINAL with a named winner, captured by our own pipeline nine hours earlier.
 *
 *   · results-latest.json  — a historical CORPUS scraped from ufcstats.com by a third party. Rich
 *                            (method, round, time) and slow: it had reached only 2026-08-15.
 *   · results/latest.json  — our own ESPN MMA scoreboard capture. Winner only, and same-day.
 *
 * THE DISAGREEMENT RULE IS THE POINT. Two sources are more useful than one and more dangerous: the
 * temptation is to prefer whichever answers, which quietly makes the settled record depend on which
 * feed happened to be ahead. So a bout present in both must AGREE, and a bout where they name
 * different winners is refused outright rather than resolved — a contradiction between two official
 * records is not something this layer is entitled to settle, and a wrong winner is worse than a
 * late one. Every returned bout names the source it came from.
 *
 * A DRAW OR NO-CONTEST IS NOT A WINNER. Both sources are read for "who won", and a bout that
 * produced no winner is recorded as VOID rather than being left to look unfought — those are
 * different facts, and only one of them means "wait".
 */

import { boutKey, foldName } from "./model-vs-market.mjs";

export const RESULT_SOURCE = Object.freeze({
  CORPUS: "ufcstats_corpus",
  ESPN: "espn_mma_scoreboard",
  BOTH: "both_sources_agree",
});

const day = (v) => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** The third-party corpus: decisive bouts only, plus draws/no-contests as explicit voids. */
function fromCorpus(doc) {
  const out = new Map();
  for (const r of doc?.results ?? []) {
    const d = day(r.eventDate);
    if (!d) continue;
    const a = r.fighterA ?? r.winner, b = r.fighterB ?? r.loser;
    if (!a || !b) continue;
    const key = r.boutId ?? boutKey(d, a, b);
    if (r.winner && r.loser) {
      out.set(key, { boutId: key, eventDate: d, winner: r.winner, loser: r.loser, void: false, source: RESULT_SOURCE.CORPUS });
    } else {
      out.set(key, { boutId: key, eventDate: d, winner: null, loser: null, void: true, source: RESULT_SOURCE.CORPUS });
    }
  }
  return out;
}

/** Our own ESPN capture: only rows the provider marks FINAL, and only with exactly one winner. */
function fromEspn(doc) {
  const out = new Map();
  for (const r of doc?.rows ?? []) {
    /*
     * KEY BY THE EVENT'S DATE, NOT THE BOUT'S UTC START. A card that begins 21:00 UTC runs its
     * main card past midnight, so day(bout start) lands on the NEXT calendar day — and the
     * snapshot's boutIds are slate-dated. Keying on the bout's own start made the entire 08-22
     * main card (headliner included) unjoinable: the prelims graded, the four bouts after the
     * rollover never could, and the gap read as "results source lagging". eventDateUtc is the
     * provider's own event date; the bout date remains the fallback for captures that predate it.
     */
    const d = day(r.eventDateUtc ?? r.dateUtc ?? r.eventDate);
    const red = r.red?.name, blue = r.blue?.name;
    if (!d || !red || !blue) continue;
    if (String(r.statusRaw ?? "") !== "STATUS_FINAL") continue;    // in progress or scheduled is not a result
    const key = boutKey(d, red, blue);
    const winner = r.redWinner && !r.blueWinner ? red : r.blueWinner && !r.redWinner ? blue : null;
    out.set(key, winner
      ? { boutId: key, eventDate: d, winner, loser: winner === red ? blue : red, void: false, source: RESULT_SOURCE.ESPN }
      : { boutId: key, eventDate: d, winner: null, loser: null, void: true, source: RESULT_SOURCE.ESPN });
  }
  return out;
}

/**
 * @param {object} o
 * @param {object|null} o.corpus  parsed results-latest.json
 * @param {object|null} o.espn    parsed ufc/results/latest.json
 * @returns {{ byBout: Map<string, object>, conflicts: Array<object> }}
 */
export function loadOfficialUfcResults({ corpus = null, espn = null } = {}) {
  const a = fromCorpus(corpus), b = fromEspn(espn);
  const byBout = new Map(a);
  const conflicts = [];
  for (const [key, row] of b) {
    const existing = byBout.get(key);
    if (!existing) { byBout.set(key, row); continue; }
    const same = existing.void === row.void
      && foldName(existing.winner ?? "") === foldName(row.winner ?? "");
    if (!same) {
      /*
       * REFUSED, NOT RESOLVED. Dropping the bout means it stays unsettled and visibly so, which is
       * recoverable. Picking a side would write a winner into an append-only ledger on the strength
       * of a coin toss between two records that disagree.
       */
      byBout.delete(key);
      conflicts.push({ boutId: key, corpus: existing.winner, espn: row.winner });
      continue;
    }
    byBout.set(key, { ...existing, source: RESULT_SOURCE.BOTH });
  }
  return { byBout, conflicts };
}

/** Fighter-name index for ONE card date — the shape a moneyline settler needs. */
export function fighterIndexForDate(byBout, date) {
  const out = new Map();
  for (const r of byBout.values()) {
    if (r.eventDate !== date || r.void || !r.winner || !r.loser) continue;
    out.set(foldName(r.winner), { won: true, boutId: r.boutId, eventDate: r.eventDate, source: r.source });
    out.set(foldName(r.loser), { won: false, boutId: r.boutId, eventDate: r.eventDate, source: r.source });
  }
  return out;
}
