/**
 * NCAAF · overtime-period table (NCAAF-003.3). PRIVATE_RESEARCH.
 *
 * For every corpus game that went to overtime: regulation score and per-OT-period points, re-derived from the
 * cached ESPN line scores (espn-cache.mjs; no network), validated against the season's OT rules, quarantined
 * (never corrected) when they do not fit. Output:
 *   data/internal/research/ncaaf/corpus/v1/overtime-periods.json   rows + quarantine list + sha256 of the corpus
 *                                                                   manifest it was joined to
 *
 * Run (from app/): node scripts/ncaaf/build-overtime-table.mjs --now 2026-10-09T23:30:00Z [--check]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { overtimeRow } from "../../src/lib/sports/ncaaf/overtime.mjs";
import { ROOT, loadSeasonEvents } from "./espn-cache.mjs";

const CORPUS = path.join(ROOT, "data", "internal", "research", "ncaaf", "corpus", "v1");
const OUT = path.join(CORPUS, "overtime-periods.json");
const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const manifestText = fs.readFileSync(path.join(CORPUS, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);
const rows = [], quarantined = [];
for (const season of Object.keys(manifest.seasons).map(Number).sort()) {
  const games = new Map(fs.readFileSync(path.join(CORPUS, `games-${season}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((g) => [g.eventId, g]));
  const { events } = loadSeasonEvents(season);
  for (const e of events) {
    const g = games.get(e.providerEventId);
    if (!g || !(g.overtimePeriods > 0)) continue;
    const r = overtimeRow(e, g.slateDate);
    if (r.quarantined) quarantined.push({ eventId: r.eventId, season, reason: r.quarantined });
    else rows.push(r);
  }
}
rows.sort((a, b) => a.slateDate.localeCompare(b.slateDate) || a.eventId.localeCompare(b.eventId));
quarantined.sort((a, b) => a.eventId.localeCompare(b.eventId));
const body = `${JSON.stringify({
  schemaVersion: 1,
  sport: "ncaaf",
  authorization: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  corpusManifestSha256: crypto.createHash("sha256").update(manifestText).digest("hex"),
  note: "Regulation = sum of periods 1-4; OT periods one entry per period. Quarantined games are excluded from every OT distribution and from the regulation score bank.",
  rows: rows.length,
  quarantinedCount: quarantined.length,
  quarantined,
  games: rows,
}, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === body;
  console.log(same ? "CHECK OK: overtime-periods.json reproduces byte-for-byte" : "CHECK FAILED");
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, body);
console.log(`overtime games ${rows.length} · quarantined ${quarantined.length} ${JSON.stringify(quarantined.reduce((o, q) => ((o[q.reason] = (o[q.reason] ?? 0) + 1), o), {}))}`);
