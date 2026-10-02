/**
 * Session 5 · B5 — a sport's paper ladder publishes only what the capability registry allows that sport to show.
 * No ladder consulted the registry, so UFC (SCAFFOLD_ONLY) published cards carrying fitted-model probabilities
 * (2026-10-03: 0.976 on a +185 underdog) as "the model's own read". UFC's real status is a founder decision; the
 * gate makes the registry — not the ladder — the place that decision is recorded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { canShowLiveProjections, capabilityOf } from "../sport-capability-registry.ts";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("WIRED: every sport ladder consults the registry before it can publish", () => {
  for (const s of ["ufc", "epl", "nfl"]) {
    const code = strip(fs.readFileSync(`scripts/${s}/build-${s}-ladder.mjs`, "utf8"));
    const gate = code.indexOf("if (!canShowLiveProjections(SPORT_KEY))");
    assert.ok(gate > 0, `${s}: no capability gate`);
    assert.match(code, new RegExp(`const SPORT_KEY = "${s}";`));
    assert.ok(gate < code.indexOf('state: "PUBLISHED"'), `${s}: the gate must run before a ladder can publish`);
  }
  for (const [wf, s] of [["ufc-fight-week", "ufc"], ["epl-matchweek", "epl"], ["nfl-odds-capture", "nfl"]]) {
    const y = fs.readFileSync(`../.github/workflows/${wf}.yml`, "utf8");
    assert.match(y, new RegExp(`npx tsx scripts/${s}/build-${s}-ladder\\.mjs`), `${wf}: the ladder imports the TS registry, so it must run under tsx`);
  }
});

test("UFC as registered today is CAPABILITY_GATED — run on the real producer, written to a temp dir", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-ufc-ladder-"));
  try {
    execFileSync("npx", ["tsx", "scripts/ufc/build-ufc-ladder.mjs", "--now", "2026-10-02T03:00:00Z", "--out-dir", out], { encoding: "utf8" });
    const latest = JSON.parse(fs.readFileSync(path.join(out, "latest.json"), "utf8"));
    if (canShowLiveProjections("ufc")) return assert.notEqual(latest.state, "CAPABILITY_GATED", "the registry now permits UFC; the gate must step aside");
    assert.equal(latest.state, "CAPABILITY_GATED");
    assert.deepEqual(latest.cards, []);
    assert.match(latest.reason, new RegExp(capabilityOf("ufc").state));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("the permitted states are exactly the ones that may show forward output", () => {
  assert.equal(canShowLiveProjections("mlb"), true);
  assert.equal(canShowLiveProjections("nfl"), true, "EXPERIMENTAL_PUBLIC lanes were founder-approved");
  assert.equal(canShowLiveProjections("epl"), true);
  assert.equal(canShowLiveProjections("nba"), false);
});
