#!/usr/bin/env node
/**
 * NBA MINUTES — controlled evaluation by PLAYER TYPE (founder P0C; PD 2026-11-12). PRIVATE research, READ-ONLY, promotes
 * nothing, writes no official file.
 *
 * Models (expected minutes for a player who plays; the same pool, the same leakage cutoff for all):
 *   v0.1-frozen      the official as it runs in 2026-27: minutes-model.mjs over box scores of PRIOR seasons only
 *                    (corpus-v1 analogue: its window is the last 10 team games of the previous season, playoffs
 *                    included) → game-sim.mjs prepareRoster (one bounded factor to 240)
 *   v0.1-rule-live   the same rule with every box score strictly before the game (what v0.1 would do if it folded)
 *   challenger       nba-minutes-current-season@1 (minutes-current-season.mjs playerEstimate + distributeTo240; its
 *                    fallback is the frozen v0.1 value, exactly as in the shadow)
 *   v0.3             minutes-model-v03.mjs roleEstimate (prior-season role blended toward the current season) →
 *                    game-sim-v03.mjs prepareRosterV03 (play-rate water-fill)
 * POOL (shared, roster-gated before any 240 step, as production): the players the game's box score lists for the team
 *   (a roster proxy; historical roster captures do not exist), minus the game's injury-type DNPs (the TIP-TIME
 *   availability proxy, as M1/M2). The forward mode uses the real frozen forecasts and their real roster gate instead.
 * ROWS: players in the pool who PLAYED (minutes > 0). A model that does not project a played player is a COVERAGE miss,
 *   reported separately; MAE pairs are rows both models projected.
 * PLAYER TYPES (tags, pregame, may overlap; definitions fixed before any number was computed):
 *   rookie            no NBA regular-season appearance before this season
 *   traded            appeared for another team this season, or last prior-season team ≠ this team; ≤ 10 games here
 *   returning         missed the team's last ≥ 3 games (injury DNP or not listed) after appearing for it this season
 *   star              prior-season regular mean ≥ 30 min (current season if ≥ 5 games and no prior season)
 *   starter           started ≥ 50% of current-season appearances (prior season if < 5 current), not a star
 *   bench             none of star / starter
 *   promoted          started ≥ 2 of the team's last 3 games, with a starter share < 20% before those 3
 * Modes:
 *   --dev      development season 2024-25 (corpus season 2025). 2025-26 is not loaded (the availability prereg's
 *              single-use holdout season is kept untouched by research that reads its outcomes).
 *   --forward  already-graded 2026-27 forecasts (frozen v0.1, the challenger recomputed, the frozen v0.3 shadow), labelled
 *              EXPLORATORY: every game was seen before this evaluation existed.
 * Paired MAE differences vs v0.1-frozen use the game-clustered bootstrap (bootstrap.mjs: B 2000, seed 20261020).
 *   node scripts/nba/research/evaluate-nba-minutes-by-player-type.mjs --dev|--forward [--out <file>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expectedMinutes } from "../../../src/lib/sports/nba/minutes-model.mjs";
import { prepareRoster } from "../../../src/lib/sports/nba/game-sim.mjs";
import { eligibleBoxscores, playerEstimate, distributeTo240, minutesChallengerSide } from "../../../src/lib/sports/nba/minutes-current-season.mjs";
import { indexRoleHistory, roleEstimate, NORMALISATION } from "../../../src/lib/sports/nba/minutes-model-v03.mjs";
import { prepareRosterV03 } from "../../../src/lib/sports/nba/game-sim-v03.mjs";
import { etDateOf } from "../../../src/lib/sports/nba/finals-record.mjs";
import { corpusSeasonOfDate } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";
import { buildPlayerTagger, PLAYER_TYPES } from "../../../src/lib/sports/nba/minutes-player-types.mjs";
import { clusterBootstrap } from "../../../src/lib/sports/nba/bootstrap.mjs";
import { LABELS } from "../../../src/lib/sports/nba/experimental-forecast.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const argv = process.argv.slice(2);
const GAMES = argv.includes("--games") ? Number(argv[argv.indexOf("--games") + 1]) : 1e9;
const MODE = argv.includes("--dev") ? "dev" : argv.includes("--forward") ? "forward" : null;
if (!MODE) { console.error("--dev | --forward required"); process.exit(2); }
const OUT = argv.includes("--out") ? path.resolve(argv[argv.indexOf("--out") + 1]) : path.join(NBA, "reports", `minutes-by-player-type-${MODE}.json`);
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const readDir = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(d, f))) : []);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const TYPES = PLAYER_TYPES;
export const MODELS = Object.freeze(["v0.1-frozen", "v0.1-rule-live", "challenger", "v0.3"]);

const SEASON = 2025;
let box = readDir(path.join(NBA, "boxscores"));
if (MODE === "dev") box = box.filter((d) => d.season <= SEASON);
else box = [...box, ...readDir(path.join(NBA, "experimental", "boxscores"))];
/* fetched 2026-27 box scores carry no season label: label them by date, as sim-v1-profile.mjs does */
box = box.map((d) => (Number.isInteger(d.season) ? d : { ...d, season: corpusSeasonOfDate(d.dateUtc) }));
const regular = (d) => d?.boxscoreAvailable && d.phase === 2;
/** Pregame tags for one player (definitions: minutes-player-types.mjs). */
const tagsOf = buildPlayerTagger(box);
const appsByAthlete = new Map(); // regular-season appearances, oldest → newest (the shared pool below)
for (const d of [...box].sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc))) {
  if (!regular(d)) continue;
  for (const p of d.players ?? []) {
    if (p?.providerAthleteId == null) continue;
    const id = String(p.providerAthleteId);
    if (!appsByAthlete.has(id)) appsByAthlete.set(id, []);
    appsByAthlete.get(id).push({ t: Date.parse(d.dateUtc), season: d.season ?? null, eventId: String(d.providerEventId), teamId: String(p.providerTeamId), played: !p.didNotPlay && p.minutes > 0, minutes: p.minutes, starter: p.starter === true });
  }
}

