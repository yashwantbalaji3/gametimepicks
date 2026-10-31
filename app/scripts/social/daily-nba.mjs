#!/usr/bin/env node
/**
 * ONE DAILY NBA COMMAND: yesterday's recap plus today's game-day library, dates from America/New_York.
 *   GTP_ODDS_DISPLAY_KEY=... app/scripts/social/daily-nba.sh [--date YYYY-MM-DD] [--as-of ISO] [--moneyline <capture>]
 * The key is read from the environment only; without it the model-only library renders. The newest saved moneyline
 * capture for the date is used; none is ever fetched. Any failed job writes ~/gtp-private/graphics/reports/FAILED-<date>.json
 * and exits 1. Founder review only: nothing is scheduled or posted.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etDate } from "../../src/lib/social/social-package.mjs";
import { parseArgs, runPack } from "./render-social-pack.mjs";

const REPORTS = () => path.join(os.homedir(), "gtp-private", "graphics", "reports");
const MONEYLINE = () => path.join(os.homedir(), "gtp-private", "odds", "nba", "moneyline");
const dayBefore = (d) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Newest saved capture taken on `date` (by the file stamp). */
export function latestMoneyline(date, dir = MONEYLINE()) {
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).filter((f) => f.startsWith(`${date}T`) && f.endsWith(".json")).sort().at(-1);
  return hit ? path.join(dir, hit) : null;
}

/** What makes a daily run a failure. Missing key or capture only narrows the library. */
export function runFailures({ packages, refused, recaps }) {
  const f = refused.filter((r) => r.job).map((r) => `${r.job}: ${r.reason}`);
  f.push(...refused.filter((r) => r.contentType === "RESULTS_RECAP" && r.reason === "NO_VERIFIED_FINALS").map((r) => `recap: ${r.reason}`));
  if (!packages) f.push("no package was written");
  for (const r of recaps) if (r.provisional.length) f.push(`recap ${r.date}: ${r.provisional.length} game(s) not final`);
  return f;
}

async function main(argv) {
  const a = parseArgs(argv);
  const asOf = a["as-of"] ?? new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const date = a.date ?? etDate(Date.parse(asOf));
  const fail = (reasons) => {
    fs.mkdirSync(REPORTS(), { recursive: true });
    const file = path.join(REPORTS(), `FAILED-${date}.json`);
    fs.writeFileSync(file, `${JSON.stringify({ date, asOf, reasons }, null, 2)}\n`);
    console.error(`FAILED ${file}`);
    process.exit(1);
  };
  try {
    const moneyline = a.moneyline ?? (process.env.GTP_ODDS_DISPLAY_KEY ? latestMoneyline(date) : null);
    const r = await runPack({ "as-of": asOf, "nba-date": date, "nba-recap-date": dayBefore(date), "approved-captions": true, ...(moneyline ? { moneyline } : {}), ...(a.scales ? { scales: a.scales } : {}) });
    const failures = runFailures(r);
    if (failures.length) fail(failures);
    fs.rmSync(path.join(REPORTS(), `FAILED-${date}.json`), { force: true });
  } catch (e) { fail([e.message]); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(() => process.exit(0));
