/**
 * Closure-packet guards (Program 196 · Release A).
 *
 * Two families. DETERMINISM: same inputs, identical bytes — twice, compared as strings, because
 * "deterministic" claimed without a byte comparison is a mood. CONTRADICTIONS: every guard is fed
 * a synthetic contradiction and must fire. A guard that has never fired is an intention; each of
 * these encodes a failure the repo has already had (green-without-artifact, fought-card-as-next,
 * stale count quoted as live, internal surface leaking public).
 *
 * Run: npx tsx --test src/lib/launch/closure-packets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildClosurePackets, executionQueue, packetContradictions, stableStringify,
  classifyBlocker, derivePublicTier, RELEASE_TRAIN_ORDER,
} from "./closure-packets.mjs";
import { GATE_STAGES } from "../sports/sport-gate.mjs";
import { SPORT_ASSESSMENTS } from "../sports/sport-assessments.mjs";
import { readCurrentEvents, readProductReceipt, readRouteInventory, readEplCalibrationAuthority } from "./closure-packet-sources.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/* ── Fixtures: a minimal, fully healthy five-sport world ─────────────────────────────────────── */

const NOW = "2026-08-24T02:00:00Z";

const stagesAll = (status) => Object.fromEntries(GATE_STAGES.map((g) => [g.id, { status, evidence: "fixture", blocker: null }]));

function fixtureInputs(overrides = {}) {
  const assessments = Object.fromEntries(RELEASE_TRAIN_ORDER.map((s) => [s, { inSeason: true, stages: stagesAll("PROVEN") }]));
  // one non-proven world for nba so tiers vary: publication unproven → NOT_PUBLIC, no route claims
  assessments.nba = { inSeason: false, stages: stagesAll("UNPROVEN") };
  const routeInventory = {
    routes: [
      { route: "/mlb", classification: "public" }, { route: "/epl", classification: "public" },
      { route: "/nfl", classification: "public" }, { route: "/ufc", classification: "public" },
    ],
  };
  const currentEvents = Object.fromEntries(RELEASE_TRAIN_ORDER.map((s) => [s, { state: "CURRENT", detail: "fixture", eventUtc: null, artifactStamp: NOW }]));
  return {
    assessments, tickets: [], watches: [], founderGates: [],
    currentEvents, productReceipt: { date: "2026-08-23", products: [] },
    routeInventory, nowIso: NOW, ...overrides,
  };
}

/* ── Determinism ─────────────────────────────────────────────────────────────────────────────── */

test("same inputs produce identical bytes, twice", () => {
  const a = stableStringify(buildClosurePackets(fixtureInputs()));
  const b = stableStringify(buildClosurePackets(fixtureInputs()));
  assert.equal(a, b);
});

test("stableStringify sorts object keys but preserves array order", () => {
  assert.equal(stableStringify({ b: 1, a: [{ z: 1, y: 2 }, 3] }, 0), '{"a":[{"y":2,"z":1},3],"b":1}');
});

test("nowIso is an input — building without it refuses", () => {
  assert.throws(() => buildClosurePackets({ ...fixtureInputs(), nowIso: undefined }), /clock/);
});

/* ── Derivations ─────────────────────────────────────────────────────────────────────────────── */

test("blocker classes derive from the assessment's own words", () => {
  assert.equal(classifyBlocker({ status: "PROVEN" }), "NONE");
  assert.equal(classifyBlocker({ status: "UNPROVEN", evidence: "UNPROVEN and not promotable by engineering: it needs matches played." }), "REALITY_GATED");
  assert.equal(classifyBlocker({ status: "UNPROVEN", evidence: "REALITY_GATED, not backlog." }), "REALITY_GATED");
  assert.equal(classifyBlocker({ status: "BLOCKED_EXTERNAL", blocker: "needs a founder decision to invest" }), "FOUNDER_DECISION");
  assert.equal(classifyBlocker({ status: "BLOCKED_EXTERNAL", blocker: "provider terms unresolved" }), "BLOCKED_EXTERNAL");
  assert.equal(classifyBlocker({ status: "PARTIAL", evidence: "cadence receipt 1/2" }), "ENGINEERING_READY");
  // P198: a PARTIAL whose own words hand the move to the founder is not engineering-ready…
  assert.equal(classifyBlocker({ status: "PARTIAL", evidence: "opens when the actives design cap (a founder rights decision) lands" }), "FOUNDER_DECISION");
  assert.equal(classifyBlocker({ status: "PARTIAL", evidence: "requires a founder decision to authorize NBA scope" }), "FOUNDER_DECISION");
  // …and reality outranks founder when both appear: a decision cannot conjure the games.
  assert.equal(classifyBlocker({ status: "PARTIAL", evidence: "it needs games, not code — with the founder lineup decision named beside it" }), "REALITY_GATED");
});

