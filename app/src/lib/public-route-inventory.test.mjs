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
  // "/homer-nukes" left this list on 2026-08-17. It was retired on 2026-06-30 because the provider
  // anytime-home-run feed it read stopped existing, and a product with no inputs is not a product.
  // It now computes its own P(>=1 HR) from free StatsAPI season totals and confirmed starters, so
  // it is a live destination again — a list of five independent probabilities, never the retired
  // five-leg parlay. The retirement's invariant was "publish nothing you cannot source"; that is
  // satisfied by owning the input, not by staying dark.
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
  "/homer-nukes",
  "/results",
  "/results/model-audit",
  "/results/nba",
  "/mlb",
  "/mlb/board",
  "/sports",
  "/nfl", // P169-J: the NFL honesty hub — footer-linked; guarded by the rendered-text rules above
  "/epl", // P186: Premier League schedule hub — schedule only, guarded by the rendered-text rules above
  "/ufc", // P186: UFC settled archive + upcoming schedule — schedule only, same rendered-text guard
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
  // "/ufc" left it in Program 186 on the same terms: it carries an upcoming schedule marked
  // "Schedule only — simulation pending" above its settled archive, and the rendered-text guard
  // above holds it to publishing nothing predictive. "/nba" stays — it is still a redirect to its
  // settled results archive, with no schedule hub of its own.
  "/nba", "/nhl", "/ipl", "/board", "/projections", "/events",
  "/trends", "/world-cup", "/world-cup-specials", "/mlb/parlays",
  "/parlays", "/parlay-lab", "/games", "/ops", "/preview",
];

/*
 * The canonical destination list is a NAV SURFACE now, and the load-bearing one.
 *
 * When the top nav and the command rail were rewritten to derive from `navigation.ts`, their own
 * files stopped containing hrefs — one literal each. These guards grep hrefs out of a surface, so
 * both were still "passing" while inspecting nothing: a retired route could have been re-listed in
 * navigation.ts and the NEVER_IN_NAV assertion would not have seen it. Scanning the list itself
 * puts every derived surface back under the guard at once.
 */
