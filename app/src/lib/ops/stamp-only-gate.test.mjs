/**
 * MLB stamp-only build gate (COST-001 Stage B, 2026-10-14) — lib/ops/stamp-only-gate.mjs and its CLI.
 *
 * Two directions, both pinned:
 *   SUPPRESS  a run that changed nothing but its own clock stamps restores the gated files and drops the
 *             identical snapshot, so the commit carries only files that cost no build;
 *   PUBLISH   any change a reader could see — one probability, one lineup, a new day's file, a moved
 *             publication deadline, a stamp outside the allowlist, an unreadable file — publishes the
 *             whole gated set exactly as before the gate existed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { decide, stampOnly, stripStamps, canonical, buildInputPredicate, ruleFor, STAMP_RULES, PUBLICATION_SLO_PATH } from "./stamp-only-gate.mjs";

const APP = process.cwd();
const REPO = path.join(APP, "..");
const D = "2026-10-13";
const T0 = "2026-10-13T21:55:56.000Z";
const T1 = "2026-10-13T23:02:25.000Z";
const NOW = Date.parse("2026-10-13T23:02:30Z");

const PRED = `app/public/data/mlb/predictions/${D}.json`;
const FULL = `app/public/data/mlb/full-game-simulations/${D}.json`;
const SNAP_DIR = `data/internal/mlb/prediction-snapshots/${D}`;
const pred = (stamp, p = 0.54, extra = {}) => ({ sport: "mlb", date: D, generatedAt: stamp, decisionEngineVersion: "mlb-prediction-2026.10-v2", predictions: [{ gamePk: 849813, artifactHash: "1e1b", status: "PREGAME", moneyline: { team: "CLE", simulationProbability: p }, completeness: { awayLineupSource: "confirmed", homeLineupSource: "confirmed" }, ...extra }] });
const full = (stamp, hash = "1e1b") => ({ date: D, generatedAt: stamp, games: [{ gamePk: 849813, artifactHash: hash, runs: { away: { mean: 4.1 } } }] });
const J = (o) => JSON.stringify(o, null, 2);

const isBuildInput = buildInputPredicate(fs.readFileSync(path.join(APP, "scripts/vercel-ignore-build.sh"), "utf8"));
const mod = (p, before, after) => ({ path: p, status: "M", before: J(before), after: J(after), buildInput: isBuildInput(p) });
const add = (p, after, priorSnapshot = null) => ({ path: p, status: "A", before: null, after: J(after), buildInput: isBuildInput(p), priorSnapshot: priorSnapshot == null ? null : J(priorSnapshot) });
const ops = (file, before, after) => mod(`app/public/data/ops/${file}`, before, after);

/** The real 2026-10-13T23:02Z lineup-refresh commit (7b2312f7a7), reduced to its shape. */
const stampOnlyRun = () => [
  mod(FULL, full(T0), full(T1)),
  mod(PRED, pred(T0), pred(T1)),
  add(`${SNAP_DIR}/snapshot-202610132302.json`, pred(T1), pred(T0)),
  ops("heartbeat.json", { lastRunAt: T0 }, { lastRunAt: T1 }),
  ops("publication-slo.json", { date: D, state: "PUBLISHED", platformState: "PUBLISHED", publishDeadlineUtc: null, reason: "board published with 9 rows", checkedAt: T0 }, { date: D, state: "PUBLISHED", platformState: "PUBLISHED", publishDeadlineUtc: null, reason: "board published with 9 rows", checkedAt: T1 }),
  mod(`data/internal/mlb/input-snapshots/${D}.json`, { updatedAt: T0 }, { updatedAt: T1 }),
];

/* ── SUPPRESS ─────────────────────────────────────────────────────────────────────────────────────── */

test("a run that moved only its stamps is suppressed: gated files restored, identical snapshot dropped, run records kept", () => {
  const out = decide({ changes: stampOnlyRun(), nowMs: NOW });
  assert.equal(out.verdict, "SUPPRESS", out.reasons.join("; "));
  assert.deepEqual(out.restore.sort(), [FULL, PRED].sort());
  assert.deepEqual(out.drop, [`${SNAP_DIR}/snapshot-202610132302.json`]);
  // The run's own records still commit — and none of them is a build input, so that commit builds nothing.
  for (const f of out.free) assert.equal(isBuildInput(f), false, `${f} would still trigger a build`);
  assert.ok(out.free.includes("app/public/data/ops/heartbeat.json"), "the dead-man's-switch heartbeat must keep committing");
});

