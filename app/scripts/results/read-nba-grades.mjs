/**
 * Read-only access to the NBA prop-grade ledger for the Results Day builder. It lives apart from the builder because
 * the builder writes files, and the settlement contract keeps exactly one writer among files that name this ledger.
 */
import fs from "node:fs";
import path from "node:path";

import { currentPropEntries, parsePropLedger } from "../../src/lib/sports/nba/prop-shadow-grading.mjs";

export const NBA_GRADE_SOURCE = "data/internal/research/nba/prop-grades/v0.1/ledger.jsonl";

/** The current entry per key. Refuses a ledger that does not parse. */
export function readNbaGrades(repo) {
  const parsed = parsePropLedger(fs.readFileSync(path.join(repo, NBA_GRADE_SOURCE), "utf8"));
  if (parsed.errors.length) throw new Error(`ledger: ${parsed.errors[0]}`);
  return currentPropEntries(parsed.entries);
}
