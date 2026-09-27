#!/usr/bin/env node
/**
 * BANK BUILDER + MOONSHOT · MULTI-SPORT DRY RUN — does NFL actually contribute?
 *
 * ⚠ READ-ONLY AND SHADOW-ONLY. It writes nothing, selects nothing, and touches no live policy. It
 *   runs the EXISTING selector (`selectProduct`) over the EXISTING multi-sport pool
 *   (`buildEligibleLegs`) under both the live policy and its pool-isolated twin, and reports the
 *   difference. No selection or scoring rule is changed — that is the founder's decision, not this
 *   command's.
 *
 * 🔴 WHAT IT EXISTS TO SHOW. The live policies carry `pool: "mlb-only"`, enforced by one line in
 *   select.mjs. That is the structural reason the products are MLB-only. BB-XSPORT / MS-XSPORT are
 *   BB-LEGACY / MS-LEGACY with EXACTLY that one field flipped, so any delta is attributable to the
 *   pool and to nothing else.
 *
 * Usage — npx tsx, not bare node (the contract chain reaches a .ts registry):
 *   npx tsx app/scripts/ops/multisport-selector-dryrun.mjs --date 2026-09-27
 *   npx tsx app/scripts/ops/multisport-selector-dryrun.mjs --date 2026-09-27 --json
 *
 * EXIT CODES — a dry run describes. 0 it ran · 2 it could not run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEligibleLegs } from "../products/build-product-eligible-legs.mjs";
import { selectProduct } from "../../src/lib/products/selector/select.mjs";
import { POLICIES, LIVE_POLICY, policyId } from "../../src/lib/products/selector/policies.mjs";
import { SHADOW_POLICIES } from "../../src/lib/products/selector/shadow.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);
const DATE = arg("--date");
if (!DATE) { console.error("REFUSED: --date <YYYY-MM-DD> is required — this command never guesses a slate"); process.exit(2); }
/*
 * asOf is the slate's OWN publication instant, not a clock and not a convenient noon.
 *
 * ⚠ A GUESSED asOf MANUFACTURES STALENESS. The first version defaulted to `${DATE}T12:00:00Z`, which
 * sits ~19h after the boards captured their prices — so 101 of 102 legs came back STALE and the
 * report blamed the market when the fault was my own clock. The default now reads the slate's real
 * generatedAt, and refuses rather than inventing one.
 */
const ASOF = arg("--now") ?? slatePublicationInstant();
function slatePublicationInstant() {
  const dir = path.join(APP, "public/data/nfl/player-board");
  let best = null;
  try {
    for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
      const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const k = String(b.kickoffUtc ?? "");
      if (!k.startsWith(DATE) && !k.startsWith(nextUtcDay(DATE))) continue;
      if (b.generatedAt && (!best || b.generatedAt > best)) best = b.generatedAt;
    }
  } catch { /* fall through */ }
  if (best) return best;
  console.error(`REFUSED: no slate publication instant found for ${DATE}. Pass --now <ISO> explicitly rather than letting this command invent one — a guessed instant manufactures staleness.`);
  process.exit(2);
}
function nextUtcDay(d) { return new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10); }

let built;
try { built = buildEligibleLegs({ date: DATE, now: ASOF }); }
catch (e) { console.error(`REFUSED: could not assemble the eligible universe — ${e.message}`); process.exit(2); }

const legs = built.artifact?.legs ?? built.legs ?? [];
const manifest = built.manifest ?? null;

/*
 * ⚠ AN OBJECT KEYED BY LANE, NOT AN ARRAY. `selectProduct` reads `positions?.[lane]`, so an array
 * silently resolves to undefined and every lane falls back to its default rung — the run still
 * "works" and quietly answers a different question. Passing the wrong shape here is how the first
 * version of this dry run produced a vacuous "NO".
 */
const positions = { A: { step: 1, state: "ready" }, B: { step: 1, state: "ready" } };

const run = (policyName) => {
  try { return selectProduct({ policyName, legs, positions, asOf: ASOF }); }
  catch (e) { return { error: e.message }; }
};

const PAIRS = [
  { product: "bank-builder", live: LIVE_POLICY["bank-builder"], isolated: "BB-XSPORT" },
  { product: "moonshot", live: LIVE_POLICY.moonshot, isolated: "MS-XSPORT" },
];

const bySport = {}, byFamily = {}, byReason = {};
for (const l of legs) {
  const s = l.sport ?? "?";
  bySport[s] = bySport[s] ?? { total: 0, eligible: 0 };
  bySport[s].total += 1;
  if (l.productEligible) bySport[s].eligible += 1;
  const f = `${s}/${l.marketFamily ?? "?"}`;
  byFamily[f] = byFamily[f] ?? { total: 0, eligible: 0 };
  byFamily[f].total += 1;
  if (l.productEligible) byFamily[f].eligible += 1;
  if (!l.productEligible) for (const r of l.eligibilityReasonCodes ?? []) byReason[r] = (byReason[r] ?? 0) + 1;
}

