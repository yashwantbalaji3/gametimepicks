#!/usr/bin/env node
/**
 * BUILD THE CANONICAL RESULTS PROJECTION (v1.8 · Track C · C1).
 *
 *   node scripts/results/build-results-projection.mjs --now <ISO>            # dry run: prints the cells
 *   node scripts/results/build-results-projection.mjs --now <ISO> --write    # writes latest.json + <date>.json
 *
 * Options: --root <public/data> (default app/public/data) · --internal-root <data/internal> (default
 * <repo>/data/internal) · --out <dir> (default <root>/results/projection) · --date <YYYY-MM-DD> (default:
 * the ET SLATE DATE of --now — see etSlateDate). `--now` is required for --write so the artifact is
 * replayable; a dry run defaults it to the clock.
 *
 * READS ONLY THE OWNERS (docs/V19_RESULTS_TRUST_ARCHITECTURE.md §2). Every owner is optional except
 * mr-dub/portfolio.json: a missing owner means its cells are absent — never zero — and the build
 * still succeeds. The assembly is `lib/results/projection-core.mjs`; this file is the IO around it.
 *
 * WRITE-ONCE, DATED (rule 7). The dated file is written once. A re-run whose cells differ from the
 * dated file on disk is REFUSED (exit 1) and writes nothing — the pattern of
 * scripts/settle-mlb-player-props.mjs — so a projection is replayable and a bot cannot silently
 * restate history. A re-run that is identical leaves the dated file untouched and refreshes
 * latest.json (a pointer, not history). What "differs" means: the `cells` and `headline` blocks;
 * `builtAt` and the sources' stamps are not history.
 *
 * NOT SCHEDULED. No workflow runs this yet (see docs/V18_RESULTS_PROJECTION_CONTRACT.md §9 for the
 * wiring plan and why it was left out of nightly-settle in C1). nightly-settle already stages
 * app/public/data/results/ as a whole, so once a step runs it, the artifact lands without a new
 * allowlist line.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProjection, PROJECTION_REL } from "../../src/lib/results/projection-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const REPO = path.resolve(APP, "..");

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** One owner: its path relative to the data root (what a cell cites) and its parsed document (null when absent). */
function owner(root, rel) {
  const doc = readJson(path.join(root, rel));
  return { path: rel, doc };
}

/**
 * Read every owner from disk. Exported so the parity test can build the projection in memory from the
 * SAME reads the script uses, and compare it with what each mounted consumer's loader returns.
 */
