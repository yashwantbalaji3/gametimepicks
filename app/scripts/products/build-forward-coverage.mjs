/**
 * FORWARD-COVERAGE BUILDER (P211 · Release C). PRIVATE OPERATING RECORD.
 *
 * Reads the SAME canonical artifacts the public surfaces read — EPL fixtures/odds/forecast days,
 * the UFC card + authorized odds capture, the NFL index, today's MLB board — and derives one dated
 * coverage artifact through the pure module (lib/products/forward-coverage.mjs). No policy here,
 * no writes to any source, no wall clock beyond the required --now.
 *
 * Usage: npx tsx scripts/products/build-forward-coverage.mjs --now <iso> [--date YYYY-MM-DD] [--dry-run]
 * Writes: data/internal/products/forward-coverage/<date>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveForwardCoverage } from "../../src/lib/products/forward-coverage.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const DATA = path.join(APP, "public", "data");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const DRY_RUN = process.argv.includes("--dry-run");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DATE = arg("--date", NOW.slice(0, 10));
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// EPL: the newest real fixtures capture (never a sample-*), the odds capture, every forecast day's rows.
const fixturesDir = path.join(DATA, "soccer/epl/fixtures");
const captureNames = (fs.existsSync(fixturesDir) ? fs.readdirSync(fixturesDir) : []).filter((n) => n.startsWith("capture-")).sort();
const fixtures = captureNames.length ? read(path.join(fixturesDir, captureNames.at(-1))) : null;
const eplOdds = read(path.join(DATA, "soccer/epl/odds/latest.json"));
const forecastsDir = path.join(DATA, "soccer/epl/forecasts");
const forecastRows = (fs.existsSync(forecastsDir) ? fs.readdirSync(forecastsDir) : [])
  .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
  .flatMap((n) => read(path.join(forecastsDir, n))?.rows ?? []);

const coverage = deriveForwardCoverage({
  nowMs: Date.parse(NOW),
  epl: { fixtures, odds: eplOdds, forecastRows },
  ufc: { card: read(path.join(DATA, "ufc/card-latest.json")), odds: read(path.join(DATA, "ufc/odds-latest.json")) },
  nfl: { index: read(path.join(DATA, "nfl/index.json")), schedule: read(path.join(DATA, "nfl/schedule/latest.json")), modelStatus: read(path.join(DATA, "nfl/model-status.json")) },
  mlb: { board: read(path.join(DATA, `mlb/boards/${DATE}.json`)), date: DATE },
});

const artifact = {
  schemaVersion: 1,
  artifact: "forward-coverage",
  dataClass: "PRIVATE_OPERATING_RECORD",
  date: DATE,
  generatedAt: NOW,
  sources: {
    eplFixturesCapture: captureNames.at(-1) ?? null,
    eplOddsCapturedAt: eplOdds?.capturedAt ?? null,
    eplForecastDays: forecastRows.length,
    ufcCardGeneratedAt: coverage.sports.find((s) => s.sport === "ufc")?.state === "REFUSED" ? null : read(path.join(DATA, "ufc/card-latest.json"))?.generatedAt ?? null,
    nflIndexGeneratedAt: read(path.join(DATA, "nfl/index.json"))?.generatedAt ?? null,
  },
  ...coverage,
};

const outPath = path.join(ROOT, "data/internal/products/forward-coverage", `${DATE}.json`);
if (DRY_RUN) {
  console.log(`DRY RUN — nothing written. Would write ${path.relative(ROOT, outPath)}:`);
} else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 1));
}
for (const s of coverage.sports) {
  const c = s.counts ? `sched ${s.counts.scheduled} · priced ${s.counts.priced} · gen ${s.counts.generated} · started ${s.counts.started}` : "counts —";
  console.log(`${s.sport.padEnd(4)} ${s.state.padEnd(18)} ${c}${s.findings.length ? ` · ${s.findings.join(" | ")}` : ""}`);
}
