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

// ── P295 · the v3 play-efficiency totals head, end to end on the real builder ─────────────────────

const V3_FILES = [
  "reports/matchup-totals-historical-replay-evaluation.json",
  "reports/matchup-totals-historical-replay-preregistration.json",
  "reports/matchup-totals-evaluation.json",
  "replay/games-history-v1.json",
  "replay/team-game-efficiency-v1.json",
  "replay/current-season.json",
];
function withV3(root) {
  const research = path.join(root, "data", "internal", "research", "nfl");
  fs.mkdirSync(path.join(research, "replay"), { recursive: true });
  for (const f of V3_FILES) fs.copyFileSync(path.join(REPO, "data/internal/research/nfl", f), path.join(research, f));
}
const latestOf = (app) => JSON.parse(fs.readFileSync(path.join(app, "public/data/nfl/forecasts/latest.json"), "utf8"));

test("P295 · with its ELIGIBLE receipt and complete evidence, every Week 1 total comes from v3 — the fold that was scored", async () => {
  const rows = realWeek1Rows();
  const { app } = makeRoot({ scheduleRows: rows });
  const root = path.resolve(app, "..");
  withV3(root);
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const artifact = latestOf(app);
  assert.ok(artifact.forecasts.length >= 2);

  const lib = await import("./totals-play-efficiency.mjs");
  const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nfl", p), "utf8"));
  const gate = lib.totalsV3Gate(read(V3_FILES[0]), read(V3_FILES[1]));
  const history = read("replay/games-history-v1.json");
  const current = read("replay/current-season.json");
  const games = [...lib.gamesFromTable(history), ...lib.gamesFromTable(current).filter((g) => g.season > history.seasons[1])];
  const efficiencyRows = [...read("replay/team-game-efficiency-v1.json").rows, ...current.efficiencyRows];

  for (const f of artifact.forecasts) {
    assert.equal(f.forecastSummary.total.head, lib.NFL_TOTALS_V3_HEAD_ID, `${f.matchup}: total head`);
    assert.equal(f.model.totalsHead.id, lib.NFL_TOTALS_V3_HEAD_ID);
    assert.match(f.model.totalsHead.receipt, /^matchup-totals-historical-replay-evaluation@/);
    /* A forecast generated on Sep 9 folds nothing from Sep 9 onward, even though the store's capture
       (taken Sep 13) carries later finals — the run's own day bounds the fold. */
    assert.ok(f.model.totalsHead.foldedThrough < NOW.slice(0, 10), `${f.matchup}: folded through ${f.model.totalsHead.foldedThrough}`);
    const beforeDate = [lib.etDateOf(f.kickoffUtc), lib.etDateOf(NOW)].sort()[0];
    const fold = lib.foldTotalsV3({ games, efficiencyRows, frozen: gate.frozen, fit: gate.fit, beforeDate });
    const mu = fold.muFor(lib.toNflverseAbbr(f.home.abbr), lib.toNflverseAbbr(f.away.abbr));
    assert.ok(Math.abs(f.forecastSummary.total.median - mu) <= 1, `${f.matchup}: published median ${f.forecastSummary.total.median} vs the scored fold's mean ${mu.toFixed(2)}`);
  }
  /* The WSH/LAR spelling trap: those games must be on v3 too, not quietly on league means. */
  const spelled = artifact.forecasts.filter((f) => ["WSH", "LAR"].includes(f.home.abbr) || ["WSH", "LAR"].includes(f.away.abbr));
  for (const f of spelled) assert.equal(f.model.totalsHead.id, lib.NFL_TOTALS_V3_HEAD_ID, `${f.matchup}: ESPN spelling reached a rated franchise`);

  const receiptsDir = path.join(root, "data/internal/nfl/forecast-receipts", NOW.slice(0, 10));
  const before = Object.fromEntries(fs.readdirSync(receiptsDir).map((x) => [x, fs.readFileSync(path.join(receiptsDir, x), "utf8")]));
  assert.equal(runBuilder(app, NOW).status, 0);
  const after = Object.fromEntries(fs.readdirSync(receiptsDir).map((x) => [x, fs.readFileSync(path.join(receiptsDir, x), "utf8")]));
  assert.deepEqual(after, before, "v3 is deterministic too: identical inputs rewrite no receipt");
});

