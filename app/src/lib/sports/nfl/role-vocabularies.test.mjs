import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ROLE_VOCABULARY, sharedStateNames, vocabulariesFor, foreignStates, ROLE_CERTAINTY_BLOCKER } from "./role-vocabularies.mjs";
import { PARTICIPATION_STATES } from "./participation-states.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const ROOT = path.resolve(APP, "..");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("the registry's PARTICIPATION list IS the live contract, not a copy that can drift", () => {
  /* A registry that restates a vocabulary instead of agreeing with it becomes a second source. */
  assert.deepEqual([...ROLE_VOCABULARY.PARTICIPATION.states].sort(), [...PARTICIPATION_STATES].sort());
});

test("the ROLE_EVIDENCE list matches the artifact's own declared vocabulary", () => {
  const doc = read(path.join(ROOT, "data/internal/nfl/role-evidence/latest.json"));
  if (!Array.isArray(doc?.states)) return; // artifact absent; the leak guards below still stand
  assert.deepEqual([...ROLE_VOCABULARY.ROLE_EVIDENCE.states].sort(), [...doc.states].sort(),
    "the registry and the artifact disagree about what states exist");
});

test("the POOL_COUNTS list matches the keys the snapshots actually emit", () => {
  /* Derived from the committed snapshots rather than asserted, because this vocabulary has no module. */
  const base = path.join(ROOT, "data/internal/nfl/current");
  if (!fs.existsSync(base)) return;
  const days = fs.readdirSync(base).sort();
  if (!days.length) return;
  const seen = new Set();
  for (const d of days.slice(-1)) {
    const dir = path.join(base, d);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const a = read(path.join(dir, f));
      for (const tv of Object.values(a?.research?.perTeam ?? {})) {
        for (const k of Object.keys(tv?.participationCounts ?? {})) seen.add(k);
      }
    }
  }
  if (!seen.size) return;
  for (const k of seen) {
    assert.ok(ROLE_VOCABULARY.POOL_COUNTS.states.includes(k),
      `the snapshots emit ${k}, which the registry does not list — a fourth vocabulary is appearing`);
  }
});

/* ── THE TWO LEAKS, PINNED AGAINST THE REAL CONSUMER ────────────────────────────────────────── */

test("🔴 a consumer must not test a POOL_COUNTS name against a ROLE_EVIDENCE value", () => {
  /*
   * `build-end-zone-vault.mjs` has `AVAILABLE_STATES = {ACTIVE_EXPECTED, ACTIVE_PROJECTED,
   * ACTIVE_UNCERTAIN}` and tests it against a ROLE_EVIDENCE `role.state`. ACTIVE_PROJECTED is a
   * POOL_COUNTS name and can never match. The set works ONLY because ACTIVE_UNCERTAIN is also in it
   * — which is precisely why a dead member survives: nothing breaks.
   */
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-end-zone-vault.mjs"), "utf8");
  const m = src.match(/const AVAILABLE_STATES = new Set\(\[([^\]]+)\]\)/);
  assert.ok(m, "AVAILABLE_STATES must exist for this guard to mean anything");
  const names = [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
  assert.ok(names.length > 0);
  const foreign = foreignStates(names, "ROLE_EVIDENCE");
  assert.deepEqual(foreign, ["ACTIVE_PROJECTED"],
    `AVAILABLE_STATES is tested against a ROLE_EVIDENCE state; foreign names: ${JSON.stringify(foreign)}`);
  /* Pinned as a KNOWN dead member rather than fixed here: removing it changes a live product's
     availability path, and it is currently harmless. The guard fails if a SECOND one appears. */
});

test("🔴 ACTIVE_CONFIRMED is in no vocabulary at all — that half of the check is dead", () => {
  assert.deepEqual(vocabulariesFor("ACTIVE_CONFIRMED"), [],
    "if ACTIVE_CONFIRMED has become a real state, the registry must list it and this guard must change");
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-end-zone-vault.mjs"), "utf8");
  if (!/ACTIVE_CONFIRMED/.test(src)) return; // already cleaned up
  /* And the condition still works, because the OTHER half is a real POOL_COUNTS key. Asserting this
     is what keeps the finding honest: a dead name, not a broken product. */
  assert.deepEqual(vocabulariesFor("ACTIVE_PROJECTED"), ["POOL_COUNTS"]);
  assert.match(src, /counts\.ACTIVE_PROJECTED > 0/, "the live half of the check must remain");
});

