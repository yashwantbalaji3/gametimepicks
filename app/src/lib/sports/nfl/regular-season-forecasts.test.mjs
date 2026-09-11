/**
 * REGULAR-SEASON PUBLIC FORECASTS — the Week 1 path, proven on the real builder (P240 · Release B).
 *
 * Until this release build-nfl-public-forecasts.mjs had no seasonType branch: the first Week 1
 * window would have published regular-season games under the preseason card — a coin-flip win
 * head and copy citing a held-out preseason those games were never part of. These scenarios run
 * THE builder (child process, --app-root seam) against a disposable repo-shaped store carrying
 * the REAL committed receipts and the REAL committed schedule capture, so what passes here is
 * what the Sep 9 event-window run will execute.
 *
 * Alongside: the strength-state season-boundary rule. The evaluated walk-forward regresses every
 * rating one third toward the mean BEFORE the first game of a new season is predicted; a Week-1
 * cutoff has no new-season final to fire that inside the fold, so the caller passes the target
 * season explicitly. Equivalence is asserted against the fold's own arithmetic, not a copy of it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { strengthStateAt, ELO_PARAMS } from "./strength-state.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");
const REPO = path.resolve(APP, "..");
const BUILDER = path.join(APP, "scripts", "nfl", "build-nfl-public-forecasts.mjs");

const CORPUS = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nfl/corpus-v1.json"), "utf8")).rows;

// ── the season boundary ─────────────────────────────────────────────────────────────────────────

test("regressToSeason applies the fold's own one-third regression, and only for a genuinely newer season", () => {
  const cutoff = "2026-09-09T15:00:00Z";
  const plain = strengthStateAt({ rows: CORPUS, cutoffIso: cutoff });
  const regressed = strengthStateAt({ rows: CORPUS, cutoffIso: cutoff, regressToSeason: 2026 });
  assert.equal(plain.lastSeasonFolded, 2025, "the corpus folds through the 2025 season");
  assert.equal(regressed.regressedToSeason, 2026);
  assert.ok(plain.gamesFolded > 800, `folds the full history (${plain.gamesFolded})`);
  const { MEAN, SEASON_REGRESSION } = ELO_PARAMS;
  for (const [team, r] of Object.entries(plain.ratings)) {
    const expected = r + (MEAN - r) * SEASON_REGRESSION;
    assert.ok(Math.abs(regressed.ratings[team] - expected) < 1e-9, `${team}: ${regressed.ratings[team]} vs ${expected}`);
  }
  // idempotence by the fold's own rule: a target season the fold already reached regresses nothing
  const same = strengthStateAt({ rows: CORPUS, cutoffIso: cutoff, regressToSeason: 2025 });
  assert.equal(same.regressedToSeason, null);
  assert.deepEqual(same.ratings, plain.ratings);
});

// ── the builder, end to end ─────────────────────────────────────────────────────────────────────

/** A disposable repo-shaped store carrying the REAL committed receipts and schedule capture. */
function makeRoot({ scheduleRows }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-rs-forecasts-"));
  const app = path.join(root, "app");
  const research = path.join(root, "data", "internal", "research", "nfl");
  fs.mkdirSync(path.join(research, "reports"), { recursive: true });
  for (const f of ["reports/public-beta-v1-calibration.json", "reports/preseason-model-v1-evaluation.json",
    "reports/signal-significance.json", "reports/model-v1-evaluation.json",
    "public-beta-model-card-v1.json", "regular-season-public-card-v1.json", "corpus-v1.json"]) {
    fs.copyFileSync(path.join(REPO, "data/internal/research/nfl", f), path.join(research, f));
  }
  const nflData = path.join(app, "public", "data", "nfl");
  fs.mkdirSync(path.join(nflData, "schedule"), { recursive: true });
  fs.writeFileSync(path.join(nflData, "schedule", "latest.json"),
    JSON.stringify({ generatedAt: "2026-09-05T15:41:47Z", rows: scheduleRows }));
  // no markets/latest.json on purpose: NO_MARKET is the honest Week 1 state while odds stay gated
  return { root, app };
}

/* The REAL committed schedule capture — PINNED to the last one taken before the Week 1 opener kicked off.
   This read latest.json, which rotted the moment the opener went final (2026-09-11): the fixture's first
   rows stopped being a pre-kickoff Week 1, so the phase-refusal scenarios had nothing to refuse. A dated
   capture never changes; latest.json always will. */
const WEEK1_PREKICKOFF_CAPTURE = "capture-2026-09-10T1644.json";
const realWeek1Rows = () => JSON.parse(
  fs.readFileSync(path.join(APP, "public", "data", "nfl", "schedule", WEEK1_PREKICKOFF_CAPTURE), "utf8"),
).rows.filter((r) => r.seasonType === 2);

const runBuilder = (app, now, extra = []) => spawnSync(
  process.execPath,
  [BUILDER, "--app-root", app, "--now", now, "--lookahead-hours", "48", ...extra],
  { encoding: "utf8" },
);

const NOW = "2026-09-09T15:00:00Z"; // the first cron slot that admits the Week 1 opener

