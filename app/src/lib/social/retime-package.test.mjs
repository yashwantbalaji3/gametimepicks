import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { contentShaOf, retimePackage } from "./retime-package.mjs";
import { buildSocialPackage } from "./social-package.mjs";

const base = () => buildSocialPackage({
  sport: "nba", date: "2026-11-04", contentType: "NBA_TONIGHT", variant: "slate-today", snapshotRefs: [{ ref: "app/x.json", sha256: "a".repeat(64) }],
  images: [{ path: "t.png", width: 1080, height: 1350, scale: 1, sha256: "b".repeat(64) }], caption: "NBA tonight: 14 games.", verification: { passed: true, checks: [], cellsVerified: 1 },
  window: { opensAt: "2026-11-04T14:00:00Z", closesAt: "2026-11-05T00:00:00Z" }, recommended: { recommendedAt: "2026-11-04T22:00:00Z" }, freshness: { asOf: "2026-11-04T14:00:00Z", expiresAt: "2026-11-05T00:00:00Z" },
  content: { games: 14 }, eligibilityClass: "ESTIMATE", disclosures: ["Model projections"], ccCaption: "NBA tonight: 14 games.", extraClaims: [{ key: "games", display: "14", evidenceRef: "app/x.json" }], title: "t", firstStartUtc: "2026-11-05T00:00:00Z",
});

test("contentShaOf reproduces buildSocialPackage's fingerprint", () => { const p = base(); assert.equal(contentShaOf(p), p.contentSha256); });

test("retime: new revision and fingerprint, same image and caption, every window field closes at the new time", () => {
  const p = base(), r = retimePackage(p, { recommendedAt: "2026-11-04T17:30:00Z", closesAt: "2026-11-04T18:00:00Z", rule: "founder" });
  assert.equal(r.revision, 2); assert.notEqual(r.contentSha256, p.contentSha256);
  assert.deepEqual([r.images, r.caption, r.content, r.dedupeId], [p.images, p.caption, p.content, p.dedupeId]);
  assert.deepEqual([r.window.closesAt, r.expiresAt, r.freshness.expiresAt, r.recommendedAt, r.commandCenter.suggestedPublishAt], ["2026-11-04T18:00:00Z", "2026-11-04T18:00:00Z", "2026-11-04T18:00:00Z", "2026-11-04T17:30:00Z", "2026-11-04T17:30:00Z"]);
  assert.throws(() => retimePackage(p, { recommendedAt: "2026-11-04T17:30:00Z", closesAt: "2026-11-05T01:00:00Z", rule: "x" }));
  assert.throws(() => retimePackage(p, { recommendedAt: "2026-11-04T18:30:00Z", closesAt: "2026-11-04T18:00:00Z", rule: "x" }));
});
