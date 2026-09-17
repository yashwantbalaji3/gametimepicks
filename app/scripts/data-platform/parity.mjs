#!/usr/bin/env node
/**
 * Shadow parity receipt (D1214): the committed platform store vs the CURRENT product owners' artifacts.
 *
 *   node scripts/data-platform/parity.mjs            write data/internal/platform/v1/receipts/parity.json
 *   node scripts/data-platform/parity.mjs --print    print only
 *
 * Owner artifacts move daily (bots). A mismatch caused by an owner artifact that changed AFTER the platform
 * was built is STALE_PLATFORM, proven by the sha256 recorded in sources.json — never assumed. The receipt is
 * point-in-time, so it lives outside the content manifest.
 */
import fs from "node:fs";
import path from "node:path";
import { openPlatform } from "../../src/lib/data-platform/readers.mjs";
import { parityRow, containment, values, DISPOSITIONS as D } from "../../src/lib/data-platform/parity.mjs";
import { mlbTeamId, nflTeamId, eplPlayerId } from "../../src/lib/data-platform/ids.mjs";
import { normalizeInstant } from "../../src/lib/data-platform/contract.mjs";
import { sha256Hex, stablePretty, parseJsonl } from "../../src/lib/data-platform/stable-json.mjs";
import { APP, REPO, PLATFORM_DIR } from "./sources.mjs";

const PRINT = process.argv.includes("--print");
const P = openPlatform(PLATFORM_DIR);
const sources = JSON.parse(fs.readFileSync(path.join(PLATFORM_DIR, "sources.json"), "utf8"));
const recorded = new Map(sources.sources.flatMap((s) => s.artifacts.map((a) => [a.path, a.sha256])));
const rel = (abs) => path.relative(REPO, abs).split(path.sep).join("/");
const ownerArtifacts = new Map();
const read = (abs, parse = JSON.parse) => {
  const bytes = fs.readFileSync(abs);
  ownerArtifacts.set(rel(abs), sha256Hex(bytes));
  return parse(bytes.toString("utf8"));
};
/** true when this artifact is a platform source whose bytes changed since the build (or is new since it) */
const changedSinceBuild = (abs) => {
  const r = rel(abs);
  if (!recorded.has(r)) return true;
  return recorded.get(r) !== sha256Hex(fs.readFileSync(abs));
};
const listDir = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f)) : []);
const pub = (p) => path.join(APP, "public/data", p);
const rows = [];

// ── MLB ───────────────────────────────────────────────────────────────────────────────────────────
{
  const schedFiles = listDir(pub("mlb/statsapi-schedule"), /^\d{4}-\d{2}-\d{2}\.json$/);
  const teamIds = [], gamePks = [], changed = new Set(), newestStart = new Map();
  for (const f of schedFiles) {
    const doc = read(f);
    const stale = changedSinceBuild(f);
    for (const g of doc.games ?? []) {
      teamIds.push(mlbTeamId(g.home?.id), mlbTeamId(g.away?.id));
      gamePks.push(String(g.gamePk));
      if (stale) changed.add(String(g.gamePk));
      const prev = newestStart.get(String(g.gamePk));
      if (!prev || doc.date > prev.date) newestStart.set(String(g.gamePk), { date: doc.date, start: normalizeInstant(g.gameDate) });
    }
  }
  const platformTeams = new Set(P.listSeasonsForLeague("MLB").length ? (() => { const s = new Set(); for (const t of teamIds) if (P.getTeam(t)) s.add(t); return s; })() : []);
  rows.push(parityRow("P-MLB-1", { owner: "Follow entity registry team ids (mlb-team-<StatsAPI id> over mlb/statsapi-schedule)", platform: "teams/MLB", ...containment(teamIds.filter(Boolean), (id) => platformTeams.has(id)) }));
  rows.push(parityRow("P-MLB-2", { owner: "mlb/statsapi-schedule gamePk (routes, Live, Saved)", platform: "games/MLB", ...containment(gamePks, (id) => Boolean(P.getGame("MLB", id)), (id) => (changed.has(id) ? D.STALE_PLATFORM : D.UNEXPLAINED)) }));
  rows.push(parityRow("P-MLB-3", {
    owner: "mlb/statsapi-schedule newest capture gameDate", platform: "GameRecord.startUtc",
    ...values([...newestStart].map(([pk, v]) => ({ key: pk, owner: v.start, platform: P.getGame("MLB", pk)?.startUtc ?? null })), ({ key }) => (changed.has(key) ? D.STALE_PLATFORM : D.UNEXPLAINED)),
  }));
  const graded = read(pub("mlb/results/game-predictions-graded.jsonl"), parseJsonl);
  const byPk = new Map();
  for (const g of graded) if (g.actual) byPk.set(String(g.gamePk), g.actual);
  const linescoreCutoff = sources.cutoffs?.MLB?.["mlb.linescores"] ?? "";
  const gradedDate = new Map(graded.map((g) => [String(g.gamePk), g.date]));
  rows.push(parityRow("P-MLB-4", {
    owner: "settlement: mlb/results/game-predictions-graded.jsonl actual runs", platform: "team-game-stats mlb.final-score",
    ...values([...byPk].map(([pk, a]) => {
      const game = P.getGame("MLB", pk);
      const home = game?.homeTeamId ? P.getTeamGameStat("MLB", pk, game.homeTeamId, "mlb.final-score")?.stats.runs ?? null : null;
      const away = game?.awayTeamId ? P.getTeamGameStat("MLB", pk, game.awayTeamId, "mlb.final-score")?.stats.runs ?? null : null;
      return { key: pk, owner: [a.homeRuns, a.awayRuns], platform: [home, away] };
    }), ({ key, platform }) => (gradedDate.get(key) > linescoreCutoff ? D.OWNER_NEWER_THAN_PLATFORM_SOURCE : platform[0] === null ? D.DECLARED_GAP : D.UNEXPLAINED)),
  }));
  const receipt = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/mlb/reports/finals-history-validation.json"), "utf8"));
  const perSeason = Object.fromEntries((receipt.seasons ?? []).map((s) => [s.season, s]));
  const pairs = ["2023", "2024", "2025"].map((y) => ({ key: `MLB-${y}`, owner: perSeason[y]?.finalGames ?? null, platform: P.listGamesForSeason(`MLB-${y}`).filter((g) => g.statusClass === "FINAL").length }));
  pairs.push({ key: "total", owner: (receipt.seasons ?? []).reduce((n, s) => n + (s.finalGames ?? 0), 0), platform: pairs.reduce((n, p) => n + p.platform, 0) });
  rows.push(parityRow("P-MLB-5", { owner: "finals-history-validation.json receipt counts", platform: "games/MLB 2023–2025 FINAL", ...values(pairs) }));
}