test("every gated stamp path in the allowlist suppresses on its own (tier grid, game sims, homer nukes, schedule)", () => {
  const tg = (s, age) => ({ sport: "mlb", date: D, generatedAt: s, state: "OK", reason: null, evidence: { pricedGames: 1, pricesCapturedAt: "2026-10-13T09:33:48Z", priceAgeDays: age }, cells: [{ k: 1 }] });
  const gs = (s) => ({ date: D, generatedAt: s, games: [{ gamePk: 1, freshness: { generatedAt: s, sourceCapturedAt: "2026-10-13T09:32Z" }, distributions: [1, 2] }] });
  const changes = [
    mod("app/public/data/parlays/tier-grid/mlb-latest.json", tg(T0, 0.22), tg(T1, 0.25)),
    mod(`app/public/data/parlays/tier-grid/mlb-${D}.json`, tg(T0, 0.22), tg(T1, 0.25)),
    mod(`app/public/data/mlb/game-simulations/${D}.json`, gs(T0), gs(T1)),
    mod(`app/public/data/mlb/homer-nukes/${D}.json`, { generatedAt: T0, rows: [1] }, { generatedAt: T1, rows: [1] }),
    mod(`app/public/data/mlb/schedule/${D}.json`, { generatedAt: T0, games: [{ gamePk: 1 }] }, { generatedAt: T1, games: [{ gamePk: 1 }] }),
    mod("app/public/data/admin/status.json", { generatedAt: T0, slate: { mlbGames: 1 } }, { generatedAt: T1, slate: { mlbGames: 2 } }),
  ];
  const out = decide({ changes, nowMs: NOW });
  assert.equal(out.verdict, "SUPPRESS", out.reasons.join("; "));
  assert.equal(out.restore.length, 5);
  assert.deepEqual(out.free, ["app/public/data/admin/status.json"], "admin/status.json is a run record now outside the build trigger");
});

test("key order alone is not a change a reader can see", () => {
  assert.ok(stampOnly(JSON.stringify({ a: 1, generatedAt: T0, b: [1, { y: 2, x: 1 }] }), JSON.stringify({ b: [1, { x: 1, y: 2 }], generatedAt: T1, a: 1 }), ["generatedAt"]));
});

/* ── PUBLISH ──────────────────────────────────────────────────────────────────────────────────────── */

const publishes = (changes, why, nowMs = NOW) => {
  const out = decide({ changes, nowMs });
  assert.equal(out.verdict, "PUBLISH", `expected PUBLISH (${why})`);
  assert.deepEqual([out.restore, out.drop], [[], []], "a publish verdict must not touch a single file");
  return out;
};

test("one changed probability publishes everything — the majority being identical never suppresses a change", () => {
  const run = stampOnlyRun();
  run[1] = mod(PRED, pred(T0, 0.54), pred(T1, 0.55));
  run[2] = add(`${SNAP_DIR}/snapshot-202610132302.json`, pred(T1, 0.55), pred(T0, 0.54));
  const out = publishes(run, "a moneyline probability moved");
  assert.ok(out.reasons.some((r) => r.startsWith(PRED)));
});

test("a newly confirmed lineup publishes even when the predictions file is untouched", () => {
  const run = stampOnlyRun();
  run[0] = mod(FULL, full(T0, "1e1b"), full(T1, "77aa"));
  publishes(run, "the full-game artifact hash moved");
});

test("a status flip (the started-game guard) publishes", () => {
  const run = stampOnlyRun();
  run[1] = mod(PRED, pred(T0), { ...pred(T1), predictions: [{ ...pred(T1).predictions[0], status: "STARTED_BEFORE_GENERATION" }] });
  publishes(run, "a game started");
});

test("a stamp-named key OUTSIDE the allowlist publishes — the allowlist is exact paths, not key names", () => {
  const run = stampOnlyRun();
  run[1] = mod(PRED, pred(T0, 0.54, { generatedAt: T0 }), pred(T1, 0.54, { generatedAt: T1 }));
  publishes(run, "predictions[*].generatedAt is not allowlisted");
  assert.equal(stampOnly(J({ evidence: { pricesCapturedAt: "a", priceAgeDays: 1 } }), J({ evidence: { pricesCapturedAt: "b", priceAgeDays: 0 } }), ruleFor("app/public/data/parlays/tier-grid/mlb-latest.json").stamps), false, "new prices always publish");
});