test("P295 · an official final missing from the fold falls back to v1 — and the artifact says why", () => {
  const { app } = makeRoot({ scheduleRows: realWeek1Rows() });
  const root = path.resolve(app, "..");
  withV3(root);
  /* ESPN reports a regular-season final that nflverse has not published. Folding without it would
     rate a team from an incomplete season, so v3 must stand aside for these games. */
  fs.mkdirSync(path.join(app, "public/data/nfl/results"), { recursive: true });
  fs.writeFileSync(path.join(app, "public/data/nfl/results/latest.json"), JSON.stringify({
    rows: [{
      providerEventId: "999000777", dateUtc: "2026-09-08T00:20Z", statusRaw: "STATUS_FINAL", seasonType: 2, week: 1,
      home: { abbr: "DAL", name: "Dallas Cowboys" }, away: { abbr: "NYG", name: "New York Giants" }, ftHome: 24, ftAway: 20,
    }],
  }));
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const artifact = latestOf(app);
  assert.ok(artifact.forecasts.length >= 2);
  for (const f of artifact.forecasts) {
    assert.equal(f.forecastSummary.total.head, "matchup-totals-v1-decayed-points", `${f.matchup}: fell back to v1`);
    assert.equal(f.model.totalsHead.fallbackFrom, "matchup-totals-v3-play-efficiency");
    assert.match(f.model.totalsHead.fallbackReason, /1 official final\(s\) not yet published by nflverse/);
  }
});

// ── P295 · a published forecast does not disappear at kickoff ─────────────────────────────────────

test("P295 · a started game keeps its published forecast, byte-for-byte from its pre-kickoff receipt", async () => {
  /* 2026-09-13: each later run published only unstarted games, so /nfl called twelve covered games
     "missed coverage" and their reports 404'd. The started games now publish in frozen-latest.json. */
  const { unionFrozenForecasts } = await import("./public-forecast-union.mjs");
  const { app } = makeRoot({ scheduleRows: realWeek1Rows() });
  const root = path.resolve(app, "..");
  assert.equal(runBuilder(app, NOW).status, 0);
  const first = latestOf(app).forecasts.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const opener = first[0];
  const later = new Date(Date.parse(opener.kickoffUtc) + 2 * 3.6e6).toISOString().replace(".000", "");
  assert.ok(first.some((f) => f.kickoffUtc > later), "the week must still have unstarted games at the second run");

  /* A receipt stamped AFTER its own kickoff must never be carried — that would be a backfill. */
  const lateDir = path.join(root, "data/internal/nfl/forecast-receipts", later.slice(0, 10));
  fs.mkdirSync(lateDir, { recursive: true });
  fs.writeFileSync(path.join(lateDir, "999000555.json"), JSON.stringify({
    ...opener, providerEventId: "999000555", kickoffUtc: opener.kickoffUtc, generatedAt: new Date(Date.parse(opener.kickoffUtc) + 60e3).toISOString(),
  }));

  const r = runBuilder(app, later);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const live = latestOf(app);
  const frozen = JSON.parse(fs.readFileSync(path.join(app, "public/data/nfl/forecasts/frozen-latest.json"), "utf8"));
  assert.ok(!live.forecasts.some((f) => f.providerEventId === opener.providerEventId), "the started game has left the live file");
  const carried = frozen.forecasts.find((f) => f.providerEventId === opener.providerEventId);
  assert.ok(carried, "…and is in the frozen file");
  assert.deepEqual(carried.forecastSummary, opener.forecastSummary, "exactly the numbers that were published before kickoff");
  assert.equal(carried.model.inputHash, opener.model.inputHash);
  assert.ok(carried.generatedAt < carried.kickoffUtc, "only a genuinely pre-kickoff forecast is carried");
  assert.ok(!frozen.forecasts.some((f) => f.providerEventId === "999000555"), "a receipt stamped after its kickoff is never carried");
  assert.equal(frozen.generatedAt, live.generatedAt, "both files come from the same run");
  const union = unionFrozenForecasts(live, frozen);
  assert.ok(union.forecasts.some((f) => f.providerEventId === opener.providerEventId), "readers see the whole week");
});

