/**
 * RESULTS V2 · THE PURE AGGREGATION (B-1). No IO, no grading, no probability.
 *
 * A POPULATION is one graded record from one owner (MLB game calls, MLB props, NFL game winners, EPL match
 * results, UFC fight winners). Populations are never summed into each other — a single "overall" percentage
 * across a prop ledger, a game-call ledger and a fight ledger would be the mega-record the projection's rule 2
 * forbids. Each carries its own class (PUBLIC product forecast vs RESEARCH / market context) so a page can
 * keep them visually apart.
 *
 * Rules (each pinned in populations.test.mjs):
 *   - outcome is WIN | LOSS | PUSH | VOID; only WIN and LOSS are decisive; a push or a void is never a loss;
 *   - a row with no readable date is counted in `undated`, never silently dropped or given a date;
 *   - pending is NOT derived here: a graded ledger holds no pending rows, so pending is `null` (unknown),
 *     never 0 — "missing is never zero";
 *   - windows are computed from the daily series on a caller-supplied `today`, so a static page can recompute
 *     them on the reader's day instead of freezing "today" at build time.
 */

export const OUTCOMES = Object.freeze(["WIN", "LOSS", "PUSH", "VOID"]);

/** A graded-picks row (hit true / false / null) → the V2 outcome. null is a void (tie, push, no answer). */
export function outcomeFromHit(hit) {
  return hit === true ? "WIN" : hit === false ? "LOSS" : "VOID";
}

/** An owner's outcome word → the V2 outcome, or null when unreadable (never guessed). */
export function outcomeFromWord(word) {
  const w = String(word ?? "").trim().toUpperCase();
  if (w === "WIN" || w === "WON" || w === "HIT") return "WIN";
  if (w === "LOSS" || w === "LOST" || w === "MISS") return "LOSS";
  if (w === "PUSH") return "PUSH";
  if (w === "VOID" || w === "VOIDED") return "VOID";
  return null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const emptyCounts = () => ({ won: 0, lost: 0, push: 0, void: 0 });

function add(c, outcome) {
  if (outcome === "WIN") c.won += 1;
  else if (outcome === "LOSS") c.lost += 1;
  else if (outcome === "PUSH") c.push += 1;
  else if (outcome === "VOID") c.void += 1;
}

/** Finish a counts object: decisive = won + lost; hitRate only when something was decided. */
export function finish(c) {
  const decisive = c.won + c.lost;
  return { ...c, decisive, n: decisive + c.push + c.void, hitRate: decisive > 0 ? c.won / decisive : null };
}

/**
 * The daily series for one population: rows {date, outcome} → [{date, won, lost, push, void}] newest first,
 * plus how many rows had no usable date or outcome.
 */
export function dailySeries(rows) {
  const byDay = new Map();
  let undated = 0;
  let unreadable = 0;
  for (const r of rows ?? []) {
    if (!OUTCOMES.includes(r?.outcome)) { unreadable += 1; continue; }
    const d = typeof r.date === "string" ? r.date.slice(0, 10) : "";
    if (!DAY.test(d)) { undated += 1; continue; }
    if (!byDay.has(d)) byDay.set(d, emptyCounts());
    add(byDay.get(d), r.outcome);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, c]) => ({ date, ...c }));
  return { days, undated, unreadable };
}

const minusDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/**
 * Window counts from a daily series on `today` (an ET day): today, last 7 and 30 days (inclusive of today),
 * season (from `seasonStart`, when the population has one) and all. Pure — the reader's clock can drive it.
 */
/**
 * @param {Array<{ date: string, won: number, lost: number, push: number, void: number }>} days
 * @param {{ today: string, seasonStart?: string | null }} opts
 */
export function windowsFrom(days, { today, seasonStart = null }) {
  const win = (from) => {
    const c = emptyCounts();
    for (const d of days) if (d.date <= today && (from == null || d.date >= from)) { c.won += d.won; c.lost += d.lost; c.push += d.push; c.void += d.void; }
    return finish(c);
  };
  return {
    today: win(today),
    d7: win(minusDays(today, 6)),
    d30: win(minusDays(today, 29)),
    season: seasonStart ? win(seasonStart) : null,
    all: win(null),
  };
}

/**
 * Assemble one population. `pending` stays null unless the owner genuinely carries a pending count.
 * @param {{ id: string, sport: string, label: string, klass: string, kind: string, owner: string,
 *   note?: string | null, seasonStart?: string | null, seasonLabel?: string | null,
 *   rows: Array<{ date: string | null, outcome: string | null }>, pending?: number | null, today: string }} args
 */
export function population({ id, sport, label, klass, kind, owner, note = null, seasonStart = null, seasonLabel = null, rows, pending = null, today }) {
  const series = dailySeries(rows);
  return {
    id, sport, label, class: klass, kind, owner, note, seasonStart, seasonLabel,
    pending,
    undated: series.undated, unreadable: series.unreadable,
    days: series.days,
    windows: windowsFrom(series.days, { today, seasonStart }),
  };
}