test("a Week 1 window publishes under the regular-season identity with the evaluated heads", () => {
  const rows = realWeek1Rows();
  assert.ok(rows.length >= 15, `the committed capture carries Week 1 (${rows.length} rows)`);
  const { app } = makeRoot({ scheduleRows: rows });
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const artifact = JSON.parse(fs.readFileSync(path.join(app, "public/data/nfl/forecasts/latest.json"), "utf8"));
  assert.equal(artifact.model.id, "nfl-regular-season-public-v1");
  assert.ok(artifact.forecasts.length >= 2, `NE@SEA and SF@LAR are inside 48h of ${NOW} (${artifact.forecasts.length})`);
  assert.ok(!JSON.stringify(artifact).toLowerCase().includes("preseason"),
    "a regular-season artifact never describes itself with preseason copy");

  for (const f of artifact.forecasts) {
    assert.equal(f.seasonType, 2);
    assert.equal(f.model.id, "nfl-regular-season-public-v1");
    assert.equal(f.teamSignal.state, "APPLIED", "the evaluated Elo head moves regular-season forecasts");
    assert.equal(f.state, "PUBLIC_EXPERIMENTAL");
    const wp = f.forecastSummary.winProbability;
    assert.ok(Math.abs(wp.home + wp.away + wp.tieMass - 1) < 1e-6, "probabilities sum to one");
    assert.equal(typeof wp.homeUnrounded, "number");
    for (const k of ["margin", "total"]) {
      const q = f.forecastSummary[k];
      assert.ok(q.p10 <= q.median && q.median <= q.p90, `${k} quantiles ordered`);
    }
    assert.equal(f.marketComparison.state, "NO_MARKET", "no market capture in the store — the honest gated state");
    assert.equal(f.evidence.regressedToSeason, 2026, "the season boundary was applied");
  }
  // the two heads must differ across games — a model reading real team strength cannot publish
  // one shared number (the P0 the differentiation audit exists for)
  const heads = new Set(artifact.forecasts.map((f) => f.forecastSummary.winProbability.homeUnrounded));
  assert.equal(heads.size, artifact.forecasts.length, "every game gets its own distribution");
});

test("the builder is deterministic: a second run rewrites nothing and no receipt changes", () => {
  const { app } = makeRoot({ scheduleRows: realWeek1Rows() });
  const root = path.resolve(app, "..");
  assert.equal(runBuilder(app, NOW).status, 0);
  const receiptsDir = path.join(root, "data/internal/nfl/forecast-receipts", NOW.slice(0, 10));
  const before = Object.fromEntries(fs.readdirSync(receiptsDir).map((f) => [f, fs.readFileSync(path.join(receiptsDir, f), "utf8")]));
  assert.equal(runBuilder(app, NOW).status, 0);
  const after = Object.fromEntries(fs.readdirSync(receiptsDir).map((f) => [f, fs.readFileSync(path.join(receiptsDir, f), "utf8")]));
  assert.deepEqual(after, before, "identical inputs → identical receipts, no revisions");
});

test("a preseason window still publishes under the preseason card — the phases never merge", () => {
  const rows = [{
    providerEventId: "999000111", statusRaw: "STATUS_SCHEDULED", dateUtc: "2026-09-10T00:20Z",
    seasonType: 1, week: 4, venue: "Anywhere Field",
    home: { abbr: "SEA", name: "Seattle Seahawks" }, away: { abbr: "NE", name: "New England Patriots" },
  }];
  const { app } = makeRoot({ scheduleRows: rows });
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const artifact = JSON.parse(fs.readFileSync(path.join(app, "public/data/nfl/forecasts/latest.json"), "utf8"));
  assert.equal(artifact.model.id, "nfl-preseason-public-beta-v1");
  assert.equal(artifact.forecasts[0].model.id, "nfl-preseason-public-beta-v1");
});

test("a window straddling phases refuses rather than mislabeling half of it", () => {
  const rows = [
    ...realWeek1Rows().slice(0, 2),
    { providerEventId: "999000112", statusRaw: "STATUS_SCHEDULED", dateUtc: "2026-09-10T01:00Z", seasonType: 1, week: 4, home: { abbr: "SEA", name: "Seattle Seahawks" }, away: { abbr: "NE", name: "New England Patriots" } },
  ];
  const { app } = makeRoot({ scheduleRows: rows });
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /straddles season phases/);
});

test("a schedule row with no seasonType is refused typed — the phase is never guessed", () => {
  const rows = realWeek1Rows().slice(0, 2).map((r0, i) => (i === 0 ? { ...r0, seasonType: undefined } : r0));
  const { app } = makeRoot({ scheduleRows: rows });
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const artifact = JSON.parse(fs.readFileSync(path.join(app, "public/data/nfl/forecasts/latest.json"), "utf8"));
  assert.ok(artifact.refused.some((x) => x.state === "PHASE_UNRESOLVED"));
  assert.equal(artifact.forecasts.length, 1);
});

test("missing regular-season receipts refuse the whole run — no fallback to the preseason card", () => {
  const rows = realWeek1Rows().slice(0, 2);
  const { app } = makeRoot({ scheduleRows: rows });
  const root = path.resolve(app, "..");
  fs.rmSync(path.join(root, "data/internal/research/nfl/regular-season-public-card-v1.json"));
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /regular-season events are in the window/);
});