test("a snapshot that differs from the newest committed one publishes; so does the first snapshot of a date", () => {
  const run = stampOnlyRun();
  run[2] = add(`${SNAP_DIR}/snapshot-202610132302.json`, pred(T1), pred(T0, 0.6));
  publishes(run, "snapshot differs from its predecessor");
  const first = stampOnlyRun();
  first[2] = add(`${SNAP_DIR}/snapshot-202610132302.json`, pred(T1), null);
  publishes(first, "no earlier snapshot for the date");
  const rewritten = stampOnlyRun();
  rewritten[2] = mod(`${SNAP_DIR}/snapshot-202610132155.json`, pred(T0), pred(T1));
  publishes(rewritten, "an immutable snapshot was rewritten");
});

test("a new day's file, a deletion, or an unruled build input publishes", () => {
  publishes([...stampOnlyRun(), add(`app/public/data/mlb/predictions/2026-10-14.json`, pred(T1))], "new dated file");
  publishes([...stampOnlyRun(), { path: `app/public/data/mlb/homer-nukes/${D}.json`, status: "D", before: "{}", after: null, buildInput: true }], "deletion");
  publishes([...stampOnlyRun(), add(`app/public/data/mlb/team-markets/captures/${D}/${D}T12-24-08-654Z.json`, { prices: [1] })], "paid market capture (no rule)");
  publishes([...stampOnlyRun(), mod(`app/public/data/mlb/team-markets/${D}.json`, { generatedAt: T0 }, { generatedAt: T1 })], "team markets carry no stamp rule — even a stamp publishes");
});

test("a moved publication verdict publishes, because public pages read it at build time", () => {
  const run = stampOnlyRun();
  run[4] = ops("publication-slo.json", { date: D, state: "PUBLISHING", publishDeadlineUtc: "2026-10-13T22:30:00Z", checkedAt: T0 }, { date: D, state: "PUBLISHING", publishDeadlineUtc: "2026-10-13T23:30:00Z", checkedAt: T1 });
  publishes(run, "the deadline public pages render moved");
  const newDay = stampOnlyRun();
  newDay[4] = ops("publication-slo.json", { date: D, state: "PUBLISHED" }, { date: "2026-10-14", state: "PUBLISHED" });
  publishes(newDay, "the verdict's date rolled over");
  const unreadable = stampOnlyRun();
  unreadable[4] = { ...unreadable[4], after: "{not json" };
  publishes(unreadable, "unreadable verdict");
});

test("the heartbeat publishes once the committed stamps are older than the bound", () => {
  const sevenHours = Date.parse(T0) + 7 * 3_600_000;
  const out = publishes(stampOnlyRun(), "7h-old stamps against a 6h bound", sevenHours);
  assert.ok(out.reasons.some((r) => r.startsWith("heartbeat")));
  assert.equal(decide({ changes: stampOnlyRun(), nowMs: Date.parse(T0) + 5 * 3_600_000 }).verdict, "SUPPRESS");
  assert.equal(decide({ changes: stampOnlyRun(), nowMs: sevenHours, heartbeatHours: 8 }).verdict, "SUPPRESS");
  publishes(stampOnlyRun(), "no clock", NaN);
});

test("anything unreadable publishes", () => {
  const run = stampOnlyRun();
  run[1] = { ...run[1], after: "{\"generatedAt\": " };
  publishes(run, "truncated JSON");
  const noHead = stampOnlyRun();
  noHead[1] = { ...noHead[1], before: null };
  publishes(noHead, "HEAD unreadable");
  publishes([ops("heartbeat.json", { lastRunAt: T0 }, { lastRunAt: T1 })], "no gated file at all — nothing to judge, nothing touched");
});

/* ── The trigger the gate is built against ────────────────────────────────────────────────────────── */

