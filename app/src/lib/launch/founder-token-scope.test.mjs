/**
 * Founder decision answers are validated segment by segment against their templates — a different market scope
 * never passes as the one the founder was asked about.
 * Run: npx tsx --test src/lib/launch/founder-token-scope.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FOUNDER_DECISIONS, tokenMatchesTemplate, validateAnswerToken } from "./founder-decisions.mjs";

const nba = FOUNDER_DECISIONS.find((d) => d.id === "decision-nba-markets-authorization");

test("NBA markets: only the h2h scope with a positive integer ceiling is a valid AUTHORIZE answer", () => {
  assert.equal(validateAnswerToken(nba, "AUTHORIZE:h2h:500").valid, true);
  assert.equal(validateAnswerToken(nba, "DEFER").valid, true);
  for (const bad of ["AUTHORIZE:player_points:500", "AUTHORIZE:props:500", "AUTHORIZE:H2H:500", "AUTHORIZE:h2h", "AUTHORIZE:h2h:", "AUTHORIZE:h2h:0", "AUTHORIZE:h2h:-5", "AUTHORIZE:h2h:5e3", "AUTHORIZE:h2h:500:extra", "AUTHORIZE:", "DEFER:now", "defer"]) {
    assert.equal(validateAnswerToken(nba, bad).valid, false, bad);
  }
});

test("other templates: a named placeholder takes any colon-free value; literals are exact", () => {
  assert.equal(tokenMatchesTemplate("APPROVE:SportsDataIO", "APPROVE:<provider-name>"), true);
  assert.equal(tokenMatchesTemplate("APPROVE:", "APPROVE:<provider-name>"), false);
  assert.equal(tokenMatchesTemplate("APPROVE:a:b", "APPROVE:<provider-name>"), false);
  assert.equal(tokenMatchesTemplate("PROCEED", "PROCEED"), true);
  assert.equal(tokenMatchesTemplate("PROCEEDX", "PROCEED"), false);
});

test("every template a decision publishes accepts a well-formed example of itself", () => {
  const example = (t) => t.replace(/<ceiling-credits>/g, "250").replace(/<[a-z0-9-]+>/g, "Example");
  for (const d of FOUNDER_DECISIONS) for (const t of d.answerTokens) assert.equal(validateAnswerToken(d, example(t)).valid, true, `${d.id}: ${t}`);
});

test("the dry-run script validates with validateAnswerToken (no first-segment prefix check)", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "scripts/ops/founder-decision-dryrun.mjs"), "utf8");
  assert.match(src, /validateAnswerToken\(d, token\)/);
  assert.doesNotMatch(src, /token\.startsWith\(fixed/, "the prefix check let a props token pass as h2h");
});
