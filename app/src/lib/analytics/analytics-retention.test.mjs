/**
 * Guards for the 90-day analytics retention (P256 · Task 4): the rule, the lock on the endpoint, and
 * the cron that runs it — the privacy notice promises 90 days, so all three must hold.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RETENTION_DAYS, cronAuthorized, expiredDayFolders, retentionCutoff } from "../../../api/_retention-core.mjs";
import { LEGAL_PARAMETERS } from "../legal/texts.mjs";

const NOW = "2026-09-11T07:17:00Z";

test("the window is the founder's 90 days, and the privacy notice says the same number", () => {
  assert.equal(RETENTION_DAYS, 90);
  assert.equal(String(LEGAL_PARAMETERS.analyticsRetentionDays.value), String(RETENTION_DAYS));
});

test("buckets strictly older than the cutoff go; the cutoff day and newer stay", () => {
  assert.equal(retentionCutoff(NOW), "2026-06-13");
  const out = expiredDayFolders(["analytics/2026-01-01/", "analytics/2026-06-12/", "analytics/2026-06-13/", "analytics/2026-09-11/"], NOW);
  assert.deepEqual(out, ["analytics/2026-01-01/", "analytics/2026-06-12/"]);
});

test("anything that does not parse as a day bucket is KEPT — never delete what cannot be dated", () => {
  assert.deepEqual(expiredDayFolders(["analytics/rollups/", "analytics/2026-1-1/", "other/2020-01-01/", null], NOW), []);
});

test("only Vercel's cron may run it: exact bearer, a real secret, nothing else", () => {
  const s = "0123456789abcdef0123";
  assert.equal(cronAuthorized(`Bearer ${s}`, s), true);
  assert.equal(cronAuthorized(`Bearer ${s}x`, s), false);
  assert.equal(cronAuthorized(undefined, s), false);
  assert.equal(cronAuthorized("Bearer short", "short"), false, "a weak secret is refused outright");
  assert.equal(cronAuthorized("Bearer undefined", undefined), false);
});

test("the cron is declared, daily, at a path that does not redirect (trailingSlash is on; crons never follow 3xx)", () => {
  const vj = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8"));
  const c = (vj.crons ?? []).find((x) => x.path.startsWith("/api/analytics-retention"));
  assert.ok(c, "retention cron declared");
  assert.equal(c.path, "/api/analytics-retention/");
  assert.match(c.schedule, /^\d+ \d+ \* \* \*$/, "once a day (the Hobby plan's limit)");
});

test("the collector writes PRIVATE blobs through the SDK — never the old raw public-style PUT", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "api/collect.mjs"), "utf8");
  assert.match(src, /put\(key, JSON\.stringify\(v\.event\), \{ access: "private"/);
  assert.doesNotMatch(src, /blob\.vercel-storage\.com/);
});
