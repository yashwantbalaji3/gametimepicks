#!/usr/bin/env node
/**
 * Build the NFL player-evidence file (lib/sports/nfl/player-evidence.mjs) for every player board whose kickoff is in
 * the future relative to the newest box score, plus a coverage report on stdout.
 *   node app/scripts/nfl/build-nfl-player-evidence.mjs [--write] [--all]
 * --all includes boards of games already played (for audits); the committed file covers upcoming boards only.
 * Deterministic: the same player-events + boards ⇒ the same bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVIDENCE_REL, FAMILY_STAT, buildEvidenceFile, lineRecord, summary } from "../../src/lib/sports/nfl/player-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SEASON = 2026;
const events = JSON.parse(fs.readFileSync(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${SEASON}.json`), "utf8"));
const newest = events.games.map((g) => g.dateUtc).sort().pop();
const boardDir = path.join(ROOT, "app/public/data/nfl/player-board");
const boards = fs.readdirSync(boardDir).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(boardDir, f), "utf8")))
  .filter((b) => b.kickoffUtc && (process.argv.includes("--all") || Date.parse(b.kickoffUtc) > Date.parse(newest)));

const doc = buildEvidenceFile({ boards, games: events.games, sourceHash: events.contentHash });

// coverage report (stdout only)
const c = { events: boards.length, players: 0, last5Complete: 0, last5WithNoStatLine: 0, fewerThan5Games: 0, last10Complete: 0, projectionRows: 0, rowsWithObservedLine: 0, tier5of5: 0, tier4of5: 0 };
for (const b of boards) for (const p of b.players ?? []) {
  c.players++;
  const log = doc.events[String(b.providerEventId)].players[p.playerId];
  const s5 = summary(log, "player_receptions", 5);
  if (s5.games < 5) c.fewerThan5Games++; else if (s5.noStatLine) c.last5WithNoStatLine++; else c.last5Complete++;
  const s10 = summary(log, "player_receptions", 10);
  if (s10.games === 10 && !s10.noStatLine) c.last10Complete++;
  for (const [fam, m] of Object.entries(p.markets ?? {})) {
    if (!FAMILY_STAT[fam]) continue;
    c.projectionRows++;
    const line = m.market?.line != null ? { line: m.market.line, sportsbook: m.market.sportsbook, capturedAt: m.market.capturedAt } : null;
    if (line) c.rowsWithObservedLine++;
    const r = lineRecord(log, fam, 5, { line });
    if (r.badge === "5/5") c.tier5of5++; else if (r.badge === "4/5") c.tier4of5++;
  }
}
console.log(JSON.stringify({ newestBoxScore: newest, coverage: c }, null, 2));

if (process.argv.includes("--write")) {
  const out = path.join(ROOT, EVIDENCE_REL);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc) + "\n");
  console.log(`wrote ${EVIDENCE_REL} (${fs.statSync(out).size} bytes)`);
}
