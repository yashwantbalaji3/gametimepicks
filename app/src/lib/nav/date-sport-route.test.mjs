/**
 * The date-and-sport URL contract, and the guard that keeps it the only one.
 *
 * Six surfaces built their own date links before this existed, and they had already drifted in form:
 * five emitted an unslashed `/results/date/<date>` against a `trailingSlash: true` config, one the
 * slashed form. Latent rather than visible — `<Link>` normalises at render, and production serves
 * zero unslashed dated links — but six private implementations of one contract is six chances to
 * drift somewhere that has no such safety net, which is what these cases pin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  SURFACES,
  surfaceHref,
  supportsDate,
  supportsSport,
  surfacesForDate,
  sportFromQuery,
} from "./date-sport-route.ts";

const TODAY = "2026-08-27";

test("EVERY href is slash-terminated — the export's own convention, emitted not relied upon", () => {
  const seen = [];
  for (const surface of Object.keys(SURFACES)) {
    for (const date of [null, TODAY, "2026-08-26"]) {
      for (const sport of [null, "mlb"]) {
        const href = surfaceHref(surface, { date, defaultDate: TODAY, sport });
        if (href == null) continue;
        seen.push(href);
        const pathPart = href.split(/[?#]/)[0];
        assert.ok(pathPart.endsWith("/"), `${surface} → ${href} is not slash-terminated`);
      }
    }
  }
  assert.ok(seen.length > 6, "the sweep actually produced hrefs");
});

test("the default date collapses to the base path — one canonical url per view", () => {
  // Otherwise /simulate and /simulate/d/<today>/ are two urls rendering the same page.
  assert.equal(surfaceHref("simulate", { date: TODAY, defaultDate: TODAY }), "/simulate/");
  assert.equal(surfaceHref("simulate", { date: null, defaultDate: TODAY }), "/simulate/");
  assert.equal(surfaceHref("results", { date: "2026-08-26", defaultDate: "2026-08-26" }), "/results/");
});

test("a non-default date uses the surface's own route convention", () => {
  assert.equal(surfaceHref("simulate", { date: "2026-08-26", defaultDate: TODAY }), "/simulate/d/2026-08-26/");
  assert.equal(surfaceHref("results", { date: "2026-08-20", defaultDate: "2026-08-26" }), "/results/date/2026-08-20/");
});

test("the sport rides in ?sport=, the convention /today already used", () => {
  assert.equal(surfaceHref("simulate", { date: "2026-08-26", defaultDate: TODAY, sport: "mlb" }), "/simulate/d/2026-08-26/?sport=mlb");
  assert.equal(surfaceHref("today", { sport: "ufc" }), "/today/?sport=ufc");
  assert.equal(surfaceHref("today", { sport: null }), "/today/");
});

test("REFUSAL · a today-only surface asked for another day returns null, not a 404 link", () => {
  // Home and Today have no page for last Tuesday. Saying so is a state a caller can render;
  // guessing a url would send a reader to a missing page.
  assert.equal(surfaceHref("today", { date: "2026-08-20", defaultDate: TODAY }), null);
  assert.equal(surfaceHref("home", { date: "2026-08-20", defaultDate: TODAY }), null);
  assert.equal(surfaceHref("picks", { date: "2026-08-20", defaultDate: TODAY }), null);
});

test("REFUSAL · a malformed date never reaches a url", () => {
  for (const bad of ["2026-8-27", "yesterday", "", "2026-08-27T00:00:00Z", "../../etc"]) {
    assert.equal(surfaceHref("simulate", { date: bad, defaultDate: TODAY }), null, `"${bad}" must refuse`);
  }
});

test("a sport value is encoded, never interpolated raw", () => {
  const href = surfaceHref("simulate", { sport: "a b&c=d" });
  assert.ok(href.includes("?sport=a%20b%26c%3Dd"), href);
});

test("capability queries answer what the registry declares", () => {
  assert.equal(supportsDate("simulate"), true);
  assert.equal(supportsDate("results"), true);
  assert.equal(supportsDate("today"), false);
  assert.equal(supportsSport("today"), true);
  assert.equal(supportsSport("home"), false);
});

test("surfacesForDate lists exactly the surfaces with a page for that day", () => {
  assert.deepEqual(surfacesForDate("2026-08-20", TODAY).sort(), ["results", "simulate"]);
  // The default date is reachable everywhere, because every surface has its default view.
  assert.deepEqual(
    surfacesForDate(TODAY, TODAY).sort(),
    ["home", "parlay", "picks", "results", "simulate", "today"],
  );
});

test("sportFromQuery folds case and treats blank as no filter", () => {
  assert.equal(sportFromQuery("?sport=MLB"), "mlb");
  assert.equal(sportFromQuery("?sport=%20"), null);
  assert.equal(sportFromQuery("?other=1"), null);
  assert.equal(sportFromQuery(null), null);
  assert.equal(sportFromQuery(new URLSearchParams("sport=ufc")), "ufc");
});

/* ── THE OWNERSHIP GUARD ──────────────────────────────────────────────────────────────────────── */

test("NO SECOND ROUTER · no surface hand-builds a dated url", () => {
  /*
   * The reason the trailing slash was inconsistent across six places at once. A date url is a
   * contract, and a contract with six private implementations is six chances to drift — this guard
   * is what makes `date-sport-route.ts` the owner rather than merely the newest copy.
   */
  const SRC = path.join(process.cwd(), "src");
  const OWNER = path.join(SRC, "lib/nav/date-sport-route.ts");
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (full === OWNER) continue;
      const src = fs.readFileSync(full, "utf8");
      /*
       * Strip comments — several files legitimately DESCRIBE these routes in prose — but strip them
       * LINE-PRESERVINGLY. The first version deleted them outright and then reported line numbers
       * from the shortened text, so every offender it found pointed at an unrelated line and the
       * report was useless for the one thing a guard report is for.
       */
      const blank = (m) => m.replace(/[^\n]/g, " ");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
      for (const [i, line] of code.split("\n").entries()) {
        // A template literal or concatenation that builds one of the dated route families.
        if (/["'`]\/(simulate\/d|results\/date)\/\$\{/.test(line)) {
          offenders.push(`${path.relative(SRC, full)}:${i + 1}`);
        }
      }
    }
  };
  walk(SRC);

  assert.deepEqual(offenders, [],
    `these build a dated url directly — use surfaceHref() from lib/nav/date-sport-route:\n  ${offenders.join("\n  ")}`);
});
