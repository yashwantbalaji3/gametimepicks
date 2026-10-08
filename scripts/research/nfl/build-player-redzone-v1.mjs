#!/usr/bin/env node
/**
 * NFL PLAYER RED-ZONE OPPORTUNITY TABLE v1 (NFL-004 input) — PRIVATE_RESEARCH.
 *
 * Per (gameId, team, player) carries and targets, in total and inside the opponent's 20 / 10 / 5 yard line, from
 * nflverse play-by-play (CC BY 4.0). Team totals per (gameId, team) are summed over every player. The ids are the
 * gsis ids player-games-v2 uses, so the two tables join on `gameId|team|playerId`.
 *
 *   node scripts/research/nfl/build-player-redzone-v1.mjs --pbp-dir <dir with play_by_play_YYYY.csv.gz> [--first 2013 --last 2025]
 *
 * Play filter (same spirit as player-games-v2): two-point attempts, deleted and aborted plays and `no_play` rows are
 * dropped; a carry is `rush_attempt == 1` with a rusher id; a target is `pass_attempt == 1`, not a sack, with a
 * receiver id. Writes data/internal/research/nfl/replay/player-redzone-v1.json.gz with every source file's sha256.
 * Lives outside app/ on purpose: research tables never trigger an app build.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const PBP = argOf("--pbp-dir", path.join(ROOT, "data/internal/research/nfl/raw/nflverse/pbp"));
const FIRST = Number(argOf("--first", "2013"));
const LAST = Number(argOf("--last", "2025"));
const OUT = "data/internal/research/nfl/replay/player-redzone-v1.json.gz";
const FRANCHISE = { STL: "LA", SD: "LAC", OAK: "LV", JAC: "JAX", LAR: "LA" };
const fr = (t) => FRANCHISE[t] ?? t;

function parse(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += c; }
    else if (c === ",") { out.push(cur); cur = ""; } else if (c === '"') q = true; else cur += c;
  }
  out.push(cur);
  return out;
}

const COLS = ["car", "tgt", "c20", "t20", "c10", "t10", "c5", "t5"];
const agg = new Map();
const team = new Map();
const sources = [];
for (let season = FIRST; season <= LAST; season += 1) {
  const file = path.join(PBP, `play_by_play_${season}.csv.gz`);
  if (!fs.existsSync(file)) { console.error(`REFUSED: missing ${file}`); process.exit(1); }
  sources.push({ file: path.basename(file), sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") });
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let H = null;
  let plays = 0;
  for await (const line of rl) {
    if (!H) { H = Object.fromEntries(parse(line).map((c, i) => [c, i])); continue; }
    const r = parse(line);
    if (r[H.two_point_attempt] === "1" || r[H.play_deleted] === "1" || r[H.aborted_play] === "1" || r[H.play_type] === "no_play") continue;
    const y = Number(r[H.yardline_100]);
    if (!Number.isFinite(y)) continue;
    const gid = r[H.game_id];
    const tm = fr(r[H.posteam]);
    const bump = (pid, kind) => {
      for (const key of [`${gid}|${tm}|${pid}`, `${gid}|${tm}`]) {
        const store = key.split("|").length === 3 ? agg : team;
        let a = store.get(key);
        if (!a) { a = new Array(COLS.length).fill(0); store.set(key, a); }
        const base = kind === "car" ? 0 : 1;
        a[base] += 1;
        if (y <= 20) a[2 + base] += 1;
        if (y <= 10) a[4 + base] += 1;
        if (y <= 5) a[6 + base] += 1;
      }
    };
    if (r[H.rush_attempt] === "1" && r[H.rusher_player_id]) { bump(r[H.rusher_player_id], "car"); plays += 1; }
    if (r[H.pass_attempt] === "1" && r[H.sack] !== "1" && r[H.receiver_player_id]) { bump(r[H.receiver_player_id], "tgt"); plays += 1; }
  }
  console.log(`${season}: ${plays} opportunity plays`);
}

const rows = [...agg.entries()].map(([k, v]) => [...k.split("|"), ...v]).sort((a, b) => (a[0] + a[1] + a[2]).localeCompare(b[0] + b[1] + b[2]));
const doc = {
  schemaVersion: 1,
  artifact: "nfl-player-redzone-v1",
  dataClass: "PRIVATE_RESEARCH",
  attribution: "Data: nflverse play-by-play (https://github.com/nflverse), CC BY 4.0. Derived table; raw files are not redistributed here.",
  seasons: [FIRST, LAST],
  playFilter: "no two-point, deleted, aborted or no_play rows; carry = rush_attempt with rusher id; target = pass_attempt, not a sack, with receiver id; inside-N = yardline_100 <= N",
  franchiseMap: FRANCHISE,
  sources,
  columns: ["gameId", "team", "playerId", ...COLS],
  rows,
  teamTotalsColumns: COLS,
  teamTotals: Object.fromEntries([...team.entries()].sort()),
};
fs.writeFileSync(path.join(ROOT, OUT), zlib.gzipSync(JSON.stringify(doc), { level: 9 }));
console.log(`wrote ${OUT}: ${rows.length} player-game rows, ${team.size} team-games`);
