#!/usr/bin/env node
/**
 * GRADE THE PROSPECTIVE V2 CANDIDATE CAPTURES (private shadow). Each capture file is graded on its own, exactly as
 * frozen: a later capture is never substituted for an earlier one, and only games whose kickoff came AFTER the
 * capture's `capturedAt` count (the capture tool already refuses started games; this re-checks).
 *
 *   node scripts/research/nfl/grade-v2-candidates-forward.mjs [--capture <file>] [--events <player-events json>]
 *
 * Actuals: data/internal/research/nfl/player-events-v1/2026.json (committed ESPN stat lines), joined on ESPN athlete id.
 * A captured player with no stat line in a final game is a real zero only if the capture marked him ACTIVE and his
 * team played; otherwise he is not scored. Families: receptions, receiving / rushing / passing yards (MAE on p50,
 * 80% coverage, level), anytime TD (log loss, Brier, level) — for every model in the capture, on identical rows.
 * Writes <capture>.graded.json beside the capture (overwritten as more games finish; the capture itself never is).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const DIR = path.join(ROOT, "data/internal/research/nfl/v2-candidates-forward");
const captures = argOf("--capture") ? [path.resolve(argOf("--capture"))] : fs.readdirSync(DIR).filter((f) => /^\d{4}-week\d{2}-\d{8}T\d{4}Z\.json$/.test(f)).map((f) => path.join(DIR, f));
const events = JSON.parse(fs.readFileSync(path.resolve(argOf("--events", path.join(ROOT, "data/internal/research/nfl/player-events-v1/2026.json"))), "utf8"));
const finals = new Map(events.games.filter((g) => Number.isInteger(g.ftHome) && Number.isInteger(g.ftAway)).map((g) => [String(g.providerEventId), g]));

const FAMS = { player_receptions: "rec", player_reception_yds: "recYds", player_rush_yds: "rushYds", player_pass_yds: "passYds" };
const ENGINES = ["allocV1", "allocationWorlds", "gameWorlds"];
const clip = (p) => Math.min(1 - 1e-4, Math.max(1e-4, p));
function cont(rows) {
  if (!rows.length) return null;
  const n = rows.length;
  const mae = rows.reduce((s, r) => s + Math.abs(r.q.p50 - r.y), 0) / n;
  const cov = rows.reduce((s, r) => s + (r.y >= r.q.p10 && r.y <= r.q.p90 ? 1 : 0), 0) / n;
  const mf = rows.reduce((s, r) => s + r.q.mean, 0) / n;
  const ma = rows.reduce((s, r) => s + r.y, 0) / n;
  return { n, mae: Number(mae.toFixed(4)), coverage80: Number(cov.toFixed(4)), level: ma > 0 ? Number((mf / ma).toFixed(4)) : null };
}
function bin(rows) {
  if (!rows.length) return null;
  const n = rows.length;
  let ll = 0; let br = 0; let sp = 0; let sy = 0;
  for (const r of rows) { const p = clip(r.p); ll -= r.y ? Math.log(p) : Math.log(1 - p); br += (p - r.y) ** 2; sp += p; sy += r.y; }
  return { n, logLoss: Number((ll / n).toFixed(5)), brier: Number((br / n).toFixed(5)), level: sy > 0 ? Number((sp / sy).toFixed(4)) : null, positives: sy };
}

for (const file of captures) {
  const cap = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Object.fromEntries([...Object.keys(FAMS).map((k) => [k, []]), ["anytime_td", []]]);
  const graded = [];
  const pending = [];
  for (const g of cap.games) {
    if (Date.parse(g.kickoffUtc) <= Date.parse(cap.capturedAt)) continue; // never graded as if frozen in advance
    const fin = finals.get(String(g.providerEventId));
    if (!fin) { pending.push(g.providerEventId); continue; }
    graded.push(g.providerEventId);
    const lines = new Map(fin.players.map((p) => [String(p.playerId).replace(/^nfl-athlete-/, ""), p]));
    for (const team of Object.values(g.teams)) {
      for (const p of team.players) {
        if (!p.espnId) continue;
        const line = lines.get(String(p.espnId)) ?? null;
        // a captured ACTIVE player with no line in a final is scored as zero (he was expected to play and recorded nothing)
        const y = { rec: line?.rec ?? 0, recYds: line?.recYds ?? 0, rushYds: line?.rushYds ?? 0, passYds: line?.passYds ?? 0, td: (line?.rushTd ?? 0) + (line?.recTd ?? 0) > 0 ? 1 : 0 };
        for (const [mkt, k] of Object.entries(FAMS)) {
          if (!p.allocV1?.[mkt]) continue;
          rows[mkt].push({ y: y[k], q: Object.fromEntries(ENGINES.filter((e) => p[e]?.[mkt]).map((e) => [e, p[e][mkt]])) });
        }
        if (p.anytimeTd?.gate) rows.anytime_td.push({ y: y.td, p: { rzTdV1: p.anytimeTd.rzTdV1, incumbentOpportunityTd: p.anytimeTd.incumbentOpportunityTd, gameWorlds_NOT_VALIDATED: p.gameWorlds?.anytimeTd_NOT_VALIDATED } });
      }
    }
  }
  const results = {};
  for (const mkt of Object.keys(FAMS)) {
    const present = ENGINES.filter((e) => rows[mkt].some((r) => r.q[e]));
    const common = rows[mkt].filter((r) => present.every((e) => r.q[e]));
    results[mkt] = Object.fromEntries(present.map((e) => [e, cont(common.map((r) => ({ y: r.y, q: r.q[e] })))]));
  }
  const tdModels = ["rzTdV1", "incumbentOpportunityTd", "gameWorlds_NOT_VALIDATED"];
  const tdPresent = tdModels.filter((m) => rows.anytime_td.some((r) => Number.isFinite(r.p[m])));
  const tdCommon = rows.anytime_td.filter((r) => tdPresent.every((m) => Number.isFinite(r.p[m])));
  results.anytime_td = Object.fromEntries(tdPresent.map((m) => [m, bin(tdCommon.map((r) => ({ y: r.y, p: r.p[m] })))]));
  const out = { schemaVersion: 1, artifact: "nfl-v2-candidates-forward-graded", capture: path.basename(file), captureSha256: cap.contentSha256 ?? null, capturedAt: cap.capturedAt, gradedAt: new Date().toISOString(), gamesGraded: graded.length, gamesPending: pending, results, note: "Shadow grading of a frozen capture; a single week is diagnostic, not proof. Forward protocol bars (n >= 300 per family, n >= 1000 for TD) govern any verdict." };
  fs.writeFileSync(file.replace(/\.json$/, ".graded.json"), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${path.basename(file)}: graded ${graded.length} game(s), pending ${pending.length}`);
  for (const [k, v] of Object.entries(results)) console.log(`  ${k.padEnd(21)} ${JSON.stringify(v)}`);
}
