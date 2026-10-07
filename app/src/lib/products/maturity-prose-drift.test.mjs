/**
 * Stage 4D · prose drift. Typed status prose must not claim more maturity than the canonical contract derives for
 * that sport (founder Q2: least-mature layer wins; "Soccer: never imply validated"). Source-level, so it fails the
 * moment a sentence is edited, before a build. It checks claim words only; it does not choose the copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveMaturity, MATURITY } from "./product-status.mjs";
import { capabilityState } from "../sport-capability-registry.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
// "not validated" is an honest denial, so strip negations before looking for a claim.
const CLAIM = /\b(validated|established|proven)\b/i;
const claims = (text) => CLAIM.test(String(text).replace(/\b(not|never|un)[\s-]+(yet\s+)?(validated|established|proven)\b/gi, ""));

test("top-reads PROVENANCE: no sport below ESTABLISHED is described as validated, established or proven", () => {
  const block = src("src/lib/top-reads.ts").match(/const PROVENANCE: Record<string, string> = \{([\s\S]*?)\n\};/);
  assert.ok(block, "PROVENANCE block found");
  const entries = [...block[1].matchAll(/^\s*(\w+):\s*"([^"]*)"/gm)];
  assert.ok(entries.length >= 3);
  for (const [, sport, text] of entries) {
    const m = deriveMaturity([`registry:${capabilityState(sport)}`]);
    if (m !== MATURITY.ESTABLISHED) assert.equal(claims(text), false, `${sport} (${m}): "${text}"`);
  }
});

test("home statusSub lines make no maturity claim (they sit under sport tiles, most of which are experimental)", () => {
  const subs = [...src("src/app/page.tsx").matchAll(/statusSub:\s*([^\n]+)/g)].map((m) => m[1]);
  assert.ok(subs.length >= 4);
  for (const s of subs) assert.equal(claims(s), false, s);
});

test("NFL coverage labels never render a state as validated or established", () => {
  const block = src("src/app/nfl/page.tsx").match(/const COVERAGE_STATE_LABEL: Record<string, string> = \{([\s\S]*?)\n\};/);
  assert.ok(block);
  assert.equal(claims(block[1]), false);
});
