/**
 * capture-market-benchmark.mjs — append ONE real, timestamped benchmark snapshot of today's World Cup
 * markets to `world-cup/benchmark/<date>.json`. Pre-kickoff line-movement tracking (Phase 4 v1).
 *
 * Reads the already-built projections (`world-cup/projections/<date>.json`) — the live, de-vigged
 * consensus price per (match, market, selection) from the Odds API — and records the posted American
 * odds + implied probability with a capture timestamp. NO new Odds-API credits are spent (it snapshots
 * data already fetched by the projection build); NEVER fabricates a price; idempotent per capture bucket
 * (re-running in the same hour replaces that bucket's rows, never duplicates).
 *
 * Run on the Phase-4 schedule (02:00 / 06:00 / 09:00 / 11:00 / 13:00 / 15:00 ET + final pregame). Each
 * run adds one capture; movement/steam become meaningful once ≥2 captures accrue (see market-movement.ts).
 *
 *   npx tsx app/scripts/capture-market-benchmark.mjs --date 2026-06-26 [--at 2026-06-26T06:00:00Z]
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DATE = getArg("date", new Date().toISOString().slice(0, 10));
const AT = getArg("at", new Date().toISOString());
const ROOT = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app", "public", "data");
const log = (...m) => console.log("[benchmark]", ...m);

const americanToImpliedProb = (o) => (!Number.isFinite(o) || o === 0 ? 0 : o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const bucketOf = (iso) => `${iso.slice(0, 13)}:00Z`; // hour bucket, idempotency key

function main() {
  const projPath = path.join(ROOT, "world-cup", "projections", `${DATE}.json`);
  let proj;
  try { proj = JSON.parse(fs.readFileSync(projPath, "utf8")); }
  catch { log(`no projections for ${DATE} — NO-OP (nothing to snapshot)`); return; }

  const bucket = bucketOf(AT);
  const rows = (proj.matches ?? [])
    .filter((p) => Number.isFinite(p.americanOdds) && p.bankBuilderEligible !== undefined) // any real market line
    .map((p) => ({
      capturedAt: AT,
      bucket,
      matchId: p.matchId,
      game: `${p.homeTeam} vs ${p.awayTeam}`,
      market: p.market,
      selection: p.pickLabel,
      americanOdds: p.americanOdds,
      impliedProb: Math.round((americanToImpliedProb(p.americanOdds)) * 1e4) / 1e4,
    }));

  if (rows.length === 0) { log(`no market lines in ${DATE} projections — NO-OP`); return; }

  const outDir = path.join(ROOT, "world-cup", "benchmark");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${DATE}.json`);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(outPath, "utf8")); }
  catch { doc = { date: DATE, sport: "world_cup", note: "Pre-kickoff line-movement snapshots. Real Odds-API consensus prices; movement via lib/benchmark/market-movement.ts.", captures: [], rows: [] }; }

  // Idempotent: drop any existing rows/capture for this bucket, then append fresh.
  doc.rows = (doc.rows ?? []).filter((r) => r.bucket !== bucket);
  doc.captures = (doc.captures ?? []).filter((c) => c.bucket !== bucket);
  doc.rows.push(...rows);
  doc.captures.push({ capturedAt: AT, bucket, lines: rows.length });
  doc.captures.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  doc.generatedAt = AT;

  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  log(`captured ${rows.length} lines @ ${bucket} → ${path.relative(process.cwd(), outPath)} (${doc.captures.length} total captures)`);
}
main();
