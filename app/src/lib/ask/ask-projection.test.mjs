/**
 * ASK PROJECTION GUARDS — the committed artifact, and the CI contract that protects the endpoint.
 *
 * These read the COMMITTED projection (`data/ask-projection/v1`) rather than the emitted public copy,
 * so they run in the unit phase before any build. What they assert is the set of things that, if they
 * stopped being true, would fail SILENTLY in production: a leaked internal field, an ineligible sport
 * reopening, a link nobody approved, an asset over the loader's ceiling, or a CI filter that stops
 * covering the runtime.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ASK_ASSET_PREFIX,
  ASK_BUDGET,
  ASK_EXPECTED_FORECAST_SPORTS,
  ASK_EXPECTED_PARLAY_SPORTS,
  ASK_PROJECTION_DIR,
  ASK_RECENT_SHARDS,
  FORBIDDEN_ASK_FIELDS,
  askStoredGzipped,
  isAllowedAssetPath,
  isApprovedLink,
  storedName,
} from "./contract.mjs";
import { canEnterPredictionProducts, canShowLiveProjections, capabilityOf } from "../sport-capability-registry.ts";
import { recentShardOf } from "./contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SRC = path.join(APP, "..", ASK_PROJECTION_DIR);
const present = fs.existsSync(path.join(SRC, "manifest.json"));

/*
 * REFUSE TO RUN VACUOUSLY. A guard that quietly returns when its input is missing is the defect class
 * this repository has already paid for twice — 250 tests "passing" while asserting nothing. If the
 * projection is absent the suite FAILS and says how to build it.
 */
test("the committed Ask projection exists", () => {
  assert.ok(present, `no projection at ${ASK_PROJECTION_DIR} — run \`npm run ask:build\``);
});

const read = (rel) => {
  const buf = fs.readFileSync(path.join(SRC, storedName(rel)));
  return JSON.parse((askStoredGzipped(rel) ? zlib.gunzipSync(buf) : buf).toString("utf8"));
};
const manifest = present ? read("manifest.json") : { files: [] };
/*
 * Only the files that are actually on disk. `forecasts.json` and `parlays.json` are built by
 * `npm run build`, not committed, so in a fresh checkout they are absent — and a guard that threw on
 * their absence would fail for everyone who had not run a build, which is how a useful guard becomes
 * a ritual `npm run build` before running tests.
 */
const files = (manifest.files ?? []).filter((f) => fs.existsSync(path.join(SRC, storedName(f.path))));

/*
 * ⚠ CHECKED BY NAME, NOT VIA THE MANIFEST. The manifest lists only the COMMITTED files, so looking
 * for the daily artifacts in it always finds nothing — and the four guards below (NBA eligibility,
 * the paused market, the EV/stake owners) would have skipped for ever while reporting as skipped,
 * which reads like a deliberate exclusion rather than a broken check.
 */

test("every committed artifact is actually TRACKED BY GIT, not merely present on disk", () => {
  /*
   * ⚠ THE FAILURE THIS EXISTS FOR. The manifest was briefly gitignored alongside the daily artifacts.
   * Locally it was present-but-untracked, so every guard that reads it passed; in a fresh CI checkout
   * it did not exist, the projection guard found no index and correctly refused to pass vacuously —
   * and the build went red for a reason no local run could reproduce.
   *
   * "Present on disk" and "in the repository" are different claims, and only the second one is true
   * for everyone else. ONE `git ls-files` call, not a check-ignore per file: a per-file spawn cost
   * this CI 53 seconds once already.
   */
  if (!files.length) return;
  const tracked = new Set(
    execFileSync("git", ["ls-files", ASK_PROJECTION_DIR], { cwd: path.join(APP, ".."), encoding: "utf8" })
      .split("\n").filter(Boolean),
  );
  assert.ok(tracked.size > 0, "git reports no tracked files under the projection — the probe would pass vacuously");

  for (const f of [...files.map((x) => x.path), "manifest.json"]) {
    const rel = `${ASK_PROJECTION_DIR}/${storedName(f)}`;
    assert.ok(tracked.has(rel), `${rel} is on disk but not tracked by git — it would be absent in a fresh checkout`);
  }

  // The other direction: the DAILY artifacts must NOT be tracked, or they go stale in the repository.
  for (const daily of ["forecasts.json", "parlays.json"]) {
    assert.ok(!tracked.has(`${ASK_PROJECTION_DIR}/${daily}`), `${daily} must be built, not committed — a committed copy is stale within hours`);
  }
});

test("every file in the manifest exists, at the byte size it claims", () => {
  for (const f of files) {
    const abs = path.join(SRC, storedName(f.path));
    assert.ok(fs.existsSync(abs), `${f.path} is in the manifest but not on disk`);
    const text = askStoredGzipped(f.path) ? zlib.gunzipSync(fs.readFileSync(abs)).toString("utf8") : fs.readFileSync(abs, "utf8");
    assert.equal(Buffer.byteLength(text), f.bytes, `${f.path}: the manifest's byte count does not match the file`);
  }
});

