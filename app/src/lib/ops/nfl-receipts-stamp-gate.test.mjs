/**
 * NFL settlement-receipts stamp-only gate (COST-001, 2026-10-16) — lib/ops/stamp-only-gate.mjs with
 * NFL_RECEIPTS_STAMP_RULES, its CLI under `--rules nfl-receipts`, and the nfl-event-window.yml wiring.
 *
 *   SUPPRESS  interval-calibration.json / reconciliation/index.json that moved ONLY in reader-traced stamps
 *             are restored; the private ledgers still commit (none is a build input).
 *   PUBLISH   one moved stat, a finality change, an observedAt (rendered as "last observed"), a week report
 *             (its generatedAt is rendered "Graded <time>"), a new file, an unruled build input, a deletion,
 *             an unreadable file, a stale heartbeat, an unknown rule set — everything publishes as before.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { decide, stampOnly, canonical, buildInputPredicate, ruleFor, STAMP_RULES, NFL_RECEIPTS_STAMP_RULES, RULE_SETS } from "./stamp-only-gate.mjs";

const APP = process.cwd();
const REPO = path.join(APP, "..");
const RULES = NFL_RECEIPTS_STAMP_RULES;
/* The real 10-16 pair: 86e0c82e38 (18:19Z) re-stamped what 3122bf3f3c (17:07Z) had committed. */
const T0 = "2026-10-16T17:07:59Z";
const T1 = "2026-10-16T18:19:08Z";
const NOW = Date.parse("2026-10-16T18:19:10Z");

const CAL = "app/public/data/nfl/interval-calibration.json";
const IDX = "app/public/data/nfl/reconciliation/index.json";
const WEEK = "app/public/data/nfl/reconciliation/2-06.json";
const LIVE = "app/public/data/nfl/live-props/401872933.json";
const SETTLE = "data/internal/nfl/settlement/2026-10-16.json";
const XSETTLE = "data/internal/nfl/experimental-settlement/2026-10-16.json";
const SHADOW = "data/internal/research/nfl/reports/margin-interval-shadow-latest.json";
const WM2 = "data/internal/nfl/world-model-v2/grades/latest.json";

const cal = (stamp, ledger = stamp, n = 54) => ({ schemaVersion: 1, artifact: "nfl-interval-calibration", generatedAt: stamp, ledgerGeneratedAt: ledger, nominalCoverage: 0.8, cohorts: [{ label: "2026 regular season", n, margin: { state: "OVERCONFIDENT", n, covered: 38, observed: 38 / n, claim: "too narrow" }, total: { state: "CALIBRATED", n, covered: 43, observed: 43 / n, claim: "ok" } }], worst: "OVERCONFIDENT", action: "propose widening" });
const idx = (stamp, weekStamp = stamp, final = 9) => ({ schemaVersion: 1, artifact: "nfl-week-reconciliation-index", weeks: [{ key: "2-06", label: "Week 6", generatedAt: weekStamp, gamesFinal: final, gamesPending: 15 - final, overall: { checks: 300, hits: 240, rate: 0.8 } }], generatedAt: stamp });
const week = (stamp, revision = "2026-10-16T17:07:10Z", final = 9) => ({ generatedAt: stamp, period: { key: "2-06", label: "Week 6" }, summary: { gamesFinal: final, gamesPending: 15 - final }, games: [{ providerEventId: "401", state: "PENDING", published: { generatedAt: revision, projectedScore: { away: 21, home: 23 } }, final: null }] });
const live = (observedAt, { stat = 72, finality = "PROVISIONAL" } = {}) => ({ schemaVersion: 1, artifact: "nfl-live-props", providerEventId: "401872933", phase: "FINAL", finality, finalFirstObservedAt: "2026-10-16T03:30:00Z", observedAt, rows: [{ predictionId: "401872933:p:player_rush_yds", live: { phase: "FINAL", statValue: stat, observedAt }, settlement: { state: "SETTLED", finalStat: stat, finality, reObservedAt: observedAt } }] });
const J = (o) => JSON.stringify(o, null, 2);

const isBuildInput = buildInputPredicate(fs.readFileSync(path.join(APP, "scripts/vercel-ignore-build.sh"), "utf8"));
const mod = (p, before, after) => ({ path: p, status: "M", before: typeof before === "string" ? before : J(before), after: typeof after === "string" ? after : J(after), buildInput: isBuildInput(p) });
const add = (p, after) => ({ path: p, status: "A", before: null, after: J(after), buildInput: isBuildInput(p) });
const del = (p, before) => ({ path: p, status: "D", before: J(before), after: null, buildInput: isBuildInput(p) });
const priv = () => [mod(SETTLE, { generatedAt: T0 }, { generatedAt: T1 }), mod(XSETTLE, { generatedAt: T0 }, { generatedAt: T1 }), mod(SHADOW, { generatedAt: T0 }, { generatedAt: T1 }), mod(WM2, { at: T0 }, { at: T1 })];

