/**
 * public-beta-observe — behavioural guards for the operational observation runner.
 *
 * Three properties are worth proving and none of them can be proven by reading the source:
 *   1. it is READ-ONLY with respect to money — the pinned mr-dub artifacts are byte-identical after
 *      a full run, including the run that WRITES its own artifact;
 *   2. the artifact it writes has the shape a future session depends on, and re-running the same day
 *      rewrites it byte-identically (an observation tool that churns commits stops being run);
 *   3. a contradiction between artifacts is FLAGGED and exits non-zero — proven on a synthetic tree,
 *      never by corrupting the real one.
 *
 * Every case runs the script in a child process. The runner reports on the real repository, so an
 * in-process import would both bypass the exit code and make the money assertion decorative.
 *
 * Run: npx tsx --test src/lib/public-beta-observation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.cwd();
const REPO = path.dirname(APP);
const SCRIPT = path.join(APP, "scripts/public-beta-observe.mjs");
const MONEY_DIR = path.join(APP, "public/data/mr-dub");

const md5 = (file) => crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");

/** Hash every money artifact, not only the two pinned files — a runner that rewrote ledger.json while
 *  leaving portfolio.json alone would pass a two-file check. */
const moneyFingerprint = () =>
  fs
    .readdirSync(MONEY_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => `${f}:${md5(path.join(MONEY_DIR, f))}`)
    .join("\n");

const run = (args, env) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: APP,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

const tempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test("1 · the runner never writes money — every mr-dub artifact is byte-identical after a writing run", () => {
  const before = moneyFingerprint();
  const out = tempDir("gtp-observe-money-");
  try {
    const r = run(["--offline", "--json", "--out-dir", out]);
    assert.equal(r.status, 0, `expected a clean exit on canonical data, got ${r.status}: ${r.stderr}`);
    assert.equal(moneyFingerprint(), before, "mr-dub artifacts changed during an observation run");

    // The pinned hashes must be REPORTED as matching, not silently absent from the report.
    const o = JSON.parse(r.stdout);
    const pinned = Object.fromEntries(o.protectedHashes.map((h) => [h.file, h]));
    assert.equal(pinned["app/public/data/mr-dub/portfolio.json"].actual, "affe6b21071f2b3be96bb2774eb347c3");
    assert.equal(pinned["app/public/data/mr-dub/bank-builder-locks.json"].actual, "cb80473f88f3cb5f67208fa568925295");
    for (const h of o.protectedHashes) assert.equal(h.state, "MATCH", `${h.file} is ${h.state}`);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("2 · the artifact carries the shape a later session reads, is non-public, and re-runs byte-identically", () => {
  const out = tempDir("gtp-observe-shape-");
  try {
    const first = run(["--offline", "--out-dir", out]);
    assert.equal(first.status, 0, first.stderr);

    const latest = path.join(out, "latest.json");
    assert.ok(fs.existsSync(latest), "latest.json is written");
    const body = fs.readFileSync(latest, "utf8");
    const o = JSON.parse(body);

    const dated = path.join(out, `public-beta-observation-${o.observedEtDate}.json`);
    assert.ok(fs.existsSync(dated), "the date-stamped artifact is written alongside latest.json");
    assert.equal(fs.readFileSync(dated, "utf8"), body, "latest.json and the dated artifact are the same document");

    assert.equal(o.kind, "public-beta-observation");
    assert.equal(o.public, false, "the observation is internal and must never be served publicly");
    for (const key of [
      "observedEtDate", "verdict", "deployment", "mlb", "lineage", "predictionHistory",
      "analytics", "protectedHashes", "limitations", "wallClockObservations", "warnings", "failures",
    ]) {
      assert.ok(key in o, `artifact carries ${key}`);
    }
    assert.match(o.observedEtDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(["OK", "WARN", "FAIL"].includes(o.verdict));
    assert.ok(["OFF", "STAGING", "LIVE"].includes(o.analytics.mode), "analytics mode is one of the three derived states");
    for (const k of ["newestGeneratedBoard", "newestSettledDate", "quarantines"]) assert.ok(k in o.mlb, `mlb carries ${k}`);
    assert.ok(Array.isArray(o.mlb.quarantines.settlement) && Array.isArray(o.mlb.quarantines.researchEligibility),
      "settlement quarantine and research-eligibility quarantine stay separate lists");
    assert.equal(o.lineage.fields.length, 4, "lineage acceptance is measured over the four stamped fields");

    // Both named limitations are present, and none is claimed as closed by CODE. A wall-clock proof
    // may only reach PROVEN on the strength of a committed evidence artifact naming the real event —
    // the same rule the settlement-lineage live proof follows. Without the `provenBy` requirement,
    // "PROVEN" would just be a string a future edit could hardcode.
    const ids = o.limitations.map((l) => l.id).sort();
    assert.deepEqual(ids, ["clean-lineage-stamping", "pipefail-live"]);
    for (const l of o.limitations) {
      assert.ok(["WALL_CLOCK_OPEN", "OBSERVABLE_NOW", "PROVEN"].includes(l.status), `${l.id} is ${l.status}`);
      if (l.status === "PROVEN") {
        assert.ok(l.provenBy, `${l.id} is PROVEN but names no evidence artifact`);
        assert.ok(fs.existsSync(path.join(REPO, l.provenBy)), `${l.id} names a missing evidence artifact: ${l.provenBy}`);
      }
    }

    // Idempotence: no wall-clock instant in the document, so an unchanged tree produces no diff.
    const second = run(["--offline", "--out-dir", out]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(fs.readFileSync(latest, "utf8"), body, "a same-day re-run rewrote the artifact with different bytes");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("3 · a settled date newer than the newest generated board is a CONTRADICTION and exits non-zero", () => {
  const fixture = tempDir("gtp-observe-contradiction-");
  const boards = path.join(fixture, "boards");
  const out = path.join(fixture, "out");
  try {
    fs.mkdirSync(boards, { recursive: true });
    // A board exists for 2026-07-01; the ledger claims a settled slate four days LATER, which no board
    // produced. One of the two artifacts is describing a slate that does not exist.
    fs.writeFileSync(path.join(boards, "2026-07-01.json"), JSON.stringify({ leans: [] }));
    const ledger = path.join(fixture, "settled_leans.jsonl");
    fs.writeFileSync(
      ledger,
      [
        JSON.stringify({ id: "a", date: "2026-07-01", outcome: "Win" }),
        JSON.stringify({ id: "b", date: "2026-07-05", outcome: "Loss" }),
      ].join("\n") + "\n",
    );

    const r = run(["--offline", "--json", "--boards-dir", boards, "--ledger", ledger, "--out-dir", out]);
    assert.equal(r.status, 1, "a contradiction must exit non-zero");
    const o = JSON.parse(r.stdout);
    assert.equal(o.verdict, "FAIL");
    assert.ok(
      o.failures.some((f) => /CONTRADICTION/.test(f) && f.includes("2026-07-05") && f.includes("2026-07-01")),
      `failures did not name the contradiction: ${JSON.stringify(o.failures)}`,
    );
    // Money is still reported as intact — a contradiction elsewhere must not be conflated with money.
    for (const h of o.protectedHashes) assert.equal(h.state, "MATCH");

    // A board older than the staleness threshold is a WARNING that rides alongside, not a second failure.
    assert.ok(o.warnings.some((w) => /^STALE: newest board/.test(w)), "the stale-board guard reports on the same run");
    // The original assertion here was `failures.filter(/STALE/) === 0`. That regex was too broad
    // once the daily freshness SLO landed: it also matched `FRESHNESS STALE`, which is a
    // DIFFERENT condition — "there is no board for the CURRENT ET slate date past the SLO hour" —
    // and which SHOULD fail (a green-automation/no-current-board day is exactly the 62-hour
    // outage nobody noticed). So this is narrowed to the age-based message it was always about,
    // and the SLO failure is asserted positively rather than forbidden.
    assert.equal(
      o.failures.filter((f) => /^STALE: newest board/.test(f)).length,
      0,
      "board AGE alone must never become a failure — it rides as a warning",
    );
    // NOTE — deliberately NOT asserting the freshness-SLO message here. The SLO's severity is
    // hour-dependent by design (silent before 11:00 ET, WARN after, FAIL after 14:00), so any
    // assertion about it in this fixture-driven integration test is really an assertion about
    // the wall clock: an earlier version demanded a FAIL and passed only in the afternoon, then
    // went red at 08:2x the next morning. The escalation thresholds are proven properly in
    // daily-freshness-slo.test.mjs, which injects the hour explicitly.
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("4 · the runner is wired as an npm script and the proof doc names the checklist it drives", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
  assert.equal(pkg.scripts["ops:public-beta-observe"], "node scripts/public-beta-observe.mjs");

  const doc = fs.readFileSync(path.join(REPO, "docs/PUBLIC_BETA_OPERATIONAL_PROOF.md"), "utf8");
  assert.match(doc, /WALL_CLOCK_OPEN/, "the doc classifies the current state");
  assert.match(doc, /npm run ops:public-beta-observe/, "the doc gives the exact command");
  assert.match(doc, /scripts\/automation_settle_pipefail_test\.sh/, "the doc cites the standing known-negative proof");
});
