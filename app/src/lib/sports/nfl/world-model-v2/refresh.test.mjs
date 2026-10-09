/**
 * WORLD MODEL V2 REFRESH — end-to-end regression tests of the real builder (app/scripts/nfl/build-nfl-world-model-v2.mjs)
 * on a committed two-game Week 5 fixture (PHI vs JAX, IND @ PIT), written to a temporary directory.
 *
 * Founder requirements (2026-10-09), one test each:
 *   1. unchanged semantic inputs produce no new simulation files
 *   2. random percentile sampling noise alone does not trigger regeneration
 *   3. a material injury or quarterback change triggers regeneration even when the medians are unchanged
 *   4. a player-opportunity change triggers regeneration when the game-score summaries are unchanged
 *   5. a game that has kicked off is never regenerated
 *   6. game pages and Top Boards stay consistent after a refresh
 * plus: a model-parameter change and a real median / spread change regenerate.
 * Every input is an exact fingerprint — no threshold anywhere. The game-score inputs are the forecast's own published
 * distribution (forecastSummary.distribution; world-model-v2/heads.mjs), so the sampled 80% ranges are not read at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

import { loadForecastViews } from "../forecast-view-load.mjs";
import { gameTabs, boardTabs, topBoards, PLAYER_FAMILIES } from "../forecast-view.mjs";

const APP = process.cwd();
const FX = path.join(APP, "src/lib/sports/nfl/__fixtures__/world-model-v2-refresh");
const BUILDER = path.join(APP, "scripts/nfl/build-nfl-world-model-v2.mjs");
const NOW = "2026-10-09T01:00:00Z";
const PHI_JAX = "401872981";
const IND_PIT = "401872985";

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wm2-refresh-"));
  fs.cpSync(path.join(FX, "data"), path.join(dir, "data"), { recursive: true });
  fs.copyFileSync(path.join(FX, "packet.json"), path.join(dir, "packet.json"));
  return { dir, data: path.join(dir, "data"), out: path.join(dir, "out"), packet: path.join(dir, "packet.json") };
}
function build(sb, { now = NOW, packet = sb.packet, runs = 2000 } = {}) {
  const r = spawnSync(process.execPath, [BUILDER, "--now", now, "--packet", packet, "--data-root", sb.data, "--out-root", sb.out, "--only", `${PHI_JAX},${IND_PIT}`, "--runs", String(runs)], { encoding: "utf8" });
  assert.equal(r.status, 0, `builder failed: ${r.stderr}`);
  return r.stdout;
}
const runFiles = (sb) => { const d = path.join(sb.out, "data/internal/nfl/world-model-v2/runs"); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; };
const artifactSha = (sb, id) => crypto.createHash("sha256").update(fs.readFileSync(path.join(sb.out, "app/public/data/nfl/world-model-v2", `${id}.json`))).digest("hex");
const edit = (file, fn) => { const d = JSON.parse(fs.readFileSync(file, "utf8")); fn(d); fs.writeFileSync(file, JSON.stringify(d)); };
const forecasts = (sb) => path.join(sb.data, "app/public/data/nfl/forecasts/latest.json");
const injuries = (sb) => path.join(sb.data, "data/internal/research/injuries/nfl/latest.json");
const depth = (sb) => path.join(sb.data, "data/internal/research/nfl/depth-charts/fixture.json");
const simulated = (out) => Number(/(\d+) simulated/.exec(out)?.[1]);
const changedGames = (out) => [...out.matchAll(/^ {2}(\S.+?): home /gm)].map((m) => m[1]);
const artifact = (sb, id) => JSON.parse(fs.readFileSync(path.join(sb.out, "app/public/data/nfl/world-model-v2", `${id}.json`), "utf8"));
/** A simulated, ACTIVE receiver of a team in an artifact (the player a change will be made to). */
const receiverOf = (a, team) => a.players.find((p) => p.team === team && p.availability === "ACTIVE" && p.families.receivingYards && !p.families.passingYards);

