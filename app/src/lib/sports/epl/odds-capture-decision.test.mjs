/**
 * THE FIXTURE-GAP SKIP MUST LEAVE EVIDENCE — AND ONLY THE SKIP MAY CLAIM IT.
 *
 * On 2026-09-06 epl-matchweek failed three times in one day because its freshness assert demanded
 * odds the capture was REQUIRED not to buy (no kickoff within 30h; next 135h away). The repair has
 * two halves, and both are probed here in child processes against disposable roots:
 *
 *   · capture-epl-odds.mjs writes a dated capture-decision.json when — and only when — it read the
 *     fixture list and decided the window was empty. A refusal writes nothing.
 *   · assert-odds-fresh-or-skipped.mjs passes on fresh odds OR a decision written during this run,
 *     and fails everything else — so a dead producer, a stale decision from yesterday's run, or a
 *     decision with any other value still goes red.
 *
 * These run the REAL scripts, not copies of their rules. No scenario sets --apply and none has an
 * ODDS_API_KEY in its environment, so no path here can reach the provider.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");
const REPO = path.resolve(APP, "..");
const CAPTURE = path.join(APP, "scripts", "epl", "capture-epl-odds.mjs");
const ASSERT = path.join(APP, "scripts", "ops", "assert-odds-fresh-or-skipped.mjs");
const REAL_RECEIPT = path.join(REPO, "docs", "receipts", "ODDS_AUTHORIZATION_EPL.md");

/** A disposable repo-shaped root with the REAL committed receipt, so authorization parses the same
 * bytes production parses, and a fixture list of our choosing. */
function makeRoot({ fixtures }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "epl-odds-decision-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(root, "docs", "receipts"), { recursive: true });
  fs.copyFileSync(REAL_RECEIPT, path.join(root, "docs", "receipts", "ODDS_AUTHORIZATION_EPL.md"));
  if (fixtures) {
    const dir = path.join(app, "public", "data", "soccer", "epl", "fixtures");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "capture-2026-27-test.json"), JSON.stringify({ rows: fixtures }));
  } else {
    fs.mkdirSync(app, { recursive: true });
  }
  return { root, app };
}

const runCapture = (app, now) => spawnSync(process.execPath, [CAPTURE, "--app-root", app, "--now", now], {
  encoding: "utf8",
  env: { ...process.env, ODDS_API_KEY: "" },
});
const decisionPath = (app) => path.join(app, "public", "data", "soccer", "epl", "odds", "capture-decision.json");

const NOW = "2026-09-06T22:50:00Z";
const FAR_KICKOFF = "2026-09-12T14:00:00.000Z"; // 135.2h ahead of NOW — outside the 30h window

test("out-of-window skip exits 0 and records the decision it made", () => {
  const { app } = makeRoot({ fixtures: [{ kickoffIso: FAR_KICKOFF }] });
  const r = runCapture(app, NOW);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SKIPPED — no kickoff within 30h/);
  const d = JSON.parse(fs.readFileSync(decisionPath(app), "utf8"));
  assert.equal(d.decision, "skipped-no-kickoff-in-window");
  assert.equal(d.nextKickoffIso, FAR_KICKOFF);
  assert.equal(d.creditsSpent, 0);
  assert.equal(Date.parse(d.decidedAt), Date.parse(NOW));
});

test("a refusal (unreadable fixture list) exits 1 and writes NO decision — it cannot claim the exemption", () => {
  const { app } = makeRoot({ fixtures: null });
  const r = runCapture(app, NOW);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /REFUSED — no fixture list/);
  assert.equal(fs.existsSync(decisionPath(app)), false);
});

test("a kickoff inside the window does not write a skip decision", () => {
  const { app } = makeRoot({ fixtures: [{ kickoffIso: "2026-09-07T14:00:00.000Z" }] }); // 15.2h ahead
  const r = runCapture(app, NOW);
  // No --apply: the run stops at the dry-run gate AFTER the window check. What matters here is
  // that the window was NOT empty, so no skip decision may exist to exempt a later assert.
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(decisionPath(app)), false);
});

// ── The assert half ─────────────────────────────────────────────────────────────────────────────

const RUN_STARTED = "2026-09-06T22:49:43Z";

function runAssert({ odds, decision }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epl-odds-assert-"));
  const oddsPath = path.join(dir, "latest.json");
  const decisionFile = path.join(dir, "capture-decision.json");
  if (odds) fs.writeFileSync(oddsPath, JSON.stringify(odds));
  if (decision) fs.writeFileSync(decisionFile, JSON.stringify(decision));
  return spawnSync(process.execPath, [ASSERT, "--since", RUN_STARTED, "--max-age-min", "90",
    "--odds", oddsPath, "--decision", decisionFile], { encoding: "utf8" });
}

const skipDecision = (decidedAt) => ({
  decision: "skipped-no-kickoff-in-window", windowHours: 30,
  nextKickoffIso: FAR_KICKOFF, hoursAway: 135.2, decidedAt, generatedAt: decidedAt,
});

test("a decision written during this run exempts the freshness assert, loudly", () => {
  const r = runAssert({ odds: { generatedAt: "2026-09-06T15:00:00Z" }, decision: skipDecision("2026-09-06T22:50:00Z") });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /EXEMPT this run/);
});

test("a STALE decision from an earlier run proves nothing — stale odds still fail", () => {
  const r = runAssert({ odds: { generatedAt: "2026-09-06T15:00:00Z" }, decision: skipDecision("2026-09-05T22:50:00Z") });
  assert.equal(r.status, 1);
});

test("only the skip decision exempts: any other decision value falls through to the freshness assert", () => {
  const r = runAssert({
    odds: { generatedAt: "2026-09-06T15:00:00Z" },
    decision: { ...skipDecision("2026-09-06T22:50:00Z"), decision: "captured" },
  });
  assert.equal(r.status, 1);
});

test("no decision at all: fresh odds pass (the capture bought prices), stale odds fail (the producer is dead)", () => {
  const fresh = runAssert({ odds: { generatedAt: "2026-09-06T22:51:00Z" }, decision: null });
  assert.equal(fresh.status, 0, fresh.stderr);
  const dead = runAssert({ odds: { generatedAt: "2026-09-06T15:00:00Z" }, decision: null });
  assert.equal(dead.status, 1);
});

test("missing required flags refuse rather than pass vacuously", () => {
  const r = spawnSync(process.execPath, [ASSERT, "--since", RUN_STARTED], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /required/);
});
