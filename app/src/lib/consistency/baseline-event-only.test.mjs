/**
 * A reviewed `eventOnly` baseline entry acknowledges exactly ONE fingerprint. It must not teach the baseline its class
 * or its event — otherwise acknowledging one historical artifact would silently downgrade every future occurrence of
 * that kind of inconsistency to "data drift". Release readiness 2026-10-26: main's third unit failure was one such
 * historical event (NFL 401873011, PIT @ NO), whose cause PR 1247 fixes; see known-discrepancies.json.
 * Run: npx tsx --test src/lib/consistency/baseline-event-only.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { baselineOf, compareWithBaseline, fingerprintClass } from "./audit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FP = (event) => `MODEL_VERSION_MIX|NFL|${event}|nfl-player-board|${event}|-|OFFICIAL:inputRef`;
const disc = (event) => ({ fingerprint: FP(event), count: 1, severity: "ERROR", sources: [`app/public/data/nfl/player-board/${event}.json`] });
const audit = (...events) => ({ version: "gtp.consistency.audit@1", events: {}, manifest: {}, discrepancies: events.map(disc) });
const base = (entries) => ({ manifest: {}, entries });

test("an eventOnly entry admits exactly its own fingerprint", () => {
  const b = base([{ f: FP("401873011"), n: 1, sev: "ERROR", s: [], eventOnly: true, review: "x" }]);
  const cmp = compareWithBaseline(audit("401873011"), b);
  assert.deepEqual([cmp.newStrict.length, cmp.grown.length, cmp.drift.length], [0, 0, 0]);
});

test("…and every OTHER event of that class still fails strictly — the class is not pinned", () => {
  const b = base([{ f: FP("401873011"), n: 1, sev: "ERROR", s: [], eventOnly: true, review: "x" }]);
  const cmp = compareWithBaseline(audit("401873011", "401873099"), b);
  assert.deepEqual(cmp.newStrict.map((d) => d.fingerprint), [FP("401873099")]);
  assert.equal(cmp.drift.length, 0, "not excused as drift");
  /* Contrast: an ordinary entry pins the class, so a new event of it is (by design) drift. */
  const ordinary = compareWithBaseline(audit("401873011", "401873099"), base([{ f: FP("401873011"), n: 1, sev: "ERROR", s: [] }]));
  assert.deepEqual([ordinary.newStrict.length, ordinary.drift.length], [0, 1]);
});

test("a higher count on the acknowledged fingerprint still fails while its data is unchanged", () => {
  const src = "app/public/data/nfl/player-board/401873011.json";
  const b = { manifest: { [src]: "sha-at-pin" }, entries: [{ f: FP("401873011"), n: 1, sev: "ERROR", s: [], eventOnly: true, review: "x" }] };
  const a = audit("401873011"); a.discrepancies[0].count = 2; a.manifest[src] = "sha-at-pin";
  assert.equal(compareWithBaseline(a, b).grown.length, 1);
});

test("a full re-pin keeps the acknowledgement event-only (it never widens to the class)", () => {
  const prior = base([{ f: FP("401873011"), n: 1, sev: "ERROR", s: [], eventOnly: true, review: "reviewed" }]);
  const repinned = baselineOf(audit("401873011", "401873099"), prior);
  const e = repinned.entries.find((x) => x.f === FP("401873011"));
  assert.deepEqual([e.eventOnly, e.review], [true, "reviewed"]);
  assert.equal(repinned.entries.find((x) => x.f === FP("401873099")).eventOnly, undefined, "only what was reviewed");
});

test("THE COMMITTED ACKNOWLEDGEMENT: one entry, event-only, with its review, and nothing else changed class", () => {
  const b = JSON.parse(fs.readFileSync(path.join(here, "known-discrepancies.json"), "utf8"));
  const acks = b.entries.filter((e) => e.eventOnly);
  assert.deepEqual(acks.map((e) => e.f), [FP("401873011")]);
  assert.match(acks[0].review, /timestamp-only forecast revision/);
  assert.match(acks[0].review, /class is NOT pinned/);
  assert.ok(!b.entries.some((e) => !e.eventOnly && fingerprintClass(e.f) === fingerprintClass(FP("401873011"))), "no ordinary entry pins the board/record class");
});
