/**
 * Product reset Phase A — the 3-pillar nav + simulation-first framing. Pins the pillar spine, the
 * "Simulation Center" framing for the one modelled sport, and the coverage matrix wiring. Updated for
 * the 2026-07-30 public cleanup: /sports, /ufc and /world-cup are retired redirect stubs (the
 * capability registry — MLB the only FULL_MODEL sport — decides what may present as a live center).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd(); // app/
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");


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

test("primary nav is the pruned Adoption-Sprint spine: Today · Simulate · Results · How It Works (in order, before the divider); the paper-bankroll products are SECONDARY so the simulation product leads", () => {
  const nav = read("src/components/nav.tsx");
  const dividerAt = nav.indexOf("beforeDivider: true");
  const order = ["/today", "/simulate", "/results", "/learn"];
  let last = -1;
  for (const href of order) {
    const at = nav.indexOf(`href: "${href}"`);
    assert.ok(at > last && at < dividerAt, `${href} is a primary item before the divider, in order`);
    last = at;
  }
  // Bank Builder + Moonshot moved to SECONDARY — they come after the primary spine (the sim product leads).
  assert.ok(nav.indexOf('href: "/bank-builder"') > last, "Bank Builder comes after the primary spine (secondary)");
  assert.ok(nav.indexOf('href: "/moonshot"') > dividerAt, "Moonshot is secondary (after the divider)");
});

test("/sports revival keeps the retirement's invariant: coverage stated in words, never as equal tiles", () => {
  // The 'More Sports' directory was retired 2026-07-30 because equal sport tiles beside the one
  // FULL_MODEL sport overstated coverage. Release B (Program 148) revived the route by FIXING the
  // overstatement instead of hiding the page: the invariant moves from "the route must not exist"
  // to "the rendered words must state what each sport is not". Nav still does not link it — the
  // strip on the homepage is the deliberate, restrained discovery path.
  // Program 158 IA decision: ONE "Sports · Schedules" nav item exists (secondary group), never
  // four league links — the label carries "Schedules" so it cannot read as a second model hub.
  const nav = read("src/components/nav.tsx");
  const sportsItems = nav.match(/href: "\/sports"/g) ?? [];
  assert.equal(sportsItems.length, 1, "exactly ONE /sports nav item — the canonical discovery path");
  assert.match(nav, /label: "Sports · Schedules"/, "the nav label says Schedules, never a bare sport-hub claim");
  // P185: the rule was never "no sport links" — it was "no nav link for a sport that publishes
  // nothing", written when MLB was the only modelled sport. NFL now publishes full-game simulations
  // and a player board, so it earns its place beside MLB; EPL and UFC still publish nothing and stay
  // behind /sports. The invariant is now stated in those terms so it keeps holding as sports ship.
  // P186: the invariant is not "which sports may be linked" — it is that a nav link must never IMPLY
  // a model the sport does not have. So every league in the nav must resolve to a page that states
  // its coverage in rendered words: a simulated sport says so, and a schedule-only sport carries the
  // pending line. Checked against the page source, so adding a league without the line fails here.
  const SIMULATED = new Set(["/mlb", "/nfl"]);
  const PAGE_FOR = { "/mlb": "src/app/mlb/page.tsx", "/nfl": "src/app/nfl/page.tsx", "/epl": "src/app/epl/page.tsx", "/ufc": "src/app/ufc/page.tsx", "/nba": "src/app/nba/page.tsx" };
  const leagueLinks = [...nav.matchAll(/href: "(\/(?:mlb|nfl|epl|nba|ufc))"/g)].map((m) => m[1]);
  assert.ok(leagueLinks.length > 0, "the nav links at least one league");
  for (const href of leagueLinks) {
    const src = renderedSource(PAGE_FOR[href]);
    if (SIMULATED.has(href)) continue;
    assert.match(src, /Schedule only — simulation pending/,
      `${href} is linked in nav but never states its coverage — a nav link must not imply a model`);
  }
  const page = read("src/app/sports/page.tsx");
  const shared = read("src/components/sports/upcoming-sports.tsx");
  assert.match(page, /simulation for those is not published yet/, "the page still says which sports are not modelled");
  assert.match(shared, /Schedule only — not modelled/, "coverage state is rendered in words, not implied by layout");
  assert.match(shared, /no simulations, no predictions and no picks/, "every sport section closes with the explicit no-model line");
  assert.match(page, /MLB Simulation Center/, "the modelled products are named so the contrast is explicit");
  assert.match(page, /NFL hub/, "NFL is named as modelled now that it publishes simulations");
});

test("the ONE modelled sport keeps 'Simulation Center' framing; retired sport routes claim none", () => {
  assert.match(read("src/app/mlb/page.tsx"), /MLB Simulation Center/, "/mlb framed as a Simulation Center (FULL_MODEL)");
  // The World Cup is closed — a redirect stub that must not present itself as a simulation center.
  // /ufc is different: it is a dated ARCHIVE of the one settled card, kept because that record had
  // no other public surface (accountability outranks minimalism). It must claim no simulation
  // center either — an archive of outcomes is not a product.
  const wcSrc = read("src/app/world-cup/page.tsx");
  assert.match(wcSrc, /ClientRedirect/, "src/app/world-cup/page.tsx is a redirect stub");
  assert.ok(!/Simulation Center/.test(wcSrc), "world-cup makes no Simulation Center claim");
  const ufcSrc = read("src/app/ufc/page.tsx");
  assert.match(ufcSrc, /settled|archive/i, "src/app/ufc/page.tsx reads as a settled archive");
  assert.ok(!/Simulation Center/.test(ufcSrc), "ufc makes no Simulation Center claim");
});

test("the coverage matrix is surfaced on the surviving sport page + methodology + simulate", () => {
  for (const rel of ["src/app/mlb/page.tsx", "src/app/methodology/page.tsx", "src/app/simulate/page.tsx"]) {
    assert.match(read(rel), /SimulationCoverageMatrix/, `${rel} renders the coverage matrix`);
  }
});

test("/build is demoted to Advanced Builder (secondary), not a primary pillar", () => {
  assert.match(read("src/app/build/page.tsx"), /Advanced Builder/, "/build titled Advanced Builder");
  const nav = read("src/components/nav.tsx");
  const primary = nav.slice(0, nav.indexOf("beforeDivider: true"));
  assert.ok(!primary.includes('href: "/build"'), "/build is not a primary nav pillar");
});