// ── P298 · the adopted win + margin heads, end to end on the real builder ─────────────────────────

const WM_FILES = [
  "reports/win-margin-historical-replay-evaluation.json",
  "reports/win-margin-historical-replay-preregistration.json",
  "replay/games-history-v2.json",
];

test("P298 · every Week 1 forecast publishes the adopted pair exactly — or the incumbent pair with the helper's own reason", async () => {
  const { app } = makeRoot({ scheduleRows: realWeek1Rows() });
  const root = path.resolve(app, "..");
  withV3(root);
  for (const f of WM_FILES) fs.copyFileSync(path.join(REPO, "data/internal/research/nfl", f), path.join(root, "data/internal/research/nfl", f));
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const artifact = latestOf(app);
  assert.ok(artifact.forecasts.length >= 2);

  const lib = await import("./win-margin-heads.mjs");
  const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nfl", p), "utf8"));
  const gate = lib.winMarginGate(read(WM_FILES[0]), read(WM_FILES[1]));
  const history = read("replay/games-history-v2.json");
  const current = read("replay/current-season.json");
  const games = [...lib.rowsFromTable(history), ...lib.rowsFromTable(current).filter((g) => g.season > history.seasons[1])];
  const neutral = new Set(current.neutralEspnIds.map(String));
  const { etDateOf } = await import("./totals-play-efficiency.mjs");

  let adopted = 0;
  for (const f of artifact.forecasts) {
    const beforeDate = [etDateOf(f.kickoffUtc), etDateOf(NOW)].sort()[0];
    const fold = lib.foldWinMarginHeads({ games, gate, beforeDate, targetSeason: 2026 });
    const pick = lib.adoptedHeadsFor({ fold, home: f.home.abbr, away: f.away.abbr, neutral: neutral.has(String(f.providerEventId)) });
    if (pick.state === "READY") {
      adopted += 1;
      assert.equal(f.model.winHead.id, lib.NFL_WIN_HEAD_ID, `${f.matchup}: win head`);
      assert.equal(f.model.marginHead.id, lib.NFL_MARGIN_HEAD_ID, `${f.matchup}: margin head`);
      const wp = f.forecastSummary.winProbability;
      assert.ok(Math.abs(wp.homeUnrounded - pick.pHome * (1 - wp.tieMass)) < 1e-9, `${f.matchup}: published win chance is the adopted head's`);
      assert.ok(Math.abs(f.forecastSummary.margin.median - pick.marginMean) <= 1.5, `${f.matchup}: margin median ${f.forecastSummary.margin.median} vs head mean ${pick.marginMean.toFixed(2)}`);
    } else {
      assert.equal(f.model.winHead.fallbackFrom, lib.NFL_WIN_HEAD_ID, `${f.matchup}: fell back`);
      assert.equal(f.model.winHead.fallbackReason, pick.reason, `${f.matchup}: the artifact names the helper's own reason`);
    }
  }
  assert.ok(adopted >= Math.ceil(artifact.forecasts.length / 2), `the adopted pair should publish for most Week 1 games (${adopted}/${artifact.forecasts.length})`);
});

test("P298 · without the replay receipts every forecast keeps the incumbent pair, and says why", () => {
  const { app } = makeRoot({ scheduleRows: realWeek1Rows() });
  const r = runBuilder(app, NOW);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  for (const f of latestOf(app).forecasts) {
    assert.equal(f.model.winHead.id, "nfl-model-v1-elo-analytic");
    assert.equal(f.model.winHead.fallbackFrom, "nfl-win-elo-mov-v1");
    assert.match(f.model.winHead.fallbackReason, /no win\/margin historical replay evaluation on file/);
  }
});
