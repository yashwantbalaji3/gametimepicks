#!/usr/bin/env node
/**
 * Grade World Model V2's frozen pregame player forecasts against the official box scores (NFL-005 / LEDGER-001 hook).
 *
 *   node app/scripts/nfl/grade-nfl-world-model-v2.mjs [--now <ISO>]
 *
 * Reads the write-once runs (data/internal/nfl/world-model-v2/runs/*.json) and the committed official stat lines
 * (data/internal/research/nfl/player-events-v1/2026.json). For each game it grades the LAST run generated before
 * kickoff (lib/sports/nfl/world-model-v2/grade.mjs) and writes data/internal/nfl/world-model-v2/grades/latest.json:
 * every graded row with its run identity, plus per-family summaries. Derived and re-writable (grades are recomputed as
 * games go final); the forecasts it grades are never touched. Written only when the content changes. PRIVATE: public
 * presentation belongs to RESULTS-001.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { pregameRuns, gradeRun, summarize } from "../../src/lib/sports/nfl/world-model-v2/grade.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const NOW = argOf("--now", new Date().toISOString());
const RUNS = path.join(ROOT, "data/internal/nfl/world-model-v2/runs");
const OUT = path.join(ROOT, "data/internal/nfl/world-model-v2/grades/latest.json");
const events = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/player-events-v1/2026.json"), "utf8"));
const games = new Map(events.games.map((g) => [String(g.providerEventId), g]));
const runs = (fs.existsSync(RUNS) ? fs.readdirSync(RUNS) : []).filter((f) => f.endsWith(".json")).map((f) => ({ ...JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8")), _file: f }));
const frozen = pregameRuns(runs);
const rows = [];
const gamesOut = [];
for (const [id, run] of [...frozen.entries()].sort()) {
  const g = games.get(id) ?? null;
  const r = gradeRun(run, g);
  rows.push(...r);
  gamesOut.push({ providerEventId: id, matchup: run.identity.matchup, kickoffUtc: run.identity.kickoffUtc, gradedRun: run._file, simulationId: run.simulationId, modelVersion: run.model.version, generatedAt: run.run.generatedAt, final: !!(g && Number.isInteger(g.ftHome)), rows: r.length });
}
const body = { schemaVersion: 1, artifact: "nfl-world-model-v2-grades", dataClass: "PRIVATE_RESEARCH", officialStatsGeneratedAt: events.generatedAt ?? null, games: gamesOut, summary: summarize(rows), rows };
const hash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
if (prev?.contentSha256 === hash) { console.log("world model v2 grades: unchanged"); process.exit(0); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ ...body, gradedAt: NOW, contentSha256: hash }, null, 1)}\n`);
for (const [fam, s] of Object.entries(body.summary)) console.log(`  ${fam.padEnd(15)} graded ${s.graded} · pending ${s.pending} · no line ${s.noLine} · MAE ${s.mae} · 80% ${s.coverage80} · ladder Brier ${s.ladderBrier}`);
console.log(`world model v2 grades: ${gamesOut.length} game(s) with a pregame run, ${gamesOut.filter((g) => g.final).length} final`);
