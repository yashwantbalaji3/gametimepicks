#!/usr/bin/env node
/**
 * Emit the PUBLIC Forecast Record CSVs (Session 13 · Results V2 E7) — build step, like emit-ask-assets.mjs.
 *
 *   data/internal/forecast-ledger/v1/*.jsonl (committed)  →  app/public/data/forecast-record/v1/<sport>-<family>.csv
 *
 * One CSV per (sport, family) — exactly the rows the family page counts (same reader, same filter), so a page's
 * "n" and its download agree. The ledger holds public forecast facts only (no user data). The directory is wiped
 * first so a family dropped from the ledger never lingers as a stale download. No network, no clock.
 */
import fs from "node:fs";
import path from "node:path";

import { toCsv } from "../../src/lib/results/v2/forecast-record.mjs";
import { emitMlbGradesOfRecord, OF_RECORD_REL } from "./emit-mlb-grades-of-record.mjs";

const APP = process.cwd();
const LEDGER = path.resolve(APP, "..", "data/internal/forecast-ledger/v1");
const OUT = path.join(APP, "public/data/forecast-record/v1");
const SLUG = { NFL: "nfl", MLB: "mlb", EPL: "epl", LIGUE_1: "ligue-1", UFC: "ufc" };

export function familyCsvs(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = `${SLUG[r.sport]}-${r.family.replace(/_/g, "-")}`;
    const a = by.get(k) ?? [];
    a.push(r);
    by.set(k, a);
  }
  const files = {};
  for (const [k, rs] of by) {
    rs.sort((a, b) => String(b.eventStart ?? b.publishedAt ?? "").localeCompare(String(a.eventStart ?? a.publishedAt ?? "")) || (a.forecastId < b.forecastId ? -1 : 1));
    files[`${k}.csv`] = toCsv(rs);
  }
  return files;
}

function main() {
  const manifestPath = path.join(LEDGER, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("REFUSED: forecast ledger manifest missing — the Forecast Record would publish empty downloads");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rows = [];
  for (const s of Object.values(manifest.sports ?? {})) {
    for (const line of fs.readFileSync(path.join(LEDGER, s.file), "utf8").split("\n")) if (line.trim()) rows.push(JSON.parse(line));
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const files = familyCsvs(rows);
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), text);
  console.log(`forecast record: ${Object.keys(files).length} CSV file(s), ${rows.length} rows → public/data/forecast-record/v1/`);
  // TRUTH-001 Stage B: the browser's MLB grade rows of record (the /saved page), from the same loader as every reader.
  const appDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
  console.log(`mlb grades of record: ${emitMlbGradesOfRecord(appDir)} public row(s) → ${OF_RECORD_REL}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
