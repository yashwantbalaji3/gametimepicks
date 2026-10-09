#!/usr/bin/env node
/**
 * nba-results-refresh.yml helper: exit 0 when `<file>` (the fresh capture) differs from `HEAD:<file>` only in what no
 * reader sees (in-progress status, live scores, capture stamps) — lib/sports/nba/results-publishable.mjs. Exit 1 when
 * it publishes something (a final, a corrected final, a postponement, a schedule change, the window state), or when
 * the committed file cannot be read (fails toward committing).
 *
 *   node app/scripts/nba/results-publishable.mjs app/public/data/nba/results/latest.json
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { samePublishable } from "../../src/lib/sports/nba/results-publishable.mjs";

const file = process.argv[2];
let committed = null, fresh = null;
try { committed = JSON.parse(execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { process.exit(1); }
try { fresh = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(1); }
process.exit(samePublishable(committed, fresh) ? 0 : 1);
