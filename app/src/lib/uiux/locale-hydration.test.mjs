/**
 * UX-001 (2026-10-09) · TEXT A CLIENT COMPONENT RENDERS ON THE SERVER MUST BE THE SAME BYTES IN EVERY BROWSER.
 *
 * Two engine/locale differences broke hydration on Production after the <style> fix (#1031):
 *   · Safari/WebKit's Intl format() joins a date and a time with " at " ("Oct 8 at 9:00 PM") where Node writes
 *     "Oct 8, 9:00 PM" — NFL game pages (frozen-forecast stamp) and /ufc/ (simulation provenance) threw #425/#418/#423.
 *   · A number formatted with no locale follows the BROWSER's locale: a German browser printed "10.000" against the
 *     server's "10,000" — NFL game pages and /results/model-audit/ failed hydration for every non-US reader.
 * The fixes: dates and times through lib/et-stamp.mjs (built from formatToParts values), numbers with "en-US".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [path.join(d, e.name)] : []);
const files = walk(SRC);
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
const at = (f, s, i) => `${path.relative(process.cwd(), f)}:${s.slice(0, i).split("\n").length}`;

test("🔴 no toLocaleString / toLocaleDateString / toLocaleTimeString without an explicit locale", () => {
  const bad = [];
  for (const f of files) { const s = code(fs.readFileSync(f, "utf8")); for (const m of s.matchAll(/\.toLocale(?:Date|Time)?String\(\s*\)/g)) bad.push(at(f, s, m.index)); }
  assert.deepEqual(bad, [], `pass "en-US" (the server's locale) — a reader's browser locale must not change the text:\n  ${bad.join("\n  ")}`);
});

test("🔴 no client component formats a date AND a time with Intl's own joiner (WebKit writes ' at ')", () => {
  const bad = [];
  for (const f of files.filter((x) => x.endsWith(".tsx"))) {
    const raw = fs.readFileSync(f, "utf8"); if (!/^\s*["']use client["']/.test(raw)) continue;
    const s = code(raw);
    for (const m of s.matchAll(/(toLocaleString\(\s*"[^"]+"\s*,\s*\{[^}]*\}|DateTimeFormat\(\s*"[^"]+"\s*,\s*\{[^}]*\}\s*\)\s*\.format\()/g)) {
      const opts = m[0]; if (/\bhour\b/.test(opts) && /\b(month|day|weekday)\b/.test(opts)) bad.push(at(f, s, m.index));
    }
  }
  assert.deepEqual(bad, [], `use etStamp / etDayLabel from lib/et-stamp.mjs (formatToParts values, ASCII joins):\n  ${bad.join("\n  ")}`);
});

test("the shared stamp is engine-independent by construction", async () => {
  const { etStamp, etDayLabel } = await import("../et-stamp.mjs");
  assert.equal(etStamp("2026-10-09T01:00:16Z"), "Oct 8, 9:00 PM ET");
  assert.equal(etDayLabel("2026-10-09T01:00:16Z"), "Thu, Oct 8");
  const src = fs.readFileSync(path.join(SRC, "lib/et-stamp.mjs"), "utf8");
  assert.doesNotMatch(code(src), /\.format\(/, "built from formatToParts, never format()");
});
