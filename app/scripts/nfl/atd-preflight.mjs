/**
 * Anytime-TD preflight for one game. Zero network.
 *
 * Prints, for the top candidates by model probability: model P(TD) (from the committed player board, untouched),
 * eligibility, and the price state from the newest PRIVATE display file
 * (<private>/odds/nfl/atd-<stamp>/anytime-td-display.json) — so a missing price is visible BEFORE any graphic is rendered
 * or sent for founder review. Prices are never read from a repository file. Prints no price unless asked for the table
 * locally; the private directory must be outside every git working tree (lib/ops/private-data-dir.mjs).
 *
 * Usage: node scripts/nfl/atd-preflight.mjs --event <espnId> [--top 3] [--now <iso>] [--max-age-hours 6]
 *        [--private-dir /abs] [--json]
 *   private dir: --private-dir, else GTP_PRIVATE_DATA_DIR, else ~/gtp-private
 * Exit: 0 all candidates ready · 1 usage error · 3 at least one candidate blocked (missing price, unavailable, …)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolvePrivateDataDir, PRIVATE_DIR_ENV } from "../../src/lib/ops/private-data-dir.mjs";
import { atdPreflight, topAtdCandidates, formatPreflightTable, latestAtdDisplayFile, DEFAULT_MAX_AGE_HOURS } from "../../src/lib/sports/nfl/atd-prices.mjs";

const DEFAULT_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function runPreflight(argv, { now = new Date().toISOString(), log = (s) => console.log(s), err = (s) => console.error(s), env = process.env, appDir = DEFAULT_APP, homeDir = os.homedir() } = {}) {
  const arg = (n, f = null) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : f; };
  const event = String(arg("--event", "")).replace(/^nfl-/, "");
  if (!/^\d+$/.test(event)) { err("usage: --event <espnId> [--top 3] [--now <iso>] [--private-dir /abs]"); return 1; }
  const top = Number(arg("--top", "3"));
  const nowIso = arg("--now", now);
  const maxAgeHours = Number(arg("--max-age-hours", String(DEFAULT_MAX_AGE_HOURS)));
  const boardPath = path.join(appDir, "public/data/nfl/player-board", `${event}.json`);
  if (!fs.existsSync(boardPath)) { err(`no committed player board for ${event} (${path.relative(appDir, boardPath)})`); return 1; }
  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  const priv = resolvePrivateDataDir({ cliDir: arg("--private-dir") ?? (env[PRIVATE_DIR_ENV]?.trim() || path.join(homeDir, "gtp-private")), env, repoRoot: path.join(appDir, "..") });
  const latest = priv.ok ? latestAtdDisplayFile(priv.dir) : null;
  const result = atdPreflight({ file: latest?.file ?? null, board, eventId: event, candidates: topAtdCandidates(board, Number.isFinite(top) && top > 0 ? top : 3), nowIso, maxAgeHours });
  log(argv.includes("--json") ? JSON.stringify(result, null, 1) : formatPreflightTable(result));
  if (!priv.ok) log(`note: private directory refused (${priv.reason}) — every price reads NO_CAPTURE`);
  else if (!latest) log("note: no private anytime-TD display file yet (odds/nfl/atd-<stamp>/anytime-td-display.json) — every price reads NO_CAPTURE");
  else log(`note: prices from private ${latest.stamp}`);
  return result.allReady ? 0 : 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(runPreflight(process.argv.slice(2)));
}
