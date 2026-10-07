/**
 * WORLD SUMMARY — every game-level number read from ONE set of simulated complete games.
 *
 * A "world" is one simulated game: away runs and home runs, nothing else needed. Winner, margin, run line
 * and game total are all read from the same worlds here, so they reconcile by construction:
 *   total = away + home · margin = home − away · winner = sign(margin) · no world is a tie.
 *
 * Over/under is counted from the full total distribution at the line, never from adding two medians:
 *   P(over L)  = worlds with total > L ÷ worlds
 *   P(under L) = worlds with total < L ÷ worlds
 *   P(push L)  = worlds with total = L ÷ worlds   (only possible when L is a whole number)
 *
 * Pure and deterministic. It reads a sportsbook line only to know WHERE to count; the line never moves a
 * world. This module decides nothing about whether a number may be shown or picked — that stays with the
 * eligibility layer.
 */

export interface World {
  away: number;
  home: number;
}

export interface LineSplit {
  line: number;
  over: number;
  under: number;
  push: number;
  /** Raw counts, so a reader can recompute every probability exactly. */
  counts: { over: number; under: number; push: number; worlds: number };
}

export interface Quantiles {
  p05: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface Reconciliation {
  worlds: number;
  ties: number;
  negativeRuns: number;
  nonInteger: number;
  /** P(home) + P(away) — must be exactly 1 when there are no ties. */
  winnerMass: number;
  ok: boolean;
}

const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** The empirical quantile with the lower-median convention (an actual simulated value, never interpolated). */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

export function quantiles(values: number[]): Quantiles {
  const s = [...values].sort((a, b) => a - b);
  return {
    p05: quantile(s, 0.05),
    p10: quantile(s, 0.1),
    p25: quantile(s, 0.25),
    p50: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p90: quantile(s, 0.9),
    p95: quantile(s, 0.95),
  };
}

export function mean(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return values.length ? s / values.length : NaN;
}

/** Over / under / push at one line, counted from the worlds' totals. */
export function totalAtLine(worlds: World[], line: number): LineSplit {
  let over = 0;
  let under = 0;
  let push = 0;
  for (const w of worlds) {
    const t = w.away + w.home;
    if (t > line) over += 1;
    else if (t < line) under += 1;
    else push += 1;
  }
  const n = worlds.length;
  return { line, over: round4(over / n), under: round4(under / n), push: round4(push / n), counts: { over, under, push, worlds: n } };
}

/** Run line: P(home wins by more than `line`) and P(away wins by more than `line`), from the same worlds. */
export function runLineAt(worlds: World[], line: number): { line: number; homeCover: number; awayCover: number } {
  let hc = 0;
  let ac = 0;
  for (const w of worlds) {
    const m = w.home - w.away;
    if (m > line) hc += 1;
    if (-m > line) ac += 1;
  }
  return { line, homeCover: round4(hc / worlds.length), awayCover: round4(ac / worlds.length) };
}

export function homeWinShare(worlds: World[]): number {
  let h = 0;
  for (const w of worlds) if (w.home > w.away) h += 1;
  return worlds.length ? h / worlds.length : NaN;
}

/** Every world must be a finished baseball game: whole non-negative runs and a winner. */
export function reconcile(worlds: World[]): Reconciliation {
  let ties = 0;
  let neg = 0;
  let nonInt = 0;
  let home = 0;
  let away = 0;
  for (const w of worlds) {
    if (!Number.isInteger(w.away) || !Number.isInteger(w.home)) nonInt += 1;
    if (w.away < 0 || w.home < 0) neg += 1;
    if (w.away === w.home) ties += 1;
    else if (w.home > w.away) home += 1;
    else away += 1;
  }
  const n = worlds.length;
  const winnerMass = n ? (home + away) / n : 0;
  return { worlds: n, ties, negativeRuns: neg, nonInteger: nonInt, winnerMass, ok: n > 0 && ties === 0 && neg === 0 && nonInt === 0 && winnerMass === 1 };
}

/** Integer histogram of game totals (value → count), with a top bin `cap+` so the tail is never dropped. */
export function totalHistogram(worlds: World[], cap = 20): { value: number; label: string; count: number; probability: number }[] {
  const counts = new Array<number>(cap + 1).fill(0);
  for (const w of worlds) counts[Math.min(cap, w.away + w.home)] += 1;
  return counts.map((c, v) => ({ value: v, label: v === cap ? `${cap}+` : String(v), count: c, probability: round4(c / worlds.length) }));
}

/** Monte Carlo standard error of a share p over n worlds. */
export const shareSe = (p: number, n: number): number => Math.sqrt(Math.max(p * (1 - p), 0) / n);

/** The headline probabilities at a prefix of the worlds — used for convergence checkpoints. */
export function headline(worlds: World[], totalLine: number | null, runLine = 1.5) {
  const totals = worlds.map((w) => w.away + w.home);
  const tl = totalLine == null ? null : totalAtLine(worlds, totalLine);
  const rl = runLineAt(worlds, runLine);
  return {
    worlds: worlds.length,
    homeWin: round4(homeWinShare(worlds)),
    meanTotal: round4(mean(totals)),
    over: tl ? tl.over : null,
    under: tl ? tl.under : null,
    push: tl ? tl.push : null,
    homeCover: rl.homeCover,
    awayCover: rl.awayCover,
  };
}
