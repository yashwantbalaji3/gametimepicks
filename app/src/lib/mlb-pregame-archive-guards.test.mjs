/**
 * MLB PREGAME RESEARCH ARCHIVE — honesty guards (2026-07-21).
 *
 * The forward-only pregame capture is internal, immutable, and leakage-safe. These guards pin the spine so the
 * archive can never silently admit post-start data, fake a pregame value, leak to public output, or touch money
 * / products / calibration status.
 *
 * Run: npx tsx --test src/lib/mlb-pregame-archive-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { researchEligibility, collectionGateMet, RESEARCH_ONLY_FLAGS, SCHEMA_VERSION } from "./mlb/pregame-archive/eligibility.ts";
import { validatedModeledMarkets } from "./mlb/calibration/eligibility-policy.ts";
import { anyModeledMarketBeatsMarket } from "./mlb/model-calibration-status.ts";

const app = process.cwd();
const repo = path.dirname(app);
const ARCH = path.join(repo, "data/internal/mlb/pregame-archive");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const START = "2026-07-21T23:00:00Z";

test("1 · eligibility: captured at/after first pitch is NEVER research-eligible", () => {
  const post = researchEligibility({ family: "confirmed_lineup", capturedAt: "2026-07-21T23:05:00Z", availableAt: "2026-07-21T23:05:00Z", eventStartTime: START, timestampProven: true });
  assert.equal(post.eligible, false); assert.equal(post.quality, "POST_START_ONLY");
  const pre = researchEligibility({ family: "confirmed_lineup", capturedAt: "2026-07-21T20:00:00Z", availableAt: "2026-07-21T20:00:00Z", eventStartTime: START, timestampProven: true });
  assert.equal(pre.eligible, true);
});

test("2 · eligibility: postgame-only, superseded, and unproven-timestamp values are ineligible", () => {
  assert.equal(researchEligibility({ family: "environment", capturedAt: "2026-07-21T20:00:00Z", availableAt: "2026-07-21T20:00:00Z", eventStartTime: START, timestampProven: true, postgameOnly: true }).eligible, false);
  assert.equal(researchEligibility({ family: "pitcher_status", capturedAt: "2026-07-21T20:00:00Z", availableAt: "2026-07-21T20:00:00Z", eventStartTime: START, timestampProven: true, superseded: true }).eligible, false);
  const unproven = researchEligibility({ family: "confirmed_lineup", capturedAt: "2026-07-21T20:00:00Z", availableAt: null, eventStartTime: START, timestampProven: false });
  assert.equal(unproven.eligible, false); assert.equal(unproven.quality, "TIMESTAMP_UNPROVEN");
});

test("3 · collection gate is NOT met at the start of forward collection", () => {
  const { met, blockers } = collectionGateMet({ distinctDates: 1, settledEligibleObs: 0, featureCoveragePct: 100, timestampProvenPct: 100 });
  assert.equal(met, false); assert.ok(blockers.length > 0);
});

test("4 · captured snapshots are internal, hashed, and identify the event start", () => {
  const dates = fs.existsSync(path.join(ARCH, "snapshots")) ? fs.readdirSync(path.join(ARCH, "snapshots")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  if (!dates.length) { console.log("  (skip — no snapshots captured in this checkout)"); return; }
  const d = dates[0];
  for (const f of fs.readdirSync(path.join(ARCH, "snapshots", d)).slice(0, 20)) {
    const s = readJson(path.join(ARCH, "snapshots", d, f));
    assert.equal(s.public, false, "snapshot is internal");
    assert.equal(s.schemaVersion, SCHEMA_VERSION);
    assert.ok(s.rawPayloadHash && s.normalizedPayloadHash, "raw + normalized hashes present");
    assert.ok(s.eventStartTime, "event start time present");
    // a snapshot captured after first pitch must have zero research-eligible families
    if (s.startedAtCapture) assert.equal((s.featureFamilies || []).filter((x) => x.researchEligible).length, 0, "post-start snapshot has 0 eligible families");
    // every eligible family was captured strictly before first pitch
    for (const fam of s.featureFamilies || []) if (fam.researchEligible) assert.ok(Date.parse(fam.capturedAt) < Date.parse(s.eventStartTime), `${fam.family} eligible ⇒ captured pregame`);
  }
});

test("5 · immutability: snapshot filenames encode capture time (append-only, never overwritten)", () => {
  const dates = fs.existsSync(path.join(ARCH, "snapshots")) ? fs.readdirSync(path.join(ARCH, "snapshots")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  if (!dates.length) { console.log("  (skip)"); return; }
  for (const f of fs.readdirSync(path.join(ARCH, "snapshots", dates[0]))) {
    assert.match(f, /^\d+-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/, "filename = <gamePk>-<capturedAt>.json");
  }
});

test("6 · freeze is FINAL_PREGAME_FREEZE, internal, and only pregame snapshots seed it", () => {
  const fdir = path.join(ARCH, "freezes");
  const dates = fs.existsSync(fdir) ? fs.readdirSync(fdir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  if (!dates.length) { console.log("  (skip)"); return; }
  for (const f of fs.readdirSync(path.join(fdir, dates[0])).slice(0, 20)) {
    const fr = readJson(path.join(fdir, dates[0], f));
    assert.equal(fr.public, false); assert.equal(fr.snapshotReason, "FINAL_PREGAME_FREEZE");
    assert.equal(fr.approvedForProduction, false);
  }
});

test("7 · schema + source registry are forward-only + research-only", () => {
  const schema = readJson(path.join(ARCH, "schema.json"));
  if (schema) { assert.equal(schema.public, false); assert.match(schema.forwardOnly, /begins at first deployment/i); assert.match(schema.eligibilityRule, /capturedAt < eventStartTime/); }
  const reg = readJson(path.join(ARCH, "source-registry.json"));
  if (reg) { assert.equal(reg.public, false); assert.equal(reg.families.markets.implemented, false, "markets honestly not-yet-implemented (paid)"); }
  assert.deepEqual(RESEARCH_ONLY_FLAGS, { public: false, approvedForProduction: false, productEligible: false });
});

test("8 · NOTHING changed: no validated market, calibration disclosures intact, archive not served", () => {
  assert.deepEqual(validatedModeledMarkets(), [], "still zero validated modeled markets");
  assert.equal(anyModeledMarketBeatsMarket(), false);
  const report = fs.readFileSync(path.join(app, "src/components/game/mlb-simulation-report-v2.tsx"), "utf8");
  assert.match(report, /Model calibration notice/); assert.match(report, /Paper candidates/);
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("pregame-archive"));
    assert.equal(hit.length, 0, "no pregame-archive artifact under out/");
  }
});

test("9 · money md5 unchanged (forward-only research capture is internal + money-independent)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});

test("10 · the capture workflow is enabled, non-blocking, PR-safe, and money/public-safe", () => {
  const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
  // enabled: a real schedule/cron exists (not commented out)
  assert.match(wf, /^\s*schedule:/m, "schedule is enabled");
  assert.match(wf, /^\s*-\s*cron:\s*"/m, "at least one active cron entry");
  // never runs on pull_request (no PR trigger; explicit guard present)
  assert.ok(!/^\s*pull_request:/m.test(wf), "no pull_request trigger");
  assert.match(wf, /github\.event_name != 'pull_request'/, "explicit PR guard on the job");
  // non-blocking
  assert.match(wf, /continue-on-error:\s*true/, "job is continue-on-error (non-blocking)");
  assert.match(wf, /concurrency:/, "concurrency-guarded");
  // durable commit is OPT-IN + path-scoped to the internal archive only
  assert.match(wf, /vars\.PREGAME_ARCHIVE_COMMIT == 'true'/, "in-repo commit is opt-in via repo variable");
  assert.match(wf, /git add data\/internal\/mlb\/pregame-archive\//, "commit is path-scoped to the internal archive");
  // never ACTS on money / public / settlement files (ignore explanatory comment lines that say it does NOT)
  const codeLines = wf.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.ok(!/git add -A|git add \.|portfolio\.json|public\/data\//.test(codeLines), "no workflow step stages money/public files");
});

test("11 · settlement-join is a PLAN only (no execution, no modeling) + research-only", () => {
  const plan = readJson(path.join(ARCH, "settlement-join-plan.json"));
  if (!plan) { console.log("  (skip — plan not present)"); return; }
  assert.equal(plan.public, false);
  assert.equal(plan.approvedForProduction, false);
  assert.match(plan.status, /PLAN_ONLY/);
  assert.deepEqual(plan.joinKeys.gameLevel, ["gamePk", "boardDateEt"]);
  assert.ok(plan.gateBeforeModeling.plusFounderApproval, "modeling requires the gate + founder approval");
});
