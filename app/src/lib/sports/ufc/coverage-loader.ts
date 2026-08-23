/**
 * Reads the two artifacts the coverage comparison needs and answers with a state plus a sentence.
 *
 * Kept separate from results-coverage.mjs so the comparison itself stays pure and testable without
 * a filesystem: the rule is one thing, and which files happen to hold its inputs is another.
 */
import fs from "node:fs";
import path from "node:path";

import { resultsCoverage, coverageNote, COVERAGE } from "./results-coverage.mjs";

const read = (p: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8")); } catch { return null; }
};

export function loadUfcResultsCoverage(nowIso: string = new Date().toISOString()): { state: string; note: string | null; lagDays: number | null } {
  const ladder = read("public/data/parlays/risk-ladder-ufc/latest.json");
  const results = read("public/data/ufc/results-latest.json");
  /*
   * The card's day comes from the LADDER's own event block, because that is the card whose legs are
   * sitting unsettled — the thing the reader is actually looking at. Taking it from card-latest
   * would drift the moment the next card is announced.
   */
  const cov = resultsCoverage({
    cardEventDate: ladder?.event?.slateDate ?? ladder?.date ?? null,
    corpusLatestEvent: results?.latestEventDate ?? null,
    nowIso,
  });
  // An UNKNOWN state is deliberately silent on a product page: a note about our own unreadable file
  // tells a reader nothing they can use, and the guards catch it where it belongs.
  return { state: cov.state, note: cov.state === COVERAGE.AWAITING_SOURCE ? coverageNote(cov) : null, lagDays: cov.lagDays };
}
