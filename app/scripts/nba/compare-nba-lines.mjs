#!/usr/bin/env node
/**
 * PRIVATE NBA model-versus-line comparison (launch program 2026-10-28). Reads:
 *   - the committed public lane  app/public/data/nba/experimental-public/<date>.json   (the frozen official medians)
 *   - every private capture file <private dir>/odds/nba/props/*.json                  (adapter price records)
 * and writes the line board (lib/sports/nba/line-board.mjs) to <private dir>/odds/nba/line-board/<date>.json — never into a
 * repository (founder storage decision 2026-10-22; NBA line display is not authorized). Spends nothing; calls nothing.
 *
 *   node scripts/nba/compare-nba-lines.mjs --date YYYY-MM-DD [--as-of ISO] [--out-dir /abs/private/dir]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePrivateDataDir } from "../../src/lib/ops/private-data-dir.mjs";
import { buildNbaLineBoard } from "../../src/lib/sports/nba/line-board.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const refuse = (code, msg) => { console.error(`REFUSED: ${msg}`); process.exit(code); };
const DATE = arg("--date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) refuse(2, "--date YYYY-MM-DD required");
const AS_OF = arg("--as-of") ?? new Date().toISOString();
if (!Number.isFinite(Date.parse(AS_OF))) refuse(2, "--as-of must be an ISO instant");

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const priv = resolvePrivateDataDir({ cliDir: arg("--out-dir"), repoRoot: path.resolve(APP, "..") });
if (!priv.ok) refuse(2, `a private directory outside every repository is required (${priv.reason ?? "none"}) — line data never enters a repo`);

const lanePath = path.join(APP, "public", "data", "nba", "experimental-public", `${DATE}.json`);
if (!fs.existsSync(lanePath)) refuse(3, `no committed lane for ${DATE}`);
const lane = JSON.parse(fs.readFileSync(lanePath, "utf8"));

const capDir = path.join(priv.dir, "odds", "nba", "props");
const records = fs.existsSync(capDir)
  ? fs.readdirSync(capDir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(path.join(capDir, f), "utf8")).records ?? [])
  : [];

const board = buildNbaLineBoard({ lane, priceRecords: records, asOf: AS_OF });
const out = path.join(priv.dir, "odds", "nba", "line-board", `${DATE}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ dataClass: "PRIVATE_RESEARCH", productEligible: false, ...board }, null, 1)}\n`);
console.log(JSON.stringify({ date: DATE, asOf: AS_OF, records: records.length, coverage: board.coverage, wrote: "private line board" }, null, 2));
