/**
 * EPL `identity`, proven against REAL committed captures rather than fixtures.
 *
 * The gate asks for "canonical ids resolving through the identity components with fallbacks". Unit
 * tests on hand-made inputs cannot show that: they prove the function works on data shaped the way
 * the author imagined. This resolves the whole committed season capture — 380 fixtures, every club
 * in the division — through the same adapter production uses, and checks the ids it derives are the
 * ids already on disk.
 *
 * It then checks the JOIN, which is the part that actually matters: the odds capture is written by a
 * different script from a different provider, and it keys on eventId. If identity were only
 * internally consistent, that join would silently miss and the market layer would quietly price
 * nothing. This is the evidence the stage is promoted on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { identityFromFixture } from "./epl-identity.ts";

const APP = process.cwd();
const EPL = path.join(APP, "public/data/soccer/epl");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** The committed full-season capture — the only artifact carrying every club. */
function seasonCapture() {
  /*
   * Sorted, newest last. `readdir().find()` returns whatever the filesystem lists first — the
   * OLDEST capture — which is the same defect P215 R-C fixed in the forecast builder and P218's
   * guard then pinned across the producers. It survived here because that guard only walked
   * scripts and libs, not the test that reads the same directory.
   *
   * It surfaced the moment the fixture list was corrected: kickoff time is part of the canonical
   * eventId, so an odds capture keyed to the REAL kickoffs looked like eleven orphans when joined
   * against a fixture file still carrying the fabricated 14:00 slot.
   */
  const dir = path.join(EPL, "fixtures");
  const file = fs.readdirSync(dir).filter((f) => f.startsWith("capture-") && f.endsWith(".json")).sort().at(-1);
  assert.ok(file, "a committed season capture is required for this evidence");
  return readJson(path.join(dir, file));
}

test("every fixture in the real season capture resolves — no club falls through", () => {
  const cap = seasonCapture();
  assert.equal(cap.rows.length, 380, "a Premier League season is exactly 380 fixtures");

  const rejections = [];
  const derived = new Map();
  for (const r of cap.rows) {
    const out = identityFromFixture(
      { homeClub: r.homeClub, awayClub: r.awayClub, kickoffIso: r.kickoffIso, providerRefs: r.providerRefs },
      "2026-08-20T00:00:00Z",
    );
    if (out.rejection) rejections.push(`${r.homeClub} v ${r.awayClub}: ${out.rejection.code}`);
    else derived.set(r.eventId, out.identity);
  }

  assert.deepEqual(rejections, [], `every club must resolve; unresolved: ${rejections.slice(0, 5).join(" | ")}`);
  assert.equal(derived.size, 380, "each fixture must derive a DISTINCT id — a collision silently merges two matches");
});

test("the derived ids ARE the committed ids — the adapter and the artifact cannot drift", () => {
  const cap = seasonCapture();
  const mismatches = [];
  for (const r of cap.rows) {
    const out = identityFromFixture(
      { homeClub: r.homeClub, awayClub: r.awayClub, kickoffIso: r.kickoffIso, providerRefs: r.providerRefs },
      "2026-08-20T00:00:00Z",
    );
    if (out.identity && out.identity.eventId !== r.eventId) {
      mismatches.push(`${r.eventId} → ${out.identity.eventId}`);
    }
  }
  assert.deepEqual(mismatches.slice(0, 5), [], `${mismatches.length} committed id(s) no longer re-derive`);
});

test("THE JOIN: every odds row lands on a fixture that exists", () => {
  // Written by a different script, from a different provider, keyed on eventId. A silent miss here
  // is the market layer pricing nothing while reporting success — which is exactly how the UFC
  // capture looked healthy while producing no probabilities.
  const cap = seasonCapture();
  const ids = new Set(cap.rows.map((r) => r.eventId));
  const dir = path.join(EPL, "odds");
  const captures = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, d: readJson(path.join(dir, f)) }))
    .filter(({ d }) => d.dataClass === "ODDS_CAPTURE");

  /*
   * ── CAPTURES TAKEN UNDER THE PRE-CORRECTION SCHEDULE ────────────────────────────────────────
   *
   * The canonical eventId embeds the kickoff, so correcting a kickoff changes the identity. Until
   * 2026-08-28 the fixture list carried openfootball's provisional "all at 15:00" block for
   * matchweeks 2 and 3 (see capture-selection.test.mjs), and these four odds captures were keyed to
   * those fabricated times. They are immutable purchased evidence and are NOT rewritten — the
   * append-only rule is not suspended because a later correction made them inconvenient.
   *
   * They are named here instead: dated, explained, and excluded from the join assertion, which
   * continues to hold for every capture taken since. The list may only shrink — a NEW orphaned
   * capture means the join is broken now, which is what this test is for.
   */
  const PRE_SCHEDULE_CORRECTION = new Set([
    "capture-2026-08-21.json",
    "capture-2026-08-22.json",
    "capture-2026-08-23.json",
    "capture-2026-08-24.json",
  ]);

  assert.ok(captures.length > 0, "an authorized odds capture must exist for the join to be evidence");
  let joined = 0;
  for (const { f, d } of captures) {
    assert.ok((d.rows ?? []).length > 0, `${f}: a capture with no rows proves nothing`);
    if (PRE_SCHEDULE_CORRECTION.has(f)) continue;
    joined += 1;
    const orphans = d.rows.filter((r) => !ids.has(r.eventId)).map((r) => r.eventId);
    assert.deepEqual(orphans.slice(0, 5), [], `${f}: ${orphans.length} priced row(s) join to no fixture`);
  }
  assert.ok(joined > 0, "the exception list cannot be allowed to swallow every capture");
  assert.ok(PRE_SCHEDULE_CORRECTION.size <= 4, "pre-correction exceptions may only shrink");
});

test("a club the table cannot name is REJECTED, not passed through with the provider spelling", () => {
  const out = identityFromFixture(
    { homeClub: "Notreal Wanderers", awayClub: "Arsenal", kickoffIso: "2026-08-21T19:00:00Z" },
    "2026-08-20T00:00:00Z",
  );
  assert.ok(out.rejection, "an unknown club must not resolve");
  assert.equal(out.rejection.code, "UNRESOLVED_CLUB");
  // Emitting the raw spelling would make an unresolved state look resolved everywhere downstream.
  assert.ok(!JSON.stringify(out).includes("soccer:epl:notreal"), "no id may be minted from an unresolved club");
});

test("a fixture with no kickoff is unidentifiable, never assumed to be today", () => {
  const out = identityFromFixture({ homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: null }, "2026-08-20T00:00:00Z");
  assert.ok(out.rejection);
  assert.equal(out.rejection.code, "MISSING_KICKOFF");
});
