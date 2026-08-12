/**
 * Admin access-contract guards (Program 164 · Release 7): deny-by-default on every missing input;
 * only the fully-satisfied path allows; headers forbid indexing and caching.
 *
 * Run: npx tsx --test src/lib/admin/access-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { evaluateAdminRequest, ADMIN_RESPONSE_HEADERS } from "./access-contract.mjs";

test("every deny path denies with its named reason; the single allow path requires everything", () => {
  assert.match(evaluateAdminRequest({}).reason, /not security/, "an unprotected deployment is the root refusal");
  assert.match(evaluateAdminRequest({ deploymentProtected: true }).reason, /unauthenticated/);
  assert.match(evaluateAdminRequest({ deploymentProtected: true, authenticated: true }).reason, /wrong user is still deny/);
  assert.match(evaluateAdminRequest({ deploymentProtected: true, authenticated: true, allowlisted: true }).reason, /unbounded session/);
  assert.match(evaluateAdminRequest({ deploymentProtected: true, authenticated: true, allowlisted: true, sessionAgeMinutes: 9999 }).reason, /expired/);
  const ok = evaluateAdminRequest({ deploymentProtected: true, authenticated: true, allowlisted: true, sessionAgeMinutes: 10 });
  assert.equal(ok.allow, true);
});

test("admin responses forbid indexing and caching; the ADR exists with the recommended option and acceptance", () => {
  assert.match(ADMIN_RESPONSE_HEADERS["X-Robots-Tag"], /noindex/);
  assert.match(ADMIN_RESPONSE_HEADERS["Cache-Control"], /no-store/);
  const adr = fs.readFileSync(path.resolve(process.cwd(), "..", "docs", "ADMIN_ACCESS_DECISION.md"), "utf8");
  assert.match(adr, /RECOMMENDED/);
  assert.match(adr, /URL-hiding and client-side prompts are insufficient/i, "the ADR names the rejected class in its own heading");
  assert.match(adr, /Acceptance/);
});