test("no artifact carries an internal field name or a credential shape", () => {
  for (const f of files) {
    const text = JSON.stringify(read(f.path));
    const lower = text.toLowerCase();
    for (const field of FORBIDDEN_ASK_FIELDS) {
      const re = new RegExp(`["'\\s/\\-_.]${field.toLowerCase()}["'\\s:/\\-_.]`);
      assert.ok(!re.test(lower), `${f.path} contains the forbidden field name "${field}"`);
    }
    for (const [re, what] of [
      [/(?:^|[^\w-])\/(?:Users|home)\/[a-z]/i, "a home-directory path"],
      [/data\/internal\//i, "an internal data path"],
      [/\bsk-ant-[A-Za-z0-9_-]{16,}/, "an Anthropic key"],
      [/\bsk-[A-Za-z0-9]{24,}/, "an API key"],
    ]) {
      assert.ok(!re.test(text), `${f.path} contains ${what}`);
    }
  }
});

test("every link in every artifact is one the approved route registry permits", () => {
  const hrefs = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if ((k === "href" || k === "path" || k === "route") && typeof x === "string" && x.startsWith("/")) hrefs.push(x);
        else walk(x);
      }
    }
  };
  for (const f of files) walk(read(f.path));
  assert.ok(hrefs.length > 0, "the probe found no links to check — it would pass vacuously");
  for (const href of hrefs) assert.ok(isApprovedLink(href), `${href} is not an approved product route`);
});

/* ───────────────────────────  THE NBA RULE  ─────────────────────────── */

test("the frozen expectation still matches the live capability registry", () => {
  /*
   * ⚠ THE DORMANT-KEY TRAP. The optimizer artifact carries an `nba` cut in every snapshot and it is
   * always empty, which makes "we filter it" indistinguishable from "it happens to be empty". This
   * asserts the DERIVED answer: exactly the sports the registry currently permits, and no others. If
   * NBA is ever promoted back to FULL_MODEL this test fails and a human decides, rather than a legacy
   * JSON key quietly reopening a sport.
   *
   * The artifact-level check — that no NBA candidate is actually PRESENT — lives in
   * ask-published.test.mjs, which reads the built export so it runs after the daily artifacts exist.
   */
  const parlay = ["mlb", "nfl", "epl", "nba", "ufc", "soccer", "nhl"].filter((s) => canEnterPredictionProducts(s));
  assert.deepEqual(parlay, [...ASK_EXPECTED_PARLAY_SPORTS], "the sports permitted into parlay candidates changed");

  const forecast = ["mlb", "nfl", "epl", "nba", "ufc", "soccer", "nhl"].filter((s) => canShowLiveProjections(s));
  assert.deepEqual(forecast.sort(), [...ASK_EXPECTED_FORECAST_SPORTS].sort(), "the sports permitted to show forecasts changed");

  assert.equal(capabilityOf("nba").state, "HISTORICAL_ONLY");
  assert.equal(canEnterPredictionProducts("nba"), false);
});

test("the manifest records every sport cut that was dropped, even when none was", () => {
  // `dropped` is written even when empty: an absent field would be indistinguishable from "we stopped
  // recording drops", and an empty ARRAY is a claim that nothing was refused.
  assert.ok(Array.isArray(manifest.dropped), "the manifest must carry a dropped list");
});

/* ───────────────────────────  SIZE AND SHAPE  ─────────────────────────── */

test("no published asset exceeds the loader's own ceiling", () => {
  for (const f of files) {
    const text = JSON.stringify(read(f.path));
    const bytes = Buffer.byteLength(text);
    assert.ok(
      bytes <= ASK_BUDGET.maxAssetBytes,
      `${f.path} is ${(bytes / 1024).toFixed(0)} KB, over the loader's ceiling — an asset the endpoint cannot read ` +
      "fails silently in production only. Pack or shard it; do not raise the ceiling.",
    );
  }
});

test("every artifact path is one the loader would accept", () => {
  for (const f of files) {
    assert.ok(isAllowedAssetPath(`${ASK_ASSET_PREFIX}/${f.path}`), `${f.path} would be refused by the loader's allowlist`);
  }
});

test("the Last-N shards are complete and every player sits in the shard its id hashes to", () => {
  if (!present) return;
  for (const sport of ["mlb", "nfl", "epl"]) {
    const shards = files.filter((f) => f.path.startsWith(`recent/${sport}/`));
    if (!shards.length) continue;
    assert.equal(shards.length, ASK_RECENT_SHARDS, `${sport} must have ${ASK_RECENT_SHARDS} shards`);
    let players = 0;
    for (const f of shards) {
      const doc = read(f.path);
      for (const id of Object.keys(doc.players ?? {})) {
        assert.equal(recentShardOf(id), doc.shard, `${id} is in shard ${doc.shard} but hashes to ${recentShardOf(id)}`);
        players += 1;
      }
      // A null value means NOT RECORDED. A zero would be a claim the source never made.
      for (const p of Object.values(doc.players ?? {})) {
        assert.ok(Array.isArray(p.rows) && p.rows.length <= 10, "a Last-N row list is bounded at ten");
      }
    }
    assert.ok(players > 0, `${sport} shards hold no players — this guard would pass vacuously`);
  }
});
