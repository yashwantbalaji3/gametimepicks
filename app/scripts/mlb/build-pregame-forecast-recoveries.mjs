#!/usr/bin/env node
/**
 * TRUTH-001 · append-only RECOVERY of MLB pregame forecasts erased from the public files after first pitch
 * (founder decision 3, 2026-10-09). Before f96e91fc94 (2026-10-03) a full-game run after first pitch replaced a
 * game's published pregame forecast with `unavailable`; the moving-pointer predictions file followed.
 *
 * It NEVER rewrites the original files, never regenerates, never uses a newer model. Everything comes from
 * immutable git history plus a captured deployment-evidence file (scripts/capture-vercel-production-deployments.mjs):
 *   - the newest revision committed AND generated before first pitch that still carried the forecast;
 *   - its artifactHash recomputed (stableHash) and the predictions row from the SAME commit with the same hash;
 *   - PUBLICATION: the earliest READY Production deployment, ready before first pitch, whose commit contains that
 *     revision and still carries the same game hash. A commit time alone is not publication (founder Option B):
 *     without a deployment the record is COMMITTED_UNVERIFIED and quarantined.
 *
 * Output (append-only; an existing record that would change aborts the run):
 *   app/public/data/mlb/corrections/pregame-forecast-recoveries.jsonl
 * No record enters any public hit-rate denominator: `resultsEffect` says so on every line.
 *
 *   npx tsx app/scripts/mlb/build-pregame-forecast-recoveries.mjs --from 2026-09-01 --to 2026-10-08 \
 *     --deployments data/internal/ops/vercel-production-deployments/2026-09-01_2026-10-09.json [--write]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyErasedGame, CLASS, RECOVERY_SCHEMA } from "../../src/lib/mlb/recovery/pregame-recovery.mjs";
import { stableHash } from "../../src/lib/game-simulations/rng.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const FROM = opt("--from"), TO = opt("--to"), DEPLOYMENTS = opt("--deployments");
const WRITE = argv.includes("--write");
if (!FROM || !TO || !DEPLOYMENTS) { console.error("usage: --from D --to D --deployments <file> [--write]"); process.exit(2); }

const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1024 * 1024 * 1024 }).toString();
const showCache = new Map();
function showJson(sha, rel) {
  const k = `${sha}:${rel}`;
  if (!showCache.has(k)) { try { showCache.set(k, JSON.parse(git("show", k))); } catch { showCache.set(k, null); } }
  return showCache.get(k);
}
const ancestorCache = new Map();
function isAncestor(a, b) {
  const k = `${a}>${b}`;
  if (!ancestorCache.has(k)) {
    try { execFileSync("git", ["merge-base", "--is-ancestor", a, b], { cwd: ROOT, stdio: "ignore" }); ancestorCache.set(k, true); }
    catch { ancestorCache.set(k, false); }
  }
  return ancestorCache.get(k);
}

const SIM = (d) => `app/public/data/mlb/full-game-simulations/${d}.json`;
const PRED = (d) => `app/public/data/mlb/predictions/${d}.json`;
const evidence = JSON.parse(fs.readFileSync(path.resolve(ROOT, DEPLOYMENTS), "utf8"));
const readyDeployments = evidence.deployments.filter((d) => d.state === "READY" && d.ready && d.commitSha);

const dates = [];
for (let t = Date.parse(`${FROM}T00:00:00Z`); t <= Date.parse(`${TO}T00:00:00Z`); t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));

const r4 = (v) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(4)) : null);
function forecastValues(game, pred, fileMeta) {
  return {
    modelVersion: fileMeta?.modelVersion ?? null,
    decisionEngineVersion: pred?.decisionEngineVersion ?? null,
    status: game.status, completenessLevel: game.completeness?.level ?? null,
    winProbability: game.winProbability ?? null,
    medianRuns: game.runs ? { away: game.runs.away?.median ?? null, home: game.runs.home?.median ?? null } : null,
    medianTotalRuns: game.totalRuns?.median ?? null,
    picks: pred ? {
      moneyline: pred.moneyline ? { side: pred.moneyline.side, team: pred.moneyline.team, probability: r4(pred.moneyline.simulationProbability) } : null,
      total: pred.total && pred.total.pick !== "UNAVAILABLE" ? { pick: pred.total.pick, line: pred.total.line, overProbability: r4(pred.total.overProbability), underProbability: r4(pred.total.underProbability) } : null,
      runLine: pred.runLine ? { pick: pred.runLine.pick, pickSide: pred.runLine.pickSide, pickLine: pred.runLine.pickLine, coverProbability: r4(pred.runLine.coverProbability) } : null,
    } : null,
    asOf: {
      fileGeneratedAt: fileMeta?.generatedAt ?? null,
      marketCapturedAt: game.market?.capturedAt ?? null,
      awayLineupSource: game.completeness?.awayLineupSource ?? null,
      homeLineupSource: game.completeness?.homeLineupSource ?? null,
    },
  };
}

const records = [];
for (const date of dates) {
  const head = showJson("HEAD", SIM(date));
  if (!head?.games) continue;
  const erased = head.games.filter((g) => g.status === "unavailable" || g.completeness?.level === "unavailable");
  if (!erased.length) continue;
  const log = git("log", "--format=%H %cI", "HEAD", "--", SIM(date)).trim().split("\n").filter(Boolean)
    .map((l) => { const [sha, ct] = l.split(" "); return { sha, commitTime: new Date(ct).toISOString() }; }).reverse();
  for (const hg of erased) {
    const firstPitchUtc = hg.firstPitch ?? null;
    const revisions = log.map(({ sha, commitTime }) => {
      const f = showJson(sha, SIM(date));
      const game = f?.games?.find((g) => g.gamePk === hg.gamePk) ?? null;
      const predictions = showJson(sha, PRED(date))?.predictions?.find((p) => p.gamePk === hg.gamePk) ?? null;
      return { sha, commitTime, fileGeneratedAt: f?.generatedAt ?? null, game, predictions, fileMeta: f };
    });
    const deployments = readyDeployments.map((d) => ({
      id: d.uid, commitSha: d.commitSha, readyAt: d.ready,
      containsCommit: (sha) => {
        if (!isAncestor(sha, d.commitSha)) return false;
        const rec = revisions.find((r) => r.sha === sha);
        const served = showJson(d.commitSha, SIM(date))?.games?.find((g) => g.gamePk === hg.gamePk);
        return !!served && served.artifactHash === rec?.game?.artifactHash;
      },
    })).filter((d) => {
      // only deployments that could matter: ready before first pitch and created after the earliest revision
      const fp = Date.parse(firstPitchUtc ?? ""); const r = Date.parse(d.readyAt);
      return Number.isFinite(fp) && r < fp && r > Date.parse(log[0]?.commitTime ?? "");
    });
    const c = classifyErasedGame({ firstPitchUtc, revisions, recomputeHash: (g) => stableHash({ ...g, artifactHash: undefined }), deployments });
    const rec = c.recovered ? revisions.find((r) => r.sha === c.recovered.commit) : null;
    records.push({
      schema: RECOVERY_SCHEMA,
      key: `${date}|${hg.gamePk}`,
      date, gamePk: hg.gamePk, slug: hg.slug ?? null, matchup: `${hg.awayTeam} @ ${hg.homeTeam}`, firstPitchUtc,
      reasonCode: "PREGAME_FORECAST_ERASED_POST_START",
      class: c.class,
      quarantined: c.class !== CLASS.PUBLISHED_VERIFIED,
      reason: c.reason,
      original: c.recovered ? {
        ...c.recovered,
        sources: { fullGame: `${SIM(date)}@${c.recovered.commit}`, predictions: `${PRED(date)}@${c.recovered.commit}` },
        values: forecastValues(rec.game, rec.predictions, rec.fileMeta),
      } : null,
      newerUnservedCommit: c.newerUnservedCommit ?? null,
      publication: c.deployment ? { kind: "PRODUCTION_DEPLOYMENT_READY", ...c.deployment, evidenceFile: DEPLOYMENTS } : null,
      erasedAtHead: { status: hg.status, artifactHash: hg.artifactHash ?? null },
      resultsEffect: "NONE — a recovery record restores evidence only; it enters no public hit-rate denominator by itself",
    });
  }
}

const OUT = path.join(ROOT, "app/public/data/mlb/corrections/pregame-forecast-recoveries.jsonl");
const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").split("\n").filter(Boolean) : [];
const byKey = new Map(existing.map((l) => [JSON.parse(l).key, l]));
const appended = [];
for (const r of records) {
  const line = JSON.stringify(r);
  const prior = byKey.get(r.key);
  if (prior != null && prior !== line) { console.error(`IMMUTABLE RECORD WOULD CHANGE: ${r.key} — refusing (append a correction instead)`); process.exit(4); }
  if (prior == null) appended.push(line);
}
const counts = records.reduce((m, r) => ({ ...m, [r.class]: (m[r.class] ?? 0) + 1 }), {});
console.log(`classified ${records.length} erased games:`, counts, `· tight (<5 min): ${records.filter((r) => r.original?.tight).length}`, `· new lines: ${appended.length}`);
if (WRITE && appended.length) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.appendFileSync(OUT, appended.map((l) => `${l}\n`).join(""));
  console.log(`appended ${appended.length} → ${path.relative(ROOT, OUT)}`);
} else if (!WRITE) console.log("(dry run — pass --write to append)");
