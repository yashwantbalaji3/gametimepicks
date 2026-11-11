/**
 * Build-time reader for the EXPERIMENTAL starting-QB projections (data/internal/nfl/qb-fallback/<eventId>.json,
 * written by the board builder). Imported ONLY behind GTP_NFL_QB_FALLBACK_PUBLIC=1 (a compile-time constant), so a
 * flag-OFF build never reads the file. Returns null when the file is absent or not this schema.
 */
import fs from "node:fs";
import path from "node:path";
import { QB_FALLBACK_SCHEMA } from "./qb-fallback.mjs";

export function readQbFallback(repoRoot, eventId) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(repoRoot, "data/internal/nfl/qb-fallback", `${eventId}.json`), "utf8"));
    return doc?.schema === QB_FALLBACK_SCHEMA ? doc : null;
  } catch { return null; }
}