const rows = [];
const outPlayers = (doc, teamId) => new Set((doc.players ?? []).filter((p) => String(p.providerTeamId) === teamId && p.didNotPlay === true && !/COACH/i.test(String(p.dnpReason ?? ""))).map((p) => String(p.providerAthleteId)));
function scoreSide({ gameId, teamId, doc, t, season, models }) {
  for (const p of doc.players ?? []) {
    if (String(p.providerTeamId) !== teamId || p.didNotPlay || !(p.minutes > 0)) continue;
    const id = String(p.providerAthleteId);
    if (!Object.values(models).some((m) => m.has(id))) continue; // not in any pool
    rows.push({ game: gameId, id, actual: p.minutes, tags: tagsOf(id, teamId, t, season), ...Object.fromEntries(MODELS.map((k) => [k, models[k]?.get(id) ?? null])) });
  }
}

if (MODE === "dev") {
  const docs = box.filter((d) => regular(d) && d.season === SEASON && d.status === "STATUS_FINAL").sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId))).slice(0, GAMES);
  const priorBox = box.filter((d) => d.season < SEASON);
  let k = 0; const t0 = Date.now();
  for (const doc of docs) {
    const t = Date.parse(doc.dateUtc), asOf = doc.dateUtc, gameEt = etDateOf(doc.dateUtc);
    const roleIdx = indexRoleHistory(box, { asOfDateUtc: asOf });
    const elig = eligibleBoxscores(box, { cutoffUtc: asOf, gameEt });
    for (const team of doc.teams) {
      const teamId = String(team.providerTeamId);
      const out = outPlayers(doc, teamId);
      const injuries = [...out].map((a) => ({ athleteId: a, providerTeamId: teamId, status: "Out" }));
      /* ROSTER GATE (the production pools are roster-gated before any 240 step): the players the game's box score lists
         for the team (a roster proxy — every listed player was on the roster at tip), minus the out list */
      const roster = new Set((doc.players ?? []).filter((p) => String(p.providerTeamId) === teamId).map((p) => String(p.providerAthleteId)));
      for (const id of out) roster.delete(id);
      const gate = (res) => ({ ...res, rows: res.rows.filter((r) => roster.has(String(r.providerAthleteId))) });
      const frozen = prepareRoster(gate(expectedMinutes({ boxscores: priorBox, teamProviderId: teamId, asOfDateUtc: asOf, injuries })));
      const frozenMap = new Map(frozen.players.map((x) => [String(x.providerAthleteId), x]));
      const rescale = frozen.assumptions?.minutes?.rescaleFactor ?? null;
      const live = prepareRoster(gate(expectedMinutes({ boxscores: box, teamProviderId: teamId, asOfDateUtc: asOf, injuries })));
      const pool = roster;
      const ests = [...pool].map((id) => ({ id, ...playerEstimate(elig, teamId, id, { frozen: frozenMap.get(id) ?? null, rescaleFactor: rescale }) })).filter((e) => Number.isFinite(e.estimate) && e.estimate > 0);
      const dist = distributeTo240(ests);
      const v03Rows = [...pool].map((id) => { const rec = roleIdx.byAthlete.get(id); const e = rec ? roleEstimate(rec, roleIdx) : null; return { providerAthleteId: id, name: null, availability: "active", ...(e ?? { expectedMinutes: null, basis: "insufficient" }) }; });
      const v03 = prepareRosterV03({ rows: v03Rows, normalisation: NORMALISATION });
      const pick = (players) => new Map(players.filter((x) => pool.has(String(x.providerAthleteId))).map((x) => [String(x.providerAthleteId), x.expectedMinutes]));
      scoreSide({ gameId: String(doc.providerEventId), teamId, doc, t, season: SEASON, models: { "v0.1-frozen": pick(frozen.players), "v0.1-rule-live": pick(live.players), challenger: new Map(ests.map((e, i) => [e.id, dist.finals[i]])), "v0.3": pick(v03.players) } });
    }
    if (++k % 200 === 0) console.log(`  ${k}/${docs.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} else {
  /* forward: the frozen official v0.1 forecasts, the challenger recomputed from them, the frozen v0.3 shadow */
  const boxById = new Map(readDir(path.join(NBA, "experimental", "boxscores")).map((b) => [String(b.providerEventId), b]));
  const v03ByGame = new Map();
  const v03Dir = path.join(NBA, "experimental-v0.3", "forecasts");
  for (const f of fs.existsSync(v03Dir) ? fs.readdirSync(v03Dir).filter((x) => /\.json$/.test(x)) : []) for (const g of readJson(path.join(v03Dir, f)).games ?? []) v03ByGame.set(String(g.providerEventId), g);
  const dir = path.join(NBA, "experimental-v0.1", "forecasts");
  for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f) && f >= "2026-10-20").sort()) {
    for (const g of readJson(path.join(dir, file)).games ?? []) {
      if (g.label !== LABELS[2]) continue;
      const doc = boxById.get(String(g.providerEventId));
      if (!doc || doc.status !== "STATUS_FINAL") continue;
      const t = Date.parse(g.dateUtc), season = 2027;
      for (const side of ["home", "away"]) {
        const teamId = String(g[side].providerTeamId);
        const off = new Map((g.forecast?.players?.[side] ?? []).filter((p) => p.availability !== "out").map((p) => [String(p.providerAthleteId), p.expectedMinutes]));
        const ch = minutesChallengerSide(g, side, box);
        const v03g = v03ByGame.get(String(g.providerEventId));
        const v03 = new Map((v03g?.forecast?.players?.[side] ?? []).filter((p) => p.availability !== "out").map((p) => [String(p.providerAthleteId), p.expectedMinutes]));
        scoreSide({ gameId: String(g.providerEventId), teamId, doc, t, season, models: { "v0.1-frozen": off, "v0.1-rule-live": new Map(), challenger: ch.ok ? new Map(ch.players.map((p) => [p.providerAthleteId, p.expectedMinutes])) : new Map(), "v0.3": v03 } });
      }
    }
  }
}

/* ── scoring ── */
const block = (xs, m) => { const v = xs.filter((r) => Number.isFinite(r[m])); return { n: v.length, coverage: r2(xs.length ? v.length / xs.length : null), mae: r2(mean(v.map((r) => Math.abs(r[m] - r.actual)))), bias: r2(mean(v.map((r) => r[m] - r.actual))) }; };
const pairedVs = (xs, m, ref = "v0.1-frozen") => {
  const byGame = new Map();
  for (const r of xs) { if (!Number.isFinite(r[m]) || !Number.isFinite(r[ref])) continue; if (!byGame.has(r.game)) byGame.set(r.game, []); byGame.get(r.game).push(Math.abs(r[m] - r.actual) - Math.abs(r[ref] - r.actual)); }
  const b = clusterBootstrap([...byGame.values()]);
  return { n: b.n, games: b.clusters, mean: b.mean, ci95: b.lo == null ? null : [b.lo, b.hi] };
};
const strata = { all: rows, ...Object.fromEntries(TYPES.map((ty) => [ty, rows.filter((r) => r.tags.includes(ty))])) };
const models = MODE === "dev" ? MODELS : MODELS.filter((m) => m !== "v0.1-rule-live");
const report = {
  schema: "gtp.nba.minutes-by-player-type@1", dataClass: "PRIVATE_RESEARCH",
  label: MODE === "dev" ? "EXPLORATORY — development season 2024-25 replay (tip-time availability proxy); promotes nothing" : "EXPLORATORY — already-graded 2026-27 forecasts, seen before this evaluation; promotes nothing",
  mode: MODE, rows: rows.length, games: new Set(rows.map((r) => r.game)).size, models,
  unit: "players who played (minutes > 0) in the shared pool; MAE / bias of expected minutes (projected − actual); coverage = share of those rows the model projected",
  bootstrap: "game-clustered percentile, B 2000, seed 20261020",
  strata: Object.fromEntries(Object.entries(strata).map(([k, xs]) => [k, {
    rows: xs.length,
    byModel: Object.fromEntries(models.map((m) => [m, block(xs, m)])),
    pairedMaeVsV01Frozen: Object.fromEntries(models.filter((m) => m !== "v0.1-frozen").map((m) => [`${m} − v0.1-frozen`, pairedVs(xs, m)])),
    ...(models.includes("v0.3") && models.includes("challenger") ? { pairedMae_v03_minus_challenger: pairedVs(xs, "v0.3", "challenger") } : {}),
  }])),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
for (const [k, s] of Object.entries(report.strata)) console.log(k.padEnd(10), String(s.rows).padStart(6), models.map((m) => `${m} ${s.byModel[m].mae}/${s.byModel[m].bias} cov ${s.byModel[m].coverage}`).join(" | "), "||", Object.entries(s.pairedMaeVsV01Frozen).map(([n, v]) => `${n.split(" ")[0]} ${v.mean} ${JSON.stringify(v.ci95)}`).join(" ; "));