/** 86e0c82e38's two gateable public files, reduced to their shape, plus its private ledgers. */
const stampOnlyRun = () => [mod(CAL, cal(T0), cal(T1)), mod(IDX, idx(T0), idx(T1)), ...priv()];
const judge = (changes, nowMs = NOW, extra = {}) => decide({ changes, nowMs, rules: RULES, ...extra });

/* ── SUPPRESS ─────────────────────────────────────────────────────────────────────────────────────── */

test("NFL receipts: calibration + index re-stamped over unchanged content is suppressed; private ledgers keep committing", () => {
  const out = judge(stampOnlyRun());
  assert.equal(out.verdict, "SUPPRESS", out.reasons.join("; "));
  assert.deepEqual(out.restore.sort(), [CAL, IDX].sort());
  assert.deepEqual(out.drop, []);
  assert.deepEqual(out.free.sort(), [SETTLE, XSETTLE, SHADOW, WM2].sort());
  for (const f of out.free) assert.equal(isBuildInput(f), false, `${f} would still trigger a build`);
});

test("NFL receipts: each gated file suppresses on its own", () => {
  assert.equal(judge([mod(CAL, cal(T0), cal(T1, "2026-10-16T18:18:59Z")), ...priv()]).verdict, "SUPPRESS");
  assert.equal(judge([mod(IDX, idx(T0), idx(T1, "2026-10-16T18:18:20Z")), ...priv()]).verdict, "SUPPRESS");
});

test("NFL receipts: a run that staged only private ledgers is a PUBLISH no-op (nothing gated, index untouched)", () => {
  const out = judge(priv());
  assert.equal(out.verdict, "PUBLISH");
  assert.deepEqual(out.restore, []);
});

/* ── PUBLISH (negative controls) ──────────────────────────────────────────────────────────────────── */

test("one moved stat in a live-props record publishes everything", () => {
  const out = judge([...stampOnlyRun(), mod(LIVE, live(T0, { stat: 72 }), live(T0, { stat: 79 }))]);
  assert.equal(out.verdict, "PUBLISH");
  assert.match(out.reasons.join(" "), /live-props\/401872933\.json: a build input with no stamp rule/);
  assert.deepEqual(out.restore, [], "nothing is restored when the run publishes");
});

test("a finality change (PROVISIONAL → CANONICAL) publishes", () => {
  assert.equal(judge([...stampOnlyRun(), mod(LIVE, live(T0), live(T0, { finality: "CANONICAL" }))]).verdict, "PUBLISH");
});

test("a live-props observedAt-only change publishes — it is rendered ('last observed', 'Updated 42s ago')", () => {
  assert.equal(judge([...stampOnlyRun(), mod(LIVE, live(T0), live(T1))]).verdict, "PUBLISH");
});

test("a week report publishes on any change — its generatedAt is rendered 'Graded <time> ET' and published.generatedAt names the graded revision", () => {
  assert.equal(judge([...stampOnlyRun(), mod(WEEK, week(T0), week(T1))]).verdict, "PUBLISH", "generatedAt alone");
  assert.equal(judge([...stampOnlyRun(), mod(WEEK, week(T0), week(T0, "2026-10-16T18:18:18Z"))]).verdict, "PUBLISH", "revision pointer alone");
  assert.equal(ruleFor(WEEK, RULES), null);
});

test("a moved calibration number, a moved week count in the index, publishes", () => {
  assert.equal(judge([mod(CAL, cal(T0, T0, 54), cal(T1, T1, 55)), mod(IDX, idx(T0), idx(T1))]).verdict, "PUBLISH");
  assert.equal(judge([mod(CAL, cal(T0), cal(T1)), mod(IDX, idx(T0, T0, 9), idx(T1, T1, 10))]).verdict, "PUBLISH");
});

test("a stamp-named key OUTSIDE the allowlist publishes — the allowlist is exact paths, not key names", () => {
  const before = cal(T0); const after = cal(T1); before.cohorts[0].generatedAt = T0; after.cohorts[0].generatedAt = T1;
  assert.equal(judge([mod(CAL, before, after)]).verdict, "PUBLISH");
  const i0 = idx(T0); const i1 = idx(T1); i0.observedAt = T0; i1.observedAt = T1;
  assert.equal(judge([mod(IDX, i0, i1)]).verdict, "PUBLISH");
});

