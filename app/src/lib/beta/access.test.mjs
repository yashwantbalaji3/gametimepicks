/**
 * Beta access guards (Program 164 · Release 6): PII structurally refused, deny-by-default access,
 * prerequisite gate blocks invitations until support/legal/analytics are real.
 *
 * Run: npx tsx --test src/lib/beta/access.test.mjs
 */
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

import { validateCohortContract, invitationPrerequisites, resolveBetaAccess } from "./access.mjs";
import { LEGAL_CONTENT_MANIFEST } from "../legal/content-manifest.mjs";

const CLEAN = { cohortId: "beta-1", targetCount: 8, window: { start: "2026-09-01", end: "2026-09-21" }, owner: "founder", accessMethod: "allowlist", statusCounts: { invited: 0, active: 0 } };

test("a clean PII-free cohort contract validates; small controlled counts only", () => {
  assert.equal(validateCohortContract(CLEAN).valid, true);
  assert.equal(validateCohortContract({ ...CLEAN, targetCount: 500 }).valid, false, "a controlled cohort, not a launch");
});

test("PII is STRUCTURALLY refused: email-shaped values and roster-like fields fail anywhere in the object", () => {
  const email = validateCohortContract({ ...CLEAN, note: "invite person@example.com" });
  assert.equal(email.valid, false);
  assert.match(email.errors.join(" "), /email-shaped/);
  const roster = validateCohortContract({ ...CLEAN, participants: ["hash1"] });
  assert.equal(roster.valid, false);
  assert.match(roster.errors.join(" "), /never enters the repository/);
  const nested = validateCohortContract({ ...CLEAN, meta: { emails: [] } });
  assert.equal(nested.valid, false, "nesting does not hide a roster field");
});

test("invitation prerequisites: the CURRENT real state blocks on support + legal; silence is not an analytics decision", () => {
  const now = invitationPrerequisites({ supportState: "NOT_CONFIGURED", legalManifest: LEGAL_CONTENT_MANIFEST, analyticsDecision: null });
  assert.equal(now.ready, false);
  assert.equal(now.blockedBy.length, 3, "support, legal, analytics all block today — honestly");
  const later = invitationPrerequisites({
    supportState: "CONFIGURED",
    legalManifest: { sections: { terms: ok(), privacy: ok(), "responsible-use": ok() } },
    analyticsDecision: "DEFERRED_BY_FOUNDER",
  });
  assert.equal(later.ready, true, "an explicit deferral is a decision; unset is not");
  function ok() { return { status: "APPROVED", approval: { reviewer: "A. Reviewer", role: "solicitor", approvedOn: "2026-09-01", packetVersion: 1, contentHash: "abc123def456" }, effectiveDate: "2026-09-05" }; }
});

test("access is deny-by-default at every layer; revocation beats presence", () => {
  assert.equal(resolveBetaAccess({}).allow, false);
  assert.equal(resolveBetaAccess({ allowlistConfigured: true }).allow, false);
  assert.equal(resolveBetaAccess({ allowlistConfigured: true, entryPresent: true, windowOpen: true, revoked: true }).allow, false);
  assert.equal(resolveBetaAccess({ allowlistConfigured: true, entryPresent: true, windowOpen: false }).allow, false);
  assert.equal(resolveBetaAccess({ allowlistConfigured: true, entryPresent: true, windowOpen: true }).allow, true);
});

test("P256 · the founder's written notice satisfies the legal prerequisite — nothing else does", async () => {
  const { WRITTEN_LEGAL_NOTICE } = await import("./access.mjs");
  const base = { supportState: "CONFIGURED", legalManifest: LEGAL_CONTENT_MANIFEST, analyticsDecision: "ENABLED" };
  assert.equal(invitationPrerequisites(base).ready, false, "unpublished legal still blocks by default");
  assert.equal(invitationPrerequisites({ ...base, legalDisclosure: WRITTEN_LEGAL_NOTICE }).ready, true);
  assert.equal(invitationPrerequisites({ ...base, legalDisclosure: "yes" }).ready, false, "only the exact recorded choice counts");
  assert.equal(invitationPrerequisites({ ...base, supportState: "NOT_CONFIGURED", legalDisclosure: WRITTEN_LEGAL_NOTICE }).ready, false, "the notice never stands in for support");
});

test("P256 · the committed friends-beta contract is valid, PII-free, and its kit carries the notice verbatim", async () => {
  const { WRITTEN_LEGAL_NOTICE } = await import("./access.mjs");
  const repo = path.resolve(process.cwd(), "..");
  const c = JSON.parse(fs.readFileSync(path.join(repo, "data/internal/beta/cohort-contract.json"), "utf8"));
  assert.deepEqual(validateCohortContract(c), { valid: true, errors: [] });
  assert.equal(c.legalDisclosure, WRITTEN_LEGAL_NOTICE);
  const kit = fs.readFileSync(path.join(repo, "docs/beta/INVITATION_KIT.md"), "utf8");
  assert.match(kit, /Terms of Use and Privacy Notice are still under legal review/);
  assert.match(kit, /adults 18 and older in the US/);
  assert.doesNotMatch(kit, /[^\s@]+@[^\s@]+\.[a-z]{2,}/i, "no email address in the kit — feedback goes through the site's support link");
});
