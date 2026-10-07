/**
 * MODEL-IMPLIED TOTAL — the game total the full-game simulation actually produced, read for DISPLAY.
 *
 * Founder decision 2026-10-07 16:50Z: "Display the model-implied total. Keep product eligibility separate."
 * When the page shows both teams' runs and the winner from 10,000 simulated games, the same games already
 * hold the total (away + home in each game). Hiding it as "Unavailable" said the model had no total, which
 * was not true. This module reads that total from the SAME artifact the winner, score and run line come
 * from — never from adding the two displayed medians — and counts over / under / push at the posted line.
 *
 * It is a READER for one page, not a pick:
 *   • it returns no `pick`, no strength label and no TotalPrediction, so no board, parlay, Bank Builder or
 *     Moonshot path can consume it (model-total.test.mjs pins that nothing outside the game report imports it);
 *   • the over/under PAUSE stays exactly where it is (live-record-gate.mjs) and is shown as the product status;
 *   • the sportsbook line is only WHERE the worlds are counted; it never moves a simulated game.
 */
import type { FullGameSimGame } from "./types";

export interface ModelImpliedTotal {
  worlds: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  /** The sportsbook total captured with the artifact, or null when none was posted. */
  line: number | null;
  lineBookmaker: string | null;
  lineCapturedAt: string | null;
  /** Shares of the simulated games; null when there is no line. Push is 0 unless the line is a whole number. */
  over: number | null;
  under: number | null;
  push: number | null;
}

/**
 * Read the model-implied total from a full-game artifact. Null when the game has no valid simulated total
 * distribution (unavailable game, missing histogram, or a histogram whose counts do not add up to the
 * artifact's own run count — a broken artifact is never shown as a number).
 */
export function modelImpliedTotal(g: FullGameSimGame | null | undefined): ModelImpliedTotal | null {
  if (!g || g.status === "unavailable" || !g.totalRuns || !Array.isArray(g.totalRuns.distribution)) return null;
  const bins = g.totalRuns.distribution;
  const worlds = bins.reduce((s, b) => s + (Number.isFinite(b.count) ? b.count : 0), 0);
  if (!(worlds > 0) || worlds !== g.runCount) return null;
  const topBin = Math.max(...bins.map((b) => b.value));
  const rawLine = g.market?.total?.line;
  // The top bin is "cap+" — a line at or above it cannot be split honestly, so no over/under is given.
  const line = typeof rawLine === "number" && Number.isFinite(rawLine) && rawLine < topBin ? rawLine : null;
  let over = 0;
  let under = 0;
  let push = 0;
  if (line != null) {
    for (const b of bins) {
      if (b.value > line) over += b.count;
      else if (b.value < line) under += b.count;
      else push += b.count;
    }
  }
  return {
    worlds,
    mean: g.totalRuns.mean,
    median: g.totalRuns.median,
    p10: g.totalRuns.p10,
    p90: g.totalRuns.p90,
    line,
    lineBookmaker: line != null ? g.market?.bookmaker ?? null : null,
    lineCapturedAt: line != null ? g.market?.capturedAt ?? null : null,
    over: line != null ? over / worlds : null,
    under: line != null ? under / worlds : null,
    push: line != null ? push / worlds : null,
  };
}

const pct = (p: number): string => `${Math.round(p * 100)}%`;
const fmtLine = (l: number): string => (Number.isInteger(l) ? l.toFixed(1) : String(l));

/** The display copy, kept here so the wording is tested once and every reader says the same thing. */
export function modelTotalCopy(t: ModelImpliedTotal, opts: { productPaused: boolean; modelVersion?: string | null }) {
  const worlds = t.worlds.toLocaleString("en-US");
  const lines: string[] = [];
  if (t.line != null && t.over != null && t.under != null && t.push != null) {
    lines.push(`Over ${fmtLine(t.line)} — ${pct(t.over)} of ${worlds} simulated games`);
    lines.push(`Under ${fmtLine(t.line)} — ${pct(t.under)}`);
    if (Number.isInteger(t.line)) lines.push(`Push at exactly ${t.line} — ${pct(t.push)}`);
  }
  return {
    eyebrow: "Model-implied total",
    headline: `Projected ${t.mean.toFixed(1)} runs`,
    median: `Median ${t.median} · 80% of simulated games ${t.p10}–${t.p90}`,
    sportsbook: t.line != null ? `Sportsbook line ${fmtLine(t.line)}` : "No sportsbook total posted",
    splits: lines,
    source: `GameTimePicks simulation · ${worlds} simulated games${opts.modelVersion ? ` · ${opts.modelVersion}` : ""}`,
    status: opts.productPaused ? "GameTimePicks model output · Totals product currently paused" : "GameTimePicks model output",
    /** Optional honesty line (founder's call whether to show it). */
    evidenceNote: "In testing so far, this totals model has not beaten a coin flip on over/under.",
  };
}