test("public tier derives from stages and only from stages", () => {
  const s = stagesAll("PROVEN");
  assert.equal(derivePublicTier(s), "LIVE_ELIGIBLE");
  assert.equal(derivePublicTier({ ...s, publication: { status: "UNPROVEN" } }), "NOT_PUBLIC");
  assert.equal(derivePublicTier({ ...s, calibration: { status: "UNPROVEN" }, model: { status: "UNPROVEN" } }), "SCHEDULE_LIVE");
  assert.equal(derivePublicTier({ ...s, calibration: { status: "UNPROVEN" } }), "PUBLIC_BETA_MODEL");
  assert.equal(derivePublicTier({ ...s, calibration: { status: "UNPROVEN" }, publication: { status: "PARTIAL" } }), "RESEARCH_LAB");
});

/* ── Contradiction guards — every one must FIRE on a synthetic contradiction ─────────────────── */

const healthyPacket = () => buildClosurePackets(fixtureInputs()).sports.mlb;
const routeSet = new Set(["/mlb", "/epl", "/nfl", "/ufc"]);

test("C1 · tampered counts fail (COUNT_DRIFT) and a hand-typed pct fails (PCT_HAND_WRITTEN)", () => {
  const p = healthyPacket();
  const drift = { ...p, counts: { ...p.counts, proven: p.counts.proven - 1 } };
  assert.ok(packetContradictions(drift, { publicRouteSet: routeSet }).some((c) => c.code === "COUNT_DRIFT"));
  const pct = { ...p, counts: { ...p.counts, pct: 97 } };
  assert.ok(packetContradictions(pct, { publicRouteSet: routeSet }).some((c) => c.code === "PCT_HAND_WRITTEN"));
});

test("C2 · a tier the stages do not support fails (TIER_VS_STAGES) — a page cannot promote a model", () => {
  const p = buildClosurePackets(fixtureInputs()).sports.nba; // NOT_PUBLIC world
  const promoted = { ...p, publicClaims: { ...p.publicClaims, tier: "LIVE_ELIGIBLE" } };
  assert.ok(packetContradictions(promoted, { publicRouteSet: routeSet }).some((c) => c.code === "TIER_VS_STAGES"));
});

test("C3 · claiming a route the inventory does not class public fails (INTERNAL_ROUTE_IN_PUBLIC_CLAIMS)", () => {
  const p = healthyPacket();
  const leak = { ...p, publicClaims: { ...p.publicClaims, routes: [...p.publicClaims.routes, "/launch"] } };
  assert.ok(packetContradictions(leak, { publicRouteSet: routeSet }).some((c) => c.code === "INTERNAL_ROUTE_IN_PUBLIC_CLAIMS"));
});

test("C4 · a product lane claiming ACTIVE with no dated receipt fails", () => {
  const p = healthyPacket();
  const bad = { ...p, products: [{ lane: "bank-builder", state: "ACTIVE", asOf: null, source: null }] };
  assert.ok(packetContradictions(bad, { publicRouteSet: routeSet }).some((c) => c.code === "ACTIVE_WITHOUT_CURRENT_RECEIPT"));
});

test("C5 · settled rows exceeding frozen pre-event records fail (SETTLED_WITHOUT_FROZEN)", () => {
  const p = healthyPacket();
  const bad = { ...p, settlementSummary: { settledRows: 10, rowsWithFrozenForecast: 8 } };
  assert.ok(packetContradictions(bad, { publicRouteSet: routeSet }).some((c) => c.code === "SETTLED_WITHOUT_FROZEN"));
});

test("C6 · a green workflow with no produced artifact fails (GREEN_WORKFLOW_WITHOUT_ARTIFACT)", () => {
  const p = healthyPacket();
  const bad = { ...p, workflowReceipts: [{ workflow: "nightly-settle", lastRunConclusion: "success", artifactStamp: null }] };
  assert.ok(packetContradictions(bad, { publicRouteSet: routeSet }).some((c) => c.code === "GREEN_WORKFLOW_WITHOUT_ARTIFACT"));
});

test("C7 · a learning artifact that disagrees with the ledger recount fails (STALE_CALIBRATION_COUNT)", () => {
  // The '0 of 30 paired quoted while the artifact said 3' failure, made impossible to repeat quietly.
  const p = healthyPacket();
  const stale = {
    ...p,
    liveCalibration: {
      source: "learning-artifact", generatedAt: "2026-08-21T00:00:00Z",
      artifactCounts: { graded: 1, pairedWithMarket: 0, minSampleForComparison: 30 },
      ledgerRecount: { graded: 8, paired: 3 },
    },
  };
  assert.ok(packetContradictions(stale, { publicRouteSet: routeSet }).some((c) => c.code === "STALE_CALIBRATION_COUNT"));
  const fresh = { ...stale, liveCalibration: { ...stale.liveCalibration, artifactCounts: { graded: 8, pairedWithMarket: 3 } } };
  assert.equal(packetContradictions(fresh, { publicRouteSet: routeSet }).filter((c) => c.code === "STALE_CALIBRATION_COUNT").length, 0);
});

