/**
 * Cross-surface truth — every detector proven against the corruption it claims to catch.
 *
 * Run: npx tsx --test src/lib/reconcile/cross-surface.test.mjs
 *
 * This file reads the built export, so it runs in CI's phase 2. It would have been meaningless
 * before Program 225 re-sequenced the gate — which is precisely why it can exist now.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { reconcileSurfaces, mainRegion, FINDING_KINDS } from "./cross-surface.mjs";

const TODAY = "2026-09-01";
const matrix = (o = {}) => ({
  date: TODAY,
  sports: [
    { sport: "mlb", state: "COMPLETE", windowDate: TODAY, rows: [{ startUtc: "2026-09-01T22:40:00Z" }] },
    { sport: "nba", state: "NO_EVENTS", rows: [] },
  ],
  ...o,
});
const surface = (region, route = "/today") => ({ route, region });

/* ── THE DETECTORS ─────────────────────────────────────────────────────────────────────────────── */

test("a clean set of surfaces reconciles", () => {
  const out = reconcileSurfaces({ matrix: matrix(), today: TODAY, surfaces: [surface("Tonight 15 games · first pitch 2026-09-01")] });
  assert.equal(out.state, "RECONCILED");
  assert.deepEqual(out.findings, []);
  assert.equal(out.regionsFound, 1);
});

test("REGION_NOT_FOUND is a finding, never a silent pass", () => {
  /*
   * Four guards in this repository have passed by scanning navigation chrome, a serialized payload,
   * or an area that did not contain what they meant to read. A check that cannot prove it found its
   * subject has not checked anything.
   */
  const out = reconcileSurfaces({ matrix: matrix(), today: TODAY, surfaces: [surface(null, "/picks")] });
  assert.equal(out.findings[0].kind, "REGION_NOT_FOUND");
  assert.equal(out.findings[0].route, "/picks");
  assert.equal(out.state, "FINDINGS");
  assert.equal(out.regionsFound, 0);
});

test("DATE_DRIFT · a page describing a day the platform is not operating", () => {
  const out = reconcileSurfaces({ matrix: matrix(), today: TODAY, surfaces: [surface("Tonight the slate for 2026-07-04 is live")] });
  assert.equal(out.findings[0].kind, "DATE_DRIFT");
  assert.match(out.findings[0].detail, /2026-07-04/);

  // An event date inside the window is legitimate, and so is the matrix's own date.
  const ok = reconcileSurfaces({ matrix: matrix(), today: TODAY, surfaces: [surface("Tonight's slate 2026-09-01")] });
  assert.deepEqual(ok.findings, []);

  /*
   * An ARCHIVE renders past dates as its content. /results exists to show them, and holding it to a
   * current-slate claim it never makes produced a finding a day, none of them real.
   */
  const archive = reconcileSurfaces({
    matrix: matrix(), today: TODAY,
    surfaces: [{ route: "/results", region: "2026-08-30 Complete · every generated row reached a final state", currentSlateSurface: false }],
  });
  assert.deepEqual(archive.findings, [], "an archive is not making a claim about tonight");
});

test("QUIET_SPORT_PRESENTED_LIVE · the claim customers actually act on", () => {
  const out = reconcileSurfaces({
    matrix: matrix(), today: TODAY,
    surfaces: [surface("NBA — tonight's slate is here", "/nba")],
  });
  assert.equal(out.findings[0].kind, "QUIET_SPORT_PRESENTED_LIVE");
  assert.match(out.findings[0].detail, /NBA is NO_EVENTS/);
});

test("naming a quiet sport is legal; ASSERTING it is live is not", () => {
  /*
   * The narrowness matters. Every page lists NBA in its navigation, and an off-season notice has to
   * be able to say the word. Only a live-slate assertion is a finding — otherwise this detector
   * fires on the honest copy and gets switched off.
   */
  for (const legal of ["NBA is in its off-season", "NBA · no games scheduled", "NBA Paper Cards"]) {
    assert.deepEqual(reconcileSurfaces({ matrix: matrix(), today: TODAY, surfaces: [surface(legal)] }).findings, []);
  }
});

test("INTERNAL_VOCABULARY_LEAK · the matrix's state names are not customer copy", () => {
  const out = reconcileSurfaces({ matrix: matrix(), today: TODAY, surfaces: [surface("15 games NOT_YET_CAPTURED")] });
  assert.equal(out.findings[0].kind, "INTERNAL_VOCABULARY_LEAK");
  assert.match(out.findings[0].detail, /NOT_YET_CAPTURED/);
});

test("every finding kind is in the closed vocabulary", () => {
  const out = reconcileSurfaces({
    matrix: matrix(), today: TODAY,
    surfaces: [surface(null), surface("Tonight's slate 2026-01-01"), surface("NBA tonight's slate"), surface("SOURCE_STALE")],
  });
  for (const f of out.findings) assert.ok(FINDING_KINDS.includes(f.kind), `${f.kind} outside the vocabulary`);
  assert.ok(out.findings.length >= 4, "each corrupted surface produced its own finding");
});

/* ── THE REGION EXTRACTOR ──────────────────────────────────────────────────────────────────────── */

test("mainRegion returns null rather than falling back to the whole document", () => {
  /*
   * The fallback IS the defect. Returning the document lets a check read navigation chrome present
   * on every route and Next.js's serialized payload, both of which have already made guards pass on
   * pages whose visible text said nothing of the kind.
   */
  assert.equal(mainRegion("<html><body>no main here</body></html>"), null);
  assert.equal(mainRegion(null), null);
  assert.equal(mainRegion("<main><p>Hello &amp; welcome</p></main>"), "Hello & welcome");
  assert.equal(mainRegion("<main><script>var x='NOT_YET_CAPTURED'</script><p>ok</p></main>"), "ok",
    "the serialized payload is stripped, not scanned");
});

/* ── AGAINST THE BUILT EXPORT ──────────────────────────────────────────────────────────────────── */

const OUT = path.join(process.cwd(), "out");
const ROUTES = ["", "today", "mlb", "nfl", "epl", "ufc", "results", "picks", "build", "simulate"];

test("LIVE · the real surfaces reconcile with the committed matrix", () => {
  if (!fs.existsSync(OUT)) return;
  const dir = path.join(process.cwd(), "..", "data", "internal", "offered-window");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (files.length === 0) return;
  const m = JSON.parse(fs.readFileSync(path.join(dir, files.at(-1)), "utf8"));

  /* Archives render past dates as their content; they make no claim about tonight. */
  const ARCHIVES = new Set(["/results", "/picks"]);
  const surfaces = ROUTES.map((r) => {
    const p = path.join(OUT, r, "index.html");
    return {
      route: `/${r}`,
      region: fs.existsSync(p) ? mainRegion(fs.readFileSync(p, "utf8")) : null,
      currentSlateSurface: !ARCHIVES.has(`/${r}`),
    };
  }).filter((s, i) => fs.existsSync(path.join(OUT, ROUTES[i], "index.html")));

  assert.ok(surfaces.length >= 6, `only ${surfaces.length} surfaces found — the route list has drifted from the export`);

  const out = reconcileSurfaces({ matrix: m, today: m.date, surfaces });
  assert.deepEqual(
    out.findings,
    [],
    `cross-surface findings:\n  ${out.findings.map((f) => `${f.route} ${f.kind}: ${f.detail}`).join("\n  ")}`,
  );
  assert.equal(out.regionsFound, surfaces.length, "every surface's main region must be findable");
});
