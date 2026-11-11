#!/usr/bin/env node
/**
 * NBA ELO CONFIG — walk-forward comparison on DEVELOPMENT seasons (founder P0D, 2026-11-11). PRIVATE RESEARCH; changes
 * nothing official. Corpus-v1 only (2023-24 warm-up, fit-only; 2024-25 and 2025-26 evaluated, as in the model card's
 * baseline evaluation). 2026-27 is NOT touched: those games belong to prereg v2 (confirmatory after its approval,
 * exploratory before).
 *
 * Four configs, the official update rule otherwise (team-rating.mjs NBA_ELO_PARAMS: K 20, HA 70 suppressed at neutral
 * sites, scale 400, mean 1500; playoffs/play-in/cup final fold, preseason never):
 *   frozen-0.25   ratings frozen at the season start, 0.25 boundary regression — what the official does in 2026-27
 *   frozen-1/3    the same, 1/3 regression (the model card's stated value)
 *   inseason-0.25 every final strictly before the game's ET date folds — team-rating.mjs's rule if it kept folding
 *   inseason-1/3  the same with 1/3 — the model card's baseline evaluation (evaluate-nba-baselines.mjs)
 * Same cutoff for all: only finals on ET dates strictly before the game's ET date (prereg v2 §3's training-set rule).
 *
 * Metrics: log loss, Brier, ECE (10 bins), home bias; paired differences vs frozen-0.25 (the official as run) with the
 * game bootstrap (bootstrap.mjs: B 2000, seed 20261020). Primary population: regular season (phase 2).
 *   node scripts/nba/research-elo-config-walkforward.mjs [--out <file>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NBA_ELO_PARAMS } from "../../src/lib/sports/nba/team-rating.mjs";
import { bootstrapStatistic, clusterBootstrap } from "../../src/lib/sports/nba/bootstrap.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const OUT = process.argv.includes("--out") ? path.resolve(process.argv[process.argv.indexOf("--out") + 1]) : path.join(NBA, "reports", "elo-config-walkforward-dev.json");
const corpus = JSON.parse(fs.readFileSync(path.join(NBA, "corpus-v1.json"), "utf8"));
const WARMUP = 2024;
const etDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const games = corpus.rows
  .filter((r) => r.phase !== 1 && Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway) && r.ftHome !== r.ftAway)
  .map((r) => ({ ...r, et: etDate(r.dateUtc), y: r.ftHome > r.ftAway ? 1 : 0 }))
  .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));

const { K, HOME_ADVANTAGE: HA, MEAN, SCALE } = NBA_ELO_PARAMS;
const pOf = (rh, ra, neutral) => 1 / (1 + Math.pow(10, (ra - (rh + (neutral ? 0 : HA))) / SCALE));

/** Walk-forward: returns Map(eventId → pHome) for every evaluated game. `dayKey` groups the cutoff (ET by default). */
function run({ regression, inseason, dayKey = (g) => g.et }) {
  const r = new Map(); const get = (t) => r.get(t) ?? MEAN;
  let season = null; let frozen = null;
  const out = new Map();
  for (let i = 0; i < games.length;) {
    const day = dayKey(games[i]); const slate = [];
    while (i < games.length && dayKey(games[i]) === day) slate.push(games[i++]);
    for (const g of slate) {
      if (season != null && g.season !== season) { for (const [t, v] of r) r.set(t, v + (MEAN - v) * regression); frozen = new Map(r); }
      season = g.season;
      if (g.season === WARMUP) continue;
      const src = inseason ? get : (t) => frozen.get(t) ?? MEAN;
      out.set(String(g.providerEventId), pOf(src(g.home), src(g.away), g.neutralSite === true));
    }
    for (const g of slate) {
      const e = pOf(get(g.home), get(g.away), g.neutralSite === true);
      r.set(g.home, get(g.home) + K * (g.y - e)); r.set(g.away, get(g.away) + K * ((1 - g.y) - (1 - e)));
    }
  }
  return out;
}

const r4 = (x) => Number(x.toFixed(4));
const ll = (p, y) => -(y ? Math.log(Math.max(1e-12, p)) : Math.log(Math.max(1e-12, 1 - p)));
const ece = (items) => { let s = 0; for (let b = 0; b < 10; b += 1) { const xs = items.filter((it) => Math.min(9, Math.floor(it.p * 10)) === b); if (xs.length) s += (xs.length / items.length) * Math.abs(xs.reduce((a, it) => a + it.p, 0) / xs.length - xs.reduce((a, it) => a + it.y, 0) / xs.length); } return s; };
const summary = (items) => ({ n: items.length, logLoss: r4(items.reduce((s, it) => s + ll(it.p, it.y), 0) / items.length), brier: r4(items.reduce((s, it) => s + (it.p - it.y) ** 2, 0) / items.length), ece: bootstrapStatistic(items, ece), homeBias: r4(items.reduce((s, it) => s + it.p - it.y, 0) / items.length) });

