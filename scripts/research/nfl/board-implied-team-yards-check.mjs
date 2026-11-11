#!/usr/bin/env node
/** D3 development check: is the board-implied team yardage (starter passing mean + board rushers scaled by covered carry share) calibrated against actual team yards? 2026 weeks 2-9, committed boards + player-games-2026. Development data only. */
import fs from "node:fs"; import zlib from "node:zlib";
import path from "node:path"; import { fileURLToPath } from "node:url";
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const t = JSON.parse(zlib.gunzipSync(fs.readFileSync(R + "/data/internal/research/nfl/replay/player-games-2026-v1.json.gz")));
const C = Object.fromEntries(t.columns.map((c, i) => [c, i]));
const NV = { WSH: "WAS", LAR: "LA" };
const actual = new Map(); // `${week}|${nvTeam}` → {pass, rush}
for (const r of t.rows) { const k = `${r[C.week]}|${r[C.team]}`; const a = actual.get(k) ?? { pass: 0, rush: 0 }; a.pass += r[C.passYds]; a.rush += r[C.rushYds]; actual.set(k, a); }
const fc = (w) => { try { return JSON.parse(fs.readFileSync(`${R}/data/internal/research/nfl/replay/player-props-share-level-forward/2026-${String(w).padStart(2, "0")}.json`, "utf8")); } catch { return null; } };
const out = [];
const bd = R + "/app/public/data/nfl/player-board";
for (const f of fs.readdirSync(bd).filter((x) => /^\d+\.json$/.test(x))) {
  const b = JSON.parse(fs.readFileSync(`${bd}/${f}`, "utf8"));
  if (!(b.week >= 2 && b.week <= 9)) continue;
  const F = fc(b.week); if (!F) continue; const FC = Object.fromEntries(F.columns.map((c, i) => [c, i]));
  for (const team of [...new Set(b.players.map((p) => p.team))]) {
    const nv = NV[team] ?? team; const a = actual.get(`${b.week}|${nv}`); if (!a) continue;
    const ps = b.players.filter((p) => p.team === team);
    const qb = ps.find((p) => p.markets?.player_pass_yds); if (!qb) continue;
    const rushers = ps.filter((p) => p.markets?.player_rush_yds);
    const shareOf = (pid) => F.rows.find((r) => r[FC.market] === "player_rush_yds" && r[FC.team] === nv && String(r[FC.espnId]) === String(pid).replace(/^nfl-athlete-/, ""))?.[FC.share] ?? 0;
    const cov = rushers.reduce((s, p) => s + shareOf(p.playerId), 0);
    if (cov < 0.5) continue;
    const pass = qb.markets.player_pass_yds.mean, rush = rushers.reduce((s, p) => s + p.markets.player_rush_yds.mean, 0) / cov;
    out.push({ week: b.week, team, passB: pass, passA: a.pass, rushB: rush, rushA: a.rush });
  }
}
const m = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const rep = (k) => `${k}: board-implied mean ${m(out.map((o) => o[k + "B"])).toFixed(1)} vs actual ${m(out.map((o) => o[k + "A"])).toFixed(1)} · level (Σactual/Σboard) ${(m(out.map((o) => o[k + "A"])) / m(out.map((o) => o[k + "B"]))).toFixed(3)} · MAE ${m(out.map((o) => Math.abs(o[k + "A"] - o[k + "B"]))).toFixed(1)}`;
console.log("team-games", out.length, "(2026 weeks 2–9; QB passing = the passer's yards, actual = team passing yards from player rows)");
console.log(rep("pass")); console.log(rep("rush"));
const tot = out.map((o) => ({ b: o.passB + o.rushB, a: o.passA + o.rushA }));
console.log(`total: board ${m(tot.map((x) => x.b)).toFixed(1)} vs actual ${m(tot.map((x) => x.a)).toFixed(1)} · level ${(m(tot.map((x) => x.a)) / m(tot.map((x) => x.b))).toFixed(3)}`);
