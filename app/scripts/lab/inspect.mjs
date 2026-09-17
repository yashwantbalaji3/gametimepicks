#!/usr/bin/env node
/**
 * Research Lab projection inspector (v1.5) — read-only. Prints what the committed projection carries and how fast
 * a real query runs through the real engine, so every number in a report is measured rather than estimated.
 *
 *   node scripts/lab/inspect.mjs --coverage     per mode / sport / season: rows, entities, asset bytes
 *   node scripts/lab/inspect.mjs --bench        parse + execute timings for representative queries
 *   node scripts/lab/inspect.mjs --query '?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs'
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { LAB_MODE_SPORTS, LAB_PROJECTION_DIR } from "../../src/lib/lab/contract.mjs";
import { labDataset } from "../../src/lib/lab/dataset.mjs";
import { executeLabQuery } from "../../src/lib/lab/engine.mjs";
import { parseLabQuery, queryPartitions, serializeLabQuery, validateLabQuery } from "../../src/lib/lab/query.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(APP, "..", LAB_PROJECTION_DIR);
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] ?? true : null; };
const read = (rel) => { const abs = path.join(SRC, rel); const b = fs.readFileSync(abs); return (abs.endsWith(".gz") ? zlib.gunzipSync(b) : b).toString("utf8"); };
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;
const index = (mode, sport) => JSON.parse(read(`indexes/${mode}-${sport.toLowerCase()}.json`));
const partition = (mode, sport, season) => JSON.parse(read(mode === "players" ? `players/${sport}/${season}.json.gz` : `${mode}/${sport}.json.gz`));

if (arg("--coverage") || process.argv.length === 2) {
  const receipt = JSON.parse(read("receipt.json"));
  console.log(`lab projection · content ${(receipt.contentBytes / 1048576).toFixed(1)} MB · ${receipt.files.length} files · compare ${receipt.compareContentSha256.slice(0, 12)} · research ${receipt.researchContentSha256.slice(0, 12)}\n`);
  console.log("| mode | sport | seasons | rows | entities | index raw/gz | largest partition raw/gz |");
  console.log("|---|---|---:|---:|---:|---|---|");
  for (const [mode, sports] of Object.entries(LAB_MODE_SPORTS)) {
    for (const sport of sports) {
      const raw = read(`indexes/${mode}-${sport.toLowerCase()}.json`);
      const idx = JSON.parse(raw);
      let big = { raw: 0, gz: 0 };
      const parts = mode === "players" ? idx.seasons.map((s) => `players/${sport}/${s}.json.gz`) : [`${mode}/${sport}.json.gz`];
      for (const p of parts) { const c = read(p); if (Buffer.byteLength(c) > big.raw) big = { raw: Buffer.byteLength(c), gz: gz(c) }; }
      console.log(`| ${mode} | ${sport} | ${idx.seasons.length} | ${idx.totalRows} | ${idx.entities.length} | ${kb(Buffer.byteLength(raw))} / ${kb(gz(raw))} | ${kb(big.raw)} / ${kb(big.gz)} |`);
    }
  }
}

const BENCH = [
  ["games NFL one team one season", "games", "NFL", "?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs"],
  ["games NFL every season, pair", "games", "NFL", "?mode=games&sport=nfl&season=all&team=kansas-city-chiefs&opp=los-angeles-chargers"],
  ["games MLB season + min runs", "games", "MLB", "?mode=games&sport=mlb&season=MLB-2024&team=new-york-mets&scored_min=5"],
  ["games MLB every season", "games", "MLB", "?mode=games&sport=mlb&season=all"],
  ["players NFL stat threshold", "players", "NFL", "?mode=players&sport=nfl&season=NFL-2025&stat=receiving-yards&value_min=80"],
  ["players NFL one player", "players", "NFL", "?mode=players&sport=nfl&season=NFL-2025&player=keenan-allen&stat=receiving-yards"],
  ["players EPL goals", "players", "EPL", "?mode=players&sport=epl&season=EPL-2025-26&stat=goals&value_min=1"],
  ["players MLB hits", "players", "MLB", "?mode=players&sport=mlb&season=MLB-2026&stat=hits&value_min=2"],
  ["seasons NFL every season", "seasons", "NFL", "?mode=seasons&sport=nfl&season=all"],
  ["seasons MLB one season", "seasons", "MLB", "?mode=seasons&sport=mlb&season=MLB-2026"],
];

if (arg("--bench")) {
  console.log("\n| query | partition raw/gz | parse ms | JSON.parse ms | execute ms | scanned | matched |");
  console.log("|---|---|---:|---:|---:|---:|---:|");
  for (const [name, mode, sport, search] of BENCH) {
    const idx = index(mode, sport);
    const { query: parsed } = parseLabQuery(search, idx);
    const { valid, errors, query } = validateLabQuery(parsed, idx);
    if (!valid) { console.log(`| ${name} | — | — | — | INVALID ${errors.map((e) => e.code).join(",")} | — | — |`); continue; }
    const p = queryPartitions(query)[0];
    const text = read(mode === "players" ? `players/${sport}/${p.seasonId}.json.gz` : `${mode}/${sport}.json.gz`);
    const t0 = performance.now(); for (let i = 0; i < 5; i += 1) parseLabQuery(search, idx); const tParse = (performance.now() - t0) / 5;
    const t1 = performance.now(); let doc; for (let i = 0; i < 5; i += 1) doc = JSON.parse(text); const tJson = (performance.now() - t1) / 5;
    const ds = labDataset(mode, idx, doc, 2);
    const t2 = performance.now(); let res; for (let i = 0; i < 5; i += 1) res = executeLabQuery(query, ds); const tExec = (performance.now() - t2) / 5;
    console.log(`| ${name} | ${kb(Buffer.byteLength(text))} / ${kb(gz(text))} | ${tParse.toFixed(2)} | ${tJson.toFixed(1)} | ${tExec.toFixed(1)} | ${res.cost.rowsScanned} | ${res.cost.rowsMatched} |`);
  }
}

const q = arg("--query");
if (typeof q === "string") {
  const mode = new URLSearchParams(q).get("mode") ?? "games";
  const sport = (new URLSearchParams(q).get("sport") ?? "nfl").toUpperCase();
  const idx = index(mode, sport);
  const { query: parsed, errors: parseErrors } = parseLabQuery(q, idx);
  if (parseErrors.length) console.log("parse errors:", parseErrors);
  const { valid, errors, query } = validateLabQuery(parsed, idx);
  if (!valid) { console.error("INVALID:", errors); process.exit(1); }
  console.log("canonical:", serializeLabQuery(query, idx));
  const p = queryPartitions(query)[0];
  const res = executeLabQuery(query, labDataset(mode, idx, partition(mode, sport, p.seasonId), 2));
  console.log(`${res.totalMatched} matched · showing ${res.returned} · cost ${JSON.stringify(res.cost)}`);
  for (const r of res.rows.slice(0, 12)) console.log("  ", JSON.stringify(r.perspective ? { date: r.date, team: r.perspective.team?.label, opp: r.opponent?.label, ha: r.perspective.homeAway, result: r.perspective.result, score: `${r.perspective.scored}-${r.perspective.allowed}` } : r.player ? { date: r.date, player: r.player.label, team: r.team?.label, opp: r.opponent?.label, ha: r.homeAway, value: r.value } : { season: r.seasonId, team: r.team?.label, finals: r.finals, w: r.wins, l: r.losses, t: r.ties, scored: r.scored, allowed: r.allowed }));
}
