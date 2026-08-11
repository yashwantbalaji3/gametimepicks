/**
 * UFC lineage classifier guards (Program 162 · Release D).
 *
 * The REAL receipt: the two committed captures around fight day (Aug 10 → Aug 11) already contain
 * genuine lineage — one bout ADDED on stable ids with zero removals. The classifier must
 * reproduce exactly that reading from the artifacts on disk; the synthetic cases then prove every
 * class it may ever need (replacement, cancellation, weight change, postponement, both-corners,
 * corner swap, duplicate-id refusal) without manufacturing any of them as reality.
 *
 * Run: npx tsx --test src/lib/sports/ufc/lineage.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { classifyUfcLineage, LINEAGE_CLASSES, UFC_LINEAGE_VERSION } from "./lineage.mjs";

const DIR = path.join(process.cwd(), "public", "data", "ufc", "schedule");
const readCap = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

const BOUT = (id, red, blue, over = {}) => ({ providerBoutId: id, eventProviderId: "ev1", red, blue, redProviderId: null, blueProviderId: null, weightClass: "Lightweight", dateUtc: "2026-09-01T23:00Z", statusRaw: "STATUS_SCHEDULED", ...over });
const CAP = (bouts, events = [{ providerEventId: "ev1", name: "Card", dateUtc: "2026-09-01T23:00Z" }]) => ({ generatedAt: "2026-08-11T00:00:00Z", events, bouts });

test("REAL CAPTURES · Aug 10 → Aug 11 classifies as exactly the lineage reality supplied: one addition, zero removals", () => {
  const files = fs.readdirSync(DIR).filter((f) => f.startsWith("capture-")).sort();
  assert.ok(files.length >= 2, "two committed captures exist");
  const out = classifyUfcLineage(readCap(files[0]), readCap(files[1]));
  assert.equal(out.counts.ADDED, 1, "the fight-day addition (82→83) is the one ADDED bout");
  assert.equal(out.counts.REMOVED, 0);
  assert.equal(out.counts.REPLACEMENT, 0, "reality has not yet supplied a replacement — the classifier must not invent one");
  assert.equal(out.counts.BOTH_CORNERS_CHANGED, 0);
  assert.equal(out.refusals.length, 0, "every committed bout row carries a unique stable id");
  assert.equal(out.reconciliation.exact, true);
  const added = out.changes.find((c) => c.class === "ADDED");
  assert.match(added.after, /vs/, "the added bout names its pairing");
});

test("REPLACEMENT: exactly one corner changes; kept/out/in named; basis recorded honestly", () => {
  const prev = CAP([BOUT("b1", "Alice Smith", "Bob Jones")]);
  const next = CAP([BOUT("b1", "Alice Smith", "Carol White")]);
  const out = classifyUfcLineage(prev, next);
  const r = out.changes.find((c) => c.class === "REPLACEMENT");
  assert.deepEqual({ kept: r.kept, out: r.out, in: r.in, basis: r.basis }, { kept: "Alice Smith", out: "Bob Jones", in: "Carol White", basis: "exact-name" });
  // With provider ids on both sides, the basis upgrades.
  const prevId = CAP([BOUT("b1", "Alice Smith", "Bob Jones", { redProviderId: "10", blueProviderId: "11" })]);
  const nextId = CAP([BOUT("b1", "Alice Smith", "Carol White", { redProviderId: "10", blueProviderId: "12" })]);
  assert.equal(classifyUfcLineage(prevId, nextId).changes.find((c) => c.class === "REPLACEMENT").basis, "provider-id");
});

test("CORNER_SWAP is presentation, BOTH_CORNERS_CHANGED is review — never conflated with replacement", () => {
  const prev = CAP([BOUT("b1", "Alice Smith", "Bob Jones")]);
  const swapped = classifyUfcLineage(prev, CAP([BOUT("b1", "Bob Jones", "Alice Smith")]));
  assert.equal(swapped.counts.CORNER_SWAP, 1);
  assert.equal(swapped.counts.REPLACEMENT, 0);
  const rebooked = classifyUfcLineage(prev, CAP([BOUT("b1", "Carol White", "Dan Green")]));
  assert.equal(rebooked.counts.BOTH_CORNERS_CHANGED, 1);
  assert.match(rebooked.changes.find((c) => c.class === "BOTH_CORNERS_CHANGED").note, /review/);
});

test("CANCELLED only from the bout's own status; removal never infers it; weight and date changes classified", () => {
  const prev = CAP([BOUT("b1", "Alice Smith", "Bob Jones"), BOUT("b2", "Eve Black", "Fay Gray")]);
  const next = CAP([
    BOUT("b1", "Alice Smith", "Bob Jones", { statusRaw: "STATUS_CANCELED", weightClass: "Welterweight", dateUtc: "2026-09-02T23:00Z" }),
  ]);
  const out = classifyUfcLineage(prev, next);
  assert.equal(out.counts.CANCELLED, 1, "status says so on a still-present bout");
  assert.equal(out.counts.WEIGHT_CLASS_CHANGE, 1);
  assert.equal(out.counts.POSTPONED, 1);
  const removed = out.changes.find((c) => c.class === "REMOVED");
  assert.equal(removed.providerBoutId, "b2");
  assert.match(removed.note, /not inferred/, "a vanished bout is REMOVED — the provider did not say why");
});

test("identity refusals: duplicate providerBoutId in one capture refuses BOTH readings; missing id refuses the row", () => {
  const dup = CAP([BOUT("b1", "Alice Smith", "Bob Jones"), BOUT("b1", "Carol White", "Dan Green")]);
  const out = classifyUfcLineage(dup, CAP([BOUT("b2", "Eve Black", "Fay Gray")]));
  assert.ok(out.refusals.some((r) => r.reason.includes("duplicate providerBoutId")));
  const noId = classifyUfcLineage(CAP([{ red: "Ghost", blue: "Row" }]), CAP([]));
  assert.ok(noId.refusals.some((r) => r.reason.includes("without providerBoutId")));
});

test("surface closed: version 1, every emitted class is in the taxonomy, unchanged bouts counted", () => {
  assert.equal(UFC_LINEAGE_VERSION, 1);
  const prev = CAP([BOUT("b1", "Alice Smith", "Bob Jones")]);
  const out = classifyUfcLineage(prev, prev);
  assert.equal(out.counts.UNCHANGED, 1);
  for (const c of out.changes) assert.ok(LINEAGE_CLASSES.includes(c.class), c.class);
});
