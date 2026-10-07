/**
 * Stage 3E — RECORD PARITY. Every public surface that states the same record must state the same numbers.
 *
 * A record (say "NFL game winners") is read by several readers (the graded-picks page, the Forecast Ledger, the
 * settler's lifetime summary …). After Stage 3 they all apply one forecast-of-record rule, so their decided counts must
 * be equal. This module compares what each reader published. It never picks the "right" one: any disagreement is a
 * failure (founder 3B "A — BOTH": disagreement is a Production acceptance failure, never resolved toward the more
 * favorable number). A reader whose artifact is missing or unreadable is MISSING, which also fails: missing is not
 * zero.
 *
 * Pure: callers read the artifacts and hand in counts.
 */

export const PARITY = Object.freeze({ AGREE: "AGREE", DISAGREE: "DISAGREE", MISSING: "MISSING" });

const isCount = (v) => Number.isInteger(v) && v >= 0;

/**
 * @param {Array<{ record: string, readers: Array<{ name: string, win: number|null, loss: number|null }> }>} groups
 * @returns {{ ok: boolean, rows: Array<{ record: string, state: string, readers: object[], detail: string }> }}
 */
export function parityReport(groups) {
  const rows = (groups ?? []).map(({ record, readers }) => {
    const missing = readers.filter((r) => !isCount(r.win) || !isCount(r.loss));
    if (missing.length) return { record, state: PARITY.MISSING, readers, detail: `no readable count from ${missing.map((r) => r.name).join(", ")}` };
    const words = new Set(readers.map((r) => `${r.win}–${r.loss}`));
    if (words.size > 1) return { record, state: PARITY.DISAGREE, readers, detail: readers.map((r) => `${r.name} ${r.win}–${r.loss}`).join(" · ") };
    return { record, state: PARITY.AGREE, readers, detail: `${readers[0].win}–${readers[0].loss} on ${readers.length} readers` };
  });
  return { ok: rows.length > 0 && rows.every((r) => r.state === PARITY.AGREE), rows };
}

/** Wins and losses from a cohort summary that publishes {decisive, winnerAccuracy} (the NFL settler's lifetime block). */
export function winsFromAccuracy(cohorts) {
  let win = 0, loss = 0;
  for (const c of Object.values(cohorts ?? {})) {
    if (!isCount(c?.decisive) || typeof c?.winnerAccuracy !== "number") { if (c?.decisive === 0) continue; return { win: null, loss: null }; }
    const w = Math.round(c.winnerAccuracy * c.decisive);
    win += w; loss += c.decisive - w;
  }
  return { win, loss };
}

/** Directional WIN / LOSS counts for one family in Forecast Ledger rows (pushes are neither). */
export function ledgerDirectional(rows, family) {
  let win = 0, loss = 0, seen = 0;
  for (const r of rows ?? []) {
    if (r?.family !== family) continue;
    seen += 1;
    const d = r.measurement?.directionalResult;
    if (d === "WIN") win += 1; else if (d === "LOSS") loss += 1;
  }
  return seen ? { win, loss } : { win: null, loss: null };
}
