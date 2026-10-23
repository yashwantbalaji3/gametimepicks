/**
 * Build-time reader for the Homer Nukes record split by publication status (homer-nukes-publication.mjs). ONE reader:
 * /homer-nukes and the MLB hub's board read the record through here, so the board's honest-limits line and the track
 * record count the same picks.
 *
 * Reads the settled day files (public/data/mlb/homer-nukes/settled-<date>.json — the settlement owner's grades) and
 * the Forecast Ledger's provenance verdict (forecast-ledger-reader). A missing ledger leaves every graded pick in the
 * public record, as before this rule: there is then no verdict to apply, and inventing one would be a guess.
 */
import fs from "node:fs";
import path from "node:path";

import { readForecastLedger } from "@/lib/results/v2/forecast-ledger-reader";
import { homerNukesRecordSplit, unknownPublicationKeys } from "@/lib/results/homer-nukes-publication.mjs";

type Split = ReturnType<typeof homerNukesRecordSplit>;
let memo: { dir: string; split: Split } | null = null;

export function homerNukesRecord(dataRoot: string = path.join(process.cwd(), "public", "data")): Split {
  const dir = path.join(dataRoot, "mlb", "homer-nukes");
  if (memo && memo.dir === dir) return memo.split;
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^settled-\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { /* none settled */ }
  const days = files.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } })
    .filter((d): d is { date: string; picks: unknown[] } => typeof d?.date === "string");
  const split = homerNukesRecordSplit(days as never, unknownPublicationKeys(readForecastLedger().rows));
  memo = { dir, split };
  return split;
}
