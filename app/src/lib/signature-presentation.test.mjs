/**
 * Signature presentation proofs (Program 136).
 *
 * The regression that matters is measured, not hypothetical: on 2026-08-05 `/moonshot` rendered
 * "Slate in progress" for lane `moonshot-lane-mlb-2026-07-21` (status "active", generated fifteen
 * days earlier), because the page mapped the lane's self-declared status straight to a surface
 * status without consulting the date.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { presentSignatureState, presentFromArtifact } from "./signature-presentation.mjs";
import { SIGNATURE_STATES } from "./signature-state.mjs";

const TODAY = "2026-08-05";

test("THE REGRESSION · a stale 'active' artifact must not present as live", () => {
  const p = presentFromArtifact({ slateDate: TODAY, artifactDate: "2026-07-21", artifactStatus: "active" });
  assert.equal(p.state, SIGNATURE_STATES.STALE);
  assert.equal(p.isActive, false, "a 15-day-old lane is never active");
  assert.notEqual(p.surfaceStatus, "live", "this is the exact bug: stale rendering as 'Slate in progress'");
  assert.match(p.label, /Not published today/);
  assert.match(p.explanation, /earlier slate/);
});

test("a genuinely current, approved artifact presents as live", () => {
  const p = presentFromArtifact({ slateDate: TODAY, artifactDate: TODAY, artifactStatus: "active" });
  assert.equal(p.state, SIGNATURE_STATES.ACTIVE);
  assert.equal(p.surfaceStatus, "live");
  assert.equal(p.isActive, true);
});

test("a stopped/completed artifact is archived, never live — even dated today", () => {
  for (const s of ["stopped", "completed"]) {
    const p = presentFromArtifact({ slateDate: TODAY, artifactDate: TODAY, artifactStatus: s });
    assert.equal(p.state, SIGNATURE_STATES.ARCHIVED, `${s} must archive`);
    assert.equal(p.isActive, false);
  }
});

test("a current but unapproved candidate awaits approval, not live", () => {
  const p = presentFromArtifact({ slateDate: TODAY, artifactDate: TODAY, artifactStatus: "awaiting", requiresApproval: true });
  assert.equal(p.state, SIGNATURE_STATES.AWAITING_APPROVAL);
  assert.equal(p.isActive, false);
  assert.equal(p.surfaceStatus, "review");
});

test("a missing artifact fails closed to a non-active state", () => {
  for (const bad of [null, undefined, ""]) {
    const p = presentFromArtifact({ slateDate: TODAY, artifactDate: bad, artifactStatus: bad });
    assert.equal(p.isActive, false, `artifactDate=${bad} must not be active`);
    assert.notEqual(p.surfaceStatus, "live");
  }
});

test("a FUTURE-dated artifact is not treated as today's", () => {
  const p = presentFromArtifact({ slateDate: TODAY, artifactDate: "2099-01-01", artifactStatus: "active" });
  assert.equal(p.isActive, false, "a future date is a mismatch, not a licence to look live");
});

test("every derived state has deterministic, user-readable presentation", () => {
  const cases = [
    { slateDate: TODAY, artifactDate: TODAY, archived: false, marketsPosted: true, candidates: 3, qualified: 1, approved: true },
    { slateDate: TODAY, artifactDate: TODAY, archived: false, marketsPosted: true, candidates: 3, qualified: 1, approved: false },
    { slateDate: TODAY, artifactDate: TODAY, archived: false, marketsPosted: true, candidates: 3, qualified: 0, approved: false },
    { slateDate: TODAY, artifactDate: TODAY, archived: false, marketsPosted: false, candidates: 0, qualified: 0, approved: false },
    { slateDate: TODAY, artifactDate: "2026-08-01", archived: false, marketsPosted: true, candidates: 1, qualified: 1, approved: true },
    { slateDate: TODAY, artifactDate: TODAY, archived: true, marketsPosted: true, candidates: 1, qualified: 1, approved: true },
  ];
  const seen = new Set();
  for (const c of cases) {
    const p = presentSignatureState(c);
    seen.add(p.state);
    assert.ok(p.label && p.label.length > 3, `${p.state}: needs a label`);
    assert.ok(p.explanation && p.explanation.length > 12, `${p.state}: needs an explanation`);
    assert.ok(["live", "review", "data_pending", "pregame", "settled"].includes(p.surfaceStatus), `${p.state}: bad surface status`);
    // No state may communicate itself only by colour — the label always carries the meaning.
    assert.doesNotMatch(p.label, /^(green|red|amber)$/i);
  }
  assert.equal(seen.size, 6, "all six states exercised");
});

test("the moonshot page consumes the shared adapter and re-derives nothing", () => {
  const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const page = fs.readFileSync(path.join(APP, "src/app/moonshot/page.tsx"), "utf8");
  assert.match(page, /presentFromArtifact/, "must consume the shared adapter");
  // The exact ternary that caused the bug must not come back.
  assert.doesNotMatch(
    page,
    /lane\?\.status === "active" \? "live"/,
    "the inline availability ternary must not return — freshness has to outrank the artifact's own status",
  );
});
