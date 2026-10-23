#!/usr/bin/env node
/**
 * Emit the PUBLIC Forecast Record CSVs (Session 13 · Results V2 E7) — build step, like emit-ask-assets.mjs.
 *
 *   data/internal/forecast-ledger/v1/*.jsonl (committed)  →  app/public/data/forecast-record/v1/<sport>-<family>.csv
 *
 * One CSV per (sport, family) — exactly the rows the family page counts (same reader, same filter), so a page's
 * "n" and its download agree. The ledger holds public forecast facts only (no user data). The directory is wiped
 * first so a family dropped from the ledger never lingers as a stale download. No network, no clock: the same ledger
 * gives byte-identical files (emit-forecast-record-assets.test.mjs). Each row carries its provenance columns and, for a
 * multiclass family, the model's full outcome vector (forecast-record.mjs CSV_COLUMNS).
 */
import fs from "node:fs";
import path from "node:path";

import { toCsv } from "../../src/lib/results/v2/forecast-record.mjs";

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

/** Read the ledger at `ledgerDir` and write one CSV per family into `outDir` (wiped first). Returns { files, rows }. */
export function emitForecastRecord({ ledgerDir = LEDGER, outDir = OUT } = {}) {
  const manifestPath = path.join(ledgerDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rows = [];
  for (const s of Object.values(manifest.sports ?? {})) {
    for (const line of fs.readFileSync(path.join(ledgerDir, s.file), "utf8").split("\n")) if (line.trim()) rows.push(JSON.parse(line));
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const files = familyCsvs(rows);
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), text);
  return { files: Object.keys(files).sort(), rows: rows.length };
}

function main() {
  const out = emitForecastRecord();
  if (!out) {
    console.error("REFUSED: forecast ledger manifest missing — the Forecast Record would publish empty downloads");
    process.exit(1);
  }
  console.log(`forecast record: ${out.files.length} CSV file(s), ${out.rows} rows → public/data/forecast-record/v1/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
