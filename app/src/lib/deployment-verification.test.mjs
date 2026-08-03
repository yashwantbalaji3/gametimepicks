/**
 * Bot-challenge classification proofs (Program 108-111 §10.4).
 *
 * The live 403 that triggered this work carried BOTH `x-vercel-mitigated: challenge` and an
 * `x-vercel-challenge-token`, while the site was perfectly healthy in a browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDeployment, isBotChallenge, VERIFY_STATES } from "./deployment-verification.mjs";

const SHA = "32598eb2f1a0";
const REAL_CHALLENGE = {
  status: 403,
  headers: {
    "x-vercel-mitigated": "challenge",
    "x-vercel-challenge-token": "2.1785763633.60.ODg2ODVl…",
    server: "Vercel",
  },
};

test("the real observed challenge response is recognized", () => {
  assert.equal(isBotChallenge(REAL_CHALLENGE), true);
  // Header case must not matter.
  assert.equal(isBotChallenge({ status: 403, headers: { "X-Vercel-Mitigated": "challenge" } }), true);
});

test("a 403 WITH the mitigation header is a challenge, never an outage", () => {
  const r = classifyDeployment({ expectedSha: SHA, httpProbe: REAL_CHALLENGE });
  assert.equal(r.state, VERIFY_STATES.CHALLENGE);
  assert.equal(r.healthy, true, "a challenge is absence of evidence, not evidence of failure");
});

test("MUTATION · a 403 WITHOUT the mitigation header stays a real failure candidate", () => {
  const plain = { status: 403, headers: { server: "Vercel" } };
  assert.equal(isBotChallenge(plain), false, "mutation must actually apply");
  const r = classifyDeployment({ expectedSha: SHA, httpProbe: plain });
  assert.equal(r.state, VERIFY_STATES.HTTP_FAILURE);
  assert.equal(r.healthy, false, "the fix must not swallow genuine 403s");
});

test("trusted metadata outranks a challenged probe and yields verified-current", () => {
  const r = classifyDeployment({ expectedSha: SHA, metadataSha: SHA, httpProbe: REAL_CHALLENGE });
  assert.equal(r.state, VERIFY_STATES.METADATA);
  assert.equal(r.healthy, true);
});

test("MUTATION · an OLD deployment SHA with a challenge is STALE, never falsely healthy", () => {
  // The dangerous failure: bot mitigation masking a genuinely stale site.
  const r = classifyDeployment({ expectedSha: SHA, metadataSha: "deadbeef0000", httpProbe: REAL_CHALLENGE });
  assert.equal(r.state, VERIFY_STATES.STALE);
  assert.equal(r.healthy, false, "staleness must survive the challenge classification");
});

test("browser verification counts when automated HTTP is challenged", () => {
  const r = classifyDeployment({ expectedSha: SHA, browserSha: SHA, httpProbe: REAL_CHALLENGE });
  assert.equal(r.state, VERIFY_STATES.BROWSER);
  assert.equal(r.healthy, true);
});

test("a stale build-info fingerprint is STALE even on a 200", () => {
  const r = classifyDeployment({ expectedSha: SHA, buildInfoSha: "0000aaaa1111", httpProbe: { status: 200, headers: {} } });
  assert.equal(r.state, VERIFY_STATES.STALE);
  assert.equal(r.healthy, false);
});

test("no signal at all is UNVERIFIED and not healthy", () => {
  const r = classifyDeployment({ expectedSha: SHA });
  assert.equal(r.state, VERIFY_STATES.UNVERIFIED);
  assert.equal(r.healthy, false);
});

test("a real 5xx is a failure, not a challenge", () => {
  const r = classifyDeployment({ expectedSha: SHA, httpProbe: { status: 503, headers: {} } });
  assert.equal(r.state, VERIFY_STATES.HTTP_FAILURE);
  assert.equal(r.healthy, false);
});
