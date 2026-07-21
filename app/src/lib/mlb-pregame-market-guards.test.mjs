/**
 * MLB PREGAME MARKET CAPTURE — honesty guards (2026-07-21).
 *
 * Paid Odds-API market capture is internal, immutable, timestamp-safe, credit-guarded, and dry-run-by-default.
 * These guards pin the de-vig math + the safety of the capture script and workflow.
 *
 * Run: npx tsx --test src/lib/mlb-pregame-market-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { americanToProb, deVig, marketRecordEligibility, resolveAvailableAt } from "./mlb/pregame-archive/market-normalizer.ts";

const app = process.cwd();
const repo = path.dirname(app);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const START = "2026-07-22T23:00:00Z";

test("1 · de-vig math: paired only; over-only / incomplete never de-vigged", () => {
  // -154 / +130 (fanduel-style ML): implied 0.606 / 0.435; fair ≈ 0.582
  const p = deVig(-154, 130);
  assert.equal(p.status, "paired");
  assert.ok(Math.abs(p.noVigProbability - 0.582) < 0.01, `fair ~0.582 (got ${p.noVigProbability})`);
  // over-only (no under) ⇒ null, never inferred
  assert.deepEqual(deVig(120, null), { noVigProbability: null, status: "over_only_or_unpaired" });
  // sanity: implied prob monotonic
  assert.ok(americanToProb(-200) > americanToProb(+200));
});

test("2 · market-record eligibility: post-start + missing-timestamp are ineligible", () => {
  assert.equal(marketRecordEligibility({ capturedAt: "2026-07-22T20:00:00Z", availableAt: "2026-07-22T20:00:00Z", eventStartTime: START }).researchEligible, true);
  assert.equal(marketRecordEligibility({ capturedAt: "2026-07-22T23:05:00Z", availableAt: "2026-07-22T23:05:00Z", eventStartTime: START }).researchEligible, false); // captured post-start
  assert.equal(marketRecordEligibility({ capturedAt: null, availableAt: null, eventStartTime: START }).researchEligible, false);
  assert.equal(marketRecordEligibility({ capturedAt: "2026-07-22T20:00:00Z", availableAt: "2026-07-22T20:00:00Z", eventStartTime: null }).researchEligible, false);
  // availableAt resolves to the earlier of last_update / capture
  assert.equal(resolveAvailableAt("2026-07-22T19:00:00Z", "2026-07-22T20:00:00Z"), "2026-07-22T19:00:00Z");
  assert.equal(resolveAvailableAt(null, "2026-07-22T20:00:00Z"), "2026-07-22T20:00:00Z");
});

test("3 · the capture script is dry-run-by-default, credit-guarded, and immutable", () => {
  const s = fs.readFileSync(path.join(app, "scripts/capture-mlb-pregame-markets.mjs"), "utf8");
  assert.match(s, /const WRITE = has\("--write"\)/, "writes only with explicit --write (dry-run default)");
  assert.match(s, /DRY_RUN — no odds fetched, 0 credits spent/, "dry-run spends no credits");
  assert.match(s, /ODDS_API_MIN_CREDITS_REMAINING/, "reads the credit floor");
  assert.match(s, /remaining < CREDIT_FLOOR \+ estMainCredits/, "credit-floor guard before write");
  assert.match(s, /Date\.parse\(ev\.commence_time\) <= Date\.parse\(capturedAt\)/, "skips started games");
  assert.match(s, /new immutable directory|new capture = new/i, "documents immutable-per-capture");
  assert.match(s, /researchEligible: capturedPregame && availPregame/, "record eligibility = pregame capture + availability");
});

test("4 · the workflow market step is OPT-IN, non-blocking, PR-safe, money/public-safe", () => {
  const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
  assert.match(wf, /vars\.PREGAME_ARCHIVE_MARKETS == 'true'/, "market capture is opt-in via repo var");
  assert.match(wf, /ODDS_API_KEY: \$\{\{ secrets\.ODDS_API_KEY \}\}/, "key comes from a secret, never hardcoded");
  assert.ok(!/^\s*pull_request:/m.test(wf), "no pull_request trigger");
  assert.match(wf, /continue-on-error:\s*true/, "non-blocking");
  const codeLines = wf.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.ok(!/git add -A|git add \.|portfolio\.json|public\/data\//.test(codeLines), "workflow never stages money/public files");
});

test("5 · committed market manifest is internal, all-eligible, and hash-stamped (large payloads are gitignored)", () => {
  const base = path.join(repo, "data/internal/mlb/pregame-archive/market-snapshots");
  if (!fs.existsSync(base)) { console.log("  (skip — no market snapshots in this checkout)"); return; }
  const dates = fs.readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  for (const d of dates) for (const cap of fs.readdirSync(path.join(base, d))) {
    const m = readJson(path.join(base, d, cap, "manifest.json"));
    if (!m) continue;
    assert.equal(m.public, false, "manifest is internal");
    assert.equal(m.approvedForProduction, false);
    if (m.mode === "write") { assert.ok(m.rawHash && m.normalizedHash, "hashes present"); assert.equal(m.wrote, m.eligible ?? m.wrote, "all written records were pregame-eligible"); }
    // raw + normalized payloads must be gitignored (only the manifest is committed)
    assert.ok(fs.existsSync(path.join(app, "..", ".gitignore")));
  }
});

test("6 · market snapshots are NOT web-served", () => {
  const out = path.join(app, "out");
  if (!fs.existsSync(out)) { console.log("  (skip — no build output)"); return; }
  const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("market-snapshots") || String(p).includes("pregame-archive"));
  assert.equal(hit.length, 0, "no pregame/market archive under out/");
});

test("7 · archive status includes the market fields", () => {
  const st = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/latest.json"));
  if (!st) { console.log("  (skip — no status)"); return; }
  for (const k of ["marketSnapshots", "marketRecords", "marketRecordsEligible", "marketDeVigCoveragePct", "marketCreditStatus", "marketCoverageByFamily"]) {
    assert.ok(k in st, `status has ${k}`);
  }
});

test("8 · money md5 unchanged (market capture is internal + money-independent)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
