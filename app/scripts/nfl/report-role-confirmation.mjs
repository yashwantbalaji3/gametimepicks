#!/usr/bin/env node
/**
 * NFL ROLE CONFIRMATION REPORT (Session 9 · C) — read-only. Evaluates every player-family row on the
 * pre-kickoff boards through lib/sports/nfl/role-confirmation.mjs against the committed roster, injuries and
 * the newest depth-chart snapshot per team, and prints the states and reasons. Writes nothing.
 *
 *   node scripts/nfl/report-role-confirmation.mjs --now <ISO> [--json <file>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRole, satisfiesGate } from "../../src/lib/sports/nfl/role-confirmation.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("--now <ISO> required"); process.exit(2); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const roster = read(path.join(APP, "public/data/nfl/rosters/latest.json"));
const injuries = read(path.join(ROOT, "data/internal/research/injuries/nfl/latest.json"));
const depthDir = path.join(ROOT, "data/internal/research/nfl/depth-charts");
const newestDepth = new Map();
for (const f of fs.existsSync(depthDir) ? fs.readdirSync(depthDir).filter((x) => x.endsWith(".json")) : []) {
  for (const s of read(path.join(depthDir, f))?.snapshots ?? []) {
    if (Date.parse(s.timestamp) > Date.parse(NOW)) continue;
    const was = newestDepth.get(s.team);
    if (!was || Date.parse(s.timestamp) > Date.parse(was.timestamp)) newestDepth.set(s.team, s);
  }
}
const boardDir = path.join(APP, "public/data/nfl/player-board");
const boards = fs.readdirSync(boardDir).filter((f) => /^\d+\.json$/.test(f)).map((f) => read(path.join(boardDir, f)))
  .filter((b) => b?.kickoffUtc && Date.parse(String(b.kickoffUtc).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")) > Date.parse(NOW));

const tally = {}; const receipts = [];
for (const b of boards) for (const p of b.players ?? []) for (const family of Object.keys(p.markets ?? {})) {
  const r = evaluateRole({ eventId: `nfl-${b.providerEventId}`, eventStartUtc: b.kickoffUtc, family, player: { playerId: p.playerId, team: p.team }, roster, injuries, depth: newestDepth.get(p.team) ?? null, asOf: NOW });
  receipts.push(r);
  const k = `${family} · ${r.state}${r.reasons.length ? ` (${r.reasons.join(",")})` : ""}`;
  tally[k] = (tally[k] ?? 0) + 1;
}
console.log(`role receipts at ${NOW}: ${receipts.length} rows on ${boards.length} pre-kickoff board(s); gate-satisfying: ${receipts.filter(satisfiesGate).length}`);
for (const [k, n] of Object.entries(tally).sort()) console.log(`  ${String(n).padStart(4)}  ${k}`);
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify({ asOf: NOW, receipts }, null, 1) + "\n");
