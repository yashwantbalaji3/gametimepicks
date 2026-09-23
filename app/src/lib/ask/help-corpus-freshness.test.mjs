/**
 * THE HELP CORPUS MUST STAY TRUE, AND ITS LINKS MUST GO SOMEWHERE (v1.8 · Ask readiness).
 *
 * Ask answers site questions from `help-source.mjs`. Two things rot there and nothing was watching either.
 *
 * 1. ROUTES. `parlay-candidates` pointed at `/parlay-lab/`, which has been a `ClientRedirect` stub to
 *    `/build#suggested-cards` since Parlay Lab was retired. Ask was handing readers a redirect — and this
 *    repository has already recorded that chained redirects discard query intent. It was the only stale
 *    route of twenty-one, which is exactly why a guard is worth more than a sweep: the next one will be
 *    the only stale route too.
 *
 * 2. MODEL-STATUS CLAIMS. The corpus said "NFL and EPL forecasts are experimental". Four NFL families are
 *    PUBLISHED on the live player board — rushing yards, receiving yards, receptions and anytime TD — so a
 *    reader asking whether GameTime publishes NFL predictions was told no. The corrected copy also draws
 *    the distinction the old text collapsed: **published as a forecast** and **eligible as a parlay leg**
 *    are different things, and the signature products remain MLB-only.
 *
 * This checks the corpus against the repository, not against a remembered fact.
 *
 * Run: cd app && npx tsx --test src/lib/ask/help-corpus-freshness.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { HELP_CHUNKS } from "./help-source.mjs";

const APP = process.cwd();
const routed = HELP_CHUNKS.filter((c) => c.route);

/** How a route resolves in the app: a real page, a redirect stub, or nothing. */
function resolveRoute(route) {
  const seg = route.replace(/^\/|\/$/g, "");
  if (!seg) return { kind: "page" };
  const pageFile = path.join(APP, "src", "app", seg, "page.tsx");
  if (!fs.existsSync(pageFile)) return { kind: "missing" };
  const src = fs.readFileSync(pageFile, "utf8");
  if (/ClientRedirect/.test(src)) return { kind: "redirect", to: src.match(/to="([^"]+)"/)?.[1] ?? "?" };
  return { kind: "page" };
}

test("PREMISE: the corpus really does carry routed chunks", () => {
  assert.ok(routed.length >= 15, `expected a routed corpus, got ${routed.length} of ${HELP_CHUNKS.length}`);
});

test("every help route resolves to a real page — never a redirect stub, never a missing route", () => {
  const bad = [];
  for (const c of routed) {
    const r = resolveRoute(c.route);
    if (r.kind === "page") continue;
    bad.push(`${c.id} → ${c.route} (${r.kind}${r.to ? ` → ${r.to}` : ""})`);
  }
  assert.deepEqual(bad, [], `Ask would send a reader somewhere that is not a page:\n  ${bad.join("\n  ")}`);
});

test("POSITIVE + NEGATIVE CONTROL: the resolver can tell the three cases apart", () => {
  /* Without this the sweep above passes for a resolver that calls everything a page. */
  assert.equal(resolveRoute("/parlay-lab/").kind, "redirect", "a known retired alias must read as a redirect");
  assert.equal(resolveRoute("/definitely-not-a-route/").kind, "missing");
  assert.equal(resolveRoute("/live/").kind, "page", "a real page must read as a page");
});

test("the model-status claims match the NFL board's actual family states", () => {
  /* Read the repository, not a memory of it. */
  const dir = path.join(APP, "public", "data", "nfl", "player-board");
  const file = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort().pop();
  assert.ok(file, "there must be a committed NFL player board, or this test proves nothing");
  const families = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).families ?? {};
  const published = Object.entries(families).filter(([, v]) => v.state === "PUBLISHED").map(([k]) => k);
  assert.ok(published.length > 0, "positive control: the board must really carry PUBLISHED families");

  const text = HELP_CHUNKS.filter((c) => ["model-status", "sports-coverage"].includes(c.id)).map((c) => c.text).join(" ");
  assert.doesNotMatch(
    text, /NFL and EPL (publish experimental|forecasts are experimental)/,
    `the corpus calls NFL wholly experimental while ${published.length} of its families are PUBLISHED (${published.join(", ")})`,
  );
  /* And it must keep the distinction the old copy collapsed, because "published" and "usable as a parlay
     leg" being the same thing is precisely the wrong inference for a reader to draw. */
  assert.match(text, /MLB only/, "the corpus must still say the signature products draw their legs from MLB only");
});