export function readSources(root, internalRoot) {
  const receiptsDir = path.join(root, "mr-dub", "settled");
  let receiptFiles = [];
  try { receiptFiles = fs.readdirSync(receiptsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { receiptFiles = []; }
  const receipts = receiptFiles.map((f) => ({ path: `mr-dub/settled/${f}`, doc: readJson(path.join(receiptsDir, f)) })).filter((r) => r.doc);
  const gradedPicks = {};
  for (const sport of ["mlb", "nfl", "ufc", "epl", "nba"]) {
    const g = owner(root, `${sport}/graded-picks.json`);
    if (g.doc) gradedPicks[sport] = g;
  }
  const cyclePath = path.join(internalRoot, "products", "cycle-table", "latest.json");
  const cycleDoc = readJson(cyclePath);
  return {
    portfolio: owner(root, "mr-dub/portfolio.json"),
    receipts,
    bankedLadders: owner(root, "mr-dub/banked-ladders.json"),
    moonshotLedger: owner(root, "product-ledger/moonshot.json"),
    gradedPicks,
    mlbLifetime: owner(root, "mlb/results/lifetime_summary.json"),
    nbaLifetime: owner(root, "results/lifetime_summary.json"),
    riskLadder: owner(root, "parlays/risk-ladder/latest.json"),
    labLedger: owner(root, "parlays/lab-ledger.json"),
    modelHealth: owner(root, "admin/model-health.json"),
    cycleTable: { path: "data/internal/products/cycle-table/latest.json", doc: cycleDoc },
  };
}

/**
 * THE DATE THIS ARTIFACT IS FILED UNDER — the ET slate day, never the UTC day.
 *
 * ⚠ WHY THIS IS NOT `NOW.slice(0, 10)`. It was, until 2026-09-24. Between 20:00 ET and midnight ET the
 * UTC date is ALREADY TOMORROW, so a producer run on the evening of 2026-09-23 wrote
 * `2026-09-24.json` — a dated, write-once artifact for a day whose settlement had not happened yet.
 * The next morning the real nightly-settle computed different cells, rule 7 correctly refused to
 * restate history, and the job failed. It failed again at 12:13Z and again at 13:30Z, and because
 * `morning-projections`, `mlb-daily-production` and `daily-products` all chain off it, NOTHING was
 * produced that day. One timezone in a filename took the whole daily product chain down, and the
 * write-once rule — which was doing exactly its job — was what surfaced it.
 *
 * Every other date in this pipeline is the ET slate day: nightly-settle's SETTLE_DATE is
 * `TZ=America/New_York date -d yesterday`, the freshness observers judge by buildEtDate, and the
 * ladders key cards to the slate day. This artifact now agrees with them, so "the projection for
 * 2026-09-23" means the same day everywhere.
 *
 * The write-once protection itself is UNCHANGED. A genuine restatement — same day, different cells —
 * is still refused, and must still be an operator decision.
 */
export const etSlateDate = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

/** The history a dated file pins: cells + headline. Stamps are not history. */
export const historyOf = (p) => JSON.stringify({ cells: p.cells, headline: p.headline });

/**
 * Write latest.json and <date>.json under `outDir`, write-once on the dated file.
 * Returns { wrote: string[], refused: string|null, untouched: string|null }.
 */
export function writeProjection(projection, { outDir, date }) {
  fs.mkdirSync(outDir, { recursive: true });
  const dated = path.join(outDir, `${date}.json`);
  const latest = path.join(outDir, "latest.json");
  const body = JSON.stringify(projection, null, 2) + "\n";
  const out = { wrote: [], refused: null, untouched: null };
  if (fs.existsSync(dated)) {
    const prior = readJson(dated);
    if (!prior || historyOf(prior) !== historyOf(projection)) {
      out.refused = `REFUSED: ${path.basename(dated)} exists and DIFFERS from this run. A dated projection is not rewritten silently.`;
      return out;
    }
    out.untouched = dated;
  } else {
    fs.writeFileSync(dated, body);
    out.wrote.push(dated);
  }
  fs.writeFileSync(latest, body);
  out.wrote.push(latest);
  return out;
}

function summarize(p) {
  const lines = [`[results-projection] ${p.cells.length} cells · builtAt ${p.builtAt}`];
  for (const c of p.cells) {
    const k = c.counts;
    const rec = Number.isInteger(k.won) && Number.isInteger(k.lost) ? `${k.won}-${k.lost}` : c.cycles ? `cycles ${c.cycles.started}` : c.ownerState ?? "—";
    lines.push(`  ${c.cellId.padEnd(64)} ${rec.padEnd(14)} n=${c.n ?? "—"} · ${c.window.from ?? "?"} → ${c.window.to ?? "?"} · ${c.status}${c.displayEligible.eligible ? "" : " · not shown"}`);
  }
  lines.push(`  headline: ${JSON.stringify(p.headline.byFamily)}`);
  return lines.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const WRITE = argv.includes("--write");
  const NOW = arg("--now", WRITE ? null : new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
  if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("--now <ISO> is required with --write (the artifact must be replayable)"); process.exit(2); }
  const ROOT = path.resolve(arg("--root", path.join(APP, "public", "data")));
  const INTERNAL = path.resolve(arg("--internal-root", path.join(REPO, "data", "internal")));
  const OUT = path.resolve(arg("--out", path.join(ROOT, PROJECTION_REL)));
  const DATE = arg("--date", etSlateDate(NOW));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error(`--date must be YYYY-MM-DD (got ${DATE})`); process.exit(2); }

  let projection;
  try {
    projection = buildProjection(readSources(ROOT, INTERNAL), { now: NOW });
  } catch (err) {
    console.error(`[results-projection] ${err.message}`);
    process.exit(3);
  }
  console.log(summarize(projection));
  if (!WRITE) { console.log("  dry run — nothing written. Re-run with --write."); return; }
  const r = writeProjection(projection, { outDir: OUT, date: DATE });
  if (r.refused) { console.error(`\n${r.refused}`); process.exit(1); }
  if (r.untouched) console.log(`  ${path.relative(APP, r.untouched)} already recorded and identical — left untouched`);
  for (const w of r.wrote) console.log(`  wrote ${path.relative(APP, w)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
