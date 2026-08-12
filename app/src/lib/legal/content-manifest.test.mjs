/**
 * Legal publish-guard tests (Program 164 · Release 5): unapproved text is structurally unable to
 * ship; approval is a named human + role + date + packet version, never an inference.
 *
 * Run: npx tsx --test src/lib/legal/content-manifest.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { LEGAL_CONTENT_MANIFEST, REQUIRED_SECTIONS, LEGAL_STATUSES, canPublishLegal, canPublishLegalSet } from "./content-manifest.mjs";

test("the CURRENT manifest blocks every required section with counsel-required reasons", () => {
  const set = canPublishLegalSet(LEGAL_CONTENT_MANIFEST);
  assert.equal(set.allowed, false);
  assert.equal(set.blocked.length, REQUIRED_SECTIONS.length, "all three required sections are honestly pre-approval");
  for (const b of set.blocked) assert.ok(b.reasons.some((r) => /only APPROVED publishes/.test(r)));
});

test("APPROVED alone is not enough: reviewer, role, date, packet version, and effective date are all mandatory", () => {
  const base = { sections: { terms: { status: "APPROVED", approval: { reviewer: "A. Reviewer", role: "solicitor", approvedOn: "2026-09-01", packetVersion: 1, contentHash: "abc123def456" }, effectiveDate: "2026-09-05" } } };
  assert.equal(canPublishLegal(base, "terms").allowed, true);
  const noRole = JSON.parse(JSON.stringify(base)); delete noRole.sections.terms.approval.role;
  assert.equal(canPublishLegal(noRole, "terms").allowed, false);
  const noDate = JSON.parse(JSON.stringify(base)); noDate.sections.terms.approval.approvedOn = "sometime";
  assert.equal(canPublishLegal(noDate, "terms").allowed, false);
  const noVer = JSON.parse(JSON.stringify(base)); delete noVer.sections.terms.approval.packetVersion;
  assert.equal(canPublishLegal(noVer, "terms").allowed, false);
  const noHash = JSON.parse(JSON.stringify(base)); delete noHash.sections.terms.approval.contentHash;
  assert.equal(canPublishLegal(noHash, "terms").allowed, false, "approving whatever-is-there-now is not approval");
  const noEff = JSON.parse(JSON.stringify(base)); delete noEff.sections.terms.effectiveDate;
  assert.equal(canPublishLegal(noEff, "terms").allowed, false);
  assert.equal(canPublishLegal(base, "made-up").allowed, false, "unknown sections never publish");
});

test("statuses are closed; the committed packet exists and is labeled FOR REVIEW / NOT LEGAL ADVICE", () => {
  for (const s of Object.values(LEGAL_CONTENT_MANIFEST.sections)) assert.ok(LEGAL_STATUSES.includes(s.status));
  const packet = fs.readFileSync(path.resolve(process.cwd(), "..", LEGAL_CONTENT_MANIFEST.packet), "utf8");
  assert.match(packet, /FOR REVIEW · NOT LEGAL ADVICE/);
  assert.match(packet, /never be inferred|never inferred/i);
  for (let n = 1; n <= 11; n++) assert.ok(new RegExp(`(^|\\n)\\| ${n} \\||\\n${n}\\.`).test(packet), `numbered item ${n} present`);
});
