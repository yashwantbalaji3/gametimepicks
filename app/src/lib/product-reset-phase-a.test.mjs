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

// P196: the surfaces DERIVE their destinations from src/lib/navigation.ts, so a reachability check
// must read the canonical list too — the href no longer appears literally in the surface file. The
// assertion is unchanged; it now looks where the answer actually lives.
test("primary nav is the pruned Adoption-Sprint spine: Today · Simulate · Results · How It Works (in order, before the divider); the paper-bankroll products are SECONDARY so the simulation product leads", () => {
  const nav = read("src/components/nav.tsx") + read("src/lib/navigation.ts");
  // P196: `beforeDivider` is COMPUTED from the group boundary now, so there is no literal to find.
  // The surviving intent is what this asserts: these four lead-destinations stay reachable, and the
  // paper-bankroll products never come first.
  const order = ["/today", "/simulate", "/results", "/learn"];
  for (const href of order) {
    assert.ok(nav.includes(`href: "${href}"`), `${href} is a top-nav destination`);
  }
  const firstDest = /href: "(\/[a-z-]+)"/.exec(nav);
  assert.ok(firstDest && !["/bank-builder", "/moonshot", "/mr-dub"].includes(firstDest[1]),
    `the spine opens on ${firstDest?.[1]} — a paper-bankroll product must never lead the simulation product`);

  // Bank Builder + Moonshot are SECONDARY: they live in the Products cluster, never in Now.
  for (const href of ["/bank-builder", "/moonshot"]) {
    assert.match(nav, new RegExp(`href: "${href}"[^}]*group: "products"`),
      `${href} belongs to the Products cluster, so the simulation product leads`);
  }
});

test("/sports revival keeps the retirement's invariant: coverage stated in words, never as equal tiles", () => {
  // The 'More Sports' directory was retired 2026-07-30 because equal sport tiles beside the one
  // FULL_MODEL sport overstated coverage. Release B (Program 148) revived the route by FIXING the
  // overstatement instead of hiding the page: the invariant moves from "the route must not exist"
  // to "the rendered words must state what each sport is not". Nav still does not link it — the
  // strip on the homepage is the deliberate, restrained discovery path.
  // Program 158 IA decision: ONE "Sports · Schedules" nav item exists (secondary group), never
  // four league links — the label carries "Schedules" so it cannot read as a second model hub.
  const nav = read("src/components/nav.tsx") + read("src/lib/navigation.ts");
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
  /*
   * P185 (2026-08-20): /epl moved from the schedule-only column to the PUBLISHING column — it now
   * carries per-fixture 1X2 distributions. It does not join SIMULATED, because that set is what the
   * nav is allowed to present as a working model and EPL has graded zero matches; it gets its own
   * requirement, which is the one that matters for an unvalidated model: the page must say so.
   *
   * Note what this guard could NOT see before. It matched the pending line in `renderedSource`,
   * which concatenates imported components — and the shared schedule component still holds that line
   * as the dead FALSE branch of a ternary /epl passes `true`. So /epl kept passing a schedule-only
   * assertion for a full day after it began publishing forecasts. A nav link that implies the WRONG
   * state is the defect this guard exists to catch, and the string it keyed on could not distinguish
   * a rendered sentence from an unreachable one.
   */
  const SIMULATED = new Set(["/mlb", "/nfl"]);
  const PUBLISHED_UNVALIDATED = new Set(["/epl"]);
  const PAGE_FOR = { "/mlb": "src/app/mlb/page.tsx", "/nfl": "src/app/nfl/page.tsx", "/epl": "src/app/epl/page.tsx", "/ufc": "src/app/ufc/page.tsx", "/nba": "src/app/nba/page.tsx" };
  const leagueLinks = [...nav.matchAll(/href: "(\/(?:mlb|nfl|epl|nba|ufc))"/g)].map((m) => m[1]);
  assert.ok(leagueLinks.length > 0, "the nav links at least one league");
  for (const href of leagueLinks) {
    const src = renderedSource(PAGE_FOR[href]);
    if (SIMULATED.has(href)) continue;
    if (PUBLISHED_UNVALIDATED.has(href)) {
      // The nav entry and the page must agree, and both must carry the validation gap. Asserted on
      // the nav SOURCE (the entry is the thing that could imply too much) and the page source.
      assert.match(src, /not validated out of sample/,
        `${href} publishes forecasts, so the page must state they are unvalidated`);
      assert.match(nav, /href: "\/epl"[\s\S]{0,240}?not validated/,
        `${href}'s nav entry must not imply a validated model — it said "simulation pending" while the page published forecasts`);
      continue;
    }
    assert.match(src, /Schedule only — simulation pending/,
      `${href} is linked in nav but never states its coverage — a nav link must not imply a model`);
  }
  const page = read("src/app/sports/page.tsx");
  const shared = read("src/components/sports/upcoming-sports.tsx");
  assert.match(page, /schedules only/, "the page still says which sports are not modelled");
  assert.match(shared, /Schedule only — not modelled/, "coverage state is rendered in words, not implied by layout");
  /*
   * P185-G: this asserted the literal sentence "no simulations, no predictions and no picks ON THIS
   * SITE" on every sport section. That sentence rendered under UFC, where /ufc publishes a
   * three-market fight model — so the guard was pinning a claim that had become false for one sport.
   *
   * The INTENT is unchanged and is what is asserted now: every section states its coverage in
   * rendered words rather than implying it by layout, and it does so WITHOUT making a site-wide
   * negative claim the directory cannot vouch for. Where a sport has its own hub, it links there.
   */
  assert.match(shared, /This section is the schedule only\./,
    "every sport section still closes with an explicit scope line");
  assert.doesNotMatch(shared, /no simulations, no predictions and no picks on this site/,
    "the directory may not assert site-wide that a sport publishes nothing");
  assert.match(shared, /SPORT_HUB\[s\.sport\]/,
    "a sport with its own hub links to it rather than being written off here");
  assert.match(page, /MLB Simulation Center/, "the modelled products are named so the contrast is explicit");
  assert.match(page, /href="\/nfl\/"/, "NFL is named, now that it publishes simulations");
});

