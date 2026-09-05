#!/usr/bin/env node
/**
 * THE FULL MODEL-PICK RESULT HISTORY, PARTITIONED — Program 235 · Release D.
 *
 * `graded-picks.json` counts 40,072 settled model picks and publishes 60 of them. The other 40,012
 * are not missing — they are in `public/data/mlb/results/calibration/<date>.jsonl`, one row per
 * pick, with its outcome. They have simply never been reachable: the export prune keeps only data
 * files the shipped output names, and it considers only `.json`, so not one `.jsonl` has ever
 * survived a build.
 *
 * This turns that history into something a page can actually serve.
 *
 *   model-index.json      one row per date × market: counts only. Small enough to ship whole, so
 *                         filters and headline figures need no detail at all.
 *   model-rows/<date>.json  that date's picks, sanitized. Fetched only when a reader opens a date.
 *
 * WHAT IS DELIBERATELY DROPPED. `edgePct` and `confidence` are internal selection signals this
 * project does not surface, and `sourceArtifact` is an internal path. They are removed here rather
 * than hidden in the UI, so a reader who opens the JSON directly sees the same thing the page does.
 *
 * WHAT IS DELIBERATELY KEPT. Both probabilities, because the model-versus-market comparison is only
 * honest on rows that carry both, and every row here does.
 *
 * RECONCILIATION IS THE POINT. The index must reproduce the published aggregate exactly — 19,015
 * wins, 18,943 losses, 2,114 pushes — or the whole feature is a second set of numbers disagreeing
 * with the first. The build refuses when it does not.
 *
 *   node app/scripts/results/build-model-results-index.mjs [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(APP, "public/data/mlb/results/calibration");
const OUT_DIR = path.join(APP, "public/data/mlb/results");
const ROWS_DIR = path.join(OUT_DIR, "model-rows");
const INDEX = path.join(OUT_DIR, "model-index.json");
const AGGREGATE = path.join(APP, "public/data/mlb/graded-picks.json");

const apply = process.argv.includes("--apply");
const NOW = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** One published row. Everything a reader may see, and nothing internal. */
function sanitize(r) {
  return {
    id: r.id,
    date: r.date,
    sport: String(r.sport ?? "MLB").toLowerCase(),
    gameId: r.gameId ?? null,
    eventName: r.eventName ?? null,
    market: r.market,
    player: r.playerName ?? null,
    team: r.team ?? null,
    opponent: r.opponent ?? null,
    selection: r.selection ?? null,
    side: r.side ?? null,
    line: Number.isFinite(r.line) ? r.line : null,
    modelProbability: Number.isFinite(r.modelProbability) ? r.modelProbability : null,
    marketProbability: Number.isFinite(r.marketProbability) ? r.marketProbability : null,
    projection: Number.isFinite(r.projection) ? r.projection : null,
    outcome: r.outcome,
    settledStat: r.settledStat ?? null,
  };
}

const files = (() => {
  try { return fs.readdirSync(SRC).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort(); } catch { return []; }
})();
if (!files.length) { console.error(`REFUSED: no calibration rows at ${path.relative(APP, SRC)}`); process.exit(1); }

const byDate = new Map();
let malformed = 0;
for (const file of files) {
  const date = file.slice(0, 10);
  const rows = [];
  for (const line of fs.readFileSync(path.join(SRC, file), "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { malformed += 1; continue; }
    if (!r?.outcome || !r?.market) { malformed += 1; continue; }
    rows.push(sanitize(r));
  }
  if (rows.length) byDate.set(date, rows);
}

/** Counts for one row set. Pushes are neither a win nor a loss and are never in a rate. */
const tally = (rows) => {
  const wins = rows.filter((r) => r.outcome === "win").length;
  const losses = rows.filter((r) => r.outcome === "loss").length;
  const pushes = rows.filter((r) => r.outcome === "push").length;
  return { rows: rows.length, wins, losses, pushes, decisive: wins + losses };
};

const index = [];
for (const [date, rows] of [...byDate].sort()) {
  const markets = [...new Set(rows.map((r) => r.market))].sort();
  index.push({
    date,
    sport: "mlb",
    ...tally(rows),
    byMarket: Object.fromEntries(markets.map((m) => [m, tally(rows.filter((r) => r.market === m))])),
    /* The partition URL is written into the index so the page can name it, which is also what keeps
       the prune from deleting it: the export sweep keeps only paths the shipped output references. */
    rowsUrl: `/data/mlb/results/model-rows/${date}.json`,
  });
}

const totals = tally([...byDate.values()].flat());

/* ── the refusal that makes this trustworthy ─────────────────────────────────────────────────── */
const agg = (() => { try { return JSON.parse(fs.readFileSync(AGGREGATE, "utf8")); } catch { return null; } })();
const problems = [];
if (agg?.counts) {
  if (totals.wins !== agg.counts.hits) problems.push(`wins ${totals.wins} vs published hits ${agg.counts.hits}`);
  if (totals.losses !== agg.counts.misses) problems.push(`losses ${totals.losses} vs published misses ${agg.counts.misses}`);
  if (totals.pushes !== agg.counts.voided) problems.push(`pushes ${totals.pushes} vs published voided ${agg.counts.voided}`);
  if (totals.decisive !== agg.counts.counted) problems.push(`decisive ${totals.decisive} vs published counted ${agg.counts.counted}`);
} else {
  problems.push("the published aggregate could not be read — there is nothing to reconcile against");
}

console.log(`model results index — ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`  source files: ${files.length} · dates with rows: ${byDate.size} · malformed lines skipped: ${malformed}`);
console.log(`  rows: ${totals.rows} · ${totals.wins}-${totals.losses} · ${totals.pushes} push · ${totals.decisive} decisive`);
if (problems.length) {
  console.error("REFUSED: the detail does not reconcile with the published aggregate:");
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(2);
}
console.log(`  reconciles with graded-picks.json: wins, losses, pushes and decisive all match`);

if (!apply) { console.log("\ndry run — nothing written. Re-run with --apply."); process.exit(0); }

fs.mkdirSync(ROWS_DIR, { recursive: true });
for (const [date, rows] of byDate) {
  fs.writeFileSync(path.join(ROWS_DIR, `${date}.json`), JSON.stringify({
    schemaVersion: 1, artifact: "mlb-model-results-rows", dataClass: "PUBLIC_DERIVED",
    date, sport: "mlb", generatedAt: NOW, ...tally(rows), rows,
  }) + "\n");
}
fs.writeFileSync(INDEX, JSON.stringify({
  schemaVersion: 1, artifact: "mlb-model-results-index", dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW, sport: "mlb",
  coverage: {
    dates: byDate.size, firstDate: index[0]?.date ?? null, lastDate: index[index.length - 1]?.date ?? null,
    ...totals,
    note: "Every settled model pick this project has graded, one row per pick. Reconciled against graded-picks.json at build time; the build refuses if the two disagree.",
  },
  days: index,
}, null, 2) + "\n");
console.log(`\nwrote ${path.relative(APP, INDEX)} and ${byDate.size} partition(s) under ${path.relative(APP, ROWS_DIR)}`);
