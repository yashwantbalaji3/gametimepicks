#!/usr/bin/env node
/**
 * NBA MINUTES v0.3 vs v0.1 — the FORWARD, PREREGISTERED scorer (docs/NBA_MINUTES_V03_PROTOCOL.md). PRIVATE research output.
 *
 *   node scripts/nba/research/score-nba-minutes-v03-prereg.mjs [--write]
 *
 * REFUSES (exit 3) until the protocol is approved: lib/sports/nba/minutes-v03-prereg.mjs APPROVED_PROTOCOL_SHA256 must
 * equal the sha256 of the committed protocol file, and PROTOCOL_APPROVED_AT must be set. No workflow runs this; arming it
 * is a separate, reviewed change after approval.
 *
 * SINGLE LOOK: until both minimums are met it writes PROGRESS ONLY (confirmatory games and player-games counted, no
 * metric), so nobody can peek. The first run at or past the minimums writes the look, write-once; a later run refuses to
 * overwrite it.
 *   data/internal/research/nba/minutes-prereg/progress.json   counts only
 *   data/internal/research/nba/minutes-prereg/look.json       the single look (write-once)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APPROVED_PROTOCOL_SHA256, PROTOCOL_APPROVED_AT, PROTOCOL_REL, MIN_GAMES, MIN_PLAYER_GAMES, PRIMARY_MIN_EXPECTED, confirmatoryGame, gameRows, scoreProtocol } from "../../../src/lib/sports/nba/minutes-v03-prereg.mjs";
import { buildPlayerTagger, PLAYER_TYPES } from "../../../src/lib/sports/nba/minutes-player-types.mjs";
import { corpusSeasonOfDate } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";
import { LABELS } from "../../../src/lib/sports/nba/experimental-forecast.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REPO = path.resolve(APP, "..");
const NBA = path.join(REPO, "data/internal/research/nba");
const OUT = path.join(NBA, "minutes-prereg");
const WRITE = process.argv.includes("--write");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readDir = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(d, f))) : []);

const protocolSha = crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO, PROTOCOL_REL))).digest("hex");
if (!APPROVED_PROTOCOL_SHA256 || !PROTOCOL_APPROVED_AT) { console.error(`NOT_APPROVED: the protocol (${PROTOCOL_REL}, sha256 ${protocolSha}) has no founder approval — nothing is scored`); process.exit(3); }
if (protocolSha !== APPROVED_PROTOCOL_SHA256) { console.error(`PROTOCOL_CHANGED: ${PROTOCOL_REL} is ${protocolSha}, approved ${APPROVED_PROTOCOL_SHA256} — refusing`); process.exit(3); }
if (fs.existsSync(path.join(OUT, "look.json"))) { console.error("LOOK_TAKEN: the single look already exists — refusing to recompute"); process.exit(3); }

const fam = (dir) => { const m = new Map(); const d = path.join(NBA, dir, "forecasts"); for (const f of fs.readdirSync(d).filter((x) => /^\d{4}-\d\d-\d\d\.json$/.test(x)).sort()) for (const g of readJson(path.join(d, f)).games ?? []) if (g.label === LABELS[2]) m.set(String(g.providerEventId), g); return m; };
const v01 = fam("experimental-v0.1"), v03 = fam("experimental-v0.3");
const fetched = readDir(path.join(NBA, "experimental/boxscores"));
const boxById = new Map(fetched.map((b) => [String(b.providerEventId), b]));
const all = [...readDir(path.join(NBA, "boxscores")), ...fetched].map((d) => (Number.isInteger(d.season) ? d : { ...d, season: corpusSeasonOfDate(d.dateUtc) }));
const tagsOf = buildPlayerTagger(all);
const postFreezeKeys = new Set();
const pfDir = path.join(APP, "public/data/nba/post-freeze-availability");
for (const f of fs.existsSync(pfDir) ? fs.readdirSync(pfDir).filter((x) => /\.json$/.test(x)) : []) for (const c of readJson(path.join(pfDir, f)).changes ?? []) postFreezeKeys.add(`${c.providerEventId}:*`);

const rows = []; const excluded = {};
for (const [id, g1] of v01) {
  const c = confirmatoryGame(g1, v03.get(id), boxById.get(id), PROTOCOL_APPROVED_AT);
  if (!c.ok) { excluded[c.reason] = (excluded[c.reason] ?? 0) + 1; continue; }
  rows.push(...gameRows(g1, v03.get(id), boxById.get(id), { tagsOf, season: corpusSeasonOfDate(g1.dateUtc) }));
}
const prim = rows.filter((r) => r.v01 != null && r.v03 != null && r.v01 >= PRIMARY_MIN_EXPECTED && r.v03 >= PRIMARY_MIN_EXPECTED);
const games = new Set(prim.map((r) => r.game)).size;
const progress = { protocolSha256: protocolSha, approvedAt: PROTOCOL_APPROVED_AT, confirmatoryGames: games, primaryPlayerGames: prim.length, minimums: { games: MIN_GAMES, playerGames: MIN_PLAYER_GAMES }, excluded };
fs.mkdirSync(OUT, { recursive: true });
if (games < MIN_GAMES || prim.length < MIN_PLAYER_GAMES) {
  console.log(`progress: ${games}/${MIN_GAMES} games, ${prim.length}/${MIN_PLAYER_GAMES} player-games — no metric is computed before the minimums`);
  if (WRITE) fs.writeFileSync(path.join(OUT, "progress.json"), JSON.stringify(progress, null, 1) + "\n");
  process.exit(0);
}
const look = { ...progress, look: scoreProtocol(rows, { subgroups: PLAYER_TYPES, postFreezeKeys }) };
console.log(JSON.stringify(look, null, 1));
if (WRITE) fs.writeFileSync(path.join(OUT, "look.json"), JSON.stringify(look, null, 1) + "\n", { flag: "wx" });
