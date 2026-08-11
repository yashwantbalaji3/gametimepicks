/**
 * PUBLIC ROUTE INVENTORY (2026-07-30 audit) — the site ships exactly the destinations it can stand
 * behind, and nothing else.
 *
 * Three separate failure modes are pinned here, because each has actually happened:
 *
 *   1. A sport with no live capability keeps a public hub. NHL, IPL and the NBA model board all sat
 *      in the export long after their sources died, each promising coverage "pending" a provider that
 *      was never coming. The capability registry (sport-capability-registry.ts) is the authority:
 *      only FULL_MODEL earns a live surface, HISTORICAL_ONLY earns an archive, and SCAFFOLD_ONLY /
 *      DISABLED earn nothing public.
 *   2. A retired route is deleted outright and every inbound link 404s. Retired routes keep a
 *      client-redirect stub instead — a stub is a real page under `output: "export"`, so bookmarked
 *      links land somewhere real.
 *   3. A nav surface quietly grows a link to something that isn't a destination. The four nav
 *      surfaces (top nav, command rail, mobile bottom bar, footer) are pinned to one approved set, so
 *      re-listing a retired sport or an internal route fails here rather than in production.
 *
 * The source tree is the authority; the export is checked only when it is demonstrably fresher than
 * the sources, because a stale out/ is not evidence of anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MOBILE_NAV_ITEMS } from "./nav-active-route.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

/**
 * Routes removed in the audit. `stub` = a client-redirect page is kept at that URL (inbound links
 * survive); `gone` = the route is deleted outright, because it was never linked from outside the
 * surfaces that were removed with it.
 */
const REMOVED = {
  "/nhl": "stub",
  "/ipl": "stub",
  "/nba": "stub",
  "/board": "stub",
  "/projections": "stub",
  "/events": "stub",
  "/trends": "stub",
  // "/sports" left this list in Program 148 Release B: the route is LIVE again as the Upcoming
  // Sports schedule directory. The retirement's invariant (no overstated coverage, no liveness
  // claims) did not lapse — it moved to rendered-text guards in product-reset-phase-a.test.mjs and
  // slate-liveness.test.mjs. It stays in NEVER_IN_NAV below: discovery is the homepage strip.
  "/homer-nukes": "stub",
  "/mlb/parlays": "stub",
  "/nhl/board": "gone",
  "/nhl/parlays": "gone",
  "/nhl/power": "gone",
  "/nhl/results": "gone",
  "/ipl/board": "gone",
  "/ipl/parlays": "gone",
  "/ipl/power": "gone",
  "/ipl/results": "gone",
  "/nba/board": "gone",
  "/nba/power": "gone",
  "/results/nhl": "gone",
  "/results/ipl": "gone",
};

/** The complete set of destinations any nav surface is allowed to link. */
const APPROVED_DESTINATIONS = new Set([
  "/",
  "/today",
  "/simulate",
  "/markets",
  "/picks",
  "/build",
  "/bank-builder",
  "/moonshot",
  "/mr-dub",
  "/results",
  "/results/model-audit",
  "/results/nba",
  "/mlb",
  "/mlb/board",
  "/sports",
  "/learn",
  "/methodology",
  "/market-guide",
  "/responsible-use",
  "/research",
  "/system-status",
  "/about",
]);

/** Nothing in a nav surface may point at any of these, however it is labelled. */
const NEVER_IN_NAV = [
  // "/sports" left this list in Program 158: it is now the canonical nav destination for the
  // four-sport schedules directory (one item, "Sports · Schedules", secondary group).
  "/nba", "/nhl", "/ipl", "/ufc", "/board", "/projections", "/events",
  "/trends", "/homer-nukes", "/world-cup", "/world-cup-specials", "/mlb/parlays",
  "/parlays", "/parlay-lab", "/games", "/ops", "/preview",
];

const NAV_SURFACES = {
  "top nav": "src/components/nav.tsx",
  "command rail": "src/components/command-rail.tsx",
  footer: "src/components/footer.tsx",
};

/** Every internal href a surface declares, normalised (trailing slash dropped, "" → "/"). */
function hrefsIn(source) {
  const out = new Set();
  for (const m of source.matchAll(/href(?:=|:\s*)"(\/[^"]*)"/g)) {
    const clean = m[1].replace(/\/$/, "");
    out.add(clean === "" ? "/" : clean);
  }
  return out;
}

