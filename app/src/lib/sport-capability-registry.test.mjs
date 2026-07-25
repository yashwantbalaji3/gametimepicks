/**
 * SPORT CAPABILITY REGISTRY GUARDS (Sprint 019 · Phase 1).
 *
 * These are PRODUCT INVARIANTS, not implementation assumptions. They deliberately do not assert "NBA is X"
 * as a fact to be memorised — they assert that whatever a sport's state is, it is justified by evidence that
 * exists on disk, that permissions follow from state alone, and that the registry fails closed.
 *
 * The strongest test here is the last one: it re-derives NBA's and UFC's states from the repo's OWN status
 * artifacts and requires the registry to agree. That is what stops the registry drifting into another
 * confidently-wrong label like the `level: "full"` it replaced.
 *
 * Run: npx tsx --test src/lib/sport-capability-registry.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  SPORT_CAPABILITIES,
  capabilityOf,
  capabilityState,
  canEnterPredictionProducts,
  canShowLiveProjections,
  resultsMode,
  isPubliclyListed,
  FULL_MODEL_SPORTS,
  CAPABILITY_BADGE,
} from "./sport-capability-registry.ts";

const REPO = path.join(process.cwd(), "..");
const STATES = ["FULL_MODEL", "HISTORICAL_ONLY", "RESEARCH_ONLY", "SCAFFOLD_ONLY", "DISABLED"];

test("fails CLOSED — anything unrecognised is DISABLED, never assumed capable", () => {
  for (const bad of ["", null, undefined, "cricket-league-that-does-not-exist", "NFL2", "  "]) {
    assert.equal(capabilityState(bad), "DISABLED", `${JSON.stringify(bad)} must fail closed`);
    assert.equal(canEnterPredictionProducts(bad), false);
    assert.equal(canShowLiveProjections(bad), false);
    assert.equal(resultsMode(bad), "none");
    assert.equal(isPubliclyListed(bad), false);
  }
});

test("lookup is case/whitespace insensitive so a caller cannot accidentally fail closed", () => {
  assert.equal(capabilityState("MLB"), capabilityState("mlb"));
  assert.equal(capabilityState("  Mlb  "), capabilityState("mlb"));
});

test("every sport declares a REASON and EVIDENCE, and the evidence actually exists", () => {
  for (const c of SPORT_CAPABILITIES) {
    assert.ok(STATES.includes(c.state), `${c.key}: state must be one of the declared states`);
    assert.ok(c.reason && c.reason.length > 40, `${c.key}: needs a real reason, not a label`);
    assert.ok(c.evidence.length > 0, `${c.key}: a status nobody can audit is just an opinion`);
    for (const rel of c.evidence) {
      assert.ok(fs.existsSync(path.join(REPO, rel)), `${c.key}: cited evidence ${rel} does not exist`);
    }
  }
});

test("permissions derive from STATE alone — no per-sport exceptions can creep in", () => {
  for (const c of SPORT_CAPABILITIES) {
    const full = c.state === "FULL_MODEL";
    assert.equal(canEnterPredictionProducts(c.key), full, `${c.key}: prediction products = FULL_MODEL only`);
    assert.equal(canShowLiveProjections(c.key), full, `${c.key}: live projections = FULL_MODEL only`);
    assert.equal(
      resultsMode(c.key),
      full ? "live" : c.state === "HISTORICAL_ONLY" ? "archive" : "none",
      `${c.key}: results mode follows state`,
    );
    assert.equal(isPubliclyListed(c.key), c.state !== "DISABLED");
  }
  // The source file must not special-case a sport key inside a permission function.
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "sport-capability-registry.ts"), "utf8");
  const perms = src.slice(src.indexOf("DERIVED PERMISSIONS"));
  for (const c of SPORT_CAPABILITIES) {
    assert.ok(!new RegExp(`["']${c.key}["']`).test(perms), `permission logic must not name "${c.key}"`);
  }
});

test("only FULL_MODEL sports may enter official prediction products", () => {
  const allowed = SPORT_CAPABILITIES.filter((c) => canEnterPredictionProducts(c.key)).map((c) => c.key);
  assert.deepEqual([...allowed].sort(), [...FULL_MODEL_SPORTS].sort());
  for (const k of allowed) assert.equal(capabilityState(k), "FULL_MODEL");
  // A sport with real settled history is still NOT eligible to publish forward-looking picks.
  for (const c of SPORT_CAPABILITIES.filter((c) => c.state === "HISTORICAL_ONLY")) {
    assert.equal(canEnterPredictionProducts(c.key), false, `${c.key}: history is not a licence to predict`);
    assert.equal(resultsMode(c.key), "archive", `${c.key}: its record is still publishable, as an archive`);
  }
});

test("badge text never promises more than the state supports", () => {
  for (const s of STATES) assert.ok(CAPABILITY_BADGE[s], `${s} has badge text`);
  // Only FULL_MODEL may mention predictions/simulations in its badge.
  for (const s of STATES.filter((s) => s !== "FULL_MODEL")) {
    assert.ok(
      !/prediction|simulation|projection|parlay/i.test(CAPABILITY_BADGE[s]),
      `${s} badge must not imply predictive capability: "${CAPABILITY_BADGE[s]}"`,
    );
  }
});

test("the registry AGREES with the repo's own status artifacts — it cannot drift into a wrong label", () => {
  const read = (rel) => {
    const p = path.join(REPO, rel);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
  };

  // NBA: the recommendation file is the authority. If it ever says publicApproved, this test forces the
  // registry to be revisited rather than silently lagging.
  const nba = read("status/nba-first-market-recommendation.json");
  if (nba) {
    assert.equal(nba.publicApproved ?? false, false, "fixture check: NBA is still not publicly approved");
    assert.notEqual(capabilityState("nba"), "FULL_MODEL", "NBA cannot be FULL_MODEL while unapproved");
    if (nba.classification === "HISTORICAL_ONLY") {
      assert.equal(capabilityState("nba"), "HISTORICAL_ONLY", "registry must match the classification file");
    }
  }

  // UFC: the graduation decision is the authority.
  const ufc = read("status/ufc-graduation-decision.json");
  if (ufc) {
    assert.equal(ufc.genuineModel ?? false, false, "fixture check: UFC has no genuine model");
    assert.notEqual(capabilityState("ufc"), "FULL_MODEL", "UFC cannot be FULL_MODEL without a genuine model");
    if (String(ufc.decision ?? "").includes("SCAFFOLD")) {
      assert.equal(capabilityState("ufc"), "SCAFFOLD_ONLY", "registry must match the graduation decision");
    }
  }

  // MLB: FULL_MODEL requires the artifacts that justify it to actually be on disk.
  if (capabilityState("mlb") === "FULL_MODEL") {
    for (const dir of ["app/public/data/mlb/full-game-simulations", "app/public/data/mlb/predictions"]) {
      const files = fs.readdirSync(path.join(REPO, dir)).filter((f) => f.endsWith(".json"));
      assert.ok(files.length > 0, `MLB is FULL_MODEL, so ${dir} must contain real artifacts`);
    }
  }
});
