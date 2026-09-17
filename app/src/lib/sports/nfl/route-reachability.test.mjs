/**
 * NO ORPHAN ROUTE — Program 234 · Release I.
 *
 * Run: npx tsx --test src/lib/sports/nfl/route-reachability.test.mjs   (needs a built export)
 *
 * `/nfl/game/[eventId]` was statically generated for every published forecast and NOTHING in the
 * export linked to it. It existed, it rendered, it was correct, and the only way to reach it was to
 * type the URL. Program 178 recorded the same shape for the Simulate lobby — "discovery was the
 * defect; the artifacts were real" — and a route nobody can reach is not a delivered feature.
 *
 * This scans the BUILT EXPORT rather than the source, because what matters is whether the HTML a
 * visitor receives contains the link. A component that renders one behind a condition nothing
 * satisfies would pass a source check and fail a reader.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildPrefixLinkIndex } from "../../ci/export-link-index.mjs";

const APP = process.cwd();
const OUT = path.join(APP, "out");

/** Every generated per-game route, from the export's own directory listing. */
function generatedGameRoutes() {
  const dir = path.join(OUT, "nfl", "game");
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch { return []; }
}

/**
 * Every page in the export that links to this route, excluding the route's own page. Backed by ONE shared read of
 * the export (lib/ci/export-link-index.mjs) instead of a full walk per route — same pages, same substring and
 * self-exclusion semantics (v1.4.1: this guard alone re-read the whole export once per route).
 */
let linkIndex = null;
function linkedFrom(route) {
  linkIndex ??= buildPrefixLinkIndex(OUT, "/nfl/game/", Math.max(64, ...generatedGameRoutes().map((r) => r.length)));
  return linkIndex(route, path.join("nfl", "game", route));
}

test("EVERY GENERATED NFL GAME ROUTE IS LINKED FROM SOMEWHERE", () => {
  if (!fs.existsSync(OUT)) return; // no build present
  const routes = generatedGameRoutes();
  if (!routes.length) return;      // no forecasts published; nothing to reach
  for (const r of routes) {
    const from = linkedFrom(r);
    assert.ok(
      from.length > 0,
      `/nfl/game/${r}/ is generated and nothing in the export links to it — it is reachable only by typing the URL`,
    );
  }
});

test("the hub itself carries the link, and says which games have been played", () => {
  const hub = path.join(OUT, "nfl", "index.html");
  if (!fs.existsSync(hub)) return;
  const html = fs.readFileSync(hub, "utf8");
  const routes = generatedGameRoutes();
  if (!routes.length) return;
  assert.match(html, /\/nfl\/game\//, "the NFL hub must offer its own game reports");
  /* A settled preseason report must be offered as what it is, never as a current read. */
  if (/played · frozen forecast|played &middot; frozen forecast|played/i.test(html)) {
    assert.doesNotMatch(
      html.slice(html.indexOf("Every forecast we published")),
      /\bupcoming\b[^<]{0,40}\bplayed\b/i,
      "a game cannot be labelled both upcoming and played",
    );
  }
});