test("1 · unchanged semantic inputs produce no new simulation files", () => {
  const sb = sandbox();
  assert.equal(simulated(build(sb)), 2, "first run simulates both games");
  const files = runFiles(sb); const a = artifactSha(sb, PHI_JAX); const b = artifactSha(sb, IND_PIT);
  // a later refresh: new forecast inputHash and generatedAt (an unrelated feed changed), same semantic inputs
  edit(forecasts(sb), (d) => { for (const f of d.forecasts) { f.model.inputHash = "ffffffffffffffff"; f.generatedAt = "2026-10-09T00:59:00Z"; } d.generatedAt = "2026-10-09T00:59:00Z"; });
  const out = build(sb, { now: "2026-10-09T01:01:00Z" });
  assert.equal(simulated(out), 0, out);
  assert.deepEqual(runFiles(sb), files, "no new run file");
  assert.equal(artifactSha(sb, PHI_JAX), a, "artifact byte-identical");
  assert.equal(artifactSha(sb, IND_PIT), b);
});

test("2 · percentile sampling noise alone does not trigger regeneration", () => {
  const sb = sandbox();
  build(sb);
  const files = runFiles(sb); const a = artifactSha(sb, PHI_JAX);
  assert.equal(artifact(sb, PHI_JAX).run.inputs.headsSource, "DISTRIBUTION", "the exact published distribution is the input");
  // a regenerated forecast: same distribution, re-sampled ranges and score ranges (any size — they are not inputs)
  for (const [i, k] of [[1, 1], [2, -1], [3, 2]].entries()) {
    edit(forecasts(sb), (d) => { for (const f of d.forecasts) { const s = f.forecastSummary; s.margin.p10 -= k[0]; s.margin.p90 += k[1]; s.total.p10 += k[1]; s.total.p90 -= k[0]; s.scoreRange.homeP90 += k[1]; } });
    assert.equal(simulated(build(sb, { now: `2026-10-09T01:0${i + 1}:00Z` })), 0);
  }
  assert.deepEqual(runFiles(sb), files);
  assert.equal(artifactSha(sb, PHI_JAX), a);
});

test("2b · a record written before the distribution was published falls back to the median and range, named as such", () => {
  const sb = sandbox();
  edit(forecasts(sb), (d) => { for (const f of d.forecasts) delete f.forecastSummary.distribution; });
  build(sb);
  const a = artifact(sb, PHI_JAX);
  assert.equal(a.run.inputs.headsSource, "RANGE");
  assert.equal(a.run.inputs.heads.mMean, 0);
});

test("3a · an injury designation change regenerates that game, medians unchanged", () => {
  const sb = sandbox();
  build(sb);
  const before = artifact(sb, PHI_JAX);
  const wr = receiverOf(before, "JAX");
  assert.ok(wr, "fixture has an active JAX receiver");
  edit(injuries(sb), (d) => { d.entries = d.entries.filter((e) => String(e.athleteId) !== wr.playerId.replace("nfl-athlete-", "")); d.entries.push({ sport: "nfl", athleteId: wr.playerId.replace("nfl-athlete-", ""), athleteName: wr.name, status: "Questionable", statedAt: "2026-10-09T00:55Z" }); });
  const out = build(sb, { now: "2026-10-09T01:01:00Z" });
  assert.deepEqual(changedGames(out), ["PHI VS JAX"], out);
  const after = artifact(sb, PHI_JAX);
  assert.deepEqual(after.run.inputs.heads, before.run.inputs.heads, "the game-score inputs did not change");
  assert.equal(after.players.find((p) => p.playerId === wr.playerId).availability, "QUESTIONABLE");
  assert.equal(after.run.supersedes, before.simulationId, "the new run records the run it supersedes");
});

