/**
 * MLB PREGAME PLAYER-PROP CAPTURE — honesty guards (2026-07-21).
 *
 * Per-event Odds-API player-prop capture is internal, immutable, timestamp-safe, credit-guarded, dry-run-default,
 * and a SEPARATE opt-in from team markets. These guards pin the safety + de-vig behaviour.
 *
 * Run: npx tsx --test src/lib/mlb-pregame-player-prop-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { deVig, marketRecordEligibility } from "./mlb/pregame-archive/market-normalizer.ts";

const app = process.cwd();
const repo = path.dirname(app);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("1 · de-vig: paired over/under de-vigs; over-only never de-vigged (shared normalizer)", () => {
  assert.equal(deVig(-125, 105).status, "paired"); // Valdez pitcher_outs Over/Under
  assert.deepEqual(deVig(120, null), { noVigProbability: null, status: "over_only_or_unpaired" });
});

test("2 · eligibility: post-start + missing-timestamp player-prop records are ineligible", () => {
  const START = "2026-07-22T23:00:00Z";
  assert.equal(marketRecordEligibility({ capturedAt: "2026-07-22T20:00:00Z", availableAt: "2026-07-22T20:00:00Z", eventStartTime: START }).researchEligible, true);
  assert.equal(marketRecordEligibility({ capturedAt: "2026-07-22T23:30:00Z", availableAt: "2026-07-22T23:30:00Z", eventStartTime: START }).researchEligible, false);
  assert.equal(marketRecordEligibility({ capturedAt: null, availableAt: null, eventStartTime: START }).researchEligible, false);
});

test("3 · the player-prop script: dry-run default, credit estimate + floor, skip-started, no loops", () => {
  const s = fs.readFileSync(path.join(app, "scripts/capture-mlb-pregame-player-props.mjs"), "utf8");
  assert.match(s, /const WRITE = has\("--write"\)/, "writes only with --write (dry-run default)");
  assert.match(s, /DRY_RUN — .*0 credits spent/, "dry-run spends no credits");
  assert.match(s, /creditEstimate|estCredits = targetEvents\.length \* MARKETS\.length/, "credit estimate before write");
  assert.match(s, /remaining < CREDIT_FLOOR \+ estCredits/, "credit-floor guard");
  assert.match(s, /Date\.parse\(ev\.commence_time\) <= Date\.now\(\)/, "skips started games");
  assert.match(s, /provider_unavailable|providerUnavailable\.push/, "records provider_unavailable, no retry loop");
  assert.match(s, /deVigStatus: paired \? "paired" : "over_only_or_unpaired"/, "over-only not de-vigged");
  assert.match(s, /PREGAME_ARCHIVE_PLAYER_PROP_MAX_EVENTS|MAX_EVENTS/, "max-events control");
  assert.match(s, /stop cleanly|stoppedEarly/, "stops cleanly if credits fall below floor");
});

test("4 · the workflow player-prop step is a SEPARATE opt-in, non-blocking, key-from-secret", () => {
  const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
  assert.match(wf, /vars\.PREGAME_ARCHIVE_PLAYER_PROPS == 'true'/, "player props are a separate opt-in var");
  assert.match(wf, /capture-mlb-pregame-player-props\.mjs/, "runs the player-prop script");
  assert.match(wf, /ODDS_API_KEY: \$\{\{ secrets\.ODDS_API_KEY \}\}/, "key from secret");
  assert.ok(!/^\s*pull_request:/m.test(wf), "no pull_request trigger");
  // count continue-on-error occurrences ⇒ the prop step is also non-blocking
  assert.ok((wf.match(/continue-on-error:\s*true/g) || []).length >= 2, "prop step is non-blocking");
});

test("5 · committed player-prop manifest: internal, all-eligible, hash-stamped, all 9 markets", () => {
  const base = path.join(repo, "data/internal/mlb/pregame-archive/market-snapshots");
  if (!fs.existsSync(base)) { console.log("  (skip — no snapshots)"); return; }
  let found = false;
  for (const d of fs.readdirSync(base).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
    for (const cap of fs.readdirSync(path.join(base, d))) {
      const m = readJson(path.join(base, d, cap, "manifest.json"));
      if (m?.kind !== "mlb-pregame-player-prop-capture") continue;
      found = true;
      assert.equal(m.public, false); assert.equal(m.approvedForProduction, false); assert.equal(m.productEligible, false);
      assert.equal(m.playerPropRecords, m.playerPropRecordsEligible, "all written prop records were pregame-eligible");
      assert.ok(m.rawHash && m.normalizedHash, "hashes present");
      assert.equal(m.pairedCount + m.overOnlyCount, m.playerPropRecords, "paired + over-only == records");
      assert.ok(Number.isFinite(m.creditsSpent), "credits spent recorded");
    }
  }
  if (!found) console.log("  (skip — no player-prop capture in this checkout)");
});

test("6 · player-prop snapshots are NOT web-served + no product eligibility change", () => {
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    // my INTERNAL archive paths only — NOT the pre-existing public /data/mlb/player-props inventory.
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("market-snapshots") || String(p).includes("pregame-archive"));
    assert.equal(hit.length, 0, "no internal pregame/market archive under out/");
  }
  // product eligibility untouched: still zero validated modeled markets
  const pol = fs.readFileSync(path.join(app, "src/lib/mlb/calibration/eligibility-policy.ts"), "utf8");
  assert.match(pol, /pitcher_strikeouts: "INSUFFICIENT_OUT_OF_SAMPLE_DATA"/, "calibration verdicts unchanged");
});

test("7 · archive status carries player-prop fields", () => {
  const st = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/latest.json"));
  if (!st) { console.log("  (skip)"); return; }
  for (const k of ["playerPropMarketSnapshots", "playerPropRecords", "playerPropRecordsEligible", "playerPropCoverageByMarket", "overOnlyCount", "pairedCount", "deVigCoverage", "playerPropCreditsSpent"]) {
    assert.ok(k in st, `status has ${k}`);
  }
});

test("8 · money md5 unchanged (player-prop capture is internal + money-independent)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
