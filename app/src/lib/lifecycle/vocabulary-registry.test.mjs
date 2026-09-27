/**
 * THE SET OF LIFECYCLE VOCABULARIES IS CLOSED (§8).
 *
 * §8 asks for one canonical lifecycle. Four exist, and each has a genuinely different SUBJECT — one
 * event by the clock, one event by the provider, one prediction row, one date's cards. That is
 * defensible. What is not defensible is a fifth appearing quietly, because the failure mode §8 is
 * describing is a reader reaching for whichever state name looks closest to what they meant.
 *
 * So the set is registered, with its subject, and a new frozen state-map under a lifecycle-ish name
 * fails this test until it says what it is about.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** module → the ONE subject it describes. Adding a row is a deliberate act. */
const REGISTERED = Object.freeze({
  "lib/sports/event-lifecycle.mjs": { exp: "EVENT_STATE", subject: "one event, from the clock alone" },
  "lib/live/lifecycle.mjs": { exp: "LIFECYCLE_LABEL", subject: "one event, from the provider" },
  "lib/live/tracked-prediction.mjs": { exp: "RAIL_STATE", subject: "one prediction row, against a line or band" },
  "lib/lifecycle/card-lifecycle.mjs": { exp: "CARD_LIFECYCLE", subject: "a date or card, by publication and settlement" },
  /*
   * ⚠ THE DANGEROUS ADJACENCY, and this guard found it on its first run. `products/lifecycle.mjs`
   * exports `CARD`, one character-class away from `CARD_LIFECYCLE`, and BOTH have a VOID. They are
   * not the same subject:
   *
   *     CARD            what HAPPENED to a ladder card — won / lost / void / pending
   *     CARD_LIFECYCLE  HOW FAR ALONG a date's cards are — published / live / settled / …
   *
   * A card can be CARD_LIFECYCLE.SETTLED and CARD.LOST at once; those are answers to different
   * questions. Crossing them would let a pending ladder read as an unpublished day.
   */
  "lib/products/lifecycle.mjs": { exp: "CARD", subject: "a ladder card's graded outcome, and the ladder transition it implies" },
});

const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(mjs|ts)$/.test(e.name) && !/\.test\./.test(e.name)) acc.push(p);
  }
  return acc;
};

/*
 * ⚠ ONE SCAN, SHARED. The vacuity check below had its own `walk()` call, so emptying the OFFENDER
 * scan's loop left both tests green — the check could not vouch for the scan it was meant to guard.
 * They now read the same list, so a walker that reaches nothing fails the vacuity check too.
 */
const SCANNED = walk(path.join(SRC, "lib"))
  .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
  .filter((rel) => /lifecycle|tracked-prediction/i.test(rel));

test("every registered vocabulary exists and exports what the registry claims", () => {
  for (const [rel, { exp }] of Object.entries(REGISTERED)) {
    const file = path.join(SRC, rel);
    assert.ok(fs.existsSync(file), `${rel} is registered but missing — the registry must not describe a file that is gone`);
    assert.match(fs.readFileSync(file, "utf8"), new RegExp(`export const ${exp}\\s*=`), `${rel} no longer exports ${exp}`);
  }
});

test("no FIFTH lifecycle vocabulary has appeared unregistered", () => {
  /*
   * Scope: a file whose NAME is about lifecycle, exporting a frozen state map. Deliberately narrow —
   * a broad "any frozen object" scan would flag every token table in the repo and become the kind of
   * guard people delete.
   */
  const offenders = [];
  for (const rel of SCANNED) {
    if (REGISTERED[rel]) continue;
    const src = fs.readFileSync(path.join(SRC, rel), "utf8");
    const maps = [...src.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*Object\.freeze\(\{/g)].map((m) => m[1]);
    /* A label/phrase table for an ALREADY-registered vocabulary is not a new vocabulary. */
    const novel = maps.filter((n) => !/_LABEL$|_PHRASE$|_TONE$|_GROUP_LABEL$/.test(n));
    if (novel.length) offenders.push(`${rel} → ${novel.join(", ")}`);
  }
  assert.deepEqual(offenders, [], "an unregistered lifecycle vocabulary — declare its subject in REGISTERED");
});

test("the scan actually reaches the registered files — it must not pass by finding nothing", () => {
  /* A closed-set guard whose walker misses the directory reports success forever. */
  for (const rel of Object.keys(REGISTERED)) {
    assert.ok(SCANNED.includes(rel), `the walker never reached ${rel}`);
  }
  assert.ok(SCANNED.length >= Object.keys(REGISTERED).length, "the scan found fewer files than are registered");
});

test("each subject is stated once — two vocabularies must not claim the same subject", () => {
  const subjects = Object.values(REGISTERED).map((r) => r.subject);
  assert.equal(new Set(subjects).size, subjects.length, "duplicate subjects mean one of them is redundant");
});
