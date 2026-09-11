/**
 * The morning trigger (P256): a Vercel cron that starts the settlement chain when GitHub's scheduler
 * has not. It must never start a second settlement on a day one already succeeded, must fail closed on
 * anything it cannot read, and must refuse every caller but the cron.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { decideMorningTrigger, etDate, TRIGGER_WORKFLOW, TRIGGER_TOKEN_ENV } from "../../api/_morning-trigger-core.mjs";

const NOW = "2026-09-12T09:20:00Z"; // 05:20 ET
const run = (created_at, status, conclusion = null) => ({ created_at, status, conclusion });

test("ET date, not UTC date — 01:30 UTC on the 12th is still the 11th in New York", () => {
  assert.equal(etDate("2026-09-12T01:30:00Z"), "2026-09-11");
  assert.equal(etDate(NOW), "2026-09-12");
});

test("starts the chain when nothing succeeded today, even if yesterday did", () => {
  const d = decideMorningTrigger([run("2026-09-11T13:48:00Z", "completed", "success")], NOW);
  assert.equal(d.dispatch, true, d.reason);
});

test("never a second settlement: a success today, or one queued/running, means no start", () => {
  assert.equal(decideMorningTrigger([run("2026-09-12T09:05:00Z", "completed", "success")], NOW).dispatch, false);
  for (const s of ["queued", "in_progress", "waiting", "pending"])
    assert.equal(decideMorningTrigger([run("2026-09-12T09:15:00Z", s)], NOW).dispatch, false, s);
});

test("a failed run today does not block a restart (the failure is exactly what needs one)", () => {
  assert.equal(decideMorningTrigger([run("2026-09-12T09:01:00Z", "completed", "failure")], NOW).dispatch, true);
});

test("fails closed when the run list cannot be read", () => {
  assert.equal(decideMorningTrigger(null, NOW).dispatch, false);
});

test("the handler is cron-only, token-gated, and the cron is scheduled before 8 AM ET", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "api/morning-trigger.mjs"), "utf8");
  assert.match(src, /cronAuthorized\(req\.headers\?\.authorization, process\.env\.CRON_SECRET\)/, "401 for anyone but the cron");
  assert.match(src, /status\(503\)/, "fail-closed without the token");
  assert.ok(!/console\.log\([^)]*token/i.test(src.replace(/need: TRIGGER_TOKEN_ENV/, "")), "the token is never logged");
  assert.equal(TRIGGER_WORKFLOW, "nightly-settle.yml");
  assert.equal(TRIGGER_TOKEN_ENV, "GTP_DISPATCH_TOKEN");
  const cron = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")).crons.find((c) => c.path === "/api/morning-trigger/");
  assert.ok(cron, "the cron exists");
  const [min, hourUtc] = cron.schedule.split(" ").map(Number);
  // Hobby crons may fire anywhere inside the hour; the latest possible start (hour:59 UTC) must still
  // leave the ~40-minute chain time to finish before 8:00 AM EDT (12:00 UTC).
  assert.ok(hourUtc <= 10 && Number.isInteger(min), `scheduled ${cron.schedule} UTC`);
  assert.ok(cron.path.endsWith("/"), "trailing slash — Vercel cron does not follow the 308");
});
