/**
 * RESULTS TRUST CENTER (Chunk 6B, 2026-07-09) — the founder's 13 guarantees.
 *
 * `/results` now LEADS with a single public trust center (Results & Receipts):
 * official paper-card record, open exposure, settlement status, product cards,
 * Bank Builder settled history, and a money-INDEPENDENT MLB model-performance
 * summary — with the deeper optimizer/projection transparency retained in full
 * below a divider. These checks pin: the trust-center structure, every number
 * sourced from canonical artifacts (never hardcoded), open exposure $0 from
 * source, pending kept separate from settled and never called a loss, the raw
 * MLB model-performance section explicitly separated from the 19-14 product
 * record, July-8 grading surfaced, `/mr-dub` still reachable and linked as the
 * Daily Dashboard, the "Parlay Lab" / "Mr. Dub" label cleanup, no banned copy,
 * and the untouched canonical money md5.
 *
 * Source-grep style (the suite runs pre-build) + functional derivations against
 * the real committed artifacts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { getTrustCenterModel } from "./results-trust-center.ts";
import { latestMlbResultDate, getMlbComparisonReport } from "./data-mlb-results.ts";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

const resultsPage = read("src/app/results/page.tsx");
const trustCenter = read("src/components/results/trust-center.tsx");
const loader = read("src/lib/results-trust-center.ts");

const ALL = [resultsPage, trustCenter].join("\n");
// Comment-stripped code — an example in a JSDoc/`//` comment is not a runtime value/label.
const stripComments = (s) =>
  s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const PAGE_CODE = stripComments(resultsPage);
const TC_CODE = stripComments(trustCenter);
const LOADER_CODE = stripComments(loader);
const CODE = [PAGE_CODE, TC_CODE, LOADER_CODE].join("\n");

const stripSafeArea = (s) => s.replace(/safe-area-inset/gi, "").replace(/safe-area/gi, "");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free|easy money/i;

const portfolio = readJson("public/data/mr-dub/portfolio.json");

// ── 1. Trust Center / Results & Receipts concept ─────────────────────────
test("1 · /results leads with the Results & Receipts trust center", () => {
  assert.match(trustCenter, /Results &amp; Receipts/);
  assert.match(trustCenter, /Trust center/i);
  // The page renders <TrustCenter> as its lead child.
  assert.match(resultsPage, /<TrustCenter\s+model=\{getTrustCenterModel\(\)\}/);
  assert.match(resultsPage, /Deeper transparency/);
});

// ── 2. Official record comes from canonical source, not hardcoded ────────
test("2 · official record is sourced from canonical portfolio.json, not hardcoded", () => {
  const m = getTrustCenterModel();
  assert.equal(m.money.record.wins, portfolio.record.wins);
  assert.equal(m.money.record.losses, portfolio.record.losses);
  assert.equal(m.money.bankroll, portfolio.currentBankroll);
  assert.equal(m.money.crown, portfolio.crownBankroll);
  // No hardcoded money literal in the presentational component or loader code.
  assert.doesNotMatch(TC_CODE, /\b19\s*[-–]\s*14\b/);
  assert.doesNotMatch(TC_CODE, /19[,.]?065/);
  assert.doesNotMatch(TC_CODE, /20[,.]?465/);
  assert.doesNotMatch(LOADER_CODE, /19[,.]?065|20[,.]?465/);
});

// ── 3. Open exposure shows $0 from source ────────────────────────────────
test("3 · open exposure is read from source and is currently $0", () => {
  const m = getTrustCenterModel();
  const canonicalExposure = Number(portfolio.totalOpenExposure ?? portfolio.openExposure ?? 0);
  assert.equal(m.money.openExposure, canonicalExposure);
  assert.equal(m.money.openExposure, 0);
  // The component formats exposure through the model, never a hardcoded exposure literal.
  assert.match(TC_CODE, /usd\(money\.openExposure\)/);
});

// ── 4. Pending cards are separate from settled cards ─────────────────────
test("4 · pending and settled are distinct labelled sections", () => {
  assert.match(trustCenter, /Settled/);
  assert.match(trustCenter, /Pending/);
  assert.match(trustCenter, /aria-label="Settled versus pending"/);
});

// ── 5. Pending is never called a loss ────────────────────────────────────
test("5 · pending is explicitly not a loss", () => {
  assert.match(trustCenter, /Pending cards are never shown as losses/i);
  assert.match(trustCenter, /Pending is not a loss/i);
  // Awaiting-next-card is called out as NOT a pending settlement.
  assert.match(trustCenter, /not a pending settlement/i);
});

// ── 6. Raw MLB model-performance is separated from the product record ────
test("6 · MLB model performance is explicitly separated from the 19-14 product record", () => {
  assert.match(trustCenter, /id="mlb-model-performance"/);
  assert.match(trustCenter, /Raw model-performance ledger/i);
  // Explicit "this is NOT part of the … product-card record" separation disclaimer.
  assert.match(trustCenter, /not<\/strong>\s+part of the/i);
  assert.match(trustCenter, /product-card record/i);
});

// ── 7. July-8 MLB model performance appears when the artifact exists ─────
test("7 · latest MLB model-performance (July-8) is surfaced from the real artifact", () => {
  const m = getTrustCenterModel();
  const latest = latestMlbResultDate();
  assert.equal(m.mlb.latestDate, latest);
  if (latest) {
    const report = getMlbComparisonReport(latest);
    assert.ok(m.mlb.daily, "daily MLB perf present when a report exists");
    assert.equal(m.mlb.daily.decisive, report.decisive);
    assert.equal(m.mlb.daily.wins, report.wins);
    assert.equal(m.mlb.daily.losses, report.losses);
    assert.equal(m.mlb.daily.hitRate, report.hitRate);
    // The four MLB markets are surfaced with real hit rates.
    assert.ok(m.mlb.byMarket.length >= 1);
    for (const mk of m.mlb.byMarket) {
      assert.equal(mk.hitRate, report.byMarket[mk.key].hitRate);
    }
  }
});

// ── 8. /mr-dub remains reachable ─────────────────────────────────────────
test("8 · /mr-dub route still exists and is reachable", () => {
  assert.ok(fs.existsSync(path.join(app, "src/app/mr-dub/page.tsx")));
});

// ── 9. /results links to Mr. Dub's Portfolio (/mr-dub) ───────────────────
test("9 · /results links to /mr-dub labelled as Mr. Dub's Portfolio", () => {
  assert.match(trustCenter, /href="\/mr-dub\/"/);
  // Program 139 founder rename: "Daily Dashboard" -> "Mr. Dub's Portfolio" everywhere.
  assert.match(trustCenter, /Mr\. Dub(&rsquo;|’|')s Portfolio/);
});

// ── 10. No Parlay Lab residual in the public /results body ───────────────
test("10 · no 'Parlay Lab' residual in the visible /results body", () => {
  assert.doesNotMatch(PAGE_CODE, /Parlay Lab/);
  assert.doesNotMatch(TC_CODE, /Parlay Lab/);
});

// ── 11. The /mr-dub link uses the full product name, never the bare codename ──
test("11 · the trust-center link says \"Mr. Dub's Portfolio\", never a bare \"Mr. Dub\"", () => {
  // This guard used to forbid "Mr. Dub" entirely on /results, to keep an internal codename off a
  // public surface. Program 139's founder rename makes "Mr. Dub's Portfolio" the product's actual
  // public name, so the rule narrows rather than disappears: the full name is required, and a bare
  // "Mr. Dub" with no "'s Portfolio" after it is still a leaked codename.
  const bare = [...TC_CODE.matchAll(/Mr\.?\s?Dub(?!(&rsquo;|’|')s Portfolio)/gi)].map((m) => m[0]);
  assert.deepEqual(bare, [], "a bare 'Mr. Dub' label leaked onto the trust center");
  assert.match(TC_CODE, /Mr\. Dub(&rsquo;|’|')s Portfolio/, "the full product name must be present");
});

// ── 12. No money md5 change ──────────────────────────────────────────────
test("12 · canonical money md5 is unchanged and unread-mutated", () => {
  const md5 = () =>
    crypto
      .createHash("md5")
      .update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json")))
      .digest("hex");
  const before = md5();
  assert.equal(before, "affe6b21071f2b3be96bb2774eb347c3");
  // Calling the loader must never write.
  getTrustCenterModel();
  assert.equal(md5(), before);
});

// ── 13. No banned copy ───────────────────────────────────────────────────
test("13 · no banned copy in the trust-center surface", () => {
  assert.doesNotMatch(stripSafeArea(TC_CODE), BANNED);
  assert.doesNotMatch(stripSafeArea(LOADER_CODE), BANNED);
});
