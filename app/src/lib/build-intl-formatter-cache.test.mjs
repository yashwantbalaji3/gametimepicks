/**
 * Build memory (2026-10-26): the build-only ICU formatter cache (scripts/build/intl-formatter-cache.cjs) is a CACHE,
 * never a formatting change, and `npm run build` really loads it into next and its static workers.
 *
 * The cache exists because the static export made 553,913 native ICU formatters per build (~16 GB of native churn,
 * 365,467 of them on the 35 /simulate/d/<date> pages); on the 8 GB build machine the static workers were SIGKILLed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const cache = require(path.join(APP, "scripts/build/intl-formatter-cache.cjs"));

const OPTIONS = [
  undefined,
  {},
  { timeZone: "America/New_York" },
  { timeZone: "UTC" },
  { month: "short", day: "numeric" },
  { month: "short", day: "numeric", timeZone: "America/New_York" },
  { month: "short", day: "numeric", timeZone: "UTC" },
  { weekday: "long", month: "long", day: "numeric" },
  { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" },
  { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" },
  { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
  { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" },
  { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York", timeZoneName: "short" },
  { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" },
  { hour: "numeric" },
  { month: "short" },
  { weekday: "short" },
  { timeZoneName: "short" },
  { hour12: false },
  { dateStyle: "medium" },
  { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" },
  { timeStyle: "short", timeZone: "America/New_York" },
  { month: "short", day: "numeric", year: undefined },
  { month: "bogus" },
  { timeZone: "Not/AZone" },
];
const INSTANTS = [
  "2026-10-26T17:12:21Z",
  "2026-11-01T05:30:00Z", // the 2026 fall-back hour in ET
  "2026-03-08T07:30:00Z", // the 2026 spring-forward hour in ET
  "2026-12-31T23:59:59Z",
  "2026-06-01T12:00:00Z",
  "not a date",
];
const LOCALES = [undefined, "en-US", "en-CA", "en-GB", ["en-US"]];

const outcome = (f) => { try { return { ok: f() }; } catch (e) { return { err: e.constructor.name }; } };

test("the cached Date#toLocale* methods equal the native ones, byte for byte (results AND thrown error types)", () => {
  let checked = 0;
  for (const m of ["toLocaleDateString", "toLocaleTimeString", "toLocaleString"]) {
    const mine = { toLocaleDateString: cache.cachedToLocaleDateString, toLocaleTimeString: cache.cachedToLocaleTimeString, toLocaleString: cache.cachedToLocaleString }[m];
    const native = cache.native[m];
    for (const iso of INSTANTS) for (const locales of LOCALES) for (const options of OPTIONS) {
      const d = new Date(iso);
      const args = options === undefined ? (locales === undefined ? [] : [locales]) : [locales, options];
      assert.deepEqual(outcome(() => mine.apply(d, args)), outcome(() => native.apply(d, args)), `${m}(${JSON.stringify(args)}) on ${iso}`);
      checked++;
    }
  }
  assert.ok(checked >= 2000, `matrix too small: ${checked}`);
});

test("a shared formatter equals a fresh native one (format, formatToParts, resolvedOptions, invalid-instant throw)", () => {
  for (const locales of LOCALES) for (const options of OPTIONS) {
    const fresh = outcome(() => new cache.native.DateTimeFormat(locales, options));
    const shared = outcome(() => new cache.CachedDateTimeFormat(locales, options));
    assert.deepEqual(Object.keys(shared), Object.keys(fresh), `construction outcome ${JSON.stringify([locales, options])}`);
    if (fresh.err) { assert.equal(shared.err, fresh.err); continue; }
    assert.ok(shared.ok instanceof cache.native.DateTimeFormat);
    assert.deepEqual(shared.ok.resolvedOptions(), fresh.ok.resolvedOptions());
    for (const iso of INSTANTS.slice(0, -1)) {
      const t = Date.parse(iso);
      assert.equal(shared.ok.format(t), fresh.ok.format(t));
      assert.equal(shared.ok.format(new Date(t)), fresh.ok.format(new Date(t)));
      assert.deepEqual(shared.ok.formatToParts(new Date(t)), fresh.ok.formatToParts(new Date(t)));
    }
    assert.throws(() => shared.ok.format(new Date("not a date")), RangeError, "an invalid instant still throws, as before");
  }
});

test("one (locales, options) pair is ONE formatter; unusual shapes fall through to native", () => {
  const opts = () => ({ timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const a = new cache.CachedDateTimeFormat("en-CA", opts());
  assert.equal(new cache.CachedDateTimeFormat("en-CA", opts()), a);
  assert.equal(new cache.CachedDateTimeFormat("en-US", { month: "short", year: undefined }), new cache.CachedDateTimeFormat("en-US", { month: "short" }), "an undefined option is an absent option");
  assert.notEqual(new cache.CachedDateTimeFormat("en-US", { month: "short" }), new cache.CachedDateTimeFormat("en-US", { month: "long" }));
  const odd = Object.create({ month: "short" });
  assert.notEqual(new cache.CachedDateTimeFormat("en-US", odd), new cache.CachedDateTimeFormat("en-US", odd), "a non-plain options object is never cached");
  assert.equal(new cache.CachedDateTimeFormat("en-US", odd).resolvedOptions().month, "short", "…and still honoured, natively");
  assert.equal(typeof cache.CachedDateTimeFormat.supportedLocalesOf, "function");
  assert.ok(cache.CachedDateTimeFormat("en-US") instanceof cache.native.DateTimeFormat, "a call without new stays native");
});

test("install() replaces the globals in a fresh process and the page-shaped calls still format identically", () => {
  const probe = `
    const native = { d: new Date("2026-10-26T17:12:21Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }),
                     f: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.parse("2026-10-27T03:00:00Z")) };
    require(${JSON.stringify(path.join(APP, "scripts/build/intl-formatter-cache-preload.cjs"))});
    const a = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
    const b = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
    const cached = { d: new Date("2026-10-26T17:12:21Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }), f: a.format(Date.parse("2026-10-27T03:00:00Z")) };
    console.log(JSON.stringify({ same: a === b, inst: a instanceof Intl.DateTimeFormat, native, cached }));`;
  const r = spawnSync(process.execPath, ["-e", probe], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout.trim());
  assert.equal(got.same, true, "installed: one formatter per (locales, options)");
  assert.equal(got.inst, true);
  assert.deepEqual(got.cached, got.native);
  assert.deepEqual(got.native, { d: "Oct 26", f: "2026-10-26" });
});

test("npm run build loads the cache into next build (and so, via execArgv, into every static worker)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
  for (const name of ["build", "build:raw"]) {
    assert.match(pkg.scripts[name], /node --require \.\/scripts\/build\/intl-formatter-cache-preload\.cjs node_modules\/next\/dist\/bin\/next build/, `${name} must preload the formatter cache`);
  }
  assert.ok(fs.existsSync(path.join(APP, "node_modules/next/dist/bin/next")) || !fs.existsSync(path.join(APP, "node_modules/next")), "the next entry point the build script names exists");
  // jest-worker (the static workers) forks with the parent's execArgv — the reason a --require reaches the workers.
  const jw = path.join(APP, "node_modules/next/dist/compiled/jest-worker/index.js");
  if (fs.existsSync(jw)) assert.match(fs.readFileSync(jw, "utf8"), /execArgv:process\.execArgv\.filter/, "static workers inherit execArgv");
});