test("3b · an Out designation removes the player and regenerates", () => {
  const sb = sandbox();
  build(sb);
  const wr = receiverOf(artifact(sb, IND_PIT), "PIT");
  edit(injuries(sb), (d) => { d.entries = d.entries.filter((e) => String(e.athleteId) !== wr.playerId.replace("nfl-athlete-", "")); d.entries.push({ sport: "nfl", athleteId: wr.playerId.replace("nfl-athlete-", ""), athleteName: wr.name, status: "Out", statedAt: "2026-10-09T00:55Z" }); });
  assert.deepEqual(changedGames(build(sb, { now: "2026-10-09T01:01:00Z" })), ["IND @ PIT"]);
  assert.ok(!artifact(sb, IND_PIT).players.some((p) => p.playerId === wr.playerId), "an Out player is not simulated");
});

test("3c · a depth-chart starting-quarterback change regenerates even with the same score inputs", () => {
  const sb = sandbox();
  build(sb);
  const before = artifact(sb, PHI_JAX);
  assert.equal(before.quarterbacks.PHI.passer.name, "Jalen Hurts");
  // a later depth-chart snapshot promotes the QB2 (Tanner McKee) over Hurts; nothing else changes
  edit(depth(sb), (d) => { const s = d.snapshots.find((x) => x.team === "PHI"); const [q1, q2, ...rest] = s.quarterbacks; d.snapshots.push({ ...s, timestamp: "2026-10-09T00:58:00Z", quarterbacks: [{ ...q2, rank: 1 }, { ...q1, rank: 2 }, ...rest] }); });
  const out = build(sb, { now: "2026-10-09T01:01:00Z" });
  assert.deepEqual(changedGames(out), ["PHI VS JAX"], out);
  const after = artifact(sb, PHI_JAX);
  assert.equal(after.quarterbacks.PHI.passer.name, "Tanner McKee", "the passer changed");
  assert.deepEqual(after.run.inputs.heads, before.run.inputs.heads, "the game-score inputs did not change");
  assert.equal(after.run.supersedes, before.simulationId);
});

test("3d · the starting quarterback ruled Out regenerates with the backup passing", () => {
  const sb = sandbox();
  build(sb);
  const before = artifact(sb, IND_PIT);
  const qb = before.quarterbacks.IND.passer;
  assert.equal(qb.name, "Daniel Jones");
  const id = qb.playerId.replace("nfl-athlete-", "");
  edit(injuries(sb), (d) => { d.entries = d.entries.filter((e) => String(e.athleteId) !== id); d.entries.push({ sport: "nfl", athleteId: id, athleteName: qb.name, status: "Out", statedAt: "2026-10-09T00:55Z" }); });
  const out = build(sb, { now: "2026-10-09T01:01:00Z" });
  assert.deepEqual(changedGames(out), ["IND @ PIT"], out);
  const after = artifact(sb, IND_PIT);
  assert.equal(after.quarterbacks.IND.passer.name, "Anthony Richardson Sr.");
  assert.ok(!after.players.some((p) => p.playerId === qb.playerId), "the Out starter is not simulated");
  assert.deepEqual(after.run.inputs.heads, before.run.inputs.heads);
});

test("4 · a player-opportunity change regenerates when the game-score summaries are unchanged", () => {
  const sb = sandbox();
  build(sb);
  const before = artifact(sb, IND_PIT);
  const changedPacket = path.join(sb.dir, "packet-v2.json");
  const p = JSON.parse(fs.readFileSync(sb.packet, "utf8"));
  const wr = receiverOf(before, "IND");
  const member = p.teams.IND.pool.find((m) => `nfl-athlete-${m.espnId}` === wr.playerId);
  member.shares.targets = Number((member.shares.targets * 1.25).toFixed(4)); // a new week's usage
  fs.writeFileSync(changedPacket, JSON.stringify(p));
  const out = build(sb, { now: "2026-10-09T01:01:00Z", packet: changedPacket });
  assert.deepEqual(changedGames(out), ["IND @ PIT"], "only the game whose players changed");
  assert.deepEqual(artifact(sb, IND_PIT).run.inputs.heads, before.run.inputs.heads);
});