test("a new file publishes (new live-props record, new week, re-created index)", () => {
  assert.equal(judge([...stampOnlyRun(), add(LIVE, live(T1))]).verdict, "PUBLISH");
  assert.equal(judge([...stampOnlyRun(), add("app/public/data/nfl/reconciliation/2-07.json", week(T1))]).verdict, "PUBLISH");
  assert.match(judge([add(IDX, idx(T1))]).reasons.join(" "), /new file/);
});

test("an unknown build input publishes; so does a deletion", () => {
  const out = judge([...stampOnlyRun(), mod("app/public/data/nfl/forecasts/2026-10-16.json", { a: 1 }, { a: 2 })]);
  assert.equal(out.verdict, "PUBLISH");
  assert.match(out.reasons.join(" "), /no stamp rule/);
  assert.equal(judge([...stampOnlyRun(), del(IDX, idx(T0))].filter((c, i, a) => !(c.path === IDX && c.status === "M"))).verdict, "PUBLISH");
});

test("anything unreadable publishes (an error never suppresses)", () => {
  assert.equal(judge([mod(CAL, "{not json", J(cal(T1)))]).verdict, "PUBLISH");
  assert.equal(judge([mod(CAL, J(cal(T0)), "{not json")]).verdict, "PUBLISH");
  const noStamp = cal(T0); delete noStamp.generatedAt; const noStamp1 = cal(T1); delete noStamp1.generatedAt;
  assert.match(judge([mod(CAL, noStamp, noStamp1)]).reasons.join(" "), /committed stamp unreadable/);
  assert.equal(judge(stampOnlyRun(), NaN).verdict, "PUBLISH", "no clock, no suppression");
});

test("the 6h heartbeat: suppress up to the bound, publish beyond it", () => {
  const at = (h) => Date.parse(T0) + h * 3_600_000;
  assert.equal(judge(stampOnlyRun(), at(5.9)).verdict, "SUPPRESS");
  const out = judge(stampOnlyRun(), at(6.1));
  assert.equal(out.verdict, "PUBLISH");
  assert.match(out.reasons.join(" "), /heartbeat: committed stamps are 6\.1h old \(bound 6h\)/);
  // The OLDEST committed gated stamp decides.
  assert.equal(judge([mod(CAL, cal("2026-10-16T09:00:00Z"), cal(T1)), mod(IDX, idx(T0), idx(T1))]).verdict, "PUBLISH");
});

/* ── Rule sets are scoped ─────────────────────────────────────────────────────────────────────────── */

test("rule sets are scoped: MLB rules never judge NFL files and NFL rules never judge MLB files", () => {
  assert.deepEqual(Object.keys(RULE_SETS).sort(), ["mlb", "nfl-receipts"]);
  assert.equal(RULE_SETS.mlb, STAMP_RULES);
  for (const f of [CAL, IDX, WEEK, LIVE]) assert.equal(ruleFor(f), null, `${f} under the default (MLB) rules`);
  assert.equal(decide({ changes: stampOnlyRun(), nowMs: NOW }).verdict, "PUBLISH", "without --rules nfl-receipts the NFL run publishes");
  for (const f of ["app/public/data/mlb/predictions/2026-10-16.json", "app/public/data/parlays/tier-grid/mlb-latest.json"]) assert.equal(ruleFor(f, RULES), null, f);
});

test("every NFL rule names a build input, and the gated set is exactly calibration + reconciliation index", () => {
  assert.deepEqual(RULES.map((r) => r.id).sort(), ["nfl-interval-calibration", "nfl-reconciliation-index"]);
  assert.equal(ruleFor(CAL, RULES)?.id, "nfl-interval-calibration");
  assert.equal(ruleFor(IDX, RULES)?.id, "nfl-reconciliation-index");
  for (const f of [CAL, IDX, WEEK, LIVE]) assert.equal(isBuildInput(f), true, f);
  for (const f of [SETTLE, XSETTLE, SHADOW, WM2, "data/internal/nfl/prop-settlement/2026-10-16.json", "data/internal/nfl/official-stats/401.json"]) assert.equal(isBuildInput(f), false, f);
  assert.deepEqual(ruleFor(CAL, RULES).stamps, ["generatedAt", "ledgerGeneratedAt"]);
  assert.deepEqual(ruleFor(IDX, RULES).stamps, ["generatedAt", "weeks.*.generatedAt"]);
});