const results = PAIRS.map((p) => {
  const live = run(p.live), iso = run(p.isolated);
  /* A run that produced no lane at all is a broken adapter, not a NO_PLAY — say so loudly. */
  for (const [label, r] of [["live", live], ["isolated", iso]]) {
    if (r?.error) console.error(`⚠ ${p.product} ${label} selector threw: ${r.error}`);
    else if (!r?.A && !r?.B) console.error(`⚠ ${p.product} ${label} returned no lanes — the adapter is reading the wrong shape, and any comparison below is vacuous`);
  }
  /*
   * ⚠ selectProduct returns { A, B } KEYED BY LANE and its success status is "CARD".
   * Reading a `lanes` array yielded [] for both sides, which compared EQUAL and reported "the pool
   * flip changed nothing" while having evaluated nothing. A comparison of two empty things is not a
   * finding — it is the absence of one.
   */
  const laneSummary = (r) => ["A", "B"].map((lane) => {
    const l = r?.[lane];
    if (!l) return { lane, status: "MISSING", note: "selectProduct returned no result for this lane" };
    return {
      lane, status: l.status ?? "?", reason: l.reason ?? null,
      poolSize: l.receipt?.poolSize ?? null, considered: l.receipt?.considered ?? null,
      american: l.card?.american ?? null, jointP: l.card?.jointP ?? null,
      legs: (l.card?.legs ?? []).map((x) => ({ sport: x.sport, legId: x.legId, p: x.probability ?? x.marketImpliedProbability ?? null })),
    };
  });
  const sportsPicked = (r) => [...new Set(["A", "B"].flatMap((lane) => (r?.[lane]?.card?.legs ?? []).map((x) => x.sport)))].sort();
  return {
    product: p.product,
    livePolicy: p.live, livePolicyId: safeId(p.live), livePool: POLICIES[p.live]?.pool ?? null,
    isolatedPolicy: p.isolated, isolatedPolicyId: safeId(p.isolated), isolatedPool: POLICIES[p.isolated]?.pool ?? null,
    live: laneSummary(live), isolated: laneSummary(iso),
    liveSports: sportsPicked(live), isolatedSports: sportsPicked(iso),
    /* The only number that answers the founder's question. */
    poolFlipChangedSelection: JSON.stringify(laneSummary(live)) !== JSON.stringify(laneSummary(iso)),
  };
});

function safeId(n) { try { return policyId(n); } catch { return null; } }

/* ⚠ DORMANCY IS A FINDING. BB-C3 / MS-C3 already flip the pool and are in no shadow set, so no
   evidence is being collected on cross-sport selection at all. */
const crossSportPolicies = Object.entries(POLICIES).filter(([, v]) => v.pool === "eligible-universe").map(([k]) => k);
const shadowed = new Set([...(SHADOW_POLICIES["bank-builder"]?.shadow ?? []), ...(SHADOW_POLICIES.moonshot?.shadow ?? [])]);
const dormantCrossSport = crossSportPolicies.filter((k) => !shadowed.has(k));

const report = {
  artifact: "multisport-selector-dryrun", readOnly: true, shadowOnly: true,
  date: DATE, asOf: ASOF,
  liveProductPolicies: LIVE_POLICY,
  poolCounts: { totalLegs: legs.length, eligible: legs.filter((l) => l.productEligible).length, bySport, byFamily },
  rejectionsByTypedReason: byReason,
  crossSportPolicies, dormantCrossSport, shadowedPolicies: [...shadowed],
  results,
};

if (has("--json")) { fs.writeSync(1, JSON.stringify(report, null, 1) + "\n"); process.exit(0); }

console.log(`BANK BUILDER + MOONSHOT · MULTI-SPORT DRY RUN · ${DATE} · asOf ${ASOF}`);
console.log("READ-ONLY, SHADOW-ONLY. No live policy touched; the existing selector over the existing pool.\n");

console.log(`POOL · ${legs.length} legs → ${report.poolCounts.eligible} eligible`);
for (const [s, v] of Object.entries(bySport).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${s.padEnd(6)} ${String(v.total).padStart(4)} legs · ${v.eligible} eligible`);
}
console.log("\nby FAMILY:");
for (const [f, v] of Object.entries(byFamily).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${f.padEnd(28)} ${String(v.total).padStart(4)} · ${v.eligible} eligible`);
}
console.log("\nrejections by TYPED reason:");
for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`);

for (const r of results) {
  console.log(`\n── ${r.product.toUpperCase()} ─────────────────────────────────────────────`);
  console.log(`  live     ${r.livePolicy.padEnd(11)} pool=${r.livePool}`);
  console.log(`  isolated ${r.isolatedPolicy.padEnd(11)} pool=${r.isolatedPool}   (differs from live ONLY in pool)`);
  for (const [label, lanes] of [["live", r.live], ["isolated", r.isolated]]) {
    for (const l of lanes) {
      console.log(`    ${label.padEnd(9)} lane ${l.lane ?? "?"} → ${l.status}${l.reason ? ` (${l.reason})` : ""} · pool ${l.poolSize ?? "?"} · considered ${l.considered ?? "?"}`);
      for (const leg of l.legs) console.log(`        ${leg.sport} ${leg.legId} p=${leg.p}`);
    }
  }
  console.log(`  sports selected · live ${JSON.stringify(r.liveSports)} · isolated ${JSON.stringify(r.isolatedSports)}`);
  console.log(`  ⇒ flipping the pool changed the selection: ${r.poolFlipChangedSelection ? "YES" : "NO"}`);
}

console.log(`\ncross-sport policies present: ${crossSportPolicies.join(", ") || "(none)"}`);
console.log(`⚠ DORMANT (in no shadow set, so no evidence is being collected): ${dormantCrossSport.join(", ") || "(none)"}`);
process.exit(0);
