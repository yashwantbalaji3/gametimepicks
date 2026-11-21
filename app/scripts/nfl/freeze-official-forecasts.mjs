#!/usr/bin/env node
/**
 * NFL GRADE RULE · FREEZE (founder 2026-11-09). Before the protected pregame window (21:30Z) on a slate day, writes one
 * write-once freeze record per game kicking off in [day 21:30Z, next day 21:30Z): the official forecast of record
 * (nflOfficialOfRecord — revision, model version, content hash, snapshot id) and eligibility@1 (R5 + the starting
 * quarterbacks' records from the game's player board). Internal, not a build input.
 *
 *   npx tsx scripts/nfl/freeze-official-forecasts.mjs --now <ISO> [--write]
 *
 * Refused (exit 2) at or after the day's 21:30Z deadline: a freeze taken inside the window would freeze what the
 * window published. A game already frozen (any earlier day) is never re-frozen; an existing record is never rewritten.
 * Scheduled by .github/workflows/nfl-grade-freeze.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nflOfficialOfRecord } from "../../src/lib/sports/nfl/official-of-record.mjs";
import { buildFreezeRecord, freezeSpan, inFreezeSpan } from "../../src/lib/sports/nfl/served-grade.mjs";
import { freezePath, readFreezeRecord, writeOnce } from "../../src/lib/sports/nfl/served-grade-io.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const PUBLIC = path.join(APP, "public");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const day = new Date(Date.parse(NOW)).toISOString().slice(0, 10);
const span = freezeSpan(day);
if (!(Date.parse(NOW) < Date.parse(span.frozenBefore))) { console.error(`REFUSED: ${NOW} is at or after the ${span.frozenBefore} freeze deadline`); process.exit(2); }

const ids = new Set();
for (const f of ["latest.json", "frozen-latest.json"]) for (const x of readJson(path.join(PUBLIC, "data/nfl/forecasts", f))?.forecasts ?? []) if (inFreezeSpan(x.kickoffUtc, span)) ids.add(String(x.providerEventId));

const out = { WROTE: 0, UNCHANGED: 0, CONFLICT: 0, ALREADY_FROZEN: 0, NO_RECORD: 0 };
for (const id of [...ids].sort()) {
  const prior = readFreezeRecord(ROOT, id);
  if (prior && prior.frozenBefore !== span.frozenBefore) { out.ALREADY_FROZEN += 1; console.log(`${id}: frozen before ${prior.frozenBefore} — left as is`); continue; }
  const record = nflOfficialOfRecord(PUBLIC, id);
  if (!record || record.basis !== "LIVE") { out.NO_RECORD += 1; console.log(`${id}: no live official forecast of record — nothing frozen`); continue; }
  const board = readJson(path.join(PUBLIC, "data/nfl/player-board", `${id}.json`));
  // the one-passer rule: the board's passer per team (the starter the sim and the props use), with its eligibility@1 record
  const startingQbs = (board?.players ?? []).filter((p) => p.markets?.player_pass_yds).map((p) => ({ team: p.team, playerId: p.playerId, eligibility: p.eligibility ?? null, boardGeneratedAt: board.generatedAt ?? null }));
  const rec = buildFreezeRecord({ record, startingQbs, span });
  const res = process.argv.includes("--write") ? writeOnce(freezePath(ROOT, day, id), rec) : "DRY_RUN";
  if (res in out) out[res] += 1;
  console.log(`${id} ${rec.matchup}: ${res} · revision ${rec.forecast.generatedAt} · ${rec.forecast.contentHash} · R5 ${rec.eligibility.r5.publishable ? "ok" : rec.eligibility.r5.reasons.join(",")}`);
}
console.log(`freeze ${day} (before ${span.frozenBefore}, kickoffs ${span.from} → ${span.to}): ${JSON.stringify(out)}`);
if (out.CONFLICT) { console.error("::error::a freeze record on file differs from this run's — write-once kept the existing one"); process.exit(1); }