test("the build-input predicate is the ignore step's own lists, and fails toward building", () => {
  assert.ok(isBuildInput, "vercel-ignore-build.sh lists no longer parse");
  for (const f of [PRED, FULL, `${SNAP_DIR}/snapshot-202610132302.json`, "app/public/data/admin/model-health.json", "app/public/data/parlays/tier-grid/mlb-latest.json"]) assert.equal(isBuildInput(f), true, f);
  for (const f of ["app/public/data/ops/heartbeat.json", "app/public/data/admin/status.json", `data/internal/mlb/input-snapshots/${D}.json`, `data/internal/research/mlb/engine-level-shadow/${D}.json`, `data/internal/mlb/production-history/${D}.json`]) assert.equal(isBuildInput(f), false, f);
  assert.equal(buildInputPredicate("#!/bin/sh\necho nothing here\n"), null, "an unparseable script yields no predicate (the CLI then treats every file as a build input)");
});

test("every stamp rule names a build input — a rule for a free file would be dead weight", () => {
  const samples = { "mlb-full-game-simulations": FULL, "mlb-predictions": PRED, "mlb-game-simulations": `app/public/data/mlb/game-simulations/${D}.json`, "mlb-homer-nukes": `app/public/data/mlb/homer-nukes/${D}.json`, "mlb-tier-grid": `app/public/data/parlays/tier-grid/mlb-${D}.json`, "mlb-schedule": `app/public/data/mlb/schedule/${D}.json`, "mlb-prediction-snapshot": `${SNAP_DIR}/snapshot-202610132302.json` };
  assert.deepEqual(Object.keys(samples).sort(), STAMP_RULES.map((r) => r.id).sort());
  for (const [id, f] of Object.entries(samples)) { assert.equal(ruleFor(f)?.id, id); assert.equal(isBuildInput(f), true, f); }
  assert.equal(ruleFor(PUBLICATION_SLO_PATH), null);
});

/* ── Real committed artifacts (shape drift) ───────────────────────────────────────────────────────── */

const newest = (dir, re) => { try { return fs.readdirSync(path.join(REPO, dir)).filter((f) => re.test(f)).sort().at(-1) ?? null; } catch { return null; } };

test("on the newest committed MLB artifacts: re-stamping suppresses, one moved number publishes", () => {
  const cases = [
    ["app/public/data/mlb/predictions", /^\d{4}-\d{2}-\d{2}\.json$/, (d) => { d.predictions[0].moneyline && (d.predictions[0].moneyline.simulationProbability += 0.01); }],
    ["app/public/data/mlb/full-game-simulations", /^\d{4}-\d{2}-\d{2}\.json$/, (d) => { d.games[0].artifactHash = "changed"; }],
    ["app/public/data/mlb/game-simulations", /^\d{4}-\d{2}-\d{2}\.json$/, (d) => { d.games[0].status = "changed"; }],
    ["app/public/data/parlays/tier-grid", /^mlb-latest\.json$/, (d) => { d.evidence.pricesCapturedAt = "2099-01-01T00:00:00Z"; }],
  ];
  let checked = 0;
  for (const [dir, re, perturb] of cases) {
    const f = newest(dir, re);
    if (!f) continue;
    const file = `${dir}/${f}`;
    const text = fs.readFileSync(path.join(REPO, file), "utf8");
    const doc = JSON.parse(text);
    if (!Array.isArray(doc.games ?? doc.predictions ?? []) || ((doc.games ?? doc.predictions ?? [{}]).length === 0 && !doc.evidence)) continue;
    const rule = ruleFor(file);
    assert.ok(rule, `${file} has no stamp rule`);
    const restamped = structuredClone(doc);
    for (const s of rule.stamps) {
      const segs = s.split(".");
      const walk = (n, i) => { if (n == null || typeof n !== "object") return; if (i === segs.length - 1) { if (segs[i] in n) n[segs[i]] = "2099-01-01T00:00:00.000Z"; return; } if (segs[i] === "*") { if (Array.isArray(n)) n.forEach((e) => walk(e, i + 1)); return; } walk(n[segs[i]], i + 1); };
      walk(restamped, 0);
    }
    assert.ok(stampOnly(text, JSON.stringify(restamped), rule.stamps), `${file}: re-stamping alone must be stamp-only`);
    assert.notEqual(canonical(doc), canonical(restamped), `${file}: the stamp paths must exist in the real artifact`);
    const moved = structuredClone(restamped);
    perturb(moved);
    assert.equal(stampOnly(text, JSON.stringify(moved), rule.stamps), false, `${file}: a moved number must publish`);
    checked++;
  }
  assert.ok(checked >= 3, `only ${checked} real artifacts were checked`);
});