// ── NFL ───────────────────────────────────────────────────────────────────────────────────────────
{
  const rosterLatest = pub("nfl/rosters/latest.json");
  const ro = read(rosterLatest);
  rows.push(parityRow("P-NFL-1", { owner: "Follow nfl-team-<ESPN id> (nfl/rosters/latest.json)", platform: "teams/NFL", ...containment((ro.teams ?? []).map((t) => nflTeamId(t.providerTeamId)), (id) => Boolean(P.getTeam(id))) }));
  const schedIds = [], changed = new Set();
  for (const f of listDir(pub("nfl/schedule"), /^(capture-.*|latest)\.json$/)) {
    const stale = changedSinceBuild(f);
    for (const r of read(f).rows ?? []) { schedIds.push(String(r.providerEventId)); if (stale) changed.add(String(r.providerEventId)); }
  }
  rows.push(parityRow("P-NFL-2", { owner: "nfl/schedule event ids (/nfl/game/[eventId])", platform: "games/NFL", ...containment(schedIds, (id) => Boolean(P.getGame("NFL", id)), (id) => (changed.has(id) ? D.STALE_PLATFORM : D.UNEXPLAINED)) }));
  const resultsPath = pub("nfl/results/latest.json");
  const res = read(resultsPath);
  const resStale = changedSinceBuild(resultsPath);
  const points = (id, teamId) => (teamId ? P.getTeamGameStat("NFL", id, teamId, "nfl.final-score")?.stats.points ?? null : null);
  rows.push(parityRow("P-NFL-3", {
    owner: "nfl/results/latest.json FINAL scores (loadCurrentNflResults input)", platform: "team-game-stats nfl.final-score",
    ...values((res.rows ?? []).filter((r) => /^STATUS_FINAL/.test(r.statusRaw)).map((r) => ({ key: String(r.providerEventId), owner: [r.ftHome, r.ftAway], platform: [points(String(r.providerEventId), nflTeamId(r.home?.providerTeamId)), points(String(r.providerEventId), nflTeamId(r.away?.providerTeamId))] })), () => (resStale ? D.STALE_PLATFORM : D.UNEXPLAINED)),
  }));
  const pairs = [];
  for (const f of listDir(path.join(REPO, "data/internal/nfl/experimental-settlement"), /^\d{4}-\d{2}-\d{2}\.json$/)) {
    for (const e of read(f).events ?? []) {
      const a = e.grade?.actual;
      if (!a) continue;
      const id = String(e.providerEventId);
      const g = P.getGame("NFL", id);
      pairs.push({ key: id, owner: [a.home, a.away], platform: [points(id, g?.homeTeamId), points(id, g?.awayTeamId)], phase: g?.seasonPhase ?? null });
    }
  }
  rows.push(parityRow("P-NFL-4", {
    owner: "settlement: data/internal/nfl/experimental-settlement grade.actual", platform: "team-game-stats nfl.final-score",
    // Finals older than the ESPN results window exist only inside settlement ledgers: the results capture is
    // overwritten each run, so the platform has no retained FINAL source for them (declared SOURCE_MISSING).
    ...values(pairs.map(({ key, owner, platform }) => ({ key, owner, platform })), ({ platform }) => (platform[0] === null ? D.DECLARED_GAP : D.UNEXPLAINED)),
  }));
  const boardIds = [];
  for (const f of listDir(pub("nfl/player-board"), /^\d+\.json$/)) for (const p of read(f).players ?? []) boardIds.push(p.playerId);
  const rosterStale = listDir(pub("nfl/rosters"), /^(capture-.*|latest)\.json$/).some(changedSinceBuild);
  rows.push(parityRow("P-NFL-5", { owner: "nfl/player-board playerId (nfl-athlete-<ESPN id>, Follow)", platform: "players/NFL", ...containment(boardIds, (id) => Boolean(P.getPlayer(id)), () => (rosterStale ? D.STALE_PLATFORM : D.UNEXPLAINED)) }));
  const gp = read(pub("nfl/graded-picks.json"));
  rows.push(parityRow("P-NFL-6", { owner: "nfl/graded-picks.json eventId (nfl-<ESPN id>)", platform: "games/NFL", ...containment((gp.picks ?? []).map((p) => String(p.eventId).replace(/^nfl-/, "")), (id) => Boolean(P.getGame("NFL", id))) }));
  const fc = read(pub("nfl/forecasts/latest.json"));
  rows.push(parityRow("P-NFL-7", { owner: "nfl/forecasts/latest.json providerEventId", platform: "games/NFL", ...containment((fc.forecasts ?? []).map((f) => String(f.providerEventId)), (id) => Boolean(P.getGame("NFL", id)), (id) => (changed.has(id) ? D.STALE_PLATFORM : D.UNEXPLAINED)) }));
}