const NAV_SURFACES = {
  "canonical destinations": "src/lib/navigation.ts",
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

/**
 * A page's rendered source: the page file PLUS the source of any first-party component it imports.
 *
 * A guard that greps only the page file silently passes when the page delegates to a shared
 * component — which is the direction this codebase deliberately moves in (one schedule component
 * serving several sports). Following the import keeps the assertion about what a READER sees rather
 * than about which file a sentence happens to live in.
 */
function renderedSource(rel) {
  const src = read(rel);
  let all = src;
  for (const m of src.matchAll(/from "@\/(components|lib)\/([^"]+)"/g)) {
    for (const ext of [".tsx", ".ts", ""]) {
      const p = path.join(APP, "src", m[1], m[2] + ext);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) { all += "\n" + fs.readFileSync(p, "utf8"); break; }
    }
  }
  return all;
}

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
  // P186: EPL graduates from redirect-only to a SCHEDULE HUB, the same graduation /sports took in
  // P148-B and /nfl took in P169-J. The invariant never was "the route must not exist" — it was "a
  // route must not imply coverage it does not have", and that is asserted against rendered text
  // below. EPL's capability state is unchanged: still not FULL_MODEL, still no published model.
  for (const sport of ["nhl", "ipl", "wnba", "mls"]) {
    assert.notEqual(capabilityState(sport), "FULL_MODEL", `${sport} is not FULL_MODEL`);
    const hub = path.join(APP, `src/app/${sport}/page.tsx`);
    if (!fs.existsSync(hub)) continue; // no route at all is the strongest form of "not public"
    assert.match(fs.readFileSync(hub, "utf8"), /ClientRedirect/, `/${sport} may only exist as a redirect`);
  }
  // NFL graduated from redirect-only to an HONESTY HUB (Program 169 · Release J, founder charter)
  // exactly as /sports graduated in P148-B: the invariant — no overstated coverage, no model
  // claims, no liveness theater — did not lapse; it is enforced against the RENDERED TEXT below.
  // The sport's capability state is unchanged: still not FULL_MODEL, still no public model.
  assert.notEqual(capabilityState("nfl"), "FULL_MODEL", "nfl is not FULL_MODEL — the hub is schedule/honesty context only");
  // ── Schedule hubs: they exist, and they must say what they are. ──
  for (const [sport, hub] of [["epl", "src/app/epl/page.tsx"], ["ufc", "src/app/ufc/page.tsx"]]) {
    assert.notEqual(capabilityState(sport), "FULL_MODEL", `${sport} is not FULL_MODEL`);
    const src = renderedSource(hub);
    // The page must state its coverage in words a reader sees, not merely omit a model.
    assert.match(src, /Schedule only — simulation pending/, `/${sport} must state its coverage state`);
    // And it must not carry the vocabulary of a live model.
    for (const banned of ["projected score", "win probability", "our pick", "best bet", "\\bedge\\b", "\\block\\b"]) {
      assert.doesNotMatch(src, new RegExp(banned, "i"), `/${sport} must not use live-model language ("${banned}")`);
    }
  }

  const nflHub = read("src/app/nfl/page.tsx");
  assert.doesNotMatch(nflHub, /ClientRedirect/, "/nfl is a real page now (P169-J)");
  // P173: the founder authorised a two-tier launch, so the old blanket "no predictions" line is
  // now FALSE and was replaced rather than left to contradict the page. The invariant it protected
  // — never implying a proven or market-beating model — is asserted directly instead.
  assert.doesNotMatch(nflHub, /No NFL predictions, picks, or\s+simulations are published/, "that line is no longer true and must not linger");
  assert.match(nflHub, /experimental\s+preseason simulations/i, "the page says plainly what it publishes");
  assert.match(nflHub, /not a claim to beat the sportsbook market/i, "and what it does not claim");
  /*
   * The coin-flip limit is now RENDERED FROM THE MODEL ARTIFACT rather than retyped in the page, so
   * the literal no longer appears in this source file. That change was made because the page's own
   * copy had drifted to the kinder "barely better than a coin flip" while the artifact said "no
   * better" — a hand-maintained caveat can only drift toward flattery.
   *
   * So the assertion follows the text to where it actually lives, and gets STRICTER on the way: the
   * page must render the artifact's honestLimit in the lead, and that honestLimit must state the
   * coin-flip result. Pinning the string in the page file could not have caught the drift; this can.
   */
  assert.match(nflHub, /plainEnglish\?\.honestLimit/, "the lead renders the model's own honest limit, not a retyped copy");
  const nflModel = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/index.json"), "utf8"))?.model;
  assert.match(nflModel?.plainEnglish?.honestLimit ?? "", /coin flip/i, "the honest limit states the coin-flip result");
  assert.doesNotMatch(nflModel?.plainEnglish?.honestLimit ?? "", /barely better/i, "and never softens it to 'barely better'");
  assert.doesNotMatch(nflHub, /\b(edge|lock|best bet|profitable|guaranteed)\b/i, "no validated-tier vocabulary");
  // P172-C: the literal "PRIVATE_ONLY" moved out of typed prose into the DERIVED status artifact.
  // The invariant is unchanged and now checked against the artifact the page actually renders:
  // the team-simulation layer may never claim a published NFL model.
  {
    const st = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/model-status.json"), "utf8")).teamSimulation;
    // P173 two-tier contract: PUBLIC_EXPERIMENTAL joins the allowed set by founder decision, but
    // it is NOT the validated tier — it must still name the gate it has not cleared and must
    // carry its honest limit in the same breath as the claim.
    assert.ok(["PRIVATE_ONLY", "MODEL_ABSTAINS", "REGULAR_SEASON_ELIGIBLE", "PUBLIC_EXPERIMENTAL", "UNKNOWN"].includes(st.state),
      `team simulation state ${st.state} outside the allowed set`);
    if (st.state !== "LIVE") assert.ok(st.nextGate || st.state === "UNKNOWN", "a held or experimental layer names the gate that would release it");
    if (st.state === "PUBLIC_EXPERIMENTAL") {
      assert.match(st.detail, /coin flip/i, "an experimental claim carries its honest limit inline");
      assert.match(st.detail, /no claim to beat/i);
      assert.match(st.nextGate, /validated pick/i, "and names the stronger tier it has not reached");
    }
  }
  assert.match(nflHub, /committed/i, "data provenance is stated");
  // P172-C: layer states are DERIVED from committed evaluation receipts, not typed prose — the
  // page must read the derived artifact and must fall back to UNKNOWN, never to green.
  assert.match(nflHub, /nfl\/model-status\.json/, "the coverage table reads the derived status artifact");
  assert.match(nflHub, /state: "UNKNOWN"/, "a missing receipt renders UNKNOWN");
  const status = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/model-status.json"), "utf8"));
  assert.equal(status.dataClass, "PUBLIC_DERIVED");
  for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "perTdShare"]) {
    assert.ok(!JSON.stringify(status).includes(banned), `the public status must not carry "${banned}"`);
  }
  // each player family carries its OWN decision — receiving never inherits rushing's status
  const families = status.playerFamilies.map((f) => f.modelStanding ?? f.detail);
  assert.equal(new Set(families).size >= 2, true, "families are decided independently, not as one block");
  // P171-F: the market layer publishes PRICES, never a model claim beside them. The invariant
  // holds in rendered text — prices are attributed as the books' own numbers, the capture stamp
  // is absolute, and the section cannot render without its artifact.
  // the attribution invariant is now asserted in BOTH places it can reach a reader: the page's
  // own market-section prose, and the derived status detail the coverage table renders.
  assert.match(nflHub, /GameTimePicks publishes no NFL prediction beside/, "the market section attributes prices as the books' own");
  {
    const st = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/model-status.json"), "utf8"));
    if (st.market.state === "LIVE") assert.match(st.market.detail, /not GameTimePicks predictions/, "captured prices are attributed as market facts, never as our output");
  }
  assert.match(nflHub, /they describe the market, not a forecast of ours/, "the de-vigged percentages disclaim forecast status in words");
  assert.match(nflHub, /markets\?\.capturedAt && r\.kickoffUtc && markets\.capturedAt < r\.kickoffUtc/, "only rows captured BEFORE their own kickoff render — a static truth that cannot rot into liveness theater");
  assert.match(nflHub, /marketRows\.length \? \(/, "no artifact, no section — a page area is never filled merely because a file exists");
  {
    // the typed NO_MARKET finding also moved into the derived artifact (P172-C)
    const st = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/model-status.json"), "utf8"));
    const probed = st.playerFamilies.some((f) => f.state === "NO_MARKET") || st.anytimeTd.state === "NO_MARKET";
    const holds = st.playerFamilies.every((f) => f.state !== "MODEL_READY" || f.nextGate);
    assert.ok(probed || st.playerFamilies.every((f) => f.state === "ROLE_UNCERTAIN"),
      "probed-absent player markets are typed NO_MARKET, not left as stale AUTH_REQUIRED language");
    assert.ok(holds, "any ready family still names the live-data gate it waits on");
  }
  assert.doesNotMatch(nflHub, /\bedge\b|\block\b|best bet|beat the market|profitable/i, "the banned advantage vocabulary never appears beside prices");
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
