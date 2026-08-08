/**
 * Evidence-ledger guards (Program 144 · Release A).
 *
 * The ledger's value is what it REFUSES: to coerce a missing source to green, to let freshness
 * soften an incident, or to let two monitors disagree silently. Every case is a synthetic fixture —
 * the contradiction detector is proven on data built to contradict, never by corrupting real
 * artifacts.
 *
 * Run: npx tsx --test src/lib/launch/evidence-ledger.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEvidenceLedger, LEDGER_STATES, severityRank, FRESHNESS_WINDOWS_H } from "./evidence-ledger.mjs";

const NOW = "2026-08-08T04:00:00Z";

const HEALTHY_ADMIN = {
  generatedAt: "2026-08-08T03:00:00Z",
  workflowHealth: { ok: true, status: "pass", phase: "mlb-daily-production", lastRunAt: "2026-08-08T03:00:00Z" },
  slate: { mlbSlate: "2026-08-07", mlbGames: 15 },
  products: { bankBuilder: { lanes: [{ status: "awaiting" }, { status: "awaiting" }] } },
  moneyGate: { pass: true, crownMinusDrawdownEqualsBankroll: true, dailyTracksCanonical: true },
};
const HEALTHY_ALPHA = {
  day: 3, verdict: "PASS", observedEtDate: "2026-08-07", sourceSha: "b5ff087a",
  tally: { PASS: 9, FAIL: 0, BLOCKED: 6, UNKNOWN: 0 },
  criteria: [{ id: "protected-money", result: "PASS" }],
};
const BOARDS = ["2026-08-05", "2026-08-06", "2026-08-07"];
const SIMS = ["2026-08-05", "2026-08-07"]; // Aug-6 is the real, documented permanent gap

// v2 fixture assessments: UFC historical-archive only (→ OFF_SEASON), NFL empty (→ PLANNED).
const FIXTURE_SPORTS = {
  ufc: { inSeason: false, historicalArchive: true, stages: {} },
  nfl: { inSeason: false, historicalArchive: false, stages: {} },
};

const build = (over = {}) =>
  buildEvidenceLedger({ adminStatus: HEALTHY_ADMIN, alphaDay: HEALTHY_ALPHA, gates: [], boardDates: BOARDS, simDates: SIMS, sportAssessments: FIXTURE_SPORTS, now: NOW, ...over });

test("PURITY · `now` is required — the ledger never reads the clock", () => {
  assert.throws(() => buildEvidenceLedger({ adminStatus: HEALTHY_ADMIN }), /now.*required/);
});

test("a missing source is UNKNOWN, never green", () => {
  const l = build({ adminStatus: null, alphaDay: null });
  const chain = l.entries.find((e) => e.id === "daily-chain");
  const alpha = l.entries.find((e) => e.id === "alpha-day");
  assert.equal(chain.state, "UNKNOWN");
  assert.equal(alpha.state, "UNKNOWN");
});

test("freshness converts self-reported health to STALE — but can never soften an INCIDENT", () => {
  const oldRun = { ...HEALTHY_ADMIN, generatedAt: "2026-08-05T03:00:00Z", workflowHealth: { ...HEALTHY_ADMIN.workflowHealth, lastRunAt: "2026-08-05T03:00:00Z" } };
  const l = build({ adminStatus: oldRun });
  const chain = l.entries.find((e) => e.id === "daily-chain");
  assert.equal(chain.declaredState, "HEALTHY", "the source still says healthy");
  assert.equal(chain.state, "STALE", `${chain.ageHours}h old exceeds the ${FRESHNESS_WINDOWS_H.workflow}h window`);

  // INCIDENT survives any age: a stale money-gate failure is still an incident.
  const badMoney = { ...oldRun, moneyGate: { pass: false } };
  const l2 = build({ adminStatus: badMoney });
  assert.equal(l2.entries.find((e) => e.id === "money-gate").state, "INCIDENT", "freshness must not soften an incident");
});

test("CONTRADICTION · green workflow without its board artifact is an INCIDENT", () => {
  const l = build({ boardDates: ["2026-08-05", "2026-08-06"] });     // today's board absent
  const c = l.entries.find((e) => e.id === "contradiction:success-without-artifact");
  assert.ok(c, "the Aug-3 shape — green automation, no product — must be detected");
  assert.equal(c.state, "INCIDENT");
  assert.equal(l.contradictionCount >= 1, true);
});

test("CONTRADICTION · a board without simulations is detected, and the Aug-6 gap is named, not hidden", () => {
  const l = build();
  const c = l.entries.find((e) => e.id === "contradiction:board-without-sims:2026-08-06");
  assert.ok(c, "the Aug-6 board/sim gap must be visible in the ledger");
  assert.match(c.remediation, /documented permanent Aug-6 gap/, "the known gap points at its documentation rather than paging anyone");
});

test("CONTRADICTION · two money monitors disagreeing is the loudest possible state", () => {
  const alphaFail = { ...HEALTHY_ALPHA, verdict: "FAIL", criteria: [{ id: "protected-money", result: "FAIL" }] };
  const l = build({ alphaDay: alphaFail });
  const c = l.entries.find((e) => e.id === "contradiction:protected-state-disagreement");
  assert.ok(c, "moneyGate pass + observer hash divergence must contradict");
  assert.match(c.remediation, /STOP/, "the remediation is to stop, not to continue");
});

test("CONTRADICTION · an alpha PASS with a FAILED criterion is inconsistent", () => {
  const inconsistent = { ...HEALTHY_ALPHA, verdict: "PASS", criteria: [{ id: "x", result: "FAIL" }] };
  const l = build({ alphaDay: inconsistent });
  assert.ok(l.entries.find((e) => e.id === "contradiction:alpha-verdict-inconsistent"));
});

test("a healthy tree yields zero contradictions and no INCIDENT — except the named Aug-6 gap", () => {
  const l = build({ simDates: BOARDS });                             // pretend no gap
  assert.equal(l.contradictionCount, 0);
  assert.equal(l.entries.filter((e) => e.state === "INCIDENT").length, 0);
});

test("NO_PLAY and OFF_SEASON are real states — never failures, never hidden", () => {
  const l = build();
  assert.equal(l.entries.find((e) => e.id === "bank-builder").state, "NO_PLAY", "0 active lanes under unchanged policy is a no-play");
  // v2: these derive from the twelve-stage gate rather than a hand-written list.
  assert.equal(l.entries.find((e) => e.id === "sport:ufc").state, "OFF_SEASON", "an archive-only sport is off-season, not broken");
  assert.equal(l.entries.find((e) => e.id === "sport:nfl").state, "PLANNED");
  assert.match(l.entries.find((e) => e.id === "sport:nfl").evidence, /0\/12 gate stages proven/, "the evidence counts gate stages");
});

test("founder gates are BLOCKED_EXTERNAL, never repository incidents", () => {
  const gates = [
    { id: "business-legal", name: "Terms", status: "FAIL", blocker: "counsel", owner: "FOUNDER" },
    { id: "reliability", name: "Reliability", status: "PASS", owner: "ENGINEERING" },
  ];
  const l = build({ gates });
  const legal = l.entries.find((e) => e.id === "gate:business-legal");
  assert.equal(legal.state, "BLOCKED_EXTERNAL");
  assert.equal(legal.owner, "FOUNDER");
  assert.ok(!l.entries.some((e) => e.id === "gate:reliability"), "engineering gates are covered by their own entries");
});

test("entries sort INCIDENT-first and the counts cover every state exactly once", () => {
  const l = build();
  for (let i = 1; i < l.entries.length; i++) {
    assert.ok(severityRank(l.entries[i - 1].state) <= severityRank(l.entries[i].state), "severity order must be monotonic");
  }
  const total = Object.values(l.counts).reduce((a, b) => a + b, 0);
  assert.equal(total, l.entries.length, "every entry is counted in exactly one state");
  for (const s of Object.keys(l.counts)) assert.ok(LEDGER_STATES.includes(s));
});

test("the artifact is internal, versioned, and idempotent for a fixed `now`", () => {
  const a = build(), b = build();
  assert.equal(a.public, false, "the ledger must never be served publicly");
  assert.equal(a.schemaVersion, 2);
  assert.deepEqual(a, b, "same inputs + same now ⇒ byte-identical ledger");
});
