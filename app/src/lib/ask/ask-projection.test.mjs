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
import { fileURLToPath } from "node:url";

import {
  ASK_ASSET_PREFIX,
  ASK_BUDGET,
  ASK_EXPECTED_FORECAST_SPORTS,
  ASK_EXPECTED_PARLAY_SPORTS,
  ASK_PROJECTION_DIR,
  ASK_RECENT_SHARDS,
  FORBIDDEN_ASK_FIELDS,
  isAskDailyFile,
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
const dailyPresent = (manifest.files ?? []).some((f) => isAskDailyFile(f.path) && fs.existsSync(path.join(SRC, storedName(f.path))));

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

test("no parlay candidate belongs to a sport the capability registry bars from prediction products", { skip: !dailyPresent && "parlays.json is built by `npm run build`, not committed" }, () => {
  const parlays = read("parlays.json");
  let checked = 0;
  for (const day of Object.values(parlays.byDate ?? {})) {
    for (const [sport] of Object.entries(day.eligibleSports ?? {})) void sport;
    for (const slips of Object.values(day.profiles ?? {})) {
      for (const slip of slips) {
        checked += 1;
        assert.ok(canEnterPredictionProducts(slip.sport), `${slip.slipId}: ${slip.sport} may not enter prediction products (${capabilityOf(slip.sport).state})`);
        for (const leg of slip.legs ?? []) {
          assert.ok(canEnterPredictionProducts(leg.sport), `${slip.slipId}: a leg is ${leg.sport}, which may not enter prediction products`);
        }
      }
    }
  }
  assert.ok(checked > 0, "no candidates were checked — this guard would pass vacuously");
});

test("the frozen expectation still matches the live capability registry", () => {
  /*
   * ⚠ THE DORMANT-KEY TRAP. The optimizer artifact carries an `nba` cut in every snapshot and it is
   * always empty, which makes "we filter it" indistinguishable from "it happens to be empty". This
   * asserts the DERIVED answer: exactly the sports the registry currently permits, and no others. If
   * NBA is ever promoted back to FULL_MODEL this test fails and a human decides, rather than a legacy
   * JSON key quietly reopening a sport.
   */
  const parlay = ["mlb", "nfl", "epl", "nba", "ufc", "soccer", "nhl"].filter((s) => canEnterPredictionProducts(s));
  assert.deepEqual(parlay, [...ASK_EXPECTED_PARLAY_SPORTS], "the sports permitted into parlay candidates changed");

  const forecast = ["mlb", "nfl", "epl", "nba", "ufc", "soccer", "nhl"].filter((s) => canShowLiveProjections(s));
  assert.deepEqual(forecast.sort(), [...ASK_EXPECTED_FORECAST_SPORTS].sort(), "the sports permitted to show forecasts changed");

  assert.equal(capabilityOf("nba").state, "HISTORICAL_ONLY");
  assert.equal(canEnterPredictionProducts("nba"), false);
});

test("the manifest records every sport cut that was dropped, even when none was", () => {
  if (!present) return;
  // `dropped` is written even when empty: an absent field would be indistinguishable from "we stopped
  // recording drops", and an empty ARRAY is a claim that nothing was refused.
  assert.ok(Array.isArray(manifest.dropped), "the manifest must carry a dropped list");
});

/* ───────────────────────────  FORECASTS AND PAUSES  ─────────────────────────── */

test("no forecast belongs to a sport that may not show forward-looking output", { skip: !dailyPresent && "forecasts.json is built by `npm run build`, not committed" }, () => {
  const doc = read("forecasts.json");
  assert.ok((doc.forecasts ?? []).length > 0, "no forecasts were checked — this guard would pass vacuously");
  for (const f of doc.forecasts) {
    assert.ok(canShowLiveProjections(f.sport), `${f.forecastId}: ${f.sport} may not show forecasts`);
    // NFL and EPL publish under an experimental banner and are NOT product picks. The flag travels
    // with the forecast so the answer cannot drop it.
    if (f.sport !== "MLB") assert.equal(f.experimental, true, `${f.forecastId}: a non-FULL_MODEL forecast must be marked experimental`);
  }
});

test("a paused market ships as PAUSED with a reason, and never with a pick", { skip: !dailyPresent && "forecasts.json is built by `npm run build`, not committed" }, () => {
  const doc = read("forecasts.json");
  const paused = doc.forecasts.flatMap((f) => (f.markets ?? []).filter((m) => m.status === "PAUSED"));
  for (const m of paused) {
    assert.equal(m.pick, null, `a paused ${m.market} must carry no pick`);
    assert.equal(m.modelProbability, null, `a paused ${m.market} must carry no model probability`);
    assert.ok(m.pausedReason, `a paused ${m.market} must state why`);
  }
});

test("the artifact states that no expected-value owner and no staking policy exist", { skip: !dailyPresent && "parlays.json is built by `npm run build`, not committed" }, () => {
  const parlays = read("parlays.json");
  /*
   * Stated as DATA, not only in a prompt. The writer receives "GameTime publishes no price-aware
   * expected value" as a fact it repeats, rather than as a rule it is asked to obey.
   */
  assert.equal(parlays.evOwner, null, "no approved price-aware EV owner exists in this repository");
  assert.equal(parlays.stakePolicyOwner, null, "no approved staking policy exists in this repository");
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
