/**
 * EPL artifact schemas — the leakage gate exists from artifact ONE, not from a later audit.
 *
 * Includes a mutation test: the gate is removed in a child process (tsx caches modules, so an
 * in-process mutation would be decorative), the resulting behaviour change is observed, and the
 * source is restored and checked byte-identical.
 *
 * Run: npx tsx --test src/lib/soccer/epl-artifacts.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import {
  EPL_ARTIFACT_ROOT,
  EPL_ARTIFACT_SUBROOTS,
  MODEL_FIELD_KEYS,
  assertArtifactPublishable,
  findModelField,
  isRowPregame,
  validateFixtureArtifact,
  validateOddsArtifact,
} from "./epl-artifacts.ts";

const APP = process.cwd();
const KICKOFF = "2026-08-22T14:00:00Z";
const EVENT = "soccer:epl:arsenal-v-chelsea:20260822t1400";

const header = (over = {}) => ({
  schemaVersion: 1,
  competition: "epl",
  season: "2026-27",
  dataClass: "FIXTURE_SAMPLE",
  generatedAt: "2026-07-30T00:00:00Z",
  source: "synthetic",
  public: false,
  ...over,
});

const oddsRow = (over = {}) => ({
  eventId: EVENT,
  kickoffIso: KICKOFF,
  capturedAt: "2026-08-22T09:00:00Z",
  market: "MATCH_RESULT_1X2",
  book: "sample-book",
  prices: { HOME: -125, DRAW: 260, AWAY: 340 },
  ...over,
});

const fixtureRow = (over = {}) => ({
  eventId: EVENT,
  homeClub: "Arsenal",
  awayClub: "Chelsea",
  kickoffIso: KICKOFF,
  lifecycle: "SCHEDULED",
  providerRefs: [{ provider: "odds-api", id: "sample-evt-0001", kind: "event" }],
  capturedAt: "2026-07-30T00:00:00Z",
  ...over,
});

// ── the leakage gate ───────────────────────────────────────────────────────────

test("a capture that does not precede kickoff is REJECTED, not flagged", () => {
  const post = validateOddsArtifact({ ...header(), rows: [oddsRow({ capturedAt: "2026-08-22T16:00:00Z" })] });
  assert.equal(post.accepted.length, 0);
  assert.equal(post.rejected[0].code, "CAPTURE_NOT_PREGAME");
  assert.equal(post.clean, false);
});

test("a capture stamped exactly at kickoff is not pregame — equality cannot be shown to precede", () => {
  assert.equal(isRowPregame({ capturedAt: KICKOFF, kickoffIso: KICKOFF }), false);
  const v = validateOddsArtifact({ ...header(), rows: [oddsRow({ capturedAt: KICKOFF })] });
  assert.equal(v.rejected[0].code, "CAPTURE_NOT_PREGAME");
});

test("the gate is fail-closed on missing or unparseable timestamps", () => {
  const cases = [
    [{ capturedAt: undefined }, "MISSING_CAPTURED_AT"],
    [{ capturedAt: "" }, "MISSING_CAPTURED_AT"],
    [{ kickoffIso: undefined }, "MISSING_KICKOFF"],
    [{ capturedAt: "some time before" }, "UNPARSEABLE_TIMESTAMP"],
    [{ kickoffIso: "Saturday 3pm" }, "UNPARSEABLE_TIMESTAMP"],
    [{ eventId: "" }, "MISSING_EVENT_ID"],
  ];
  for (const [over, code] of cases) {
    const v = validateOddsArtifact({ ...header(), rows: [oddsRow(over)] });
    assert.equal(v.rejected[0]?.code, code, JSON.stringify(over));
    assert.equal(v.accepted.length, 0);
  }
  assert.equal(isRowPregame({ capturedAt: null, kickoffIso: KICKOFF }), false);
  assert.equal(isRowPregame({ capturedAt: "2026-01-01T00:00:00Z", kickoffIso: null }), false);
});

test("a pregame row is accepted", () => {
  const v = validateOddsArtifact({ ...header(), rows: [oddsRow()] });
  assert.equal(v.accepted.length, 1);
  assert.equal(v.clean, true);
});

// ── no model fields ────────────────────────────────────────────────────────────

test("a modelled field anywhere in the row is refused", () => {
  for (const key of MODEL_FIELD_KEYS) {
    const v = validateOddsArtifact({ ...header(), rows: [oddsRow({ [key]: 0.42 })] });
    assert.equal(v.rejected[0]?.code, "MODEL_FIELD_PRESENT", key);
  }
  // Nested, too — a model number hidden one level down still reaches a template.
  const nested = validateOddsArtifact({ ...header(), rows: [oddsRow({ meta: { inner: { rating: 7 } } })] });
  assert.equal(nested.rejected[0].code, "MODEL_FIELD_PRESENT");
  assert.match(nested.rejected[0].message, /meta\.inner\.rating/);
});

test("findModelField reports the path, and returns null on a clean row", () => {
  assert.equal(findModelField(oddsRow()), null);
  assert.equal(findModelField({ a: [{ projection: 1 }] }), "a.0.projection");
});

// ── fixture rows ───────────────────────────────────────────────────────────────

test("an UNKNOWN lifecycle is rejected rather than assumed SCHEDULED", () => {
  const v = validateFixtureArtifact({ ...header(), rows: [fixtureRow({ lifecycle: "UNKNOWN" })] });
  assert.equal(v.rejected[0].code, "UNKNOWN_LIFECYCLE");
});

test("a market other than the three-way result is refused until a provider payload proves it", () => {
  const v = validateOddsArtifact({ ...header(), rows: [oddsRow({ market: "TOTALS" })] });
  assert.equal(v.rejected[0].code, "UNSUPPORTED_MARKET");
});

test("prices must each be a finite number or null", () => {
  for (const prices of [
    { HOME: "-125", DRAW: 260, AWAY: 340 },
    { HOME: Number.NaN, DRAW: 260, AWAY: 340 },
    undefined,
  ]) {
    const v = validateOddsArtifact({ ...header(), rows: [oddsRow({ prices })] });
    assert.equal(v.rejected[0].code, "MALFORMED_PRICES", JSON.stringify(prices));
  }
});

test("publication refuses an artifact with any rejected row", () => {
  const v = validateOddsArtifact({ ...header(), rows: [oddsRow(), oddsRow({ capturedAt: "2026-08-23T00:00:00Z" })] });
  assert.equal(v.accepted.length, 1, "a research caller may still take the clean subset");
  assert.throws(() => assertArtifactPublishable(v, "odds"), /CAPTURE_NOT_PREGAME/);
  assert.doesNotThrow(() => assertArtifactPublishable(validateOddsArtifact({ ...header(), rows: [oddsRow()] }), "odds"));
});

// ── the committed sample artifacts ─────────────────────────────────────────────

test("every committed EPL artifact validates clean and is marked non-public sample data", () => {
  const roots = { fixtures: validateFixtureArtifact, odds: validateOddsArtifact };
  let seen = 0;

  for (const [subroot, validate] of Object.entries(roots)) {
    const dir = path.join(APP, EPL_ARTIFACT_ROOT, subroot);
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      seen += 1;
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      assert.equal(data.competition, "epl", name);
      assert.equal(data.dataClass, "FIXTURE_SAMPLE", `${name} — nothing live exists yet`);
      assert.equal(data.public, false, `${name} must be swept out of the deployed export`);
      assert.match(data.notes ?? "", /SAMPLE/, `${name} must say what it is`);
      assert.doesNotThrow(() => assertArtifactPublishable(validate(data), `${subroot}/${name}`));
    }
  }
  assert.ok(seen >= 3, `expected committed samples, found ${seen}`);
});

test("results/ and settlement/ are empty — no approved source, so nothing was invented", () => {
  for (const subroot of ["results", "settlement"]) {
    const dir = path.join(APP, EPL_ARTIFACT_ROOT, subroot);
    assert.deepEqual(
      fs.readdirSync(dir).filter((f) => f.endsWith(".json")),
      [],
      `${subroot}/ must hold no artifacts while settlement is switched off`,
    );
  }
});

test("all four artifact subroots exist and carry provenance", () => {
  for (const subroot of EPL_ARTIFACT_SUBROOTS) {
    const readme = path.join(APP, EPL_ARTIFACT_ROOT, subroot, "README.md");
    assert.ok(fs.existsSync(readme), `${subroot}/README.md`);
    assert.ok(fs.readFileSync(readme, "utf8").length > 200, `${subroot}/README.md must say something`);
  }
  assert.ok(fs.existsSync(path.join(APP, EPL_ARTIFACT_ROOT, "README.md")));
});

// ── mutation: the leakage gate is load-bearing ─────────────────────────────────

const MODULE = path.join(APP, "src/lib/soccer/epl-artifacts.ts");
const PROBE = path.join(APP, "src/lib/soccer/leakage-gate.probe.tmp.mjs");
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");

const PROBE_SOURCE = `import { validateOddsArtifact } from "./epl-artifacts.ts";
const v = validateOddsArtifact({
  schemaVersion: 1, competition: "epl", season: "2026-27", dataClass: "FIXTURE_SAMPLE",
  generatedAt: "2026-07-30T00:00:00Z", source: "synthetic", public: false,
  rows: [{
    eventId: ${JSON.stringify(EVENT)}, kickoffIso: ${JSON.stringify(KICKOFF)},
    capturedAt: "2026-08-22T16:00:00Z", market: "MATCH_RESULT_1X2", book: "b",
    prices: { HOME: -125, DRAW: 260, AWAY: 340 },
  }],
});
console.log(JSON.stringify({ accepted: v.accepted.length, codes: v.rejected.map((r) => r.code) }));
`;

test("MUTATION: deleting the pregame check makes a post-kickoff row accepted", () => {
  const original = fs.readFileSync(MODULE, "utf8");
  const before = md5(MODULE);

  const GATE = `    if (!isRowPregame(row)) {`;
  assert.ok(original.includes(GATE), "the mutation target must exist, or this test proves nothing");

  const run = () => JSON.parse(execFileSync("npx", ["tsx", PROBE], { cwd: APP, encoding: "utf8" }).trim());

  try {
    fs.writeFileSync(PROBE, PROBE_SOURCE);

    const clean = run();
    assert.deepEqual(clean, { accepted: 0, codes: ["CAPTURE_NOT_PREGAME"] }, "unmutated: the row is refused");

    const mutated = original.replace(GATE, `    if (false) {`);
    assert.notEqual(mutated, original, "the mutation must actually change the source");
    fs.writeFileSync(MODULE, mutated);
    assert.notEqual(md5(MODULE), before, "the mutation is on disk");

    const leaked = run();
    assert.deepEqual(
      leaked,
      { accepted: 1, codes: [] },
      "with the gate removed a post-kickoff row is accepted — the gate is what refuses it",
    );
  } finally {
    fs.writeFileSync(MODULE, original);
    if (fs.existsSync(PROBE)) fs.rmSync(PROBE);
  }

  assert.equal(md5(MODULE), before, "the source must be restored byte-identical");
  assert.equal(fs.existsSync(PROBE), false, "the probe must not survive the test");
});
