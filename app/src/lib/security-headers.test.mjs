/**
 * SITE-WIDE SECURITY HEADERS (launch audit, 2026-10-13; founder-approved, CSP report-only first).
 *
 * Production sent only HSTS. The site is `output: "export"`, so next.config headers() never runs — the headers live in
 * app/vercel.json. The CSP ships as Content-Security-Policy-Report-Only until the founder approves enforcement; it was
 * probed against 24 Production pages at 1440 and 390 px with zero violations (and a strict negative control that
 * produced them), and the full header set showed no page, console or request errors on 20 pages vs. an uninjected run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
const site = (cfg.headers ?? []).find((h) => h.source === "/(.*)");
const get = (k) => site?.headers?.find((h) => h.key.toLowerCase() === k.toLowerCase())?.value;

test("every response carries the baseline security headers", () => {
  assert.ok(site, "a site-wide /(.*) header rule exists");
  assert.equal(get("X-Content-Type-Options"), "nosniff");
  assert.equal(get("X-Frame-Options"), "DENY");
  assert.equal(get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.match(get("Permissions-Policy") ?? "", /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
});

test("the CSP is REPORT-ONLY until the founder approves enforcement", () => {
  assert.ok(get("Content-Security-Policy-Report-Only"), "report-only policy present");
  assert.equal(get("Content-Security-Policy"), undefined, "no enforcing CSP without a separate founder approval");
  const csp = get("Content-Security-Policy-Report-Only");
  for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) assert.ok(csp.includes(d), d);
});

test("the CSP allows every image host the components actually render (no false reports at launch)", () => {
  const csp = get("Content-Security-Policy-Report-Only");
  const img = csp.split(";").find((d) => d.trim().startsWith("img-src")) ?? "";
  const src = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? src(path.join(dir, e.name)) : /\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [fs.readFileSync(path.join(dir, e.name), "utf8")] : []);
  const hosts = new Set();
  for (const s of src(path.join(process.cwd(), "src/components"))) for (const m of s.matchAll(/https:\/\/([a-z0-9.-]*(?:espncdn\.com|mlbstatic\.com|cdn\.nba\.com))/g)) hosts.add(m[1]);
  for (const h of hosts) {
    const ok = img.includes(`https://${h}`) || img.split(/\s+/).some((t) => t.startsWith("https://*.") && h.endsWith(t.slice("https://*".length)));
    assert.ok(ok, `img-src allows ${h}`);
  }
});
