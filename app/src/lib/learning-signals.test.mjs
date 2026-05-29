/**
 * Tests for `learning-signals.ts`.
 *
 * Lock the honesty rules:
 *   - Sample below threshold → "too-small" (never "tracking").
 *   - Sample passes threshold + observed below baseline by >= 8pp →
 *     "shadow-test-candidate".
 *   - Audit-policy confirmation only flows through when the policy
 *     itself says `confirmed: true`; never invented.
 *   - Missing rows are skipped, not fabricated.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLearningSignalRows,
  getStatusDisplay,
} from "./learning-signals.ts";

function _bucket(wins, losses) {
  const decisive = wins + losses;
  return {
    wins,
    losses,
    pushes: 0,
    pending: 0,
    decisive,
    hitRate: decisive > 0 ? wins / decisive : null,
  };
}

test("buildLearningSignalRows: null summary → empty", () => {
  const rows = buildLearningSignalRows(null, null);
  assert.deepEqual(rows, []);
});

test("buildLearningSignalRows: profile below n=60 → too-small", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(50, 150),
      byProfile: { conservative: _bucket(20, 20) },
      bySport: {},
    },
    null,
  );
  const r = rows.find((x) => x.id === "profile:conservative");
  assert.ok(r);
  assert.equal(r.status, "too-small");
});

test("buildLearningSignalRows: profile passes n but within band → tracking", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(40, 60),
      byProfile: { balanced: _bucket(35, 30) }, // n=65, hit=0.54, lifetime=0.40 → +14pp
      bySport: {},
    },
    null,
  );
  const r = rows.find((x) => x.id === "profile:balanced");
  assert.ok(r);
  assert.equal(r.status, "tracking");
});

test("buildLearningSignalRows: profile past gap → shadow-test-candidate", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(60, 60), // 50% lifetime baseline
      byProfile: { aggressive: _bucket(8, 60) }, // n=68, ~12% → -38pp
      bySport: {},
    },
    null,
  );
  const r = rows.find((x) => x.id === "profile:aggressive");
  assert.ok(r);
  assert.equal(r.status, "shadow-test-candidate");
  assert.match(r.direction, /-3[0-9]\.[0-9]pp/);
});

test("buildLearningSignalRows: section below n=40 → too-small", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(50, 150),
      byProfile: {},
      bySport: {},
      byPublicSection: {
        lifetime: { longshot: _bucket(0, 4) },
        byDate: {},
      },
    },
    null,
  );
  const r = rows.find((x) => x.id === "section:longshot");
  assert.ok(r);
  assert.equal(r.status, "too-small");
});

test("buildLearningSignalRows: audit signal confirmed → confirmed-not-consumed", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(0, 0),
      byProfile: {},
      bySport: {},
    },
    {
      confirmed: true,
      signals: {
        mixedSportDownrank: {
          fires: 3,
          daysRequired: 3,
          confirmed: true,
          strength: 0.45,
        },
      },
    },
  );
  const r = rows.find((x) => x.id === "policy:mixedSportDownrank");
  assert.ok(r);
  assert.equal(r.status, "confirmed-not-consumed");
});

test("buildLearningSignalRows: audit signal unconfirmed → tracking", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(0, 0),
      byProfile: {},
      bySport: {},
    },
    {
      confirmed: false,
      signals: {
        sameGameNbaCap: { fires: 1, daysRequired: 3, confirmed: false },
      },
    },
  );
  const r = rows.find((x) => x.id === "policy:sameGameNbaCap");
  assert.ok(r);
  assert.equal(r.status, "tracking");
});

test("buildLearningSignalRows: never says 'AI' or 'deep learning' in copy", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(50, 50),
      byProfile: { conservative: _bucket(70, 50) },
      bySport: {},
      byPublicSection: { lifetime: { low: _bucket(50, 30) }, byDate: {} },
    },
    {
      confirmed: false,
      signals: {
        marketDemotion: { fires: 1, daysRequired: 3, confirmed: false },
      },
    },
  );
  const all = rows
    .map((r) => `${r.signal} ${r.direction} ${r.explanation}`)
    .join(" ")
    .toLowerCase();
  for (const banned of [
    "ai is choosing",
    "deep learning",
    "machine learning",
    "model learned",
    "neural network",
  ]) {
    assert.equal(all.includes(banned), false, `banned "${banned}"`);
  }
});

test("buildLearningSignalRows: too-small profile row surfaces shortfall", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(50, 150),
      byProfile: { conservative: _bucket(20, 14) }, // n=34
      bySport: {},
    },
    null,
  );
  const r = rows.find((x) => x.id === "profile:conservative");
  assert.ok(r);
  assert.equal(r.status, "too-small");
  // Profile floor is n=60 → needs 26 more
  assert.match(r.explanation, /needs 26 more decisive slips/);
});

test("buildLearningSignalRows: too-small section row surfaces shortfall", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(50, 150),
      byProfile: {},
      bySport: {},
      byPublicSection: {
        lifetime: { longshot: _bucket(0, 4) }, // n=4
        byDate: {},
      },
    },
    null,
  );
  const r = rows.find((x) => x.id === "section:longshot");
  assert.ok(r);
  assert.equal(r.status, "too-small");
  // Section floor is n=40 → needs 36 more
  assert.match(r.explanation, /needs 36 more decisive slips/);
});

test("buildLearningSignalRows: too-small sport row surfaces shortfall", () => {
  const rows = buildLearningSignalRows(
    {
      _disclaimer: "",
      generatedAt: "",
      byDate: [],
      lifetime: _bucket(50, 150),
      byProfile: {},
      bySport: {},
      byPublicSection: { lifetime: {}, byDate: {} },
      bySportBucket: {
        lifetime: { nba: _bucket(4, 0) }, // n=4
        byDate: {},
      },
    },
    null,
  );
  const r = rows.find((x) => x.id === "sport:nba");
  assert.ok(r);
  assert.equal(r.status, "too-small");
  // Sport floor is n=40 → needs 36 more
  assert.match(r.explanation, /needs 36 more decisive slips/);
});

test("getStatusDisplay: stable labels", () => {
  assert.equal(getStatusDisplay("confirmed-not-consumed").label, "Confirmed · operator review");
  assert.equal(getStatusDisplay("shadow-test-candidate").label, "Shadow-test candidate");
  assert.equal(getStatusDisplay("too-small").label, "Too small to act on");
  assert.equal(getStatusDisplay("tracking").label, "Tracking");
});
