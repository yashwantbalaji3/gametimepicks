/**
 * Adoption-gate integrity (v1.7 Phase 7.3). The real `adoptionGate` is exercised, never a copy of it:
 * an insufficient sample, a hot streak, a guard failure, survival below control and thin publication each
 * block on their own; the gate returns a state and reasons only. A source scan then proves that neither
 * the shadow modules nor the shadow scripts import or write the live selection owner.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adoptionGate, policyMetrics, ADOPTION_MIN_DECIDED, SHADOW_POLICIES } from "./shadow.mjs";
import { LIVE_POLICY, POLICIES } from "./policies.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const control = { decided: 40, survivalPerStep: 0.5, placed: 40 };
const rows = (won, lost, extra = []) => [...Array.from({ length: won }, () => ({ status: "won", step: 1, jointP: 0.4 })), ...Array.from({ length: lost }, () => ({ status: "lost", step: 1, jointP: 0.4 })), ...extra];

test("insufficient sample: 19 decided lane-days at 100% survival is NOT_YET, and 20 is the first count the floor accepts", () => {
  const nineteen = adoptionGate({ shadow: policyMetrics(rows(19, 0)), control });
  assert.equal(nineteen.state, "NOT_YET");
  assert.match(nineteen.reasons.join(";"), new RegExp(`decided 19 < ${ADOPTION_MIN_DECIDED}`));
  const twenty = adoptionGate({ shadow: policyMetrics(rows(20, 0)), control });
  assert.equal(twenty.state, "ELIGIBLE_FOR_ADOPTION_RECEIPT", "the floor is inclusive at 20 with every other condition met");
  assert.equal(ADOPTION_MIN_DECIDED, 20, "the preregistered floor is 20 (docs/V17_SELECTOR_PREREGISTRATION.md §6)");
});

test("a hot streak alone cannot pass: 6-0 is NOT_YET; pending and no-play lane-days never count as decided", () => {
  const m = policyMetrics(rows(6, 0, [{ status: "pending", step: 1 }, { status: "pending", step: 1 }, { status: "NO_QUALIFYING_PLAY", reason: "PRICE_UNAVAILABLE", step: 1 }]));
  assert.equal(m.decided, 6); assert.equal(m.survivalPerStep, 1);
  const g = adoptionGate({ shadow: m, control });
  assert.equal(g.state, "NOT_YET");
  assert.match(g.reasons.join(";"), /decided 6 < 20/);
  // Even 30 pending lane-days on top of the streak change nothing: pending is never decided.
  const m2 = policyMetrics(rows(6, 0, Array.from({ length: 30 }, () => ({ status: "pending", step: 1 }))));
  assert.equal(adoptionGate({ shadow: m2, control }).state, "NOT_YET");
});

test("a single guard failure blocks a policy that satisfies every other condition", () => {
  const m = policyMetrics(rows(15, 10));
  assert.equal(adoptionGate({ shadow: m, control }).state, "ELIGIBLE_FOR_ADOPTION_RECEIPT", "control case: 25 decided, 0.6 ≥ 0.5, published 25 ≥ 20");
  const g = adoptionGate({ shadow: m, control, guardFailures: 1 });
  assert.equal(g.state, "NOT_YET");
  assert.deepEqual(g.reasons, ["1 guard failure(s)"]);
});

test("survival below the control blocks; equal survival does not", () => {
  const below = adoptionGate({ shadow: policyMetrics(rows(12, 13)), control });
  assert.equal(below.state, "NOT_YET");
  assert.match(below.reasons.join(";"), /survival 0\.48 < control 0\.5/);
  assert.equal(adoptionGate({ shadow: policyMetrics(rows(15, 15)), control }).state, "ELIGIBLE_FOR_ADOPTION_RECEIPT", "0.5 ≥ 0.5 passes");
  assert.equal(adoptionGate({ shadow: policyMetrics(rows(20, 0)), control: { decided: 40, survivalPerStep: null, placed: 40 } }).state, "NOT_YET", "an unmeasurable control survival blocks — missing is never a number");
});

test("publication below 50% of the control's placed days blocks; exactly 50% passes", () => {
  const ctl = { decided: 40, survivalPerStep: 0.5, placed: 50 };
  const thin = policyMetrics(rows(20, 4)); // 24 placed < 25
  const g = adoptionGate({ shadow: thin, control: ctl });
  assert.equal(g.state, "NOT_YET");
  assert.match(g.reasons.join(";"), /published 24 < 50% of control's 50/);
  assert.equal(adoptionGate({ shadow: policyMetrics(rows(20, 5)), control: ctl }).state, "ELIGIBLE_FOR_ADOPTION_RECEIPT", "25 placed = 50% of 50");
});

test("the gate returns a state, reasons and its inputs — never an instruction, never a new live policy", () => {
  const g = adoptionGate({ shadow: policyMetrics(rows(20, 0)), control });
  assert.deepEqual(Object.keys(g).sort(), ["measured", "note", "reasons", "state"]);
  assert.ok(["NOT_YET", "ELIGIBLE_FOR_ADOPTION_RECEIPT"].includes(g.state));
  assert.match(g.note, /nothing changes on its own/);
  assert.deepEqual(LIVE_POLICY, { "bank-builder": "BB-LEGACY", moonshot: "MS-LEGACY" }, "the live policy map is the frozen control; the gate cannot reach it");
  assert.ok(Object.isFrozen(LIVE_POLICY) && Object.isFrozen(POLICIES) && Object.isFrozen(SHADOW_POLICIES));
});

/**
 * SOURCE SCAN. The live selection owner is app/scripts/activate-daily-portfolio.mjs writing
 * app/public/data/mr-dub/daily-portfolio.json (and the protected money files beside it). No shadow
 * module or shadow script may import that owner, name its output as a write target, or import the live
 * selection-policy module. Reads of the LIVE settlement (mr-dub/settled) are allowed for the report only.
 */
