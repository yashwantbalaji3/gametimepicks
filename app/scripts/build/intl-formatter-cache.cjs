/**
 * BUILD-ONLY: one ICU date formatter per (locales, options) in the `next build` processes (2026-10-26).
 *
 * WHY. Every `new Intl.DateTimeFormat(...)`, and every `Date#toLocale{Date,Time,}String` called WITH options, builds
 * a fresh ICU formatter that costs ~20–30 KB of NATIVE memory (Node 22, measured: 31 KB per construction, 22 KB per
 * toLocaleDateString with a timeZone) while adding almost nothing to the JS heap. V8 schedules major GCs by heap
 * growth, so the ICU objects are freed late and the native memory piles up inside a static-generation worker.
 *
 * Measured on the static export of 2026-10-26 (3,016 pages, the Production flags): 553,913 such constructions —
 * ~16 GB of native churn. 365,467 were on the 35 /simulate/d/<date> pages (~10,400 each: the season's schedule is
 * re-bucketed by ET day with a new formatter per event); each of those pages added ~310 MB of RSS to its worker
 * while the JS heap grew by ~5 MB, and one worker that rendered ten of them reached 4.2 GB RSS on a 600 MB heap.
 * /today alone made 60,109. On Vercel's 8 GB Standard machine that is the static workers' SIGKILL (OOM).
 *
 * WHAT. A formatter is immutable and its output is a function of (locales, options) only, so handing back the one
 * already built is the same result as building it again: this is a pure cache, not a formatting change, and the
 * exported HTML/RSC/JS is byte-identical with or without it. It lives HERE, preloaded into the build processes,
 * rather than in the ~230 call sites, because most of those sites are in modules that also ship to the browser —
 * editing them would change client JS bytes for a build-memory fix. The browser never runs this file.
 *
 * HOW IT IS LOADED. `npm run build` starts next with `node --require ./scripts/build/intl-formatter-cache-preload.cjs`,
 * which calls install(); jest-worker forks each static worker with the parent's execArgv, so every worker installs it
 * too. Requiring THIS module (as the test does) installs nothing.
 *
 * SAFETY. Anything outside the plain shapes the app uses (a non-plain options object, a non-primitive option value,
 * a call without `new`, a non-Date receiver) falls through to the native implementation untouched. The equivalence
 * with the native methods is proven over a matrix of locales × options × instants (Invalid Date and DST edges
 * included) by src/lib/build-intl-formatter-cache.test.mjs. Rollback: drop the `--require` from package.json.
 */
"use strict";

const NativeDateTimeFormat = Intl.DateTimeFormat;
const nativeToLocaleDateString = Date.prototype.toLocaleDateString;
const nativeToLocaleTimeString = Date.prototype.toLocaleTimeString;
const nativeToLocaleString = Date.prototype.toLocaleString;

/** A safety valve, never reached by the app's static option sets (~100 distinct). */
const MAX_FORMATTERS = 2000;
const formatters = new Map();
const stats = { constructed: 0, reused: 0, bypassed: 0 };

const isPrimitive = (v) => v === undefined || v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** The cache key, or null when the arguments are not the plain shapes this cache is proven for. */
function keyOf(locales, options) {
  if (!(locales === undefined || typeof locales === "string" || (Array.isArray(locales) && locales.every((l) => typeof l === "string")))) return null;
  if (options !== undefined) {
    if (options === null || typeof options !== "object") return null;
    const proto = Object.getPrototypeOf(options);
    if (proto !== Object.prototype && proto !== null) return null;
    for (const k of Object.keys(options)) if (!isPrimitive(options[k])) return null;
    if (Object.getOwnPropertySymbols(options).length) return null;
    for (const k of Object.getOwnPropertyNames(options)) {
      const d = Object.getOwnPropertyDescriptor(options, k);
      if (!d || d.get || d.set || !d.enumerable) return null;
    }
  }
  // An undefined option is an absent option to Intl, and JSON.stringify drops it: the two spellings share an entry.
  return JSON.stringify([locales === undefined ? null : locales, options === undefined ? null : options]);
}

/** `new Intl.DateTimeFormat(locales, options)`, constructed once per distinct (locales, options). */
function cachedDateTimeFormat(locales, options) {
  const key = keyOf(locales, options);
  if (key === null) { stats.bypassed++; return new NativeDateTimeFormat(locales, options); }
  let f = formatters.get(key);
  if (f) { stats.reused++; return f; }
  f = new NativeDateTimeFormat(locales, options); // throws exactly as before on bad options; nothing is cached then
  stats.constructed++;
  if (formatters.size >= MAX_FORMATTERS) formatters.clear();
  formatters.set(key, f);
  return f;
}