// ── 1 · removed routes are gone from the source tree ─────────────────────────────────────────────
test("every removed route has no page body left in the source tree", () => {
  for (const [route, kind] of Object.entries(REMOVED)) {
    const page = path.join(APP, `src/app${route}/page.tsx`);
    if (kind === "gone") {
      assert.ok(!fs.existsSync(page), `${route}: the route must be deleted, not left rendering`);
      continue;
    }
    assert.ok(fs.existsSync(page), `${route}: the redirect stub must exist so inbound links survive`);
    const src = fs.readFileSync(page, "utf8");
    assert.match(src, /ClientRedirect/, `${route}: the stub must client-redirect`);
    assert.match(src, /robots:\s*\{\s*index:\s*false/, `${route}: a stub must be noindex`);
    // A stub renders no data: no artifact loading, no board/settlement libs.
    assert.doesNotMatch(src, /node:fs|@\/lib\/data|getBoardForDate|loadTodaySlate/, `${route}: a stub must not load data`);
  }
});

// ── 2 · the capability registry actually justifies each removal ──────────────────────────────────
test("no SCAFFOLD_ONLY or DISABLED sport keeps a live public hub", async () => {
  const { capabilityState } = await import("./sport-capability-registry.ts");
  for (const sport of ["nhl", "ipl", "wnba", "mls", "epl", "nfl"]) {
    assert.notEqual(capabilityState(sport), "FULL_MODEL", `${sport} is not FULL_MODEL`);
    const hub = path.join(APP, `src/app/${sport}/page.tsx`);
    if (!fs.existsSync(hub)) continue; // no route at all is the strongest form of "not public"
    assert.match(fs.readFileSync(hub, "utf8"), /ClientRedirect/, `/${sport} may only exist as a redirect`);
  }
  // NBA is HISTORICAL_ONLY: the settled archive stays published, the live model surfaces do not.
  assert.equal(capabilityState("nba"), "HISTORICAL_ONLY");
  assert.ok(fs.existsSync(path.join(APP, "src/app/results/nba/page.tsx")), "the NBA settled archive stays published");
  assert.ok(!fs.existsSync(path.join(APP, "src/app/nba/board/page.tsx")), "no NBA model board");
  assert.ok(!fs.existsSync(path.join(APP, "src/app/nba/power/page.tsx")), "no NBA power board");
  // MLB is the one live sport, so its hub and board are real pages, not stubs.
  assert.equal(capabilityState("mlb"), "FULL_MODEL");
  for (const rel of ["src/app/mlb/page.tsx", "src/app/mlb/board/page.tsx"]) {
    assert.doesNotMatch(read(rel), /ClientRedirect/, `${rel} is a real page`);
  }
});

// ── 3 · the nav surfaces carry ONLY the approved destination set ─────────────────────────────────
test("no nav surface links anything outside the approved public set", () => {
  const offenders = [];
  for (const [name, rel] of Object.entries(NAV_SURFACES)) {
    for (const href of hrefsIn(read(rel))) {
      if (!APPROVED_DESTINATIONS.has(href)) offenders.push(`${name}: ${href}`);
    }
  }
  for (const item of MOBILE_NAV_ITEMS) {
    const href = item.href.replace(/\/$/, "") || "/";
    if (!APPROVED_DESTINATIONS.has(href)) offenders.push(`mobile bottom nav: ${href}`);
  }
  assert.deepEqual(offenders, [], `nav surfaces link non-approved destinations:\n  ${offenders.join("\n  ")}`);
});

test("no nav surface links a retired sport, a legacy alias, or an internal route", () => {
  const offenders = [];
  for (const [name, rel] of Object.entries(NAV_SURFACES)) {
    const hrefs = hrefsIn(read(rel));
    for (const bad of NEVER_IN_NAV) if (hrefs.has(bad)) offenders.push(`${name}: ${bad}`);
  }
  for (const item of MOBILE_NAV_ITEMS) {
    const href = item.href.replace(/\/$/, "") || "/";
    if (NEVER_IN_NAV.includes(href)) offenders.push(`mobile bottom nav: ${href}`);
  }
  assert.deepEqual(offenders, [], `retired/internal routes are back in nav:\n  ${offenders.join("\n  ")}`);
});

// ── 4 · MUTATION · the href scan has teeth ───────────────────────────────────────────────────────
test("MUTATION · the href scan catches a reintroduced link in either syntax", () => {
  assert.ok(hrefsIn('<Link href="/nhl">NHL</Link>').has("/nhl"), "matches a JSX href");
  assert.ok(hrefsIn('{ href: "/ufc", label: "UFC" }').has("/ufc"), "matches an object href");
  assert.ok(hrefsIn('<Link href="/mlb/">MLB</Link>').has("/mlb"), "normalises the trailing slash");
  // A deeper route that merely shares a prefix is NOT the retired parent.
  assert.ok(!hrefsIn('<Link href="/results/nba">NBA</Link>').has("/nba"), "prefix match must not fire");
});

// ── 5 · the export agrees, when the export is fresher than the sources ───────────────────────────
test("removed routes are absent from the static export (checked only against a current build)", () => {
  const out = path.join(APP, "out");
  const index = path.join(out, "index.html");
  if (!fs.existsSync(index)) return; // no build in this run

  // A stale out/ is not evidence. Only assert when the export post-dates every source page.
  let newestSource = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else newestSource = Math.max(newestSource, fs.statSync(p).mtimeMs);
    }
  };
  walk(path.join(APP, "src/app"));
  if (fs.statSync(index).mtimeMs < newestSource) return; // export predates the sources — nothing proven

  const leaked = [];
  for (const [route, kind] of Object.entries(REMOVED)) {
    if (kind !== "gone") continue;
    if (fs.existsSync(path.join(out, route.slice(1), "index.html"))) leaked.push(route);
  }
  // Internal routes are pruned from out/ by the build; re-checked here so one guard covers the export.
  for (const route of ["ops", "preview"]) {
    if (fs.existsSync(path.join(out, route))) leaked.push(`/${route}`);
  }
  assert.deepEqual(leaked, [], `routes still present in the export:\n  ${leaked.join("\n  ")}`);
});

// ── 6 · canonical money untouched (this is a routing change) ─────────────────────────────────────
test("canonical money (portfolio.json) md5 is unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
