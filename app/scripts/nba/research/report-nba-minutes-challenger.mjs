#!/usr/bin/env node
/**
 * NBA MINUTES: frozen v0.1 vs the challenger nba-minutes-current-season@1 on games ALREADY played (PRIVATE research,
 * READ-ONLY, EXPLORATORY — every game here was seen before the challenger existed; minutes are not a market and the
 * founder has not asked for them to be blinded). Report only: nothing is promoted, no official file is written.
 *
 *   node app/scripts/nba/research/report-nba-minutes-challenger.mjs [--from 2026-10-20] [--out-dir ~/gtp-evidence]
 *
 * Unit: (game, player) rows where the player PLAYED (minutes > 0 in the committed box score). PAIRED rows are those both
 * models projected. Scores: MAE and bias (projected − actual) of expected minutes; cov80 = share of actuals inside the
 * 80% interval of Normal(expected, sd) clipped to [0, 48] for BOTH models (same method), plus v0.1's own simulated
 * p10–p90 for reference; the paired MAE difference with a game-clustered 95% bootstrap interval (the champion/challenger evaluator's defaults).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { minutesChallengerSide, interval80, MINUTES_CHALLENGER_ID } from "../../../src/lib/sports/nba/minutes-current-season.mjs";
import { clusterBootstrap } from "../../../src/lib/sports/nba/champion-challenger.mjs";
import { LABELS } from "../../../src/lib/sports/nba/experimental-forecast.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const NBA = path.join(REPO, "data/internal/research/nba");
const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FROM = opt("--from", "2026-10-20");
const OUT_DIR = path.resolve(String(opt("--out-dir", "~/gtp-evidence")).replace(/^~/, os.homedir()));
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const r2 = (x) => (Number.isFinite(x) ? Number(x.toFixed(2)) : null);
const r3 = (x) => (Number.isFinite(x) ? Number(x.toFixed(3)) : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const BOX = path.join(NBA, "experimental/boxscores");
const boxscores = fs.readdirSync(BOX).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(BOX, f)));
const boxById = new Map(boxscores.map((b) => [String(b.providerEventId), b]));

const rows = [];
const sides = [];
const dir = path.join(NBA, "experimental-v0.1/forecasts");
for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f) && f.slice(0, 10) >= FROM).sort()) {
  for (const g of readJson(path.join(dir, file)).games ?? []) {
    if (g.label !== LABELS[2]) continue;
    const actual = boxById.get(String(g.providerEventId));
    if (!actual || actual.status !== "STATUS_FINAL") continue;
    for (const side of ["home", "away"]) {
      const ch = minutesChallengerSide(g, side, boxscores);
      if (!ch.ok) continue;
      const tid = String(g[side].providerTeamId);
      sides.push({ id: g.providerEventId, side, factor: ch.factor, shortfall: ch.shortfall, official: g.forecast.assumptions?.minutes?.[side]?.rescaleFactor ?? null });
      const off = new Map((g.forecast.players?.[side] ?? []).map((p) => [String(p.providerAthleteId), p]));
      const chal = new Map(ch.players.map((p) => [p.providerAthleteId, p]));
      for (const a of actual.players ?? []) {
        if (String(a.providerTeamId) !== tid || a.didNotPlay || !(a.minutes > 0)) continue;
        const id = String(a.providerAthleteId);
        const o = off.get(id), c = chal.get(id);
        if (!o && !c) continue;
        const inside = (iv) => (iv ? (a.minutes >= iv[0] && a.minutes <= iv[1] ? 1 : 0) : null);
        rows.push({
          game: String(g.providerEventId), date: file.slice(0, 10), id, name: a.name, actual: a.minutes,
          off: o ? o.expectedMinutes : null, offIn: o ? inside(interval80(o.expectedMinutes, o.minutesSd)) : null,
          offSimIn: o?.minutes && Number.isFinite(o.minutes.p10) ? inside([o.minutes.p10, o.minutes.p90]) : null,
          ch: c ? c.expectedMinutes : null, chIn: c ? inside(c.interval80) : null, chBasis: c?.basis ?? null, chOnly: !o && !!c,
        });
      }
    }
  }
}

const block = (xs, key, inKey) => {
  const v = xs.filter((r) => Number.isFinite(r[key]));
  const cov = v.map((r) => r[inKey]).filter((x) => x === 0 || x === 1);
  return { n: v.length, mae: r2(mean(v.map((r) => Math.abs(r[key] - r.actual)))), bias: r2(mean(v.map((r) => r[key] - r.actual))), cov80: r3(mean(cov)), cov80N: cov.length };
};
const paired = rows.filter((r) => Number.isFinite(r.off) && Number.isFinite(r.ch));
const byGame = new Map();
for (const r of paired) { if (!byGame.has(r.game)) byGame.set(r.game, []); byGame.get(r.game).push(Math.abs(r.ch - r.actual) - Math.abs(r.off - r.actual)); }
const diff = clusterBootstrap([...byGame.values()]);
const strata = {
  all: paired,
  "official ≥ 20 min": paired.filter((r) => r.off >= 20),
  "official > 42 min": paired.filter((r) => r.off > 42),
};
const result = {
  artifact: "nba-minutes-challenger-diagnostics", challenger: MINUTES_CHALLENGER_ID, dataClass: "PRIVATE_RESEARCH", label: "EXPLORATORY — games already seen; report only, promotes nothing",
  from: FROM, games: new Set(rows.map((r) => r.game)).size, sides: sides.length,
  strata: Object.fromEntries(Object.entries(strata).map(([k, xs]) => [k, { official: block(xs, "off", "offIn"), challenger: block(xs, "ch", "chIn"), officialSimP10P90Cov80: r3(mean(xs.map((r) => r.offSimIn).filter((x) => x === 0 || x === 1))) }])),
  pairedMaeDiff: { rule: "mean over player rows of |challenger − actual| − |official − actual| (negative favours the challenger); game-clustered 95% percentile bootstrap", n: diff.n, games: diff.clusters, mean: diff.mean, ci95: diff.lo == null ? null : [diff.lo, diff.hi] },
  challengerOnly: { note: "players the official pool could not project (no history) who played", ...block(rows.filter((r) => r.chOnly), "ch", "chIn") },
  challengerBasis: Object.fromEntries(Object.entries(paired.reduce((a, r) => ((a[r.chBasis] = (a[r.chBasis] ?? 0) + 1), a), {})).sort()),
  sideFactors: { challengerShortSides: sides.filter((s) => s.shortfall > 0).length, challengerScaledUp: sides.filter((s) => s.factor > 1).length, officialScaledUp: sides.filter((s) => s.official > 1).length },
  over42: { official: rows.filter((r) => r.off > 42).length, challenger: rows.filter((r) => r.ch > 42).length },
};
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT_DIR, `nba-minutes-challenger-diagnostics-${stamp}.json`), `${JSON.stringify(result, null, 1)}\n`);
const L = [`# NBA minutes: frozen v0.1 vs ${MINUTES_CHALLENGER_ID} (EXPLORATORY, games already seen, report only)`, "",
  `Forecasts ${FROM} → latest, regular season; ${result.games} games, ${result.sides} team-sides. Rows: players who played (minutes > 0). Lower MAE is better; bias = projected − actual. cov80: Normal(expected, sd) 80% interval clipped to [0, 48], same method for both (nominal 0.80).`, "",
  "| stratum | n | v0.1 MAE | challenger MAE | v0.1 bias | challenger bias | v0.1 cov80 | challenger cov80 | v0.1 sim p10–p90 cov80 |", "|---|---|---|---|---|---|---|---|---|"];
for (const [k, s] of Object.entries(result.strata)) L.push(`| ${k} | ${s.official.n} | ${s.official.mae} | ${s.challenger.mae} | ${s.official.bias} | ${s.challenger.bias} | ${s.official.cov80} | ${s.challenger.cov80} | ${s.officialSimP10P90Cov80} |`);
L.push("", `Paired MAE difference (challenger − v0.1): ${result.pairedMaeDiff.mean} (95% ${JSON.stringify(result.pairedMaeDiff.ci95)}), n ${result.pairedMaeDiff.n} rows over ${result.pairedMaeDiff.games} games. Exploratory: these games were seen before the challenger was defined; not a confirmatory result.`,
  `Challenger-only rows (players the official could not project, who played): n ${result.challengerOnly.n}, MAE ${result.challengerOnly.mae}, bias ${result.challengerOnly.bias}, cov80 ${result.challengerOnly.cov80}.`,
  `Challenger basis on paired rows: ${JSON.stringify(result.challengerBasis)}. Player-games projected > 42 min: v0.1 ${result.over42.official}, challenger ${result.over42.challenger}. Sides scaled up: v0.1 ${result.sideFactors.officialScaledUp}, challenger ${result.sideFactors.challengerScaledUp}; challenger sides short of 240 (all at ceiling): ${result.sideFactors.challengerShortSides}.`);
fs.writeFileSync(path.join(OUT_DIR, `nba-minutes-challenger-diagnostics-${stamp}.md`), `${L.join("\n")}\n`);
console.log(L.join("\n"));