const CONFIGS = {
  "frozen-0.25": { regression: 0.25, inseason: false },
  "frozen-1/3": { regression: 1 / 3, inseason: false },
  "inseason-0.25": { regression: 0.25, inseason: true },
  "inseason-1/3": { regression: 1 / 3, inseason: true },
};
const preds = Object.fromEntries(Object.entries(CONFIGS).map(([k, c]) => [k, run(c)]));
const evaluated = games.filter((g) => g.season !== WARMUP);
const POPS = {
  regular: (g) => g.phase === 2,
  "regular-first-30-days": (g) => g.phase === 2 && (Date.parse(g.et) - Date.parse(seasonStart[g.season])) / 864e5 < 30,
  "all-non-preseason": () => true,
};
const seasonStart = {};
for (const g of evaluated) if (g.phase === 2 && !(g.season in seasonStart)) seasonStart[g.season] = g.et;

const items = (cfg, filter) => evaluated.filter(filter).map((g) => ({ p: preds[cfg].get(String(g.providerEventId)), y: g.y }));
const paired = (a, b, filter, f) => clusterBootstrap(evaluated.filter(filter).map((g) => { const id = String(g.providerEventId); return [f(preds[a].get(id), g.y) - f(preds[b].get(id), g.y)]; }));
const brierF = (p, y) => (p - y) ** 2;

const report = {
  schema: "gtp.nba.elo-config-walkforward@1",
  dataClass: "PRIVATE_RESEARCH",
  status: "EXPLORATORY — development seasons of corpus-v1; changes nothing official",
  corpus: { file: "corpus-v1.json", warmupSeason: WARMUP, evaluatedSeasons: [2025, 2026], note: "both evaluated seasons were already seen by the model card's baseline evaluation; 2026-27 untouched (prereg v2)" },
  updateRule: { K, HA, MEAN, SCALE, source: "app/src/lib/sports/nba/team-rating.mjs NBA_ELO_PARAMS" },
  cutoff: "finals on ET dates strictly before the game's ET date (prereg v2 §3)",
  bootstrap: "game-level percentile, B 2000, seed 20261020 (bootstrap.mjs)",
  configs: CONFIGS,
  populations: {},
};
for (const [pop, filter] of Object.entries(POPS)) {
  const bySeason = (cfg) => Object.fromEntries([2025, 2026].map((s) => [s, summary(items(cfg, (g) => filter(g) && g.season === s))]));
  report.populations[pop] = {
    byConfig: Object.fromEntries(Object.keys(CONFIGS).map((c) => [c, { overall: summary(items(c, filter)), bySeason: bySeason(c) }])),
    pairedVsOfficialAsRun: Object.fromEntries(Object.keys(CONFIGS).filter((c) => c !== "frozen-0.25").map((c) => [`${c} − frozen-0.25`, { logLoss: paired(c, "frozen-0.25", filter, ll), brier: paired(c, "frozen-0.25", filter, brierF) }])),
    regressionWithinMode: {
      "inseason-1/3 − inseason-0.25": { logLoss: paired("inseason-1/3", "inseason-0.25", filter, ll), brier: paired("inseason-1/3", "inseason-0.25", filter, brierF) },
      "frozen-1/3 − frozen-0.25": { logLoss: paired("frozen-1/3", "frozen-0.25", filter, ll), brier: paired("frozen-1/3", "frozen-0.25", filter, brierF) },
    },
  };
}
/* implementation cross-check: the model card's baseline (UTC-date slates, 1/3, all non-preseason) must re-derive 0.6161 / n 2643 */
const card = run({ regression: 1 / 3, inseason: true, dayKey: (g) => g.dateUtc.slice(0, 10) });
const cardItems = evaluated.map((g) => ({ p: card.get(String(g.providerEventId)), y: g.y }));
report.crossCheck = { modelCardBaseline: { reproduced: { n: cardItems.length, logLoss: r4(cardItems.reduce((s, it) => s + ll(it.p, it.y), 0) / cardItems.length) }, modelCard: { n: 2643, logLoss: 0.6161 }, rule: "UTC-date slates, 1/3 regression, in-season, mean irrelevant (all teams start equal)" } };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ crossCheck: report.crossCheck, regular: Object.fromEntries(Object.entries(report.populations.regular.byConfig).map(([k, v]) => [k, { ll: v.overall.logLoss, brier: v.overall.brier, ece: v.overall.ece.value }])), paired: report.populations.regular.pairedVsOfficialAsRun, regression: report.populations.regular.regressionWithinMode, first30: Object.fromEntries(Object.entries(report.populations["regular-first-30-days"].pairedVsOfficialAsRun).map(([k, v]) => [k, v.logLoss])) }, null, 1));
