/**
 * TRUTH-001 Stage B · emit the PUBLIC MLB game-grade rows OF RECORD for the browser (run inside the existing
 * forecast-record-assets build phase — no new phase).
 *
 * The /saved page settles a saved MLB call in the browser by fetching a grade log. It must read the same record every
 * server reader does (lib/mlb/results/grades-of-record-io.mjs): approved restatements applied, never-public rows
 * dropped. This writes public/data/mlb/results/game-predictions-of-record.jsonl at build time (git-ignored: a build
 * byproduct, never committed). With no approved restatement log its rows are the stored log's rows, unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { publicMlbGradedRows } from "../../src/lib/mlb/results/grades-of-record-io.mjs";

export const OF_RECORD_REL = "public/data/mlb/results/game-predictions-of-record.jsonl";

export function emitMlbGradesOfRecord(appDir) {
  const rows = publicMlbGradedRows(appDir);
  const text = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  fs.writeFileSync(path.join(appDir, OF_RECORD_REL), text);
  return rows.length;
}
