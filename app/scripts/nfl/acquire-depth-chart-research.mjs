#!/usr/bin/env node
/** Free private research acquisition. No scheduler/publication/provider authorization changes. */
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { quarterbackSnapshotsFromCsv } from "../../src/lib/sports/nfl/depth-chart-snapshots.mjs";
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const season = Number(arg("--season"));
if (!Number.isInteger(season) || season < 2025 || season > new Date().getUTCFullYear()) throw new Error("--season must use available 2025+ schema");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(root, "data/internal/research/nfl/depth-charts");
const url = `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_${season}.csv.gz`;
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`depth source HTTP ${response.status}`);
const raw = Buffer.from(await response.arrayBuffer());
const hash = createHash("sha256").update(raw).digest("hex");
const parsed = quarterbackSnapshotsFromCsv(gunzipSync(raw).toString("utf8"));
if (parsed.invalidRows || !parsed.snapshots.length) throw new Error(`invalid/incomplete source: ${parsed.invalidRows} bad QB rows, ${parsed.snapshots.length} snapshots`);
const acquiredAt = new Date().toISOString();
const receipt = { schemaVersion: 1, dataClass: "PRIVATE_RESEARCH", artifact: "nfl-depth-chart-qb-snapshots", season, acquiredAt, sourceUrl: url,
  sourceSha256: hash, sourceBytes: raw.length, sourceRows: parsed.sourceRows,
  attribution: "nflverse/nflverse-data; ESPN depth charts. Not official actives. Source documentation: https://nflreadr.nflverse.com/articles/dictionary_depth_charts.html",
  ...parsed };
fs.mkdirSync(dir, { recursive: true });
const stem = `${season}-${hash.slice(0, 16)}`;
const rawPath = path.join(dir, `${stem}.csv.gz`), output = path.join(dir, `${stem}.json`);
if (!fs.existsSync(rawPath)) fs.writeFileSync(rawPath, raw, { flag: "wx" });
if (!fs.existsSync(output)) fs.writeFileSync(output, JSON.stringify(receipt, null, 1), { flag: "wx" });
console.log(JSON.stringify({ output, sourceSha256: hash, snapshots: parsed.snapshots.length, first: parsed.snapshots[0].timestamp, last: parsed.snapshots.at(-1).timestamp }, null, 2));