const DATE_FIELDS = ["weekday", "year", "month", "day"];
const TIME_FIELDS = ["dayPeriod", "hour", "minute", "second", "fractionalSecondDigits"];

/**
 * ECMA-402 CreateDateTimeFormat's (required, defaults) step as the Date#toLocale* methods apply it. The
 * Intl.DateTimeFormat constructor uses (any, date); toLocaleDateString (date, date), toLocaleTimeString
 * (time, time), toLocaleString (any, all) — so the options are completed here before they reach the shared
 * constructor. Returns the options unchanged when no default applies.
 */
function withDefaults(options, required, defaults) {
  const o = options === undefined ? {} : options;
  if (required === "date" && o.timeStyle !== undefined) return undefined; // native throws: let it (see callers)
  if (required === "time" && o.dateStyle !== undefined) return undefined;
  let need = o.dateStyle === undefined && o.timeStyle === undefined;
  if (need && required !== "time") need = DATE_FIELDS.every((k) => o[k] === undefined);
  if (need && required !== "date") need = TIME_FIELDS.every((k) => o[k] === undefined);
  if (!need) return options;
  const out = { ...o };
  if (defaults === "date" || defaults === "all") Object.assign(out, { year: "numeric", month: "numeric", day: "numeric" });
  if (defaults === "time" || defaults === "all") Object.assign(out, { hour: "numeric", minute: "numeric", second: "numeric" });
  return out;
}

function makeToLocale(native, required, defaults) {
  return function (locales, options) {
    // No options: V8 already reuses its own cached formatter, and nothing here would be cheaper. Anything unusual
    // (a non-Date receiver, a non-plain argument, a combination the native method rejects) goes to the native method.
    if (options === undefined || !(this instanceof Date) || keyOf(locales, options) === null) {
      if (options !== undefined) stats.bypassed++;
      return native.apply(this, arguments);
    }
    const completed = withDefaults(options, required, defaults);
    if (completed === undefined) { stats.bypassed++; return native.apply(this, arguments); }
    if (Number.isNaN(this.getTime())) return "Invalid Date";
    return cachedDateTimeFormat(locales, completed).format(this);
  };
}

const cachedToLocaleDateString = makeToLocale(nativeToLocaleDateString, "date", "date");
const cachedToLocaleTimeString = makeToLocale(nativeToLocaleTimeString, "time", "time");
const cachedToLocaleString = makeToLocale(nativeToLocaleString, "any", "all");

/** The drop-in constructor: `new` hands back the shared instance; a plain call (no `new`) stays native. */
function CachedDateTimeFormat(locales, options) {
  if (new.target === undefined) return NativeDateTimeFormat.apply(this, arguments);
  return cachedDateTimeFormat(locales, options);
}
CachedDateTimeFormat.prototype = NativeDateTimeFormat.prototype; // instanceof keeps working
CachedDateTimeFormat.supportedLocalesOf = NativeDateTimeFormat.supportedLocalesOf;
Object.defineProperty(CachedDateTimeFormat, "name", { value: "DateTimeFormat" });

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  Object.defineProperty(Intl, "DateTimeFormat", { value: CachedDateTimeFormat, writable: true, configurable: true, enumerable: false });
  Object.defineProperty(Date.prototype, "toLocaleDateString", { value: cachedToLocaleDateString, writable: true, configurable: true, enumerable: false });
  Object.defineProperty(Date.prototype, "toLocaleTimeString", { value: cachedToLocaleTimeString, writable: true, configurable: true, enumerable: false });
  Object.defineProperty(Date.prototype, "toLocaleString", { value: cachedToLocaleString, writable: true, configurable: true, enumerable: false });
}

module.exports = {
  install,
  cachedDateTimeFormat,
  cachedToLocaleDateString,
  cachedToLocaleTimeString,
  cachedToLocaleString,
  CachedDateTimeFormat,
  stats,
  native: { DateTimeFormat: NativeDateTimeFormat, toLocaleDateString: nativeToLocaleDateString, toLocaleTimeString: nativeToLocaleTimeString, toLocaleString: nativeToLocaleString },
};
