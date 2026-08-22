/**
 * THE MODEL'S TRAINING SET — a frozen base plus everything this season has taught it.
 *
 * fitEplStrength was reading corpus-v1.json directly, and corpus-v1.json is a STATIC FILE covering
 * 2022-23 through 2025-26. It ends on 2026-05-24. Every forecast this season was therefore fit on
 * data that stopped before the season began, and no match the model predicted ever came back to
 * inform it. There was no learning loop; there was a snapshot.
 *
 * That is also why the cold-start clubs never improved. Coventry City and Hull City are newly
 * promoted, so they appear nowhere in four seasons of top-flight results, and the fit falls back to
 * a league-average stand-in. On 2026-08-21 that produced Hull City at 42.2% at home to Manchester
 * United against a market price of 10.6% — the model was not being bold, it simply did not know who
 * Hull City were. Nothing in the pipeline was going to tell it, however many matches they played.
 *
 * TWO FILES, AND THE BASE IS NEVER WRITTEN TO. The historical corpus is validated, quarantine-checked
 * and four seasons deep; a defect in accretion must not be able to corrupt it. Current-season rows
 * accumulate in their own artifact and are concatenated at read time. This is the same discipline
 * the MLB calibration layers use, where the raw predictions are never overwritten by a fitted
 * correction — if the derived layer is wrong you delete it and rebuild, and nothing of value is gone.
 *
 * LEAKAGE IS HANDLED BY THE CUTOFF, NOT BY WHAT IS IN THE FILE. fitEplStrength takes cutoffIso and
 * ignores every match at or after it, so a result may sit in the corpus the moment it is settled
 * without any risk of a fixture informing its own forecast — a forecast is built before kickoff, and
 * the match it is forecasting has not happened yet. Filtering on write instead would be strictly
 * worse: the file's meaning would then depend on when it was written.
 */
import fs from "node:fs";
import path from "node:path";

export const BASE_CORPUS = "data/internal/research/epl/corpus-v1.json";
export const CURRENT_CORPUS = "data/internal/research/epl/corpus-current-season.json";

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * Identity for exactly-once accretion: the two clubs and the calendar day.
 *
 * Sorted, so the same match cannot enter twice under a swapped home/away reading, and dated to the
 * DAY rather than the minute because a kickoff that moves by fifteen minutes is the same match. The
 * canonical event id is not used here on purpose — it keys on the kickoff minute, which is exactly
 * the field a rescheduling changes.
 */
export function corpusKey(row) {
  const day = String(row?.dateUtc ?? "").slice(0, 10);
  return `${[String(row?.home ?? ""), String(row?.away ?? "")].sort().join("|")}|${day}`;
}

/**
 * Base + current, chronological.
 *
 * @param repoRoot  repository root, so callers need not agree on a relative path
 * @returns {{rows: Array, base: number, current: number, currentSeason: string|null}}
 *          `base` and `current` are counts, so a caller can report WHERE its training data came
 *          from rather than presenting one opaque number.
 */
export function loadEplCorpus(repoRoot) {
  const base = read(path.join(repoRoot, BASE_CORPUS));
  if (!base || !Array.isArray(base.rows)) {
    // The base is not optional. A fit that silently proceeded on current-season rows alone would be
    // catastrophically under-trained and would look like a working model.
    throw new Error(`epl corpus: base corpus unreadable at ${BASE_CORPUS} — refusing to fit on a partial history`);
  }
  const current = read(path.join(repoRoot, CURRENT_CORPUS));
  const currentRows = Array.isArray(current?.rows) ? current.rows : [];

  // Defend against a row existing in both files. The accretion script refuses to add a match the
  // base already holds, but a loader that trusts that is one bad merge away from double-weighting a
  // season of results.
  const seen = new Set(base.rows.map(corpusKey));
  const fresh = currentRows.filter((r) => !seen.has(corpusKey(r)));

  const rows = [...base.rows, ...fresh].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)) || String(a.home).localeCompare(String(b.home)));
  return { rows, base: base.rows.length, current: fresh.length, currentSeason: current?.season ?? null };
}