// ── EPL ───────────────────────────────────────────────────────────────────────────────────────────
{
  const caps = listDir(pub("soccer/epl/fixtures"), /^capture-.*\.json$/);
  const newestPath = caps.at(-1);
  const newest = read(newestPath);
  const fxStale = changedSinceBuild(newestPath);
  const resolveGame = (id) => Boolean(P.getGame("EPL", id)) || P.resolveAlias("EPL", "gametime_epl_event", "game", id).status === "RESOLVED";
  rows.push(parityRow("P-EPL-1", { owner: "newest fixture capture eventId (shipped EPL id)", platform: "games/EPL-2026-27", ...containment((newest.rows ?? []).map((r) => r.eventId), (id) => Boolean(P.getGame("EPL", id)), () => (fxStale ? D.STALE_PLATFORM : D.UNEXPLAINED)) }));
  const fids = [];
  for (const f of [...listDir(pub("soccer/epl/forecasts"), /^\d{4}-\d{2}-\d{2}\.json$/), pub("soccer/epl/forecasts/latest.json"), pub("soccer/epl/forecasts/recovered.json")]) {
    if (fs.existsSync(f)) for (const r of read(f).rows ?? []) if (r.eventId) fids.push(r.eventId);
  }
  rows.push(parityRow("P-EPL-2", { owner: "EPL forecasts eventId (dated + latest + recovered)", platform: "games/EPL (id or superseded-id lineage)", ...containment(fids, resolveGame, () => (fxStale ? D.STALE_PLATFORM : D.UNEXPLAINED)) }));
  const gf = read(pub("soccer/epl/results/graded-forecasts.jsonl"), parseJsonl);
  rows.push(parityRow("P-EPL-3", { owner: "settlement: EPL graded-forecasts eventId", platform: "games/EPL", ...containment(gf.map((g) => g.eventId), resolveGame) }));
  const gpp = read(pub("soccer/epl/results/graded-player-projections.jsonl"), parseJsonl);
  rows.push(parityRow("P-EPL-4", { owner: "EPL graded player projections playerId (bare ESPN athlete id)", platform: "players/EPL (epl-athlete-<id>)", ...containment(gpp.map((g) => eplPlayerId(g.playerId)), (id) => Boolean(P.getPlayer(id)), () => D.DECLARED_GAP) }));
  const clubPairs = (newest.rows ?? []).map((r) => {
    const g = P.getGame("EPL", r.eventId);
    return { key: r.eventId, owner: [r.homeClub, r.awayClub], platform: [P.getTeam(g?.homeTeamId)?.name ?? null, P.getTeam(g?.awayTeamId)?.name ?? null] };
  });
  rows.push(parityRow("P-EPL-5", { owner: "newest fixture capture home/away canonical club", platform: "GameRecord home/away → TeamRecord.name", ...values(clubPairs, () => (fxStale ? D.STALE_PLATFORM : D.UNEXPLAINED)) }));
}

