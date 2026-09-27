/**
 * THE STRUCTURAL MLB-ONLY LOCK, AND THE POLICY THAT ISOLATES IT.
 *
 * 🔴 THE LIVE PRODUCTS ARE HARD-LOCKED TO ONE SPORT BY A DEFAULT. Both policy factories in
 * `policies.mjs` carry `pool: "mlb-only"`, and `select.mjs` enforces it in one line:
 *
 *     if (policy.pool === "mlb-only") pool = pool.filter((l) => l.sport === "mlb");
 *
 * That — not a normalizer gap, not missing prices — is why Bank Builder and Moonshot are MLB-only.
 * The code already names the alternative in a comment: `"eligible-universe" for cross-sport`.
 *
 * ⚠ BB-C3 AND MS-C3 ALREADY FLIP IT AND CANNOT ANSWER THE QUESTION. Each ALSO adds a `noPlayFloor`,
 * so a delta against the control is attributable to either change. And neither appears in
 * SHADOW_POLICIES, so no evidence is being collected on cross-sport selection at all.
 *
 * BB-XSPORT / MS-XSPORT are the control with EXACTLY ONE FIELD CHANGED, which is what makes a
 * measured delta mean something.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { POLICIES, LIVE_POLICY, policyId } from "./policies.mjs";
import { SHADOW_POLICIES } from "./shadow.mjs";

test("🔴 the LIVE policies are still mlb-only — the lock is real and unchanged", () => {
  /* If this ever flips without a founder decision, the public products silently start selecting
     other sports. The flip is a promotion, not a refactor. */
  assert.equal(POLICIES[LIVE_POLICY["bank-builder"]].pool, "mlb-only");
  assert.equal(POLICIES[LIVE_POLICY.moonshot].pool, "mlb-only");
  assert.deepEqual(LIVE_POLICY, { "bank-builder": "BB-LEGACY", moonshot: "MS-LEGACY" });
});

test("the isolated policies differ from their live twin in EXACTLY one field: pool", () => {
  /*
   * The whole point. A shadow policy that changed two things could not attribute its delta — which
   * is precisely the flaw in BB-C3 / MS-C3.
   */
  for (const [live, iso] of [["BB-LEGACY", "BB-XSPORT"], ["MS-LEGACY", "MS-XSPORT"]]) {
    const a = POLICIES[live], b = POLICIES[iso];
    assert.ok(a && b, `${live}/${iso} must both exist`);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const differing = [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    assert.deepEqual(differing, ["pool"], `${live} vs ${iso} differ in ${JSON.stringify(differing)}`);
    assert.equal(b.pool, "eligible-universe");
  }
});

test("BB-C3 / MS-C3 are NOT a substitute — they change two things at once", () => {
  /* Recorded so nobody reaches for them to answer the pool question. */
  for (const [live, mixed] of [["BB-LEGACY", "BB-C3"], ["MS-LEGACY", "MS-C3"]]) {
    const a = POLICIES[live], b = POLICIES[mixed];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const differing = [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    assert.ok(differing.length > 1, `${mixed} was expected to differ in more than pool; got ${JSON.stringify(differing)}`);
    assert.ok(differing.includes("pool") && differing.includes("noPlayFloor"),
      `${mixed} bundles the pool change with a floor change: ${JSON.stringify(differing)}`);
  }
});

test("every cross-sport policy has a content-addressed id, and adding them did not move existing ids", () => {
  /* policyHash is per-name, so new entries must not perturb the pinned ones. */
  for (const n of ["BB-XSPORT", "MS-XSPORT"]) assert.match(policyId(n), /^[A-Z0-9-]+@[0-9a-f]{12}$/);
  assert.notEqual(policyId("BB-LEGACY"), policyId("BB-XSPORT"));
  assert.notEqual(policyId("MS-LEGACY"), policyId("MS-XSPORT"));
});

test("⚠ the cross-sport policies are DORMANT — that is a finding, not an oversight to paper over", () => {
  /*
   * Being absent from SHADOW_POLICIES means no evidence is accumulating on cross-sport selection.
   * Adding them to the active shadow set is a preregistration change, so it is NOT done here — but
   * the dormancy is asserted so it cannot be mistaken for "already being measured".
   */
  const shadowed = new Set([...(SHADOW_POLICIES["bank-builder"]?.shadow ?? []), ...(SHADOW_POLICIES.moonshot?.shadow ?? [])]);
  const crossSport = Object.entries(POLICIES).filter(([, v]) => v.pool === "eligible-universe").map(([k]) => k);
  assert.ok(crossSport.length >= 4, `expected the cross-sport set, got ${JSON.stringify(crossSport)}`);
  for (const n of crossSport) {
    assert.ok(!shadowed.has(n), `${n} is now shadowed — update this guard and the dry-run's dormancy note deliberately`);
  }
});

test("select.mjs filters on the pool flag, and only on that flag", () => {
  /* If the filter ever hardcodes a sport instead of reading the policy, the isolated policy stops
     isolating anything. */
  const src = fs.readFileSync(new URL("./select.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /policy\.pool === "mlb-only"/, "the sport restriction must come from the policy");
  /* And no other sport filter may exist in the pool construction. */
  const poolBlock = code.slice(code.indexOf("let pool = legs.filter"), code.indexOf("const minLegs"));
  const sportFilters = [...poolBlock.matchAll(/l\.sport === "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(sportFilters, ["mlb"], `unexpected hardcoded sport filters: ${JSON.stringify(sportFilters)}`);
});

test("the dry run reads the selector's REAL return shape", () => {
  /*
   * ⚠ IT DID NOT, AND THE FIRST RUN WAS VACUOUS. `selectProduct` returns { A, B } keyed by lane and
   * its success status is "CARD". The first adapter read a `lanes` array, got [] for both the live
   * and isolated policies, compared them equal, and reported "flipping the pool changed nothing" —
   * having evaluated nothing at all. A comparison of two empty things is the absence of a finding.
   */
  const src = fs.readFileSync(new URL("../../../../scripts/ops/multisport-selector-dryrun.mjs", import.meta.url), "utf8");
  assert.match(src, /\["A", "B"\]\.map\(\(lane\) =>/, "lane results are keyed by lane, not an array");
  assert.doesNotMatch(src, /r\?\.lanes/, "reading a `lanes` array is the vacuous shape");
  assert.match(src, /returned no lanes/, "a missing lane must be reported loudly, not silently compared");
  /* And positions must be the object shape selectProduct actually indexes. */
  assert.match(src, /const positions = \{ A: /, "positions is keyed by lane — an array resolves to undefined");
});

test("the dry run does not guess an evaluation instant", () => {
  /*
   * ⚠ A GUESSED asOf MANUFACTURES STALENESS. Defaulting to noon put the instant ~19h after the
   * boards captured their prices, so 101 of 102 legs came back STALE and the report blamed the
   * market for my clock. With the slate's own generatedAt, STALE drops to 0.
   */
  const src = fs.readFileSync(new URL("../../../../scripts/ops/multisport-selector-dryrun.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /arg\("--now", `\$\{DATE\}T12:00:00Z`\)/, "a noon default is a fabricated instant");
  assert.match(src, /slatePublicationInstant/, "the instant comes from the slate itself");
  assert.match(src, /REFUSED: no slate publication instant/, "and it refuses rather than inventing one");
});
