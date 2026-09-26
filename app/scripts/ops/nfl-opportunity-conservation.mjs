#!/usr/bin/env node
/**
 * OPPORTUNITY CONSERVATION — one command, one question:
 *
 *   "Do the players on a published board between them hold more of their team's targets, carries
 *    or pass attempts than the team has?"
 *
 * Usage:
 *   node app/scripts/ops/nfl-opportunity-conservation.mjs                      # every future board
 *   node app/scripts/ops/nfl-opportunity-conservation.mjs --date 2026-09-27
 *   node app/scripts/ops/nfl-opportunity-conservation.mjs --date 2026-09-27 --json
 *   node app/scripts/ops/nfl-opportunity-conservation.mjs --all                # every committed board
 *
 * ⚠ READ-ONLY. No provider call, no write, no refetch — same rule as the lifecycle trace.
 *
 * EXIT CODES
 *   0  CONSERVED, or nothing to measure
 *   1  OVER_ALLOCATED — at least one team-pool exceeds the opportunity that exists
 *   2  the audit itself could not run (a path or a join that should exist does not)
 *
 * The rule lives in app/src/lib/sports/nfl/opportunity-conservation.mjs and is tested there against
 * synthetic boards, so it is exercised without waiting for a slate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { conservationForBoard, foldConservation, THIN_BELOW } from "../../src/lib/sports/nfl/opportunity-conservation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const BOARDS = path.join(ROOT, "app/public/data/nfl/player-board");
const FORWARD = path.join(ROOT, "data/internal/research/nfl/replay/player-props-share-level-forward");

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);
const DATE = arg("--date");
const JSON_OUT = has("--json");
const ALL = has("--all");

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

if (!fs.existsSync(BOARDS)) { console.error(`REFUSED: no player-board directory at ${BOARDS}`); process.exit(2); }

const boards = fs.readdirSync(BOARDS).filter((f) => /^\d+\.json$/.test(f))
  .map((f) => read(path.join(BOARDS, f)))
  .filter((b) => b && b.artifact === "nfl-player-board")
  .filter((b) => ALL || (DATE ? String(b.kickoffUtc ?? "").startsWith(DATE) : Date.parse(b.kickoffUtc ?? "") > Date.now()))
  .sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));

if (!boards.length) {
  const scope = DATE ? `slate ${DATE}` : ALL ? "the whole board directory" : "the future boards";
  console.log(`NO_BOARDS — ${scope} has no published player board. Nothing to measure; this is a result, not a gap.`);
  process.exit(0);
}

/* The forecast is keyed per (season, week); a board whose week has no forecast cannot be measured,
   and saying so is the point — a silent zero would read as perfect conservation. */
const forecastCache = new Map();
const forecastFor = (season, week) => {
  const key = `${season}-${String(week).padStart(2, "0")}`;
  if (!forecastCache.has(key)) {
    const doc = read(path.join(FORWARD, `${key}.json`));
    if (!doc?.columns || !doc?.rows) { forecastCache.set(key, null); }
    else {
      const C = Object.fromEntries(doc.columns.map((c, i) => [c, i]));
      const m = new Map();
      for (const r of doc.rows) m.set(`${r[C.espnId]}|${r[C.team]}|${r[C.market]}`, r[C.share]);
      forecastCache.set(key, { map: m, generatedAt: doc.generatedAt, rows: doc.rows.length });
    }
  }
  return forecastCache.get(key);
};
const seasonOf = (iso) => { const d = new Date(iso); return d.getUTCMonth() < 2 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(); };

const per = [];
const unmeasurable = [];
for (const b of boards) {
  const fc = forecastFor(seasonOf(b.kickoffUtc), b.week);
  if (!fc) { unmeasurable.push(`${b.matchup} (season ${seasonOf(b.kickoffUtc)} week ${b.week}) — no share-level forward forecast on disk`); continue; }
  per.push({ ...conservationForBoard({ board: b, shareOf: (id, team, market) => fc.map.get(`${id}|${team}|${market}`) }), forecastGeneratedAt: fc.generatedAt });
}

const fold = foldConservation(per);

if (JSON_OUT) {
  console.log(JSON.stringify({ artifact: "nfl-opportunity-conservation", asOf: new Date().toISOString(), scope: DATE ?? (ALL ? "all" : "future"), fold, unmeasurable, boards: per }, null, 1));
  process.exit(fold.overAllocated ? 1 : 0);
}

const MARK = { CONSERVED: "✓", OVER_ALLOCATED: "!", UNDER_ALLOCATED: "·", NO_JOIN: "✗" };
console.log(`NFL OPPORTUNITY CONSERVATION · ${DATE ?? (ALL ? "all committed boards" : "future boards")} · as of ${new Date().toISOString()}`);
console.log(`(✓ conserved · ! over-allocated  · thin (Σ < ${THIN_BELOW})  ✗ no join)\n`);
console.log("Σshare is the fraction of a team's own opportunity pool held by the players a reader sees.");
console.log("Σ > 1 is opportunity that does not exist. Σ < 1 is legitimate — the residual is the unmodelled tail.\n");

for (const b of per) {
  const flag = b.overAllocated ? "  ← OVER" : "";
  console.log(`${b.matchup}  (${b.providerEventId})  kickoff ${b.kickoffUtc}${flag}`);
  for (const r of b.rows) {
    const largest = r.largest ? `${r.largest.name} ${r.largest.share.toFixed(3)}` : "—";
    console.log(`   ${MARK[r.state]} ${r.team.padEnd(4)} ${r.pool.padEnd(12)} Σ${r.sum.toFixed(3)}  ${String(r.joined).padStart(2)} joined${r.missed ? `, ${r.missed} unjoined` : ""}  · largest ${largest}`);
  }
  console.log("");
}
for (const u of unmeasurable) console.log(`✗ UNMEASURABLE — ${u}`);
console.log(`\nSLATE: ${fold.state} — ${fold.boards} board(s), ${fold.teamPools} team-pool(s), ${fold.overAllocated} over-allocated, worst Σ ${fold.worst == null ? "n/a" : fold.worst.toFixed(3)}`);
if (unmeasurable.length) console.log(`       ${unmeasurable.length} board(s) could not be measured — that is a gap, not a pass.`);
process.exit(fold.overAllocated ? 1 : 0);
