#!/usr/bin/env node
/**
 * QB STARTER · SHADOW REPORT (§19, §12.1, §2.5) — one command, one question:
 *
 *   "If only the depth chart's QB1 held a share of a team's PASS-ATTEMPT pool, what would change?"
 *
 * ⚠ SHADOW ONLY. No write, no provider call, no eligibility flag, no published number. §2.5
 *   pre-authorises publishing QB starter state AFTER Sunday's lifecycle acceptance and forbids it
 *   before, so this command exists to inform that gate and cannot pre-empt it.
 *
 * ⚠ THE PASS-ATTEMPT POOL AND NOTHING ELSE. The source is nflverse `depth_charts`, whose snapshot
 *   carries `quarterbacks` only. Calling this "one starter per pool" would claim a reach over
 *   carries and targets that no data here supports.
 *
 * ⚠ NOT RENORMALISATION. Σ after removal is reported as it falls, even when still above 1. §20
 *   keeps rescaling the survivors behind a model-promotion gate.
 *
 * Usage:
 *   node app/scripts/ops/nfl-qb-starter-shadow.mjs --date 2026-09-27
 *   node app/scripts/ops/nfl-qb-starter-shadow.mjs --date 2026-09-27 --json
 *   node app/scripts/ops/nfl-qb-starter-shadow.mjs --date 2026-09-27 --max-age-days 3
 *
 * EXIT CODES — a shadow report describes; it does not fail a build.
 *   0  the measurement ran (whatever it found)
 *   2  it could not run (a path or join that should exist does not)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { conservationForBoard } from "../../src/lib/sports/nfl/opportunity-conservation.mjs";
import { indexDepthCharts } from "../../src/lib/sports/nfl/depth-chart.mjs";
import { qbShadowForPool, qbShadowFold, QB_POOL, pickNewestCapture } from "../../src/lib/sports/nfl/qb-starter-shadow.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const BOARDS = path.join(ROOT, "app/public/data/nfl/player-board");
const FORWARD = path.join(ROOT, "data/internal/research/nfl/replay/player-props-share-level-forward");
const CHARTS = path.join(ROOT, "data/internal/research/nfl/depth-charts");

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);
const DATE = arg("--date");
const JSON_OUT = has("--json");
/* §12.1 fixed 3 days as the bound a Week-N role may be read across; it is an argument so the
   sensitivity is measurable, not so it can be widened until something resolves. */
const MAX_AGE_MS = Number(arg("--max-age-days", "3")) * 86400000;

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const die = (m) => { console.error(`REFUSED: ${m}`); process.exit(2); };

if (!fs.existsSync(BOARDS)) die(`no player-board directory at ${BOARDS}`);
if (!fs.existsSync(CHARTS)) die(`no depth-chart directory at ${CHARTS}`);

/* ⚠ BY acquiredAt, NEVER BY FILENAME — the names are content-addressed hashes and do not sort by
   time. See pickNewestCapture; reading the wrong capture already produced one false finding. */
const captures = fs.readdirSync(CHARTS).filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: f, doc: read(path.join(CHARTS, f)) }))
  .filter((c) => c.doc?.snapshots?.length);
const picked = pickNewestCapture(captures);
if (!picked) die(`no depth-chart capture in ${CHARTS} carries both snapshots and an acquiredAt`);
const chartFile = picked.file;
const chartDoc = picked.doc;
const index = indexDepthCharts(chartDoc);

const boards = fs.readdirSync(BOARDS).filter((f) => /^\d+\.json$/.test(f))
  .map((f) => read(path.join(BOARDS, f)))
  .filter((b) => b && b.artifact === "nfl-player-board")
  .filter((b) => (DATE ? String(b.kickoffUtc ?? "").startsWith(DATE) : Date.parse(b.kickoffUtc ?? "") > Date.now()))
  .sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));

if (!boards.length) {
  console.log(`NO_BOARDS — ${DATE ?? "the future boards"} has no published player board. Nothing to measure; a result, not a gap.`);
  process.exit(0);
}

const forecastCache = new Map();
const forecastFor = (season, week) => {
  const key = `${season}-${String(week).padStart(2, "0")}`;
  if (!forecastCache.has(key)) {
    const doc = read(path.join(FORWARD, `${key}.json`));
    if (!doc?.columns || !doc?.rows) forecastCache.set(key, null);
    else {
      const C = Object.fromEntries(doc.columns.map((c, i) => [c, i]));
      const m = new Map();
      for (const r of doc.rows) m.set(`${r[C.espnId]}|${r[C.team]}|${r[C.market]}`, r[C.share]);
      forecastCache.set(key, { map: m });
    }
  }
  return forecastCache.get(key);
};
const seasonOf = (iso) => { const d = new Date(iso); return d.getUTCMonth() < 2 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(); };