test("the builder REFUSES (throws, listing every contradiction) rather than rendering warnings", () => {
  const inputs = fixtureInputs();
  inputs.assessments.mlb.stages.publication = { status: "PROVEN", evidence: "fixture", blocker: null };
  // force a leak through the real path: mlb claims /mlb but the inventory no longer classes it public
  inputs.routeInventory = { routes: [{ route: "/mlb", classification: "internal" }, { route: "/epl", classification: "public" }, { route: "/nfl", classification: "public" }, { route: "/ufc", classification: "public" }] };
  assert.throws(() => buildClosurePackets(inputs), (err) => {
    assert.match(err.message, /refuses to build/);
    assert.ok(err.contradictions.some((c) => c.code === "INTERNAL_ROUTE_IN_PUBLIC_CLAIMS"));
    return true;
  });
});

/* ── The execution queue ─────────────────────────────────────────────────────────────────────── */

test("queue is dependency-ordered by release train then stage order; gated work never enters engineering", () => {
  const inputs = fixtureInputs();
  inputs.assessments.epl.stages.calibration = { status: "UNPROVEN", evidence: "it needs matches played.", blocker: null };
  inputs.assessments.epl.stages.data = { status: "PARTIAL", evidence: "corpus fixture", blocker: null };
  inputs.assessments.ufc.stages.schedule = { status: "PARTIAL", evidence: "cadence fixture", blocker: null };
  inputs.assessments.nba.stages.calibration = { status: "BLOCKED_EXTERNAL", evidence: null, blocker: "founder decision to invest" };
  const q = executionQueue(buildClosurePackets(inputs));

  // ufc precedes epl (release-train order), and within a sport stages keep gate order
  const engineeringKeys = q.engineering.map((x) => `${x.sport}:${x.stage}`);
  assert.ok(engineeringKeys.indexOf("ufc:schedule") < engineeringKeys.indexOf("epl:data"));
  assert.ok(!engineeringKeys.includes("epl:calibration"), "reality-gated work is a watch, not a queue item");
  assert.ok(q.realityWatch.some((x) => x.sport === "epl" && x.stage === "calibration"));
  assert.ok(q.founderQueue.some((x) => x.sport === "nba" && x.stage === "calibration"));
  assert.ok(q.engineering.every((x, i) => x.order === i + 1), "order is generated, dense, 1-based");
});

/* ── Real committed sources — structural invariants only (data moves daily; shape must not) ──── */

test("real sources build without contradiction: five sports, counts reconcile, MLB is the reference", () => {
  const appDir = APP; // three levels up from src/lib/launch IS the app root
  const result = buildClosurePackets({
    assessments: SPORT_ASSESSMENTS,
    tickets: [], watches: [], founderGates: [],
    currentEvents: readCurrentEvents({ appDir, nowIso: NOW }),
    productReceipt: readProductReceipt({ appDir }),
    routeInventory: readRouteInventory({ appDir }),
    // The committed learning artifact must agree with a fresh ledger recount — C7 makes this
    // build throw the day the nightly report stops running while matches keep settling.
    calibrationAuthorities: { epl: readEplCalibrationAuthority({ appDir }) },
    nowIso: NOW,
  });
  assert.deepEqual(Object.keys(result.sports).sort(), ["epl", "mlb", "nba", "nfl", "ufc"]);
  for (const p of Object.values(result.sports)) {
    assert.equal(p.counts.applicable, 12);
    assert.equal(p.counts.proven + p.counts.partial + p.counts.unproven + p.counts.blocked, 12);
    assert.ok(["CURRENT", "STALE", "MISSING"].includes(p.currentEvent.state));
  }
  assert.equal(result.sports.mlb.counts.pct, 100, "MLB is the 12/12 reference lane");
  assert.equal(result.sports.nba.publicClaims.routes.length, 0, "NBA claims no public surface until Release F makes one deliberately");
  const q = executionQueue(result);
  /*
   * P198 restatement: "engineering must be non-empty while sports sit unproven" was true until
   * the day queue-zero was legitimately earned — every remaining gap typed reality or founder.
   * The claim that can never expire is CONSERVATION: every non-proven stage appears in exactly
   * one of the three queues, so an empty engineering queue means the others hold the gaps, not
   * that the generator went blind.
   */
  const queued = [...q.engineering, ...q.realityWatch, ...q.founderQueue].map((x) => `${x.sport}:${x.stage}`);
  const gaps = Object.values(result.sports).flatMap((p) => p.stages.filter((st) => st.status !== "PROVEN").map((st) => `${p.sport}:${st.id}`));
  assert.deepEqual(queued.sort(), gaps.sort(), "every non-proven stage sits in exactly one queue — nothing vanishes");
});
