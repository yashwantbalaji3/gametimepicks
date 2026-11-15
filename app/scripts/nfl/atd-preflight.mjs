/**
 * Anytime-TD preflight for one game, from committed files only (zero network).
 *
 * Prints, for the top candidates by model probability: model P(TD) (from the player board, untouched), eligibility,
 * and the price state from data/internal/research/odds/nfl/anytime-td-latest.json — so a missing price is visible
 * BEFORE any graphic is rendered or sent for founder review.
 *
 * Usage: node scripts/nfl/atd-preflight.mjs --event <espnId> [--top 3] [--now <iso>] [--max-age-hours 6] [--json]
 * Exit: 0 all candidates ready · 1 usage error · 3 at least one candidate blocked (missing price, unavailable, …)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ATD_DISPLAY_RELPATH } from "../../src/lib/sports/odds/nfl-atd-targeted.mjs";
import { atdPreflight, topAtdCandidates, formatPreflightTable, DEFAULT_MAX_AGE_HOURS } from "../../src/lib/sports/nfl/atd-prices.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function runPreflight(argv, { now = new Date().toISOString(), log = (s) => console.log(s), err = (s) => console.error(s) } = {}) {
  const arg = (n, f = null) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : f; };
  const event = String(arg("--event", "")).replace(/^nfl-/, "");
  if (!/^\d+$/.test(event)) { err("usage: --event <espnId> [--top 3] [--now <iso>]"); return 1; }
  const top = Number(arg("--top", "3"));
  const nowIso = arg("--now", now);
  const maxAgeHours = Number(arg("--max-age-hours", String(DEFAULT_MAX_AGE_HOURS)));
  const boardPath = path.join(APP, "public/data/nfl/player-board", `${event}.json`);
  if (!fs.existsSync(boardPath)) { err(`no committed player board for ${event} (${path.relative(APP, boardPath)})`); return 1; }
  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  const pricePath = path.join(APP, "..", ATD_DISPLAY_RELPATH);
  const file = fs.existsSync(pricePath) ? JSON.parse(fs.readFileSync(pricePath, "utf8")) : null;
  const result = atdPreflight({ file, board, eventId: event, candidates: topAtdCandidates(board, Number.isFinite(top) && top > 0 ? top : 3), nowIso, maxAgeHours });
  log(argv.includes("--json") ? JSON.stringify(result, null, 1) : formatPreflightTable(result));
  if (!file) log(`note: ${ATD_DISPLAY_RELPATH} does not exist yet — every price reads NO_CAPTURE`);
  return result.allReady ? 0 : 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(runPreflight(process.argv.slice(2)));
}
