/**
 * The build-time reader for the ONE settled-through owner (lib/results/settled-through.mjs). Surfaces import
 * from here, never compute a settled date themselves (pinned by settled-through-one-truth.test.mjs).
 *
 * The global header renders on every exported page, so a production build answers once per worker (the
 * committed files cannot change during one `next build`); `next dev` re-reads so an edited artifact shows up.
 */
import fs from "node:fs";
import path from "node:path";

import { getOptimizerSettledDates } from "@/lib/parlay-results";
import { loadResultsProjection, type ResultsProjection } from "./projection";
import {
  corePaperSettledThrough,
  lastCardSettledDate,
  ledgerSettledLine,
  siteLatestResultsDate,
} from "./settled-through.mjs";

const DEFAULT_ROOT = () => path.join(process.cwd(), "public", "data");

let siteMemo: { value: string | null } | null = null;

/** (3) The site's "Latest results" date — the global header chip and Home's hero read this. */
export function siteLatestResults(): string | null {
  if (process.env.NODE_ENV === "production" && siteMemo) return siteMemo.value;
  const value = siteLatestResultsDate({ projection: loadResultsProjection(), optimizerSettledDates: getOptimizerSettledDates() });
  if (process.env.NODE_ENV === "production") siteMemo = { value };
  return value;
}

export interface CorePaperSettlement {
  /** (1) Results settled through — every day ≤ this is decided (the fold). */
  settledThrough: string | null;
  /** (2) The newest day a core-ledger card settled — older than (1) when no card was offered since. */
  lastCardSettled: string | null;
  /** "Results settled through Oct 26 · last card settled Oct 15" — or null when nothing has settled. */
  line: string | null;
}

/** The core paper ledger's settlement (Bank Builder + Moonshot, Rule S): /mr-dub, /bank-builder, /moonshot, Home. */
export function corePaperSettlement(
  root: string = DEFAULT_ROOT(),
  projection: ResultsProjection | null = loadResultsProjection(root),
): CorePaperSettlement {
  const settledThrough = corePaperSettledThrough(projection);
  let days: unknown = null;
  try { days = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "daily-summary.json"), "utf8"))?.days ?? null; } catch { days = null; }
  const lastCardSettled = lastCardSettledDate(days as never);
  return { settledThrough, lastCardSettled, line: ledgerSettledLine({ settledThrough, lastCardSettled }) };
}