/* ── Reader trace, pinned: a new reader must re-run the trace before these keys stay allowlisted ────── */

const srcFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === "__fixtures__" ? [] : srcFiles(p);
  return /\.(mjs|ts|tsx|js)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});
const readersOf = (needle) => srcFiles(path.join(APP, "src")).filter((f) => !f.endsWith(path.join("lib", "ops", "stamp-only-gate.mjs")) && fs.readFileSync(f, "utf8").includes(needle)).map((f) => path.relative(APP, f)).sort();

test("reader trace: interval-calibration.json is read only by the panel, which renders neither stamp", () => {
  assert.deepEqual(readersOf("interval-calibration"), ["src/app/nfl/page.tsx", "src/components/nfl/interval-calibration-panel.tsx"]);
  const panel = fs.readFileSync(path.join(APP, "src/components/nfl/interval-calibration-panel.tsx"), "utf8");
  assert.doesNotMatch(panel, /ledgerGeneratedAt/);
  assert.doesNotMatch(panel, /cal\??\.generatedAt/);
  const page = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");
  assert.doesNotMatch(page, /nflCalibration\??\.(generatedAt|ledgerGeneratedAt)/);
});

test("reader trace: the reconciliation index's stamps are read by nothing; the week report's generatedAt IS rendered (so weeks stay ungated)", () => {
  assert.deepEqual(readersOf("reconciliation/index.json").concat(readersOf('readJson<WeekIndex>("index.json")')).sort(), ["src/lib/sports/nfl/archived-forecast.ts", "src/lib/sports/nfl/week-report-data.ts"]);
  for (const f of ["src/lib/sports/nfl/archived-forecast.ts", "src/lib/sports/nfl/week-report-data.ts", "src/app/results/nfl/page.tsx", "src/app/results/page.tsx", "src/components/results/nfl-family-drilldown.tsx"]) {
    const s = fs.readFileSync(path.join(APP, f), "utf8");
    assert.doesNotMatch(s, /\b(index|idx|w|week|row|earlier\[\w*\]|weeks\[\w*\])\??\.generatedAt/, `${f} reads an index stamp — re-trace before keeping it allowlisted`);
  }
  assert.match(fs.readFileSync(path.join(APP, "src/app/results/nfl/page.tsx"), "utf8"), /Graded \{etKickoff\(latest\.generatedAt\)/, "if this stops being rendered the week rule can be revisited — not before");
});

/* ── Real committed artifacts (shape drift) ───────────────────────────────────────────────────────── */

test("on the committed NFL artifacts: re-stamping suppresses, one moved number publishes", () => {
  const cases = [[CAL, (d) => { d.cohorts[0].n += 1; }], [IDX, (d) => { d.weeks[0].gamesFinal += 1; }]];
  let checked = 0;
  for (const [file, perturb] of cases) {
    let text; try { text = fs.readFileSync(path.join(REPO, file), "utf8"); } catch { continue; }
    const doc = JSON.parse(text);
    const rule = ruleFor(file, RULES);
    const restamped = structuredClone(doc);
    for (const s of rule.stamps) {
      const segs = s.split(".");
      const walk = (n, i) => { if (n == null || typeof n !== "object") return; if (i === segs.length - 1) { if (segs[i] in n) n[segs[i]] = "2099-01-01T00:00:00Z"; return; } if (segs[i] === "*") { if (Array.isArray(n)) n.forEach((e) => walk(e, i + 1)); return; } walk(n[segs[i]], i + 1); };
      walk(restamped, 0);
    }
    assert.notEqual(canonical(doc), canonical(restamped), `${file}: every stamp path must exist in the real artifact`);
    assert.ok(stampOnly(text, JSON.stringify(restamped), rule.stamps), `${file}: re-stamping alone must be stamp-only`);
    const moved = structuredClone(restamped); perturb(moved);
    assert.equal(stampOnly(text, JSON.stringify(moved), rule.stamps), false, `${file}: a moved number must publish`);
    checked++;
  }
  assert.equal(checked, 2);
});

/* ── The CLI, on a real git index ─────────────────────────────────────────────────────────────────── */

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-stamp-gate-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  g("init", "-q"); g("config", "user.email", "t@example.invalid"); g("config", "user.name", "t"); g("config", "commit.gpgsign", "false");
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), typeof body === "string" ? body : J(body)); };
  w("app/scripts/vercel-ignore-build.sh", fs.readFileSync(path.join(APP, "scripts/vercel-ignore-build.sh"), "utf8"));
  w(CAL, cal(T0)); w(IDX, idx(T0)); w(WEEK, week(T0)); w(LIVE, live(T0)); w(SETTLE, { generatedAt: T0 });
  g("add", "-A"); g("commit", "-q", "-m", "base");
  return { dir, g, w };
}
const runGate = (dir, ...extra) => spawnSync(process.execPath, [path.join(APP, "scripts/ops/stamp-only-gate.mjs"), "--now", "2026-10-16T18:19:10Z", ...extra], { cwd: dir, encoding: "utf8" });

