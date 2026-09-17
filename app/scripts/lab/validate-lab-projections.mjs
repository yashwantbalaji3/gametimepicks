#!/usr/bin/env node
/**
 * Research Lab projection validator (v1.5) — structural integrity of the COMMITTED projection, independent of the
 * builder that wrote it.
 *
 *   node scripts/lab/validate-lab-projections.mjs
 *
 * Checks, for every committed file: readable schemaVersion · declared artifact · receipt file list, byte counts and
 * sha256 all match the bytes on disk · every row's entity and season index resolves · every game row is a recorded
 * final with two distinct teams · a host-unknown row never claims a side · player rows record the family they are
 * filed under and never carry a 0 where the source had nothing · season rows never state a record without finals ·
 * no forbidden owner field · no evaluative term · no internal path and no absolute filesystem path.
 *
 * Exit: 0 ok · 1 invalid · 3 no projection.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  FORBIDDEN_LAB_FIELDS, LAB_EVALUATIVE_TERMS, LAB_MODE_SPORTS, LAB_PROJECTION_DIR, LAB_PROJECTION_SCHEMA_VERSION,
} from "../../src/lib/lab/contract.mjs";
import { GAME, HOST_KNOWN, LAB_FIELDS, PLAYER, SEASON, isNum, isIsoDate } from "../../src/lib/lab/fields.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.join(APP, "..", LAB_PROJECTION_DIR);
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

if (!fs.existsSync(path.join(ROOT, "receipt.json"))) { console.error(`no lab projection at ${LAB_PROJECTION_DIR}`); process.exit(3); }
const t0 = performance.now();
const text = (rel) => {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  return (rel.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};
const walk = (dir, rel = "") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]));

const receipt = JSON.parse(text("receipt.json"));
if (receipt.schemaVersion !== LAB_PROJECTION_SCHEMA_VERSION) fail("receipt.json", `schemaVersion ${receipt.schemaVersion}`);
const onDisk = walk(ROOT).filter((p) => p !== "receipt.json").sort();
const listed = receipt.files.map((f) => f.path).sort();
if (JSON.stringify(onDisk) !== JSON.stringify(listed)) fail("receipt.json", `file list differs from disk (${onDisk.length} on disk, ${listed.length} listed)`);
for (const f of receipt.files) {
  if (!fs.existsSync(path.join(ROOT, f.path))) { fail(f.path, "listed in the receipt but missing"); continue; }
  const content = text(f.path);
  if (Buffer.byteLength(content) !== f.contentBytes) fail(f.path, `contentBytes ${Buffer.byteLength(content)} ≠ ${f.contentBytes}`);
  if (sha(content) !== f.sha256) fail(f.path, "sha256 does not match the bytes on disk");
}
const chain = sha(receipt.files.map((f) => `${f.path}:${f.sha256}`).join("\n"));
if (chain !== receipt.contentSha256) fail("receipt.json", "contentSha256 does not hash its own file list");

/* ── leak / owner / language guards over every byte ─────────────────────────────────────────────── */
for (const rel of onDisk) {
  const content = text(rel);
  for (const f of FORBIDDEN_LAB_FIELDS) if (content.includes(`"${f}":`)) fail(rel, `forbidden owner field "${f}"`);
  for (const t of LAB_EVALUATIVE_TERMS) if (new RegExp(`"[^"]*\\b${t}\\b[^"]*"`, "i").test(content)) fail(rel, `evaluative term "${t}"`);
  if (content.includes("data/internal")) fail(rel, "internal store path");
  if (/"\/(Users|home|var|tmp)\//.test(content)) fail(rel, "absolute filesystem path");
  if (/espn|statsapi|nflverse|openfootball|pfr|gsis|the-odds-api/i.test(content)) fail(rel, "provider or source key");
}

/* ── row-level semantics ────────────────────────────────────────────────────────────────────────── */
for (const sport of LAB_MODE_SPORTS.games) {
  const doc = JSON.parse(text(`games/${sport}.json.gz`));
  if (doc.artifact !== "lab-games") fail(`games/${sport}`, `artifact ${doc.artifact}`);
  const ids = new Set();
  for (const r of doc.rows) {
    const w = `games/${sport} ${r[GAME.ID]}`;
    if (ids.has(r[GAME.ID])) fail(w, "duplicate game id");
    ids.add(r[GAME.ID]);
    if (!isIsoDate(r[GAME.DATE])) fail(w, `date ${r[GAME.DATE]}`);
    if (doc.seasons[r[GAME.SEASON]] === undefined) fail(w, `season index ${r[GAME.SEASON]}`);
    if (doc.teams[r[GAME.A]] === undefined || doc.teams[r[GAME.B]] === undefined) fail(w, "team index does not resolve");
    if (r[GAME.A] === r[GAME.B]) fail(w, "both sides are the same team");
    // Every row is a RECORDED FINAL: two integer scores, always. A scheduled game is not in this artifact.
    if (!Number.isInteger(r[GAME.SCORE_A]) || !Number.isInteger(r[GAME.SCORE_B])) fail(w, "a game row without two recorded scores");
    if (r[GAME.SCORE_A] < 0 || r[GAME.SCORE_B] < 0) fail(w, "negative score");
    if ((r[GAME.FLAGS] & ~HOST_KNOWN) !== 0) fail(w, `unknown flag bits ${r[GAME.FLAGS]}`);
    if (r[GAME.PATH] != null && !/^\/matchups\/(mlb|nfl)\/[0-9]+\/$/.test(r[GAME.PATH])) fail(w, `route ${r[GAME.PATH]}`);
  }
}
for (const sport of LAB_MODE_SPORTS.players) {
  for (const rel of onDisk.filter((p) => p.startsWith(`players/${sport}/`))) {
    const doc = JSON.parse(text(rel));
    if (doc.artifact !== "lab-players") fail(rel, `artifact ${doc.artifact}`);
    const seasonIdx = doc.seasons.indexOf(doc.seasonId);
    if (seasonIdx < 0) fail(rel, `seasonId ${doc.seasonId} is not in its own season list`);
    const seen = new Set();
    for (const r of doc.rows) {
      const key = `${r[PLAYER.PLAYER]}|${r[PLAYER.ID]}`;
      if (seen.has(key)) fail(rel, `duplicate player-game ${key}`);
      seen.add(key);
      if (doc.players[r[PLAYER.PLAYER]] === undefined) fail(rel, `player index ${r[PLAYER.PLAYER]}`);
      if (r[PLAYER.SEASON] !== seasonIdx) fail(rel, `row season ${r[PLAYER.SEASON]} is not this partition's season`);
      if (!isIsoDate(r[PLAYER.DATE])) fail(rel, `date ${r[PLAYER.DATE]}`);
      for (const i of [PLAYER.TEAM, PLAYER.OPP]) if (r[i] != null && doc.teams[r[i]] === undefined) fail(rel, "team index does not resolve");
      // The enum comes from the field registry, so a value the data really carries cannot be "invalid" in one
      // place and filterable in the other. (This check, written against a hand-typed ["H","A"], is what found the
      // 865 neutral-site NFL player rows the registry was missing.)
      if (r[PLAYER.HA] != null && !LAB_FIELDS.players.homeAway.values.includes(r[PLAYER.HA])) fail(rel, `homeAway ${r[PLAYER.HA]}`);
      const values = r.slice(PLAYER.VALUES);
      if (values.length !== doc.families.length) fail(rel, `${values.length} values for ${doc.families.length} families`);
      for (const v of values) if (v !== null && !isNum(v)) fail(rel, `value ${JSON.stringify(v)} is neither a number nor null`);
      // A row exists because the source recorded SOMETHING; a row of all nulls would be a fabricated appearance.
      if (!values.some(isNum)) fail(rel, `player-game ${key} records no value at all`);
    }
  }
}
for (const sport of LAB_MODE_SPORTS.seasons) {
  const doc = JSON.parse(text(`seasons/${sport}.json.gz`));
  if (doc.artifact !== "lab-seasons") fail(`seasons/${sport}`, `artifact ${doc.artifact}`);
  const seen = new Set();
  for (const r of doc.rows) {
    const w = `seasons/${sport} ${doc.teams[r[SEASON.TEAM]]?.[1]}/${doc.seasons[r[SEASON.SEASON]]}`;
    const key = `${r[SEASON.TEAM]}|${r[SEASON.SEASON]}`;
    if (seen.has(key)) fail(w, "duplicate team-season");
    seen.add(key);
    if (doc.teams[r[SEASON.TEAM]] === undefined || doc.seasons[r[SEASON.SEASON]] === undefined) fail(w, "index does not resolve");
    if (r[SEASON.FINALS] < 1) fail(w, "a season row with no recorded final");
    if (r[SEASON.FINALS] > r[SEASON.GAMES]) fail(w, `finals ${r[SEASON.FINALS]} > games ${r[SEASON.GAMES]}`);
    if (r[SEASON.W] + r[SEASON.L] + r[SEASON.T] !== r[SEASON.FINALS]) fail(w, `W+L+T ${r[SEASON.W] + r[SEASON.L] + r[SEASON.T]} ≠ finals ${r[SEASON.FINALS]}`);
    if (sport === "MLB" && r[SEASON.T] !== 0) fail(w, "MLB does not record ties");
    for (const i of [SEASON.SCORED, SEASON.ALLOWED]) if (!Number.isInteger(r[i]) || r[i] < 0) fail(w, "scored/allowed is not a non-negative integer");
  }
}

/* ── index ⇔ partition agreement (the UI reads the index; it must describe the rows) ─────────────── */
for (const [mode, sports] of Object.entries(LAB_MODE_SPORTS)) {
  for (const sport of sports) {
    const idx = JSON.parse(text(`indexes/${mode}-${sport.toLowerCase()}.json`));
    if (idx.artifact !== "lab-index") fail(`indexes/${mode}-${sport}`, `artifact ${idx.artifact}`);
    if (idx.mode !== mode || idx.sport !== sport) fail(`indexes/${mode}-${sport}`, "index does not name its own mode/sport");
    const slugs = new Set();
    for (const e of idx.entities) {
      if (!e[0] || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e[0])) fail(`indexes/${mode}-${sport}`, `selector entry without a URL-safe slug: ${JSON.stringify(e[1])}`);
      if (slugs.has(e[0])) fail(`indexes/${mode}-${sport}`, `duplicate slug ${e[0]}`);
      slugs.add(e[0]);
    }
    const total = Object.values(idx.rowsBySeason).reduce((a, b) => a + b, 0);
    if (total !== idx.totalRows) fail(`indexes/${mode}-${sport}`, `rowsBySeason sums to ${total}, totalRows says ${idx.totalRows}`);
    if (!idx.coverage || typeof idx.coverage.status !== "string") fail(`indexes/${mode}-${sport}`, "no coverage descriptor");
    for (const s of idx.seasons) if (!idx.seasonLabels[s]) fail(`indexes/${mode}-${sport}`, `season ${s} has no label`);
  }
}

if (problems.length) {
  console.error(`lab projection INVALID — ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`lab projection validation: OK — ${onDisk.length} files, ${Object.values(receipt.rows).reduce((a, b) => a + b, 0)} rows (${Math.round(performance.now() - t0)} ms)`);
