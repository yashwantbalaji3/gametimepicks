/**
 * Build the NBA EXPERIMENTAL PUBLIC snapshot (§12 look 5 · §13) from the COMMITTED, frozen v0.1 forecast file.
 * Copies receipt-verified pre-tip outputs only (lib/sports/nba/experimental-public-lane.mjs); recomputes nothing.
 *
 *   node scripts/nba/build-nba-experimental-public.mjs --date 2026-10-20 [--now <ISO>] [--write]
 * Writes app/public/data/nba/experimental-public/<date>.json and latest.json. Exit 1 if the source is missing or any
 * published number fails the re-derivation check.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildExperimentalSnapshot, buildExperimentalAudit, snapshotMatchesSource } from "../../src/lib/sports/nba/experimental-public-lane.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const DATE = opt("--date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
const NOW = opt("--now") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const rel = path.join("data", "internal", "research", "nba", "experimental-v0.1", "forecasts", `${DATE}.json`);
const abs = path.join(REPO, rel);
if (!fs.existsSync(abs)) { console.error(`REFUSED: no committed v0.1 forecast file for ${DATE}`); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
let commit = null;
try { commit = execFileSync("git", ["log", "-1", "--format=%H", "--", rel], { cwd: REPO, encoding: "utf8" }).trim() || null; } catch { /* not a git checkout */ }

// Published label omits the internal prefix: the public file names the family and date, the commit pins the bytes.
// §13 amendment A: a combo that does not reconcile with its source draws throws REFUSED inside the build — exit 1.
let snap;
try {
  snap = buildExperimentalSnapshot({ forecastDoc: doc, sourceFile: `nba/experimental-v0.1/forecasts/${DATE}.json`, sourceCommit: commit, generatedAt: NOW });
} catch (e) { console.error(e.message); process.exit(1); }
const byId = new Map(doc.games.map((g) => [String(g.providerEventId), g]));
for (const g of snap.games) {
  if (!snapshotMatchesSource(g, byId.get(g.providerEventId))) { console.error(`REFUSED: ${g.providerEventId} does not re-derive from its receipt`); process.exit(1); }
}
for (const g of snap.games) console.log(`${g.away.abbr} @ ${g.home.abbr} (${g.providerEventId}) · tip ${g.tipUtc} · frozen ${g.frozenAt} · Elo favours ${g.elo.favoured} · players ${g.players.away.length}+${g.players.home.length} · receipt ${g.receipt.payloadSha256.slice(0, 12)}`);
for (const e of snap.excluded) console.log(`EXCLUDED ${e.providerEventId}: ${e.reason}`);
if (argv.includes("--write")) {
  const out = path.join(APP, "public", "data", "nba", "experimental-public");
  fs.mkdirSync(out, { recursive: true });
  const text = `${JSON.stringify(snap, null, 1)}\n`;
  fs.writeFileSync(path.join(out, `${DATE}.json`), text);
  fs.writeFileSync(path.join(out, "latest.json"), text);
  console.log(`wrote public/data/nba/experimental-public/${DATE}.json (+ latest.json)`);
  // The private audit companion (never exported): why each withholding holds, and the seeds.
  const auditDir = path.join(REPO, "data", "internal", "research", "nba", "experimental-public-audit");
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(path.join(auditDir, `${DATE}.json`), `${JSON.stringify(buildExperimentalAudit({ forecastDoc: doc, generatedAt: NOW }), null, 1)}\n`);
  console.log(`wrote data/internal/research/nba/experimental-public-audit/${DATE}.json (private)`);
}
