/**
 * INSTRUMENTATION AUDIT. The wiring inventory in `docs/ADOPTION_DASHBOARD_CONTRACT.md` §6 is a claim about
 * runtime behaviour, and a claim in a doc rots. These guards make it a checked one:
 *   • every contract event is accounted for in the inventory, exactly once;
 *   • nothing marked WIRED lacks a real call site (over-claiming fails; under-claiming is allowed, because a
 *     concurrently-shipped control may be wired before the table is updated);
 *   • every route the page-view mapper instruments actually exists;
 *   • /ops stays internal, and the adoption panel renders aggregates — never a raw payload.
 *
 * Run: cd app && npx tsx --test src/lib/analytics/instrumentation-audit.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EVENT_TYPES } from "./event-contract.ts";
import { funnelEventsForPath, homeCtaClickEvent, marketDisagreementOpenedEvent, sourceVisitEvent, todaySlateClickedFromResultsEvent } from "./page-events.ts";

const app = process.cwd();
const repo = path.dirname(app);
const read = (p) => fs.readFileSync(p, "utf8");

const DAY = "2026-07-29";
/** Routes the page-view mapper instruments. The dynamic game report is the only pattern without a literal dir. */
const INSTRUMENTED_ROUTES = ["/", "/today", "/mlb", "/results", "/results/mlb", "/markets", "/methodology", "/system-status", "/learn", "/market-guide", "/responsible-use"];
const DYNAMIC_REPORT_ROUTE = "/games/mlb/kc-vs-det-2026-07-24";

/** Builders whose NAME at a call site is the evidence of wiring (the event string never appears there). */
const BUILDER_EVENT = {
  sourceVisitEvent: sourceVisitEvent("x", DAY).event,
  marketDisagreementOpenedEvent: marketDisagreementOpenedEvent(DAY).event,
  homeCtaClickEvent: homeCtaClickEvent(DAY, "primary", "/simulate").event,
  todaySlateClickedFromResultsEvent: todaySlateClickedFromResultsEvent(DAY).event,
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

/** Every app source EXCEPT the analytics library itself — defining an event there is not a call site. */
const callSiteSource = [...walk(path.join(app, "src/app")), ...walk(path.join(app, "src/components"))]
  .filter((p) => !p.includes(path.join("src", "lib", "analytics")))
  .map(read)
  .join("\n");

const pageViewEvents = new Set([
  sourceVisitEvent("direct", DAY).event,
  ...[...INSTRUMENTED_ROUTES, DYNAMIC_REPORT_ROUTE].flatMap((r) => funnelEventsForPath(r, { dayBucket: DAY }).map((e) => e.event)),
]);

function hasCallSite(event) {
  if (pageViewEvents.has(event)) return true;
  if (new RegExp(`["'\`]${event}["'\`]`).test(callSiteSource)) return true;
  return Object.entries(BUILDER_EVENT).some(([builder, ev]) => ev === event && callSiteSource.includes(`${builder}(`));
}

/* ---------------- the inventory ---------------- */

const contract = read(path.join(repo, "docs/ADOPTION_DASHBOARD_CONTRACT.md"));
const inventory = [...contract.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*(WIRED|SCHEMA-ONLY)\s*\|/gm)].map((m) => [m[1], m[2]]);

test("the inventory accounts for every contract event exactly once, and invents none", () => {
  const listed = inventory.map(([e]) => e);
  assert.deepEqual([...listed].sort(), [...EVENT_TYPES].sort(), "inventory and EVENT_TYPES must be the same set");
  assert.equal(new Set(listed).size, listed.length, "no event is listed twice");
});

test("nothing marked WIRED lacks a real call site (the doc may under-claim, never over-claim)", () => {
  const overclaimed = inventory.filter(([e, status]) => status === "WIRED" && !hasCallSite(e)).map(([e]) => e);
  assert.deepEqual(overclaimed, [], "each WIRED event is produced by the page-view mapper or named at a call site");
});

test("every SCHEMA-ONLY row states a reason — 'not wired' is never left unexplained", () => {
  const rows = [...contract.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*SCHEMA-ONLY\s*\|([^|]*)\|/gm)];
  assert.equal(rows.length, inventory.filter(([, s]) => s === "SCHEMA-ONLY").length);
  for (const [, event, reason] of rows) assert.ok(reason.trim().length > 30, `${event} needs a real reason, got: ${reason.trim()}`);
});

test("every route the page-view mapper instruments exists as a real page", () => {
  for (const route of INSTRUMENTED_ROUTES) {
    const dir = route === "/" ? "" : route.replace(/^\//, "");
    const candidate = path.join(app, "src/app", dir, "page.tsx");
    const dynamicParent = path.join(app, "src/app", dir.split("/")[0]);
    assert.ok(fs.existsSync(candidate) || fs.existsSync(dynamicParent), `${route} maps to an event but has no page`);
    assert.ok(funnelEventsForPath(route, { dayBucket: DAY }).length > 0, `${route} is listed as instrumented but emits nothing`);
  }
  assert.ok(fs.existsSync(path.join(app, "src/app/games/[sport]/[gameId]/page.tsx")), "the game report route backs game_report_open");
});

/* ---------------- /ops stays internal, and shows aggregates only ---------------- */

test("/ops is guarded in-app AND deleted from the public static export", () => {
  const prune = read(path.join(app, "scripts/prune-internal-routes.mjs"));
  const routes = /const INTERNAL_ROUTES = \[([^\]]+)\]/.exec(prune);
  assert.ok(routes, "prune script still declares INTERNAL_ROUTES");
  assert.match(routes[1], /"ops"/, "the export prune list must keep removing /ops");
  assert.match(read(path.join(app, "src/app/ops/page.tsx")), /guardInternalRoute\(\)/, "the route guard still runs");
});

test("the adoption panel renders aggregates — no raw payload can reach the DOM", () => {
  const panel = read(path.join(app, "src/app/ops/adoption-panel.tsx"));
  assert.ok(!/JSON\.stringify/.test(panel), "no payload serialisation in the panel");
  assert.ok(!/\.events\b/.test(panel), "the panel never touches the raw event array");
  assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon\(/.test(panel), "the dashboard never sends anything");
  assert.match(panel, /NOT_YET_MEASURED/, "the unmeasured token is rendered from the shared constant");

  const page = read(path.join(app, "src/app/ops/page.tsx"));
  assert.match(page, /<AdoptionPanel report=\{adoption\} \/>/, "the panel receives the aggregate report, not the capture");
  assert.ok(!/captured\.raw\}/.test(page), "the raw capture is never passed into the tree");
});