test("stripStamps never mutates its input", () => {
  const doc = { generatedAt: T0, games: [{ freshness: { generatedAt: T0 } }] };
  const before = JSON.stringify(doc);
  stripStamps(doc, ["generatedAt", "games.*.freshness.generatedAt"]);
  assert.equal(JSON.stringify(doc), before);
});

/* ── The CLI, on a real git index ─────────────────────────────────────────────────────────────────── */

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-gate-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  g("init", "-q"); g("config", "user.email", "t@example.invalid"); g("config", "user.name", "t"); g("config", "commit.gpgsign", "false");
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), typeof body === "string" ? body : J(body)); };
  w("app/scripts/vercel-ignore-build.sh", fs.readFileSync(path.join(APP, "scripts/vercel-ignore-build.sh"), "utf8"));
  w(FULL, full(T0)); w(PRED, pred(T0)); w(`${SNAP_DIR}/snapshot-202610132155.json`, pred(T0));
  w("app/public/data/ops/heartbeat.json", { lastRunAt: T0 });
  g("add", "-A"); g("commit", "-q", "-m", "base");
  return { dir, g, w };
}
const runGate = (dir, ...extra) => spawnSync(process.execPath, [path.join(APP, "scripts/ops/stamp-only-gate.mjs"), "--now", "2026-10-13T23:02:30Z", ...extra], { cwd: dir, encoding: "utf8" });

test("CLI: a stamp-only run leaves only the heartbeat staged — the commit would build nothing", () => {
  const { dir, g, w } = scratchRepo();
  w(FULL, full(T1)); w(PRED, pred(T1)); w(`${SNAP_DIR}/snapshot-202610132302.json`, pred(T1)); w("app/public/data/ops/heartbeat.json", { lastRunAt: T1 });
  g("add", "-A");
  const r = runGate(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).verdict, "SUPPRESS");
  assert.deepEqual(g("diff", "--cached", "--name-only").trim().split("\n"), ["app/public/data/ops/heartbeat.json"]);
  assert.equal(g("status", "--porcelain").trim(), "M  app/public/data/ops/heartbeat.json", "restored files are clean in the worktree and the dropped snapshot is gone");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI: a real change leaves the index exactly as staged (exit 1); --dry-run never touches it", () => {
  const { dir, g, w } = scratchRepo();
  w(FULL, full(T1)); w(PRED, pred(T1, 0.61)); w(`${SNAP_DIR}/snapshot-202610132302.json`, pred(T1, 0.61));
  g("add", "-A");
  const staged = g("diff", "--cached", "--name-only");
  const r = runGate(dir);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).verdict, "PUBLISH");
  assert.equal(g("diff", "--cached", "--name-only"), staged);
  w(PRED, pred(T1)); w(`${SNAP_DIR}/snapshot-202610132302.json`, pred(T1)); g("add", "-A");
  const before = g("diff", "--cached", "--name-only");
  const dry = runGate(dir, "--dry-run");
  assert.equal(dry.status, 0);
  assert.equal(g("diff", "--cached", "--name-only"), before, "dry run reports SUPPRESS but changes nothing");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI: an unruled build input beside stamp-only files publishes (the ignore step's lists are read)", () => {
  const { dir, g, w } = scratchRepo();
  w(FULL, full(T1)); w(PRED, pred(T1)); w(`${SNAP_DIR}/snapshot-202610132302.json`, pred(T1));
  w(`app/public/data/mlb/team-markets/captures/${D}/${D}T12-24-08-654Z.json`, { prices: [1] });
  g("add", "-A");
  const staged = g("diff", "--cached", "--name-only");
  const r = runGate(dir);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(JSON.parse(r.stdout).reasons.join(" "), /team-markets\/captures.*no stamp rule/);
  assert.equal(g("diff", "--cached", "--name-only"), staged);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI: when it cannot judge it exits 2 and leaves the index alone", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-gate-nogit-"));
  const r = runGate(dir);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).verdict, "ERROR");
  fs.rmSync(dir, { recursive: true, force: true });
});