const SHADOW_SOURCES = [
  "src/lib/products/selector/policies.mjs", "src/lib/products/selector/select.mjs", "src/lib/products/selector/shadow.mjs", "src/lib/products/selector/shadow-report.mjs",
  "scripts/products/build-selector-shadow.mjs", "scripts/products/grade-selector-shadow.mjs", "scripts/products/report-selector-shadow.mjs",
];
const LIVE_OWNER_PATTERNS = [
  /daily-portfolio\.json/, /mr-dub\/portfolio\.json/, /bank-builder-locks/, /activate-daily-portfolio/, /selection-policy/, /selection-learning/, /moonshot-lane\.json/, /bank-builder\/active/,
];

test("source scan: no shadow module or script imports or names the live selection owner", () => {
  for (const rel of SHADOW_SOURCES) {
    const src = read(rel);
    for (const re of LIVE_OWNER_PATTERNS) assert.doesNotMatch(src, re, `${rel} must not reference the live owner (${re})`);
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) assert.doesNotMatch(m[1], /activate-daily-portfolio|selection-policy|mr-dub|bank-builder|moonshot/, `${rel} imports ${m[1]}`);
  }
});

test("source scan: every write in the shadow scripts lands under data/internal/products/selector-shadow or docs/V17_SHADOW_REPORT.md", () => {
  for (const rel of SHADOW_SOURCES.filter((r) => r.startsWith("scripts/"))) {
    const src = read(rel);
    const writes = [...src.matchAll(/fs\.writeFileSync\((path\.join\([^)]*\))/g)].map((m) => m[1].trim());
    assert.equal(writes.length, (src.match(/fs\.writeFileSync\(/g) ?? []).length, `${rel}: every write target is a path.join(...) this scan can read`);
    assert.ok(writes.length > 0, `${rel} writes something`);
    for (const target of writes) assert.match(target, /^path\.join\((DIR, |REPO, "docs", "V17_SHADOW_REPORT\.md")/, `${rel} writes only through DIR (selector-shadow) or docs/V17_SHADOW_REPORT.md: ${target}`);
    assert.match(src, /"selector-shadow"\)/, `${rel} pins DIR to selector-shadow`);
  }
  // The pure modules write nothing at all.
  for (const rel of SHADOW_SOURCES.filter((r) => r.startsWith("src/"))) assert.doesNotMatch(read(rel), /writeFileSync|node:fs/, `${rel} is pure`);
});

test("source scan: the workflows run the shadow beside the live generator and never pass --force", () => {
  for (const wf of ["daily-products.yml", "nightly-settle.yml"]) {
    const yml = fs.readFileSync(path.join(REPO, ".github", "workflows", wf), "utf8");
    assert.doesNotMatch(yml, /build-selector-shadow\.mjs[^\n]*--force/, `${wf}: a workflow never rebuilds a published shadow day`);
  }
  const daily = fs.readFileSync(path.join(REPO, ".github", "workflows", "daily-products.yml"), "utf8");
  assert.match(daily, /activate-daily-portfolio\.mjs --date "\$DATE" --apply[\s\S]*build-selector-shadow\.mjs/, "the shadow publishes in the same step, after the live generator");
});
