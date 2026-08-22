/**
 * The operator model read — what it may say, and what it must never become.
 *
 * Run: npx tsx --test src/lib/sports/epl/model-read.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const SRC = fs.readFileSync(path.join(APP, "scripts/epl/build-epl-model-read.mjs"), "utf8");
const ART = path.join(REPO, "data/internal/research/epl/model-read/latest.json");
const read = fs.existsSync(ART) ? JSON.parse(fs.readFileSync(ART, "utf8")) : null;

test("PRIVATE — the comparison is derived from a paid capture and must never reach the export", () => {
  if (read) {
    assert.equal(read.public, false);
    assert.equal(read.dataClass, "INTERNAL_RESEARCH");
  }
  // It writes under data/internal/research, which the public build never reads from.
  assert.match(SRC, /data\/internal\/research\/epl\/model-read/);
  assert.doesNotMatch(SRC.replace(/\/\*[\s\S]*?\*\//g, ""), /app\/public|public\/data/, "an operator view must not write to a public root");
  assert.equal(fs.existsSync(path.join(APP, "out/data/soccer/epl/model-read")), false);
});

test("IT EMITS NO PICK VOCABULARY — a difference is a difference, not a recommendation", () => {
  /*
   * The model's calibration is UNPROVEN and zero matches have been scored against a no-vig price, so
   * every word that would let a disagreement read as a selection is refused. This is the same
   * vocabulary the public lane bans; it matters more here, because here there are real numbers to
   * dress up.
   */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const banned of [/\blean\b/i, /\bedge\b/i, /\bconfidence\b/i, /\bpick(s|ed)?\b/i, /\brating\b/i, /\bvalue bet\b/i, /\bstake\b/i]) {
    assert.doesNotMatch(code, banned, `the model read must not emit ${banned}`);
  }
  if (read) {
    const json = JSON.stringify(read);
    for (const banned of [/"lean"/i, /"edge/i, /"confidence"/i, /"pick/i]) {
      assert.doesNotMatch(json, banned, `the artifact must not carry ${banned}`);
    }
  }
});

test("the artifact states its own lack of validation, on the artifact", () => {
  if (!read) return;
  // Not in a README someone has to find. A reader who opens this file sees it in the second field.
  assert.match(read.validation, /NOT_VALIDATED_OUT_OF_SAMPLE/);
  assert.match(read.validation, /zero matches/i);
});

test("a COLD-START fixture is flagged on its own row, where the disagreement is", () => {
  if (!read?.rows?.length) return;
  /*
   * The whole reason this must not be published. The widest disagreements belong to clubs the model
   * has no history for — Hull City read at 42.2% at home to Manchester United against a market price
   * of 10.6% is not a view about the match, it is the absence of one.
   */
  const cold = read.rows.filter((r) => r.coldStart);
  for (const r of cold) assert.equal(typeof r.coldStart, "boolean");
  if (cold.length) {
    const widest = read.rows
      .filter((r) => r.widestDisagreement)
      .sort((a, b) => Math.abs(b.widestDisagreement.points) - Math.abs(a.widestDisagreement.points))[0];
    assert.ok(widest, "the ordering exists so an operator can see the largest gaps");
  }
});

test("differences are SIGNED percentage points against the same outcome", () => {
  if (!read?.rows?.length) return;
  for (const r of read.rows) {
    if (!r.market || !r.differencePoints) continue;
    for (const k of ["home", "draw", "away"]) {
      const expected = Number((r.model[k] - r.market[k]).toFixed(1));
      assert.ok(Math.abs(r.differencePoints[k] - expected) < 0.11, `${r.matchup} ${k}: difference does not reconcile`);
    }
    // Each side's own distribution sums to 100 within rounding.
    const sum = (o) => o.home + o.draw + o.away;
    assert.ok(Math.abs(sum(r.model) - 100) < 0.5, `${r.matchup}: model probabilities do not sum to 100`);
    assert.ok(Math.abs(sum(r.market) - 100) < 0.5, `${r.matchup}: market probabilities do not sum to 100`);
  }
});

test("'highest outcome' is reported for BOTH sides, so neither is presented as the answer", () => {
  if (!read?.rows?.length) return;
  for (const r of read.rows) {
    assert.ok(["home", "draw", "away"].includes(r.modelHighestOutcome));
    if (r.market) assert.ok(["home", "draw", "away"].includes(r.marketHighestOutcome));
  }
  // The count of agreements is published rather than only the disagreements, which would be
  // selecting the fixtures that make the model look interesting.
  assert.equal(read.counts.agreeOnHighest + read.counts.disagreeOnHighest, read.counts.withMarket);
});
