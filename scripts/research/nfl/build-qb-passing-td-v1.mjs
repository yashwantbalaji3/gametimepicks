#!/usr/bin/env node
/**
 * NFL-004 A outcome side table: per player-game PASSING touchdowns, 2013–2025, keyed (gameId, playerId).
 *
 * player-games-v1/v2 do not carry passing TDs ("not scorer touchdowns"). This reads the SAME nflverse
 * stats_player_week_YYYY.csv.gz files whose sha256 are pinned in player-games-v2 'sources' (refuses on mismatch)
 * and keeps every row with attempts > 0: [gameId, playerId, team, attempts, passingTds].
 *
 * Prints JOIN ACCOUNTING ONLY (rows, matches against player-games-v1 passAtt). It computes no rate, mean or
 * any other outcome aggregate — evaluation happens once, in replay-passing-td.mjs, under the preregistration.
 *
 *   node scripts/research/nfl/build-qb-passing-td-v1.mjs --raw <dir with stats_player_week_YYYY.csv.gz>
 * Writes data/internal/research/nfl/replay/qb-passing-td-v1.json.gz
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argv = process.argv.slice(2);
const i = argv.indexOf("--raw");
const RAW = i >= 0 ? path.resolve(argv[i + 1]) : path.join(ROOT, "data/internal/research/nfl/raw/nflverse/player-stats");
const OUT = path.join(ROOT, "data/internal/research/nfl/replay/qb-passing-td-v1.json.gz");
const V2 = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/replay/player-games-v2.json.gz"))));
const V1 = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/replay/player-games-v1.json.gz"))));
const pinned = new Map(V2.sources.map((s) => [s.file, s.sha256]));
const FRANCHISE = { STL: "LA", SD: "LAC", OAK: "LV", JAC: "JAX", LAR: "LA" };
const fr = (t) => FRANCHISE[t] ?? t;

function parseCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let k = 0; k < line.length; k += 1) {
    const ch = line[k];
    if (q) { if (ch === '"') { if (line[k + 1] === '"') { cur += '"'; k += 1; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out;
}

const rows = []; const sources = [];
for (let season = 2013; season <= 2025; season += 1) {
  const file = `stats_player_week_${season}.csv.gz`;
  const buf = fs.readFileSync(path.join(RAW, file));
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (pinned.get(file) !== sha) { console.error(`REFUSED: ${file} sha256 ${sha} != pinned ${pinned.get(file)}`); process.exit(1); }
  sources.push({ file, sha256: sha });
  const lines = zlib.gunzipSync(buf).toString("utf8").replace(/\r/g, "").trim().split("\n");
  const head = parseCsvLine(lines[0]); const c = Object.fromEntries(head.map((h, k) => [h, k]));
  for (const need of ["player_id", "game_id", "team", "attempts", "passing_tds"]) if (!(need in c)) { console.error(`REFUSED: ${file} lacks ${need}`); process.exit(1); }
  for (const l of lines.slice(1)) {
    const r = parseCsvLine(l);
    const att = Number(r[c.attempts]) || 0;
    if (att <= 0) continue;
    rows.push([r[c.game_id], r[c.player_id], fr(r[c.team]), att, Number(r[c.passing_tds]) || 0]);
  }
}
// join accounting vs player-games-v1 (passAtt) — no outcome aggregate
const C1 = Object.fromEntries(V1.columns.map((x, k) => [x, k]));
const byKey = new Map(rows.map((r) => [`${r[0]}|${r[1]}`, r]));
let v1WithAtt = 0; let matched = 0; let attAgree = 0; let teamAgree = 0;
for (const r of V1.rows) {
  if (!(r[C1.passAtt] > 0)) continue;
  v1WithAtt += 1;
  const s = byKey.get(`${r[C1.gameId]}|${r[C1.playerId]}`);
  if (!s) continue;
  matched += 1; if (s[3] === r[C1.passAtt]) attAgree += 1; if (s[2] === r[C1.team]) teamAgree += 1;
}
const doc = {
  schemaVersion: 1, artifact: "qb-passing-td-v1", dataClass: "PRIVATE_RESEARCH",
  attribution: "Data: nflverse (https://github.com/nflverse), licensed CC BY 4.0. Derived per-player-game passing touchdowns; raw files are not redistributed here.",
  seasons: [2013, 2025], population: "every nflverse stats_player_week row with attempts > 0 (REG+POST)",
  columns: ["gameId", "playerId", "team", "passAtt", "passTd"], sources,
  accounting: { rows: rows.length, v1RowsWithPassAtt: v1WithAtt, matched, passAttAgree: attAgree, teamAgree },
  rows,
};
fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify(doc)));
console.log(JSON.stringify(doc.accounting));
console.log(`wrote ${path.relative(ROOT, OUT)} sha256 ${crypto.createHash("sha256").update(fs.readFileSync(OUT)).digest("hex")}`);
