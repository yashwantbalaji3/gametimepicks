/**
 * Acquisition and transform are two different things, and only one of them costs money.
 *
 * The capture script buys a provider response and then transforms it into a published artifact. The
 * spend cooldown could not tell those apart, so it stopped both: on 2026-08-27 a corrected join and
 * a corrected coverage classifier each ran against a live UFC card and changed nothing, because the
 * run exited at the cooldown before reaching the transform. Three dispatches to notice, with wrong
 * labels published in between.
 *
 * These cases pin the split, and pin every way a half-trusted cache entry must be refused.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ACQUISITION_VERSION,
  responseHash,
  writeAcquisition,
  readAcquisition,
} from "./acquisition-cache.mjs";

const FP = "ufc|mma_mixed_martial_arts|h2h|us|600060620";
const BODY = [{ id: "e1", home_team: "Song Yadong", away_team: "Umar Nurmagomedov", bookmakers: [] }];
const HEADERS = { "x-requests-last": "1", "x-requests-used": "15", "x-requests-remaining": "485" };

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "acq-"));
}

test("a written acquisition reads back byte-identical", () => {
  const root = tmpRoot();
  writeAcquisition({ root, fingerprint: FP, at: "2026-08-27T20:46:53Z", status: 200, headers: HEADERS, body: BODY });
  const got = readAcquisition({ root, fingerprint: FP });
  assert.deepEqual(got.body, BODY);
  assert.equal(got.acquiredAt, "2026-08-27T20:46:53Z");
  assert.equal(got.status, 200);
});

test("the provider's own usage headers are kept verbatim, not our arithmetic about them", () => {
  const root = tmpRoot();
  writeAcquisition({ root, fingerprint: FP, at: "2026-08-27T20:46:53Z", status: 200, headers: HEADERS, body: BODY });
  const got = readAcquisition({ root, fingerprint: FP });
  assert.equal(got.headers["x-requests-remaining"], "485");
  assert.equal(got.headers["x-requests-used"], "15");
});

test("a different fingerprint is a different acquisition, never an overwrite", () => {
  // Different markets or regions buy different bytes; collapsing them would re-derive one request's
  // artifact from another request's payload.
  const root = tmpRoot();
  writeAcquisition({ root, fingerprint: FP, at: "t1", status: 200, headers: HEADERS, body: BODY });
  writeAcquisition({ root, fingerprint: `${FP}|totals`, at: "t2", status: 200, headers: HEADERS, body: [{ id: "other" }] });
  assert.deepEqual(readAcquisition({ root, fingerprint: FP }).body, BODY);
  assert.equal(readAcquisition({ root, fingerprint: `${FP}|totals` }).body[0].id, "other");
});

test("responseHash tells a genuinely new payload from a repeated one", () => {
  assert.equal(responseHash(BODY), responseHash([...BODY]));
  assert.notEqual(responseHash(BODY), responseHash([...BODY, { id: "e2" }]));
});

/* ── EVERY REFUSAL ────────────────────────────────────────────────────────────────────────────── */

test("REFUSAL · a missing entry is null, not an empty re-derivation", () => {
  assert.equal(readAcquisition({ root: tmpRoot(), fingerprint: FP }), null);
});

test("REFUSAL · an unrecognised schema version is not trusted", () => {
  const root = tmpRoot();
  writeAcquisition({ root, fingerprint: FP, at: "t", status: 200, headers: HEADERS, body: BODY });
  const file = fs.readdirSync(path.join(root, "acquisitions"))[0];
  const p = path.join(root, "acquisitions", file);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  fs.writeFileSync(p, JSON.stringify({ ...raw, version: ACQUISITION_VERSION + 1 }));
  assert.equal(readAcquisition({ root, fingerprint: FP }), null);
});

test("REFUSAL · a tampered body fails its own hash and is refused", () => {
  /*
   * The important one. A half-trusted payload re-derived into a published artifact is worse than no
   * re-derivation at all, because the result looks exactly like a fresh capture.
   */
  const root = tmpRoot();
  writeAcquisition({ root, fingerprint: FP, at: "t", status: 200, headers: HEADERS, body: BODY });
  const file = fs.readdirSync(path.join(root, "acquisitions"))[0];
  const p = path.join(root, "acquisitions", file);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  raw.body[0].home_team = "Someone Else";
  fs.writeFileSync(p, JSON.stringify(raw));
  assert.equal(readAcquisition({ root, fingerprint: FP }), null);
});

test("REFUSAL · an entry whose fingerprint was edited is refused", () => {
  const root = tmpRoot();
  writeAcquisition({ root, fingerprint: FP, at: "t", status: 200, headers: HEADERS, body: BODY });
  const file = fs.readdirSync(path.join(root, "acquisitions"))[0];
  const p = path.join(root, "acquisitions", file);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  fs.writeFileSync(p, JSON.stringify({ ...raw, fingerprint: "someone-elses-request" }));
  assert.equal(readAcquisition({ root, fingerprint: FP }), null);
});

test("REFUSAL · a non-200 acquisition is never re-derived from", () => {
  const root = tmpRoot();
  writeAcquisition({ root, fingerprint: FP, at: "t", status: 429, headers: HEADERS, body: { message: "rate limited" } });
  assert.equal(readAcquisition({ root, fingerprint: FP }), null);
});

test("REFUSAL · unreadable bytes are null rather than a throw", () => {
  const root = tmpRoot();
  writeAcquisition({ root, fingerprint: FP, at: "t", status: 200, headers: HEADERS, body: BODY });
  const file = fs.readdirSync(path.join(root, "acquisitions"))[0];
  fs.writeFileSync(path.join(root, "acquisitions", file), "{not json");
  assert.equal(readAcquisition({ root, fingerprint: FP }), null);
});

/* ── THE CALLER'S CONTRACT ────────────────────────────────────────────────────────────────────── */

test("THE SPLIT · the capture reaches its transform on a cooldown, and cannot spend there", () => {
  /*
   * Read off the script rather than run against a live provider. Three properties, all of which
   * were false before: the duplicate branch loads a cached acquisition instead of exiting; the
   * network call is skipped entirely when it does; and no request is recorded to the spend ledger
   * for a call that was never made — an inflated ledger being worse than the missing line.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ufc/capture-ufc-odds.mjs"), "utf8");
  const blank = (m) => m.replace(/[^\n]/g, " ");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);

  assert.match(code, /if \(dup\.duplicate\) \{[\s\S]{0,400}readAcquisition/, "the cooldown must load the cache, not exit");
  assert.match(code, /if \(acquisition\) \{[\s\S]{0,300}status: acquisition\.status/, "a re-derivation must skip the network");
  assert.match(code, /if \(!acquisition\) \{\s*\nledger = recordRequest/, "a re-derivation must not record a request");
  assert.match(code, /if \(!acquisition && status === 200/, "a re-derivation must not re-stamp the cache");

  assert.match(code, /creditCost: acquisition \? 0 :/,
    "a re-derivation must publish zero cost — reading the last ledger entry would claim the EARLIER purchase's credit");

  // And the one thing that must never appear inside the re-derivation branch.
  const branch = code.slice(code.indexOf("if (acquisition) {"), code.indexOf("} else {", code.indexOf("if (acquisition) {")));
  assert.doesNotMatch(branch, /fetch\(/, "nothing in the re-derivation path may contact the provider");
});
