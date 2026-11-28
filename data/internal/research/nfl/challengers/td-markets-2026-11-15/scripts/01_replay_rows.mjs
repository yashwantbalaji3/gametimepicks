#!/usr/bin/env node
/**
 * Read-only re-run of the P301 opportunityTd walk-forward (scripts/research/nfl/replay-anytime-td.mjs logic,
 * copied verbatim for the opportunityTd model) over the hash-pinned player-games-v2 table (2013 warm-up,
 * 2014-2025 scored). Unlike the original, it EMITS one row per scored candidate player-game with mu and the
 * TD COUNT (rushTd + recTd + otherTd), plus the pregame team lambda per team-game, so 2+ TD and first-TD
 * derivations can be tested historically. Nothing in the repo is written.
 *
 * Usage: node 01_replay_rows.mjs <worktreeRoot> <outJson>
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const ROOT = process.argv[2];
const OUT = process.argv[3];
const rel = (p) => path.join(ROOT, p);
const prereg = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/anytime-td-historical-replay-preregistration.json"), "utf8"));
const F = prereg.frozen;
const TABLE_PATH = "data/internal/research/nfl/replay/player-games-v2.json.gz";
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
if (sha(TABLE_PATH) !== F.inputs.playerGamesSha256) throw new Error("player-games-v2 hash mismatch");
const table = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(TABLE_PATH))));
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const inSeasons = (s, [a, b]) => s >= a && s <= b;

const warm = table.rows.filter((r) => inSeasons(r[C.season], F.seasons.warmup) && r[C.participation] !== "UNKNOWN");
const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
const warmTeamGames = Object.entries(table.teamTotals).filter(([k]) => Number(k.slice(0, 4)) >= F.seasons.warmup[0] && Number(k.slice(0, 4)) <= F.seasons.warmup[1]).map(([, v]) => v);
const anyTd = (r) => (r[C.rushTd] + r[C.recTd] + r[C.otherTd] > 0 ? 1 : 0);
const touched = warm.filter((r) => r[C.carries] + r[C.targets] > 0);
const LEAGUE = {
  rushTdPerCarry: sum(warm, (r) => r[C.rushTd]) / sum(warm, (r) => r[C.carries]),
  recTdPerTarget: sum(warm, (r) => r[C.recTd]) / sum(warm, (r) => r[C.targets]),
  teamRushTd: sum(warmTeamGames, (v) => v[3]) / warmTeamGames.length,
  teamRecTd: sum(warmTeamGames, (v) => v[4]) / warmTeamGames.length,
  otherTdPerPlayerGame: sum(touched, (r) => r[C.otherTd]) / touched.length,
  anytimeRate: sum(touched, anyTd) / touched.length,
};

const players = new Map();
const byTeam = new Map();
const teamForm = new Map();
const ST = (id) => {
  if (!players.has(id)) players.set(id, { team: null, games: 0, obs: { rush: [], targets: [], td: [] }, rates: { rushTd: [], recTd: [] }, recentAny: [] });
  return players.get(id);
};
const weight = (idxNow, idx, seasonNow, season, hl, bd) => 0.5 ** ((idxNow - idx) / hl) * bd ** Math.max(0, seasonNow - season);
function share(st, fam, season, shrinkK) {
  let num = 0, den = 0;
  for (const o of st.obs[fam]) { const w = weight(st.games, o.idx, season, o.season, F.share.halfLifeGames, F.share.boundaryDecay); num += w * o.share; den += w; }
  return den > 0 ? num / (den + shrinkK) : 0;
}
function shrunkRate(st, key, league, season, priorTrials) {
  let num = 0, den = 0;
  for (const o of st.rates[key]) { const w = weight(st.games, o.idx, season, o.season, F.rate.halfLifeGames, F.rate.boundaryDecay); num += w * o.num; den += w * o.den; }
  return (num + priorTrials * league) / (den + priorTrials);
}
function teamTd(team, season) {
  const t = teamForm.get(team);
  if (!t) return { rush: LEAGUE.teamRushTd, rec: LEAGUE.teamRecTd };
  const bd = F.teamForm.boundaryDecay ** Math.max(0, season - t.season);
  return { rush: LEAGUE.teamRushTd + (t.rush - LEAGUE.teamRushTd) * bd, rec: LEAGUE.teamRecTd + (t.rec - LEAGUE.teamRecTd) * bd };
}
function foldTeam(team, season, totals) {
  const alpha = 1 - 0.5 ** (1 / F.teamForm.halfLifeGames);
  const cur = teamTd(team, season);
  teamForm.set(team, { rush: cur.rush + alpha * (totals[3] - cur.rush), rec: cur.rec + alpha * (totals[4] - cur.rec), season });
}
const clip = (p) => Math.min(1 - F.probabilityClip, Math.max(F.probabilityClip, p));
function muOf(st, season, lam) {
  const carryShare = share(st, "rush", season, 0);
  const targetShare = share(st, "targets", season, 0);
  const effRush = shrunkRate(st, "rushTd", LEAGUE.rushTdPerCarry, season, F.opportunityTd.rushPriorCarries) / LEAGUE.rushTdPerCarry;
  const effRec = shrunkRate(st, "recTd", LEAGUE.recTdPerTarget, season, F.opportunityTd.recPriorTargets) / LEAGUE.recTdPerTarget;
  return carryShare * lam.rush * effRush + targetShare * lam.rec * effRec + LEAGUE.otherTdPerPlayerGame;
}

const rows = [...table.rows].sort((a, b) => (a[C.date] !== b[C.date] ? (a[C.date] < b[C.date] ? -1 : 1) : a[C.gameId] < b[C.gameId] ? -1 : a[C.gameId] > b[C.gameId] ? 1 : 0));
const out = [];
const teamGamesOut = [];
const counts = { void: 0, quarantined: 0 };
for (let i = 0; i < rows.length;) {
  let j = i;
  while (j < rows.length && rows[i][C.date] === rows[j][C.date]) j += 1;
  const day = rows.slice(i, j);
  const season = day[0][C.season];
  if (season > F.seasons.warmup[1]) {
    const teamGames = new Map();
    for (const r of day) {
      const k = `${r[C.gameId]}|${r[C.team]}`;
      if (!teamGames.has(k)) teamGames.set(k, { gameId: r[C.gameId], team: r[C.team], week: r[C.week], seasonType: r[C.seasonType], rows: new Map() });
      teamGames.get(k).rows.set(String(r[C.playerId]), r);
    }
    for (const tg of teamGames.values()) {
      const lam = teamTd(tg.team, season);
      let sumMuCand = 0, nCand = 0;
      for (const id of byTeam.get(tg.team) ?? []) {
        const st = players.get(id);
        if (share(st, "rush", season, 0) < F.gate.carryShare && share(st, "targets", season, 0) < F.gate.targetShare) continue;
        const mu = muOf(st, season, lam);
        // the candidate's mu counts toward the team's candidate mass whether or not he plays (a pregame quantity)
        const row = tg.rows.get(id) ?? null;
        if (!row) { counts.void += 1; continue; }
        if (row[C.participation] === "UNKNOWN") { counts.quarantined += 1; continue; }
        sumMuCand += mu; nCand += 1;
        out.push([tg.gameId, season, tg.week, tg.team, id, row[C.position], +mu.toFixed(6), +clip(1 - Math.exp(-mu)).toFixed(6), row[C.rushTd] + row[C.recTd] + row[C.otherTd], row[C.otherTd]]);
      }
      const totals = table.teamTotals[`${tg.gameId}|${tg.team}`] ?? null;
      teamGamesOut.push([tg.gameId, season, tg.team, +lam.rush.toFixed(6), +lam.rec.toFixed(6), +sumMuCand.toFixed(6), nCand, totals ? totals[3] : null, totals ? totals[4] : null]);
    }
  }
  const folded = new Set();
  for (const r of day) {
    if (r[C.participation] === "UNKNOWN") continue;
    const id = String(r[C.playerId]);
    const st = ST(id);
    const totals = table.teamTotals[`${r[C.gameId]}|${r[C.team]}`] ?? [0, 0, 0, 0, 0];
    if (st.team !== r[C.team]) {
      if (st.team) byTeam.get(st.team)?.delete(id);
      st.obs = { rush: [], targets: [], td: [] };
      st.team = r[C.team];
      if (!byTeam.has(st.team)) byTeam.set(st.team, new Set());
      byTeam.get(st.team).add(id);
    }
    const idx = st.games + 1;
    st.obs.rush.push({ share: totals[1] > 0 ? r[C.carries] / totals[1] : 0, idx, season: r[C.season] });
    st.obs.targets.push({ share: totals[2] > 0 ? r[C.targets] / totals[2] : 0, idx, season: r[C.season] });
    const teamScorerTd = totals[3] + totals[4];
    if (teamScorerTd > 0) st.obs.td.push({ share: (r[C.rushTd] + r[C.recTd]) / teamScorerTd, idx, season: r[C.season] });
    if (r[C.carries] > 0) st.rates.rushTd.push({ num: r[C.rushTd], den: r[C.carries], idx, season: r[C.season] });
    if (r[C.targets] > 0) st.rates.recTd.push({ num: r[C.recTd], den: r[C.targets], idx, season: r[C.season] });
    st.recentAny.push(anyTd(r));
    st.games = idx;
    const tk = `${r[C.gameId]}|${r[C.team]}`;
    if (!folded.has(tk)) { folded.add(tk); foldTeam(r[C.team], r[C.season], totals); }
  }
  i = j;
}
// reproduction check against the committed receipt (held-out 2014-2021)
const held = out.filter((r) => r[1] >= 2014 && r[1] <= 2021);
let ll = 0, y = 0;
for (const r of held) { const p = r[7]; const yy = r[8] > 0 ? 1 : 0; y += yy; ll -= yy ? Math.log(p) : Math.log(1 - p); }
const check = { heldOutN: held.length, heldOutLogLoss: ll / held.length, positives: y };
fs.writeFileSync(OUT, JSON.stringify({ league: LEAGUE, teamTotalsColumns: table.teamTotalsColumns, columns: ["gameId", "season", "week", "team", "playerId", "position", "mu", "p", "tdCount", "otherTd"], rows: out, teamGameColumns: ["gameId", "season", "team", "lamRush", "lamRec", "sumMuCandPlayed", "nCandPlayed", "actRushTd", "actRecTd"], teamGames: teamGamesOut, counts, check }));
console.log(JSON.stringify({ rows: out.length, counts, check, teamTotalsColumns: table.teamTotalsColumns }));