test("shared names are exactly the two that genuinely overlap", () => {
  /* QUESTIONABLE and SOURCE_STALE mean the same thing in more than one vocabulary. Any NEW shared
     name is a place two subjects are being conflated, so it should be deliberate. */
  assert.deepEqual(sharedStateNames(), ["QUESTIONABLE", "SOURCE_STALE"]);
});

test("foreignStates refuses an unregistered vocabulary rather than returning nothing", () => {
  assert.throws(() => foreignStates(["X"], "NOT_A_VOCABULARY"), /not a registered role vocabulary/);
  /* And it must actually detect a foreign name — a function that always returns [] proves nothing. */
  assert.deepEqual(foreignStates(["EXPECTED_STARTER"], "ROLE_EVIDENCE"), ["EXPECTED_STARTER"]);
  assert.deepEqual(foreignStates(["ACTIVE_UNCERTAIN"], "ROLE_EVIDENCE"), []);
});

/* ── THE ROLE GATE IS A RIGHTS GATE ─────────────────────────────────────────────────────────── */

test("role certainty is blocked by a MISSING SOURCE, and the artifact says so itself", () => {
  /*
   * §5 asks whether the coarse role state is a weak SOURCE or an incomplete CONSUMER. The evidence
   * artifact answers it directly, so this asserts against the artifact rather than against my reading
   * of it.
   */
  const doc = read(path.join(ROOT, "data/internal/nfl/role-evidence/latest.json"));
  if (!doc?.sources) return;
  const g = doc.sources.gameDayActives;
  assert.ok(g, "gameDayActives must be a named source, even when unsupported");
  assert.equal(g.status, "UNSUPPORTED");
  assert.equal(g.id, null, "an unsupported source must not claim an id");
  assert.match(String(g.cannotEstablish), /no authorized source carries the official inactive list/i);
  assert.equal(ROLE_CERTAINTY_BLOCKER.resolution, "FOUNDER_GATE_DATA_RIGHTS");
  assert.equal(ROLE_CERTAINTY_BLOCKER.publishesAfterBoardFreeze, true);
});

test("every event on the frozen slate is ROLE_UNCERTAIN for the stated reason", () => {
  const doc = read(path.join(ROOT, "data/internal/nfl/role-evidence/latest.json"));
  if (!Array.isArray(doc?.events) || !doc.events.length) return;
  const verdicts = new Set(doc.events.map((e) => e.familyVerdict));
  assert.deepEqual([...verdicts], ["ROLE_UNCERTAIN"], "a mixed verdict would mean role IS reachable for some event");
  for (const e of doc.events) {
    assert.match(String(e.verdictReason), /authorized source/i, `${e.matchup} gives a different reason`);
    /* The window must name a real future instant, not a vague promise. */
    assert.match(String(e.nextObservationWindow), /\d{4}-\d{2}-\d{2}T/, `${e.matchup} has no dated observation window`);
  }
});

test("the blocked state is the ONLY one that would confirm a role", () => {
  /* If another ROLE_EVIDENCE state ever implies a confirmed role, the blocker description goes stale
     and the funnel's binding stage would move without anyone noticing. */
  assert.equal(ROLE_CERTAINTY_BLOCKER.blockedState, "ACTIVE_EXPECTED");
  assert.ok(ROLE_VOCABULARY.ROLE_EVIDENCE.states.includes("ACTIVE_EXPECTED"));
  /* ACTIVE_UNCERTAIN explicitly does NOT confirm a role — it means "available, extent unknown". */
  assert.ok(ROLE_VOCABULARY.ROLE_EVIDENCE.states.includes("ACTIVE_UNCERTAIN"));
});
