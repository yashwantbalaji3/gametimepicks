#!/usr/bin/env node
/**
 * Writes app/public/data/nba/post-freeze-availability/<date>.json from the frozen lane file and the NBA injuries facts
 * capture (lib/sports/nba/post-freeze-availability.mjs). Writes only when the content changes, and never creates a
 * file that would hold no change (an absent file already means none), so a caller can stage the path unconditionally
 * and a quiet window adds no diff and no Production build. Called by .github/workflows/nba-forecast-window.yml.
 *   node app/scripts/nba/build-nba-post-freeze-availability.mjs --date 2026-11-11 [--root <repo>] [--check]
 * --check exits 1 when the committed file differs from what the current inputs give (nothing is written).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postFreezeAvailability, POST_FREEZE_REL } from "../../src/lib/sports/nba/post-freeze-availability.mjs";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const root = path.resolve(arg("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
const date = arg("--date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) { console.error("--date YYYY-MM-DD required"); process.exit(2); }

const lanePath = path.join(root, "app/public/data/nba/experimental-public", `${date}.json`);
const capPath = path.join(root, "data/internal/research/injuries/nba/latest.json");
if (!fs.existsSync(lanePath)) { console.log(`no lane file for ${date}: nothing to write`); process.exit(0); }
const lane = JSON.parse(fs.readFileSync(lanePath, "utf8"));
const capture = fs.existsSync(capPath) ? JSON.parse(fs.readFileSync(capPath, "utf8")) : null;
const text = JSON.stringify(postFreezeAvailability(lane, capture), null, 1) + "\n";
const outPath = path.join(root, POST_FREEZE_REL(date));
const before = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;
if (args.includes("--check")) { if (before !== text) { console.error(`${POST_FREEZE_REL(date)} is stale`); process.exit(1); } process.exit(0); }
if (before === null && JSON.parse(text).changes.length === 0) { console.log(`${POST_FREEZE_REL(date)}: no post-freeze change, no file`); process.exit(0); }
if (before === text) { console.log(`${POST_FREEZE_REL(date)} unchanged`); process.exit(0); }
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, text);
console.log(`wrote ${POST_FREEZE_REL(date)}: ${JSON.parse(text).changes.length} change(s)`);
