#!/usr/bin/env node
/**
 * NBA v0.1 MINUTES DIAGNOSTIC — players frozen at more than 42 expected minutes (PRIVATE research, READ-ONLY; PD task
 * 2026-11-10, Elo calibration slice 1, item 5). Diagnostic only: no model change, no artifact under data/ or app/public/.
 *
 *   node app/scripts/nba/research/report-nba-minutes-over-42.mjs [--from 2026-10-20] [--out ~/gtp-evidence/nba-minutes-over-42-<today>.md]
 *
 * Reads the committed v0.1 forecasts (data/internal/research/nba/experimental-v0.1/forecasts/<date>.json) for the regular
 * season and, per game side, the frozen minutes assumptions (season and window used, raw pool minutes, rescale factor).
 * For each player above the threshold it lists the frozen value, the pre-rescale value (frozen / rescale; only a lower
 * bound when the frozen value sits at the 48-minute cap), the basis, and the actual minutes from the committed box score when one exists (graded fact, official model).
 * 42 is the PD's diagnostic threshold for this report, not a model constant.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PLAYER_MINUTES } from "../../../src/lib/sports/nba/game-sim.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const NBA = path.join(REPO, "data/internal/research/nba");
const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FROM = opt("--from", "2026-10-20");
const THRESHOLD = 42;
const OUT = path.resolve(String(opt("--out", `~/gtp-evidence/nba-minutes-over-42-${new Date().toISOString().slice(0, 10)}.md`)).replace(/^~/, os.homedir()));
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const r1 = (x) => (Number.isFinite(x) ? Number(x.toFixed(1)) : null);

const boxDirs = [path.join(NBA, "experimental/boxscores"), path.join(NBA, "boxscores")];
const actualMinutes = (eventId, athleteId) => {
  for (const d of boxDirs) {
    const f = path.join(d, `${eventId}.json`);
    if (!fs.existsSync(f)) continue;
    const p = (readJson(f).players ?? []).find((x) => String(x.providerAthleteId) === String(athleteId));
    return p ? (p.didNotPlay ? 0 : p.minutes ?? null) : "absent";
  }
  return null;
};

const dir = path.join(NBA, "experimental-v0.1/forecasts");
const rows = [];
const sides = [];
for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f) && f.slice(0, 10) >= FROM).sort()) {
  const doc = readJson(path.join(dir, file));
  for (const g of doc.games ?? []) {
    if (g.seasonType !== undefined && !/regular/i.test(String(g.label ?? g.seasonType))) continue;
    for (const side of ["home", "away"]) {
      const m = g.forecast?.assumptions?.minutes?.[side];
      if (!m) continue;
      const team = g[side]?.abbreviation ?? g[side]?.abbr ?? g[side]?.name ?? side;
      sides.push({ date: file.slice(0, 10), seasonUsed: m.seasonUsed, windowTo: m.window?.to ?? null, rescale: m.rescaleFactor, raw: m.rawPoolMinutes });
      for (const p of g.forecast.players?.[side] ?? []) {
        if (!(p.expectedMinutes > THRESHOLD)) continue;
        rows.push({
          date: file.slice(0, 10), eventId: g.providerEventId, team, name: p.name, frozen: r1(p.expectedMinutes),
          preRescale: m.rescaleFactor ? r1(p.expectedMinutes / m.rescaleFactor) : null, capped: p.expectedMinutes >= MAX_PLAYER_MINUTES,
          rescale: m.rescaleFactor, rawPool: m.rawPoolMinutes, poolSize: g.forecast.assumptions.availability?.[side]?.poolSize ?? null,
          out: g.forecast.assumptions.availability?.[side]?.excludedOut?.length ?? null,
          basis: p.basis, gamesUsed: p.gamesUsed, seasonUsed: m.seasonUsed, windowTo: m.window?.to ?? null,
          injury: p.injuryStatus ?? null, actual: actualMinutes(g.providerEventId, p.providerAthleteId),
        });
      }
    }
  }
}

const bySeason = {};
for (const s of sides) bySeason[s.seasonUsed] = (bySeason[s.seasonUsed] ?? 0) + 1;
const rescaleUp = sides.filter((s) => s.rescale > 1).length;
const played = rows.filter((r) => Number.isFinite(r.actual) && r.actual > 0);
const L = [];
L.push(`# NBA v0.1 players frozen above ${THRESHOLD} expected minutes (regular season, forecasts ${FROM} → latest)`, "");
L.push("PRIVATE research diagnostic. No model change. Source: committed v0.1 forecast files (frozen minutes assumptions) and committed box scores.", "");
L.push(`- Team-sides scanned: ${sides.length}; minutes season used: ${Object.entries(bySeason).map(([k, v]) => `${k} → ${v}`).join(", ")} (corpus season labels: 2026 = 2025-26, 2027 = 2026-27)`);
L.push(`- Sides rescaled UP (factor > 1): ${rescaleUp} of ${sides.length}`);
L.push(`- Player-games above ${THRESHOLD}: ${rows.length} (${new Set(rows.map((r) => r.name)).size} players); with an actual minutes figure: ${played.length}, mean actual ${r1(played.reduce((a, r) => a + r.actual, 0) / (played.length || 1))} vs mean frozen ${r1(played.reduce((a, r) => a + r.frozen, 0) / (played.length || 1))}`, "");
L.push("| date | team | player | frozen | pre-rescale | rescale | raw pool | pool / out | basis (games) | season · window to | injury | actual |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows.sort((a, b) => b.frozen - a.frozen || a.date.localeCompare(b.date))) {
  L.push(`| ${r.date} | ${r.team} | ${r.name} | ${r.frozen}${r.capped ? " (cap)" : ""} | ${r.capped ? `≥ ${r.preRescale}` : r.preRescale} | ${r.rescale} | ${r.rawPool} | ${r.poolSize} / ${r.out} | ${r.basis} (${r.gamesUsed}) | ${r.seasonUsed} · ${String(r.windowTo).slice(0, 10)} | ${r.injury ?? "—"} | ${r.actual ?? "no box score"} |`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${L.join("\n")}\n`);
console.log(JSON.stringify({ out: OUT, sides: sides.length, bySeason, rescaleUp, playerGames: rows.length, players: new Set(rows.map((r) => r.name)).size }));