const results = [];
const unmeasurable = [];
for (const b of boards) {
  const fc = forecastFor(seasonOf(b.kickoffUtc), b.week);
  if (!fc) { unmeasurable.push(`${b.matchup} — no share-level forward forecast on disk`); continue; }
  const cons = conservationForBoard({ board: b, shareOf: (id, team, market) => fc.map.get(`${id}|${team}|${market}`) });
  /* Every id on the board in ANY market — see SKIP in the shadow module. */
  const boardPlayerIds = new Set((b.players ?? []).map((p) => String(p.playerId ?? "").replace(/^nfl-athlete-/, "")));
  for (const row of cons.rows) {
    if (row.pool !== QB_POOL) continue;
    /*
     * ⚠ THE BOARD'S OWN generatedAt, NEVER A CLOCK. Resolving "who was QB1" against `Date.now()`
     * would answer a question about the present about a board frozen in the past, and would make
     * this report's own numbers drift between runs.
     */
    results.push({
      matchup: b.matchup, kickoffUtc: b.kickoffUtc,
      ...qbShadowForPool({ row, index, asOf: b.generatedAt ?? b.kickoffUtc, maxAgeMs: MAX_AGE_MS, boardPlayerIds }),
    });
  }
}

const fold = qbShadowFold(results);

if (JSON_OUT) {
  /* ⚠ fs.writeSync, NOT console.log — see nfl-opportunity-conservation.mjs. On a pipe, an async
     stdout write followed by process.exit() loses the tail, and a 65536-byte cut produces invalid
     JSON under a success exit code. This report already ran at 12KB and would grow into it. */
  fs.writeSync(1, JSON.stringify({
    artifact: "nfl-qb-starter-shadow", shadowOnly: true, pool: QB_POOL,
    depthChartArtifact: chartFile, maxAgeDays: MAX_AGE_MS / 86400000,
    scope: DATE ?? "future", fold, unmeasurable, pools: results,
  }, null, 1) + "\n");
  process.exit(0);
}

console.log(`NFL QB-STARTER SHADOW · ${DATE ?? "future boards"} · pool ${QB_POOL} · bound ${MAX_AGE_MS / 86400000}d`);
console.log(`depth chart: ${chartFile}\n`);
console.log("SHADOW ONLY — nothing below is published, and no eligibility flag is touched.");
console.log("'after' removes every QB but the depth chart's QB1. It does NOT rescale the survivor (§20).\n");

for (const r of results) {
  const tag = !r.applied ? `SKIPPED ${r.skip}${r.detail ? `:${r.detail}` : ""}` : r.stillOverAllocated ? "STILL OVER" : r.before > 1 ? "RESOLVED" : "was fine";
  const age = r.ageMs == null ? "—" : `${(r.ageMs / 86400000).toFixed(1)}d`;
  console.log(`${r.team.padEnd(4)} Σ${r.before.toFixed(3)} → ${r.applied ? `Σ${r.after.toFixed(3)}` : "  —  "}  ${tag.padEnd(16)} snapshot ${age} old  ${r.starter ? `QB1 ${r.starter.name}` : ""}`);
  for (const x of r.removed) console.log(`        − ${x.name} ${Number(x.share).toFixed(3)}`);
}
for (const u of unmeasurable) console.log(`✗ UNMEASURABLE — ${u}`);

console.log(`\nSHADOW FOLD · ${fold.pools} pass-attempt pool(s) · rule applied to ${fold.applied}`);
console.log(`  over-allocated before: ${fold.overBefore}   after: ${fold.overAfter}   (resolved ${fold.fixed}, still over ${fold.stillOver})`);
console.log(`  shares removed: ${fold.removedRows}   skipped: ${fold.skipped}${fold.skipped ? ` (${Object.entries(fold.bySkipReason).map(([k, v]) => `${k}×${v}`).join(", ")})` : ""}`);
console.log(`\nA skipped pool is left EXACTLY as published — fail-closed. Publishing remains a founder gate (§2.5, after Sunday acceptance).`);
process.exit(0);