test("model parameters and a real change in the published distribution regenerate", () => {
  const sb = sandbox();
  build(sb);
  const params = path.join(sb.dir, "packet-params.json");
  const p = JSON.parse(fs.readFileSync(sb.packet, "utf8")); p.params.kappa = { ...p.params.kappa, t: p.params.kappa.t + 1 }; fs.writeFileSync(params, JSON.stringify(p));
  assert.equal(simulated(build(sb, { now: "2026-10-09T01:01:00Z", packet: params })), 2, "a model parameter is in every game's fingerprint");
  const sb2 = sandbox();
  build(sb2);
  edit(forecasts(sb2), (d) => { const s = d.forecasts.find((f) => f.providerEventId === PHI_JAX).forecastSummary; s.distribution.marginMean += 0.01; });
  assert.deepEqual(changedGames(build(sb2, { now: "2026-10-09T01:01:00Z" })), ["PHI VS JAX"], "any change in a mean is a new input");
  edit(forecasts(sb2), (d) => { d.forecasts.find((f) => f.providerEventId === IND_PIT).forecastSummary.distribution.totalSigma += 0.01; });
  assert.deepEqual(changedGames(build(sb2, { now: "2026-10-09T01:02:00Z" })), ["IND @ PIT"], "any change in a spread is a new input");
});

test("5 · a game that has kicked off is never regenerated, whatever changes", () => {
  const sb = sandbox();
  build(sb);
  const a = artifactSha(sb, PHI_JAX); const files = runFiles(sb);
  const started = path.join(sb.dir, "packet-started.json");
  const p = JSON.parse(fs.readFileSync(sb.packet, "utf8")); p.games.find((g) => g.providerEventId === PHI_JAX).kickoffUtc = "2026-10-09T00:50:00Z"; fs.writeFileSync(started, JSON.stringify(p));
  edit(injuries(sb), (d) => { d.entries = []; }); // availability changes too
  edit(forecasts(sb), (d) => { d.forecasts.find((f) => f.providerEventId === PHI_JAX).forecastSummary.distribution.marginMean += 3; });
  const out = build(sb, { now: "2026-10-09T01:01:00Z", packet: started });
  assert.match(out, /skipped PHI VS JAX: kicked off — last pregame artifact kept/);
  assert.equal(artifactSha(sb, PHI_JAX), a, "the pregame artifact is untouched");
  assert.ok(!runFiles(sb).some((f) => f.startsWith(PHI_JAX) && !files.includes(f)), "no new run for the started game");
});

test("6 · game pages and Top Boards stay consistent after a refresh", () => {
  const sb = sandbox();
  build(sb, { runs: 10000 }); // the published run count (fewer runs is never shown)
  edit(injuries(sb), (d) => { d.entries = d.entries.filter((e) => e.status !== "Questionable"); });
  assert.equal(simulated(build(sb, { now: "2026-10-09T01:01:00Z", runs: 10000 })), 2, "the availability change refreshes both games");
  // a public directory holding exactly what the pages read: forecasts, the refreshed artifacts, the player boards
  const pub = path.join(sb.dir, "public");
  fs.cpSync(path.join(sb.data, "app/public"), pub, { recursive: true });
  fs.cpSync(path.join(sb.out, "app/public/data/nfl/world-model-v2"), path.join(pub, "data/nfl/world-model-v2"), { recursive: true });
  const views = loadForecastViews(pub);
  assert.equal(views.filter((v) => v.simulation).length, 2);
  const { boards } = topBoards(views, { now: NOW });
  const tabs = boardTabs(boards);
  let checked = 0;
  for (const f of PLAYER_FAMILIES.filter((x) => x.source)) {
    for (const r of tabs.lists[f.key]) {
      const v = views.find((x) => x.providerEventId === r.player.providerEventId);
      const g = gameTabs(v).lists[f.key].find((x) => x.player.playerId === r.player.playerId);
      assert.deepEqual(r.entry, g.entry, `${r.player.name} ${f.key}: board = game page after refresh`);
      checked += 1;
    }
  }
  for (const v of views) for (const p of v.players) for (const e of Object.values(p.families)) if (e.simulationId) assert.equal(e.simulationId, v.simulation.simulationId, "every row reads the refreshed run");
  assert.ok(checked > 10);
});
