/**
 * NBA EXPERIMENTAL PUBLIC LANE · AUTOMATED PUBLISH (once per slate). Wraps build-nba-experimental-public.mjs's pure
 * pieces with the publish decision (lib/sports/nba/experimental-lane-publish.mjs): HOLD until every scheduled game of
 * the slate is frozen in v0.1 or has tipped; REFUSE on any re-derivation failure or a differing published day file;
 * NOOP when nothing changed. Writes ONLY app/public/data/nba/experimental-public/<date>.json and latest.json (a Vercel
 * build input: at most one publish per slate).
 *
 *   node scripts/nba/publish-nba-experimental-lane.mjs --date 2026-10-21 [--now <ISO>] [--write] [--theater]
 * Exit 0 for HOLD / NOOP / PUBLISH, 1 for REFUSE. Prints `action=<ACTION>` as its last line (for the workflow).
 *
 * --theater (PR 1167, release owner 2026-10-21): on a PUBLISH with --write, ALSO build the slate's NBA Theater possession
 * runs (scripts/nba/research/build-theater-possession-runs.mjs --date <D> --write --no-rewrite) so ONE commit carries the
 * day file, latest.json and data/internal/research/nba/theater-possession/<D>/. The Theater can never block the lane:
 * a failed or refused build prints `theater=FAILED …` and the lane still publishes (that day simply has no Theater).
 * Prints `theater=OK|FAILED|SKIPPED` before the action line. Never run on NOOP / HOLD: a published slate is frozen.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildExperimentalSnapshot, snapshotMatchesSource, unavailablePlayersForPublish } from "../../src/lib/sports/nba/experimental-public-lane.mjs";
import { decidePublish, PUBLISH } from "../../src/lib/sports/nba/experimental-lane-publish.mjs";
import { etDateOf } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { eloWinProbabilityForPublish } from "../../src/lib/sports/nba/elo-win-probability.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const DATE = opt("--date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
const NOW = opt("--now") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const readJson = (abs) => { try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch { return null; } };

const rel = path.join("data", "internal", "research", "nba", "experimental-v0.1", "forecasts", `${DATE}.json`);
const forecastDoc = readJson(path.join(REPO, rel));
const schedule = readJson(path.join(APP, "public", "data", "nba", "schedule", "latest.json"));
const OUT = path.join(APP, "public", "data", "nba", "experimental-public");
const committedDay = readJson(path.join(OUT, `${DATE}.json`));
const committedLatest = readJson(path.join(OUT, "latest.json"));

let snapshot = null;
let rederivesOk = false;
if (forecastDoc?.family === "v0.1") {
  let commit = null;
  try { commit = execFileSync("git", ["log", "-1", "--format=%H", "--", rel], { cwd: REPO, encoding: "utf8" }).trim() || null; } catch { /* not a git checkout */ }
  // the published day file pins the commit it was built from; a rebuild of the same bytes keeps that pin
  if (committedDay?.source?.file === `nba/experimental-v0.1/forecasts/${DATE}.json` && committedDay.source.commit) commit = committedDay.source.commit;
  // founder decision 2026-10-23: the Elo game-winner probability follows the switch for an unpublished slate only; a
  // published slate is rebuilt exactly as it was published (so a flip never makes it differ or rewrites it)
  snapshot = buildExperimentalSnapshot({ forecastDoc, sourceFile: `nba/experimental-v0.1/forecasts/${DATE}.json`, sourceCommit: commit, generatedAt: NOW, eloWinProbability: eloWinProbabilityForPublish(committedDay), unavailablePlayers: unavailablePlayersForPublish(committedDay) });
  const byId = new Map(forecastDoc.games.map((g) => [String(g.providerEventId), g]));
  rederivesOk = snapshot.games.every((g) => snapshotMatchesSource(g, byId.get(g.providerEventId)));
}

const d = decidePublish({ date: DATE, scheduleRows: schedule?.rows ?? [], etDateOf, forecastDoc, now: NOW, snapshot, rederivesOk, committedDay, committedLatest });
console.log(`${DATE}: ${d.action} — ${d.reason}`);
for (const id of d.unfrozen) console.log(`  never frozen before tip: ${id}`);
if (d.action === PUBLISH.PUBLISH && argv.includes("--write")) {
  const text = `${JSON.stringify(snapshot, null, 1)}\n`;
  fs.mkdirSync(OUT, { recursive: true });
  if (d.writeDay) { fs.writeFileSync(path.join(OUT, `${DATE}.json`), text); console.log(`  wrote public/data/nba/experimental-public/${DATE}.json`); }
  if (d.writeLatest) { fs.writeFileSync(path.join(OUT, "latest.json"), d.writeDay ? text : `${JSON.stringify(committedDay, null, 1)}\n`); console.log("  wrote public/data/nba/experimental-public/latest.json"); }
}
if (argv.includes("--theater")) {
  if (d.action === PUBLISH.PUBLISH && argv.includes("--write")) {
    try {
      const outText = execFileSync("npx", ["tsx", path.join("scripts", "nba", "research", "build-theater-possession-runs.mjs"), "--date", DATE, "--write", "--no-rewrite"], { cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10 * 60 * 1000 });
      for (const line of outText.trim().split("\n").filter((l) => /^(timing|storage|wrote|data\/)/.test(l))) console.log(`  theater: ${line}`);
      console.log("theater=OK");
    } catch (e) {
      const why = String(e?.stderr ?? e?.message ?? e).trim().split("\n").filter(Boolean).at(-1) ?? "unknown";
      console.log(`theater=FAILED ${why} (the lane still publishes; no Theater for ${DATE})`);
    }
  } else console.log(`theater=SKIPPED (${d.action}${argv.includes("--write") ? "" : ", dry run"})`);
}
console.log(`action=${d.action}`);
process.exit(d.action === PUBLISH.REFUSE ? 1 : 0);
