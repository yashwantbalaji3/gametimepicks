#!/usr/bin/env node
/**
 * SUNDAY NFL RENDER, run after the morning capture. Dates come from America/New_York.
 *   app/scripts/social/daily-nfl.sh [--date YYYY-MM-DD] [--as-of ISO] [--week N]
 * Renders winners, weekly Top 5s, game posts and last week's recap from the saved captures; no key, no network, no
 * fetch. A run with no capture from today, or with a failed job, writes
 * ~/gtp-private/graphics/reports/FAILED-nfl-<date>.json and exits 1 (the NBA command owns FAILED-<date>.json).
 * Founder review only: nothing is scheduled or posted.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etDate } from "../../src/lib/social/social-package.mjs";
import { loadForecastViews } from "../../src/lib/sports/nfl/forecast-view-load.mjs";
import { APP } from "./nba-line-graphics-io.mjs";
import { runFailures } from "./daily-nba.mjs";
import { NFL_ODDS_DIR } from "./nfl-line-capture.mjs";
import { parseArgs, runPack } from "./render-social-pack.mjs";

const REPORTS = () => path.join(os.homedir(), "gtp-private", "graphics", "reports");
const stampMs = (s) => Date.parse(s.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, "$1-$2-$3T$4:$5:$6Z"));

/** The newest saved capture stamp whose Eastern date is `date`. */
export function captureOn(date, dir = NFL_ODDS_DIR()) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).filter((d) => /^\d{8}T\d{6}Z$/.test(d) && etDate(stampMs(d)) === date).sort().at(-1) ?? null;
}

/** The regular-season week with games on this Eastern date. */
export function weekOf(date, views) {
  const hit = views.find((v) => v.seasonType === 2 && etDate(Date.parse(String(v.kickoffUtc).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"))) === date);
  return hit?.week ?? null;
}

/** The FAILED report, or a clean slate on success. */
export function reportFailures(date, asOf, reasons, reports = REPORTS()) {
  const file = path.join(reports, `FAILED-nfl-${date}.json`);
  if (!reasons.length) { fs.rmSync(file, { force: true }); return null; }
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ date, asOf, reasons }, null, 2)}\n`);
  return file;
}

async function main(argv) {
  const a = parseArgs(argv);
  const asOf = a["as-of"] ?? new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const date = a.date ?? etDate(Date.parse(asOf));
  const done = (reasons) => {
    const file = reportFailures(date, asOf, reasons);
    if (file) console.error(`FAILED ${file}`);
    return file ? 1 : 0;
  };
  try {
    if (!captureOn(date)) return done([`NO_CAPTURE: no NFL capture saved on ${date} Eastern`]);
    const week = a.week ? Number(a.week) : weekOf(date, loadForecastViews(path.join(APP, "public")));
    if (!week) return done([`NO_SLATE: no regular-season week has games on ${date} Eastern`]);
    const r = await runPack({ "as-of": asOf, "nfl-sunday-pack": true, "nfl-week": String(week), "nfl-recap-week": String(week - 1), "approved-captions": true, ...(a.scales ? { scales: a.scales } : {}) });
    return done(runFailures(r));
  } catch (e) { return done([e.message]); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((c) => process.exit(c));