test("the ONE modelled sport keeps 'Simulation Center' framing; retired sport routes claim none", () => {
  // The compact hero takes the sport NAME and the eyebrow as separate props, so "MLB" and
  // "Simulation Center" are no longer one literal in the source even though the reader still sees
  // them together. Assert both halves rather than the concatenation a refactor happened to break.
  const mlbPageSrc = read("src/app/mlb/page.tsx");
  assert.match(mlbPageSrc, /sport="MLB"/, "/mlb names the sport on its hero");
  assert.match(mlbPageSrc, /Simulation Center/, "/mlb framed as a Simulation Center (FULL_MODEL)");
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

test("the raw builder never fronts the beginner: /build leads with Suggested Parlays, the leg-by-leg builder is its own mode one action away", () => {
  /*
   * SUPERSEDED CONTRACT, SAME INTENT. The product-reset rule was "demote the builder so a raw
   * 180-leg marketplace is not the front door". P208 (founder charter) keeps that intent and gives
   * it the final shape: /build is the Parlay Center whose DEFAULT mode is Suggested Parlays, and
   * the builder is the Build Your Own mode at /build/custom — visible, one action away, never the
   * first screen a novice lands on.
   */
  const suggested = read("src/app/build/page.tsx");
  assert.match(suggested, /Suggested Parlays/, "/build leads with the suggested-card mode");
  assert.match(suggested, /\/build\/custom/, "the builder mode is one visible action away");
  assert.match(read("src/app/build/custom/page.tsx"), /Build Your Own/, "the builder is its own mode, not the beginner's first screen");
  const nav = read("src/components/nav.tsx") + read("src/lib/navigation.ts");
  assert.match(nav, /href: "\/build", label: "(Build|Parlay Center)", group: "now"/, "/build sits in the Now cluster beside the tools it belongs with, never as its own pillar");
});
