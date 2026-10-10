#!/usr/bin/env node
/**
 * MLB-003 / MLB-004 · reference capture: throwing and batting hand for every player in the captured box scores.
 *
 *   node scripts/mlb/capture-mlb-people-handedness.mjs [--write]
 *
 * Source: MLB StatsAPI /api/v1/people?personIds=… (free, no key), 100 ids per request, one request at a time, with a
 * pause and back-off. Handedness is a fixed player attribute known before any game, not an outcome. A player the
 * source does not return stays absent (never guessed).
 *
 * Output: data/internal/mlb/boxscore-outcomes-history/people-handedness.json (internal, not a Vercel build input).
 * Re-runs add only ids not yet present; existing entries are never rewritten.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const OUT = path.join(ROOT, "data/internal/mlb/boxscore-outcomes-history/people-handedness.json");
const DIRS = [path.join(ROOT, "data/internal/mlb/boxscore-outcomes"), ...["2024", "2025"].map((s) => path.join(ROOT, "data/internal/mlb/boxscore-outcomes-history", s))];
const WRITE = process.argv.includes("--write");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "gametimepicks-research (reference capture)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  return null;
}

const ids = new Set();
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).rows ?? []) if (r.playerId != null) ids.add(r.playerId);
}
const doc = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { schema: "gtp.mlb.people-handedness@1", dataClass: "REFERENCE_ATTRIBUTES", source: "MLB StatsAPI /api/v1/people (free, no key)", people: {} };
const todo = [...ids].filter((id) => !doc.people[id]).sort((a, b) => a - b);
for (let i = 0; i < todo.length; i += 100) {
  const batch = todo.slice(i, i + 100);
  const j = await getJson(`https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(",")}&fields=people,id,pitchHand,batSide,code`);
  const at = new Date().toISOString();
  for (const p of j?.people ?? []) doc.people[p.id] = { pitchHand: p.pitchHand?.code ?? null, batSide: p.batSide?.code ?? null, retrievedAt: at };
  await sleep(400);
}
doc.capturedAt = new Date().toISOString();
doc.players = Object.keys(doc.people).length;
if (WRITE) fs.writeFileSync(OUT, JSON.stringify(doc) + "\n");
console.log(JSON.stringify({ idsInBoxScores: ids.size, requested: todo.length, players: doc.players, missing: [...ids].filter((id) => !doc.people[id]).length, write: WRITE }));
