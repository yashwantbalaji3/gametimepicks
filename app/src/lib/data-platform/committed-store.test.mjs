/**
 * THE COMMITTED DATA PLATFORM STORE (v1.2 · D1208/D1210/D1214) — data/internal/platform/v1.
 *
 * Two-level validation, level 2: the committed artifacts themselves — manifest integrity, whole-store
 * validation (every record, every alias round trip), the MLB 2023–2025 history pins, shipped-id
 * preservation against CURRENT owner artifacts, provenance, and golden read-layer queries.
 *
 * FRESHNESS WITHOUT FLAKINESS. Bots commit new captures daily, so an owner artifact can be newer than the
 * committed store. sources.json records the sha256 of every artifact the builder read; preservation checks
 * compare ids only from artifacts whose bytes are UNCHANGED since the build (still a non-empty, asserted
 * population), so a stale store is reported by `build.mjs --check`, never by a red unit phase on bot data.
 *
 * Run: npx tsx --test src/lib/data-platform/committed-store.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { openPlatform, readStore, verifyManifest } from "./readers.mjs";
import { validateStore } from "./validate.mjs";
import { sha256Hex, parseJsonl } from "./stable-json.mjs";
import { mlbTeamRef, nflTeamRef } from "../follow/follow-schema.mjs";
import { nflPlayerId } from "./ids.mjs";
import { SOURCES } from "../sports/source-registry.mjs";

const REPO = path.join(process.cwd(), process.cwd().endsWith("app") ? ".." : "");
const APP = path.join(REPO, "app");
const ROOT = path.join(REPO, "data", "internal", "platform", "v1");
const P = openPlatform(ROOT);
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "sources.json"), "utf8"));
const recorded = new Map(sources.sources.flatMap((s) => s.artifacts.map((a) => [a.path, a.sha256])));
const fresh = (abs) => {
  const rel = path.relative(REPO, abs).split(path.sep).join("/");
  return recorded.has(rel) && recorded.get(rel) === sha256Hex(fs.readFileSync(abs));
};
const readJson = (abs) => JSON.parse(fs.readFileSync(abs, "utf8"));
const files = (dir, re) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));

test("CS1 manifest integrity: every content file present and hashing to the manifest; nothing unlisted", async () => {
  const r = await verifyManifest(ROOT);
  assert.deepEqual(r.problems, []);
  assert.ok(r.files > 100);
});

test("CS2 the whole committed store validates (schema, identity, aliases, references, participants, time, stats)", () => {
  const v = validateStore(readStore(ROOT));
  assert.deepEqual(v.errors, []);
  assert.ok(v.checked.records > 200_000 && v.checked.aliases > 40_000, JSON.stringify(v.checked));
});

test("CS3 content is time-free and schema v1; build timing lives only in the unhashed build receipt", () => {
  const manifest = readJson(path.join(ROOT, "manifest.json"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.public, false);
  assert.equal(manifest.validation.ok, true);
  assert.doesNotMatch(JSON.stringify(manifest), /"builtAt"|"generatedAt"/);
  assert.ok(!manifest.files.some((f) => f.path.includes("build-latest")));
});

test("CS4 MLB 2023–2025 finals: counts equal the acquisition receipt, one record per gamePk, sides/venue/runs complete", () => {
  const receipt = readJson(path.join(REPO, "data/internal/research/mlb/reports/finals-history-validation.json"));
  let total = 0;
  for (const s of receipt.seasons) {
    const games = P.listGamesForSeason(`MLB-${s.season}`);
    const finals = games.filter((g) => g.statusClass === "FINAL");
    assert.equal(finals.length, s.finalGames, `MLB-${s.season} finals`);
    assert.equal(new Set(games.map((g) => g.id)).size, games.length, `MLB-${s.season} gamePk unique`);
    for (const g of games) {
      assert.ok(g.homeTeamId && g.awayTeamId && g.homeTeamId !== g.awayTeamId, g.id);
      assert.ok(g.officialDate && g.venue?.providerId, `${g.id} date + venue id`);
      assert.equal(g.startUtc, null, "the archive carries no instant; none is invented");
      const rows = [g.homeTeamId, g.awayTeamId].map((t) => P.getTeamGameStat("MLB", g.id, t, "mlb.final-score"));
      assert.ok(rows.every((r) => r && Number.isInteger(r.stats.runs) && r.src === "mlb.finals-history"), g.id);
    }
    total += finals.length;
  }
  assert.equal(total, receipt.seasons.reduce((n, s) => n + s.finalGames, 0));
  assert.equal(total, 7289, "the Phase 6 acquisition receipt total, re-derived from files");
});

test("CS5 shipped ids are preserved: MLB teams + gamePks, NFL follow teams + event ids + board athletes, EPL fixture ids, UFC bout ids", () => {
  let compared = 0;
  const mlb = files(path.join(APP, "public/data/mlb/statsapi-schedule"), /^\d{4}-\d{2}-\d{2}\.json$/).filter(fresh);
  assert.ok(mlb.length > 0, "at least one schedule capture unchanged since the build");
  for (const f of mlb) for (const g of readJson(f).games) {
    for (const side of [g.home, g.away]) assert.ok(P.getTeam(mlbTeamRef(side.id).id), `Follow id ${mlbTeamRef(side.id).id}`);
    assert.equal(P.getGame("MLB", g.gamePk)?.id, String(g.gamePk));
    compared += 1;
  }
  for (const t of readJson(path.join(APP, "public/data/nfl/rosters/latest.json")).teams) assert.ok(P.getTeam(nflTeamRef(t.providerTeamId).id), `nfl-team-${t.providerTeamId}`);
  const nflSched = files(path.join(APP, "public/data/nfl/schedule"), /^capture-.*\.json$/).filter(fresh);
  assert.ok(nflSched.length > 0);
  for (const f of nflSched) for (const r of readJson(f).rows) { assert.equal(P.getGame("NFL", r.providerEventId)?.id, String(r.providerEventId)); compared += 1; }
  const rosterAthletes = new Set(files(path.join(APP, "public/data/nfl/rosters"), /^(capture-.*|latest)\.json$/).filter(fresh).flatMap((f) => readJson(f).teams.flatMap((t) => t.players.map((p) => `nfl-athlete-${p.id}`))));
  for (const f of files(path.join(APP, "public/data/nfl/player-board"), /^\d+\.json$/)) {
    for (const p of readJson(f).players ?? []) {
      assert.equal(nflPlayerId(p.playerId), p.playerId, "the shipped nfl-athlete- id passes through unchanged");
      if (rosterAthletes.has(p.playerId)) { assert.ok(P.getPlayer(p.playerId), p.playerId); compared += 1; }
    }
  }
  const eplCaps = files(path.join(APP, "public/data/soccer/epl/fixtures"), /^capture-.*\.json$/);
  const newestEpl = eplCaps.at(-1);
  if (fresh(newestEpl)) for (const r of readJson(newestEpl).rows) { assert.equal(P.getGame("EPL", r.eventId)?.id, r.eventId); compared += 1; }
  for (const f of eplCaps.filter(fresh)) for (const r of readJson(f).rows) {
    const known = P.getGame("EPL", r.eventId) || P.resolveAlias("EPL", "gametime_epl_event", "game", r.eventId).status === "RESOLVED";
    assert.ok(known, `a shipped EPL id (current or superseded) must resolve: ${r.eventId}`);
  }
  const ufcNewest = files(path.join(APP, "public/data/ufc/schedule"), /^capture-.*\.json$/).at(-1);
  if (fresh(ufcNewest)) for (const b of readJson(ufcNewest).bouts) if (b.redProviderId && b.blueProviderId) { assert.equal(P.getGame("UFC", b.providerBoutId)?.id, String(b.providerBoutId)); compared += 1; }
  assert.ok(compared > 500, `preservation compared ${compared} ids`);
});

test("CS6 provenance: every row names a fingerprinted source; sources carry registry policy and time semantics", () => {
  const store = readStore(ROOT);
  const keys = new Set(sources.sources.map((s) => s.key));
  for (const r of [...store.teamGameStats, ...store.playerGameStats]) assert.ok(keys.has(r.src), `${r.src} not in sources.json`);
  for (const s of sources.sources) {
    assert.ok(s.registry && s.dataClass && s.timeMeaning, s.key);
    assert.ok(s.artifacts.length > 0 && s.artifacts.every((a) => /^[0-9a-f]{64}$/.test(a.sha256) && !path.isAbsolute(a.path)), s.key);
  }
  for (const s of sources.sources) assert.ok(SOURCES[s.registry], `${s.key} → registry ${s.registry} must exist in lib/sports/source-registry.mjs`);
});

test("CS7 golden queries: provider ids resolve exactly; team, player, season, head-to-head reads are source-agnostic", () => {
  // resolve ESPN NFL event alias → canonical NFL event (WSH @ PHI, 2026 week 1)
  assert.deepEqual(P.resolveAlias("NFL", "espn", "game", "401872929"), { status: "RESOLVED", id: "401872929" });
  assert.equal(P.resolveAlias("NFL", "nflverse", "game", "2026_01_WAS_PHI").id, "401872929");
  // resolve StatsAPI gamePk → canonical MLB game (2024 doubleheader game 1)
  assert.equal(P.resolveAlias("MLB", "mlb_statsapi", "game", 745844).id, "745844");
  // all games for one MLB team in 2025 (a full regular season)
  assert.equal(P.listGamesForTeam("mlb-team-121", { seasonId: "MLB-2025" }).length, 162);
  // last 5 factual games for an NFL player — newest first, each with that game's team
  const allen = P.listPlayerGameStats("nfl-athlete-15818", { family: "nfl.espn-player-lines", order: "desc", limit: 5 });
  assert.equal(allen.length, 5);
  const dates = allen.map((r) => P.getGame("NFL", r.gameId).startUtc);
  assert.deepEqual([...dates].sort().reverse(), dates);
  // season games for one EPL club
  assert.equal(P.listGamesForTeam("epl-team-359", { seasonId: "EPL-2025-26" }).length, 38);
  // UFC fighter bouts + results where supported
  const pantoja = P.listGamesForPlayer("ufc-athlete-2560746");
  assert.ok(pantoja.length >= 2 && pantoja.every((g) => g.competitors.some((c) => c.playerId === "ufc-athlete-2560746")));
  // when did these teams last play (NFL, final only)
  const h2h = P.listHeadToHead("nfl-team-12", "nfl-team-24", { finalOnly: true, limit: 1 });
  assert.equal(h2h.length, 1);
  // unknown is an answer; names never resolve
  assert.deepEqual(P.resolveAlias("MLB", "mlb_statsapi", "team", "New York Mets"), { status: "UNKNOWN" });
  assert.equal(P.getTeam("new-york-mets"), null);
});

test("CS8 coverage receipts: every sport declares unsupported slices; no unqualified 100% claim; parity has no unexplained mismatch", () => {
  for (const s of ["MLB", "NFL", "EPL", "UFC"]) {
    const c = P.getCoverage(s);
    assert.ok(c.declaredSlices.length > 0, s);
    assert.doesNotMatch(JSON.stringify(c), /100%|complete (sports )?database/i);
  }
  assert.deepEqual(P.getCoverage("EPL").families.find((f) => f.level === "player").status, "AVAILABLE");
  assert.equal(P.getCoverage("EPL").rows.teamGame, 0, "EPL team-game facts are UNSUPPORTED, not zero rows of zeros");
  const parity = readJson(path.join(ROOT, "receipts/parity.json"));
  assert.equal(parity.summary.unexplained, 0, JSON.stringify(parity.checks.filter((c) => c.verdict === "UNEXPLAINED")));
  assert.ok(parity.summary.checks >= 20);
});

test("CS9 source-owned zero vs missing survives the round trip into committed rows", () => {
  const santos = P.listPlayerGameStats("nfl-athlete-17427", { family: "nfl.espn-player-lines", limit: 1 })[0];
  assert.ok(santos && Object.values(santos.stats).every((v) => v === null), "a kicker's line: listed, nothing recorded");
  const shutout = P.getTeamGameStat("MLB", "823539", "mlb-team-147", "mlb.final-score");
  assert.equal(shutout?.stats.runs, 0, "NYY 0 in the postponed-then-played 2026-08-29 game");
  const graded = parseJsonl(fs.readFileSync(path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl"), "utf8"));
  assert.ok(graded.length > 0);
});