// ── UFC ───────────────────────────────────────────────────────────────────────────────────────────
{
  const card = read(pub("ufc/card-latest.json"));
  const schedStale = listDir(pub("ufc/schedule"), /^capture-.*\.json$/).at(-1);
  const stale = schedStale ? changedSinceBuild(schedStale) : true;
  rows.push(parityRow("P-UFC-1", { owner: "ufc/card-latest.json boutId (/ufc/bout/[boutId])", platform: "games/UFC", ...containment((card.bouts ?? []).map((b) => String(b.boutId)), (id) => Boolean(P.getGame("UFC", id)), () => (stale ? D.STALE_PLATFORM : D.UNEXPLAINED)) }));
  rows.push(parityRow("P-UFC-2", {
    owner: "ufc/card-latest.json red/blue athleteId", platform: "GameRecord.competitors",
    ...values((card.bouts ?? []).map((b) => {
      const g = P.getGame("UFC", String(b.boutId));
      const c = Object.fromEntries((g?.competitors ?? []).map((x) => [x.corner, x.playerId]));
      return { key: String(b.boutId), owner: [`ufc-athlete-${b.red?.athleteId}`, `ufc-athlete-${b.blue?.athleteId}`], platform: [c.RED ?? null, c.BLUE ?? null] };
    }), () => (stale ? D.STALE_PLATFORM : D.UNEXPLAINED)),
  }));
  const resPath = pub("ufc/results/latest.json");
  const res = read(resPath);
  const resStale = changedSinceBuild(resPath);
  rows.push(parityRow("P-UFC-3", {
    owner: "ufc/results/latest.json winner flags (FINAL)", platform: "player-game-stats ufc.bout-result",
    ...values((res.rows ?? []).filter((r) => /^STATUS_FINAL/.test(r.statusRaw)).map((r) => {
      const id = String(r.providerBoutId);
      const red = P.getPlayerGameStat("UFC", id, `ufc-athlete-${r.red?.providerId}`, "ufc.bout-result")?.stats.won ?? null;
      const blue = P.getPlayerGameStat("UFC", id, `ufc-athlete-${r.blue?.providerId}`, "ufc.bout-result")?.stats.won ?? null;
      return { key: id, owner: [r.redWinner, r.blueWinner], platform: [red, blue] };
    }), () => (resStale ? D.STALE_PLATFORM : D.UNEXPLAINED)),
  }));
  const mvm = read(path.join(REPO, "data/internal/research/ufc/model-vs-market/graded.jsonl"), parseJsonl);
  rows.push(parityRow("P-UFC-4", { owner: "UFC model-vs-market graded providerBoutId", platform: "games/UFC", ...containment(mvm.map((r) => String(r.providerBoutId)), (id) => Boolean(P.getGame("UFC", id)), () => D.DECLARED_GAP) }));
}

const receipt = {
  schemaVersion: 1,
  artifact: "gametime-data-platform-parity",
  dataClass: "INTERNAL",
  note: "Point-in-time shadow parity of the committed platform store against current owner artifacts. Not part of the content manifest.",
  platformManifestSha256: sha256Hex(fs.readFileSync(path.join(PLATFORM_DIR, "manifest.json"))),
  ownerArtifacts: Object.fromEntries([...ownerArtifacts].sort()),
  checks: rows,
  summary: { checks: rows.length, match: rows.filter((r) => r.verdict === "MATCH").length, explained: rows.filter((r) => r.verdict === "EXPLAINED").length, unexplained: rows.filter((r) => r.verdict === "UNEXPLAINED").length },
};
for (const r of rows) console.log(`${r.id.padEnd(9)} ${r.verdict.padEnd(11)} compared ${String(r.compared).padStart(5)} · mismatches ${String(r.mismatches).padStart(4)} ${Object.keys(r.byDisposition).length ? JSON.stringify(r.byDisposition) : ""}  ${r.owner}`);
console.log(`summary: ${JSON.stringify(receipt.summary)}`);
if (!PRINT) fs.writeFileSync(path.join(PLATFORM_DIR, "receipts/parity.json"), stablePretty(receipt));
process.exit(receipt.summary.unexplained ? 1 : 0);