test("CLI --rules nfl-receipts: a stamp-only run leaves only the private ledger staged — the commit builds nothing", () => {
  const { dir, g, w } = scratchRepo();
  w(CAL, cal(T1)); w(IDX, idx(T1)); w(SETTLE, { generatedAt: T1 });
  g("add", "-A");
  const r = runGate(dir, "--rules", "nfl-receipts");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.verdict, "SUPPRESS"); assert.equal(out.rules, "nfl-receipts");
  assert.deepEqual(g("diff", "--cached", "--name-only").trim().split("\n"), [SETTLE]);
  assert.equal(g("status", "--porcelain").trim(), `M  ${SETTLE}`, "restored files are clean in the worktree");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI --rules nfl-receipts: a moved live stat leaves the index exactly as staged (exit 1)", () => {
  const { dir, g, w } = scratchRepo();
  w(CAL, cal(T1)); w(IDX, idx(T1)); w(LIVE, live(T0, { stat: 80 })); w(SETTLE, { generatedAt: T1 });
  g("add", "-A");
  const staged = g("diff", "--cached", "--name-only");
  const r = runGate(dir, "--rules", "nfl-receipts");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).verdict, "PUBLISH");
  assert.equal(g("diff", "--cached", "--name-only"), staged);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI: without --rules (MLB default) the NFL stamp-only run publishes; an unknown rule set is an ERROR (exit 2), index untouched", () => {
  const { dir, g, w } = scratchRepo();
  w(CAL, cal(T1)); w(IDX, idx(T1)); g("add", "-A");
  const staged = g("diff", "--cached", "--name-only");
  const def = runGate(dir);
  assert.equal(def.status, 1, def.stdout + def.stderr);
  const bad = runGate(dir, "--rules", "nfl-reciepts");
  assert.equal(bad.status, 2, bad.stdout + bad.stderr);
  assert.equal(JSON.parse(bad.stdout).verdict, "ERROR");
  assert.equal(g("diff", "--cached", "--name-only"), staged);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ── Workflow wiring ──────────────────────────────────────────────────────────────────────────────── */

test("nfl-event-window: the receipts step runs the gate with --rules nfl-receipts after staging, before its one commit, ahead of the single push", () => {
  const src = fs.readFileSync(path.join(REPO, ".github/workflows/nfl-event-window.yml"), "utf8");
  const stepAt = src.indexOf("- name: Commit settlement receipts");
  const nextStep = src.indexOf("- name:", stepAt + 10);
  const step = src.slice(stepAt, nextStep);
  const lines = step.split("\n").map((l) => l.trim());
  const gate = lines.findIndex((l) => l === 'if node app/scripts/ops/stamp-only-gate.mjs --rules nfl-receipts; then');
  assert.ok(gate > 0, "the gate is invoked in an if (exit 1 / 2 can never fail the step under set -e)");
  assert.equal(lines.filter((l) => !l.startsWith("#") && l.includes("stamp-only-gate.mjs")).length, 1);
  const lastAdd = lines.map((l, i) => (/git add /.test(l) ? i : -1)).reduce((a, b) => Math.max(a, b));
  const empty = lines.indexOf('if git diff --cached --quiet; then echo "no settlement change"; exit 0; fi');
  const after = lines.indexOf('if git diff --cached --quiet; then echo "nothing left to persist after the stamp gate"; exit 0; fi');
  const commit = lines.indexOf('git commit -m "$RECEIPTS_MSG"');
  assert.ok(lastAdd < empty && empty < gate && gate < after && after < commit, "stage → empty check → gate → empty check → commit");
  assert.equal(lines.filter((l) => /^git commit\b/.test(l)).length, 1);
  assert.doesNotMatch(step, /git push/, "the receipts step still never pushes (COST-001 Stage A)");
  assert.ok(src.indexOf("- name: Publish this run's commits") > nextStep - 1);
  assert.match(step, /RECEIPTS_MSG="auto: nfl settlement receipts \[skip ci\]"/, "the publishing title is unchanged");
});
