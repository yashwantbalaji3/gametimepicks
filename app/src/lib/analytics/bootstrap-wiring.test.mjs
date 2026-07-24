/**
 * ANALYTICS BOOTSTRAP WIRING (Sprint 006). Source-grep guards that the client bootstrap is mounted, is
 * failure-safe, and never leaks attribution into user-visible content. Runs pre-build.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const boot = read("src/components/analytics-bootstrap.tsx");
const layout = read("src/app/layout.tsx");

test("the bootstrap is mounted once in the root layout", () => {
  assert.match(layout, /import AnalyticsBootstrap from "@\/components\/analytics-bootstrap"/);
  assert.match(layout, /<AnalyticsBootstrap\s*\/>/);
});

test("it is a client component that renders NOTHING (never injects content) and resolves the sink from config", () => {
  assert.match(boot, /^"use client"|\n"use client"/, "is a client component");
  assert.match(boot, /return null;/, "renders nothing — attribution can't leak into visible content");
  assert.match(boot, /resolveSink\(readSinkConfig\(\)\)/, "resolves the sink from config (NO-OP unless configured)");
});

test("every side-effect is wrapped so analytics can never break the site", () => {
  // Both the source block and the funnel block sit inside try/catch.
  const tryCount = (boot.match(/try\s*\{/g) || []).length;
  assert.ok(tryCount >= 2, "source + funnel emission are each guarded");
  assert.match(boot, /catch\s*\{[\s\S]*?\}/, "failures are swallowed");
});

test("it emits ONLY through the validated emitEvent path — no raw fetch/XHR/network call", () => {
  assert.match(boot, /emitEvent\(/, "uses the validated emit path");
  assert.ok(!/\bfetch\(|XMLHttpRequest|new WebSocket|axios/.test(boot), "no ad-hoc network call in the bootstrap");
});
