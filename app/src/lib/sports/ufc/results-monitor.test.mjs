/**
 * UFC results-monitor guards (Program 163 · Release I).
 *
 * The REAL-CAPTURE case uses tonight's committed artifact against a synthetic prior in which the
 * five Contender Series bouts were still scheduled — the monitor must read exactly five
 * BECAME_FINAL transitions from real data. Synthetic cases prove the correction classes reality
 * has not yet supplied (overturn, decision change, regression) without manufacturing them as
 * receipts.
 *
 * Run: npx tsx --test src/lib/sports/ufc/results-monitor.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { monitorUfcResults, UFC_MONITOR_CLASSES } from "./results-monitor.mjs";

const ROW = (id, over = {}) => ({ providerBoutId: id, dateUtc: "2026-08-10T23:00Z", statusRaw: "STATUS_FINAL", red: { name: "Alice Red" }, blue: { name: "Bob Blue" }, redWinner: true, blueWinner: false, ...over });
const ART = (rows) => ({ generatedAt: "2026-08-12T02:00:00Z", windowDays: 9, rows });

test("OVERTURNED_RESULT: a winner flip on a final is review-gated with before/after corners", () => {
  const out = monitorUfcResults(ART([ROW("b1")]), ART([ROW("b1", { redWinner: false, blueWinner: true })]));
  const o = out.changes.find((c) => c.class === "OVERTURNED_RESULT");
  assert.deepEqual({ before: o.before, after: o.after, review: o.review }, { before: "red", after: "blue", review: true });
  assert.match(o.evidence, /nothing regrades silently/);
});

test("DECISION_CHANGE: decided ↔ draw/NC churn is its own review class, never conflated with an overturn", () => {
  const toNc = monitorUfcResults(ART([ROW("b1")]), ART([ROW("b1", { redWinner: false, blueWinner: false })]));
  assert.equal(toNc.counts.DECISION_CHANGE, 1);
  assert.equal(toNc.counts.OVERTURNED_RESULT, 0);
  const fromNc = monitorUfcResults(ART([ROW("b1", { redWinner: false, blueWinner: false })]), ART([ROW("b1")]));
  assert.equal(fromNc.counts.DECISION_CHANGE, 1);
});

test("regression, window mechanics, and reschedule classify as in the NFL monitor", () => {
  const out = monitorUfcResults(
    ART([ROW("gone-recent", { dateUtc: "2026-08-11T23:00Z" }), ROW("gone-old", { dateUtc: "2026-08-01T23:00Z" }), ROW("b1"), ROW("b2")]),
    ART([ROW("b1", { statusRaw: "STATUS_IN_PROGRESS" }), ROW("b2", { dateUtc: "2026-08-12T23:00Z" })]),
  );
  assert.equal(out.counts.STATUS_REGRESSION, 1);
  assert.equal(out.counts.DISAPPEARED_UNEXPECTED, 1);
  assert.equal(out.counts.LEFT_WINDOW, 1);
  assert.equal(out.counts.RESCHEDULED, 1);
  assert.equal(out.reconciliation.exact, true);
  for (const c of out.changes) assert.ok(UFC_MONITOR_CLASSES.includes(c.class));
});

/*
 * REAL CAPTURE — the monitor is exercised against the bytes on disk, not a hand-rolled shape.
 *
 * This pinned card 600060732 and the number five. Both rotted the moment the capture refreshed: the
 * Contender Series card advanced to 600060733 and the pinned id vanished from the artifact, so the
 * synthetic prior was identical to the current capture, zero transitions were produced, and the test
 * reported the monitor as broken when the monitor had not been touched.
 *
 * A magic count is the same trap one step later — `>= 17` says nothing about the monitor and
 * everything about which cards happened to be in the last capture.
 *
 * So the card and the count are now DERIVED from the artifact: rewind whichever real card has the
 * fewest finals, then require exactly that many transitions back. The claim under test is unchanged
 * and stronger for being stated in terms of the data rather than in terms of one Friday night.
 */
test("REAL CAPTURE · rewinding one real card's finals reads back as exactly that many BECAME_FINAL", () => {
  const current = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "results", "latest.json"), "utf8"));
  const finals = current.rows.filter((r) => /^STATUS_FINAL/.test(r.statusRaw ?? ""));
  assert.ok(finals.length > 0, "the committed capture must hold at least one settled bout to monitor");

  // Smallest real card, so the rewind is a genuine subset and the rest of the capture stays untouched.
  const byCard = new Map();
  for (const r of finals) byCard.set(r.providerCardId, (byCard.get(r.providerCardId) ?? 0) + 1);
  const [CARD, expected] = [...byCard.entries()].sort((a, b) => a[1] - b[1] || String(a[0]).localeCompare(String(b[0])))[0];

  const prior = { ...current, rows: current.rows.map((r) => r.providerCardId === CARD ? { ...r, statusRaw: "STATUS_SCHEDULED", redWinner: false, blueWinner: false } : r) };
  const out = monitorUfcResults(prior, current);
  assert.equal(out.counts.BECAME_FINAL, expected, `card ${CARD}: ${expected} rewound finals must surface as ${expected} transitions`);
  assert.equal(out.counts.OVERTURNED_RESULT, 0, "reality has supplied no overturn — the monitor must not invent one");
  assert.equal(out.reviewRequired.length, 0);
});
