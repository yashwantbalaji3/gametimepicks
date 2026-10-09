/**
 * UX-001 phase 2 (2026-10-09) · THE ROUTE TABLE DESCRIBES THE PAGES AS THEY ARE.
 *
 * P240 found rows drifted from their pages because the guards checked redirect TARGETS exist, never that a
 * redirect-classified page redirects THERE. It happened again: /nba (a real hub since Session 6) was still a "redirect",
 * so sitemap.xml omitted it; /nhl, /ipl and /trends named targets their pages do not send readers to. And Ligue 1, a
 * family route, was in every menu and not in the sitemap.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ROUTE_TABLE } from "./route-inventory.mjs";
import { COMPETITIONS } from "../sports/catalog.ts";

const APP = path.join(process.cwd(), "src/app");
const norm = (h) => (h.replace(/[#?].*$/, "").replace(/\/$/, "") || "/");

test("🔴 a redirect row names the target its page actually sends readers to; a page without ClientRedirect is not a redirect", () => {
  const drift = [];
  for (const [route, row] of Object.entries(ROUTE_TABLE)) {
    const file = path.join(APP, route === "/" ? "" : route.slice(1), "page.tsx");
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    const to = /<ClientRedirect[^>]*\bto="([^"]+)"/.exec(src)?.[1] ?? null;
    // A family's target is computed per page (to={`/nfl/game/${id}/`}); it must still redirect.
    const computed = /<ClientRedirect[^>]*\bto=\{/.test(src);
    if (row.classification === "redirect" && !to && !computed) drift.push(`${route}: classified redirect, page renders no ClientRedirect`);
    if (row.classification === "redirect" && to && norm(to) !== norm(row.redirectTo ?? "")) drift.push(`${route}: table says ${row.redirectTo}, page redirects to ${to}`);
    if (row.classification !== "redirect" && (to || computed)) drift.push(`${route}: page redirects to ${to} but is classified ${row.classification}`);
  }
  assert.deepEqual(drift, [], drift.join("\n"));
});

test("🔴 every sport hub in the catalog is a public, indexable destination the sitemap lists", () => {
  const sitemap = fs.readFileSync(path.join(APP, "sitemap.ts"), "utf8");
  assert.match(sitemap, /COMPETITIONS\.map\(/, "the sitemap adds catalog hubs a family route would otherwise hide");
  for (const c of COMPETITIONS) {
    const row = ROUTE_TABLE[c.href] ?? ROUTE_TABLE["/soccer/[league]"];
    assert.equal(row?.classification, "public", `${c.href} is public in the route table`);
  }
  const built = path.join(process.cwd(), "out/sitemap.xml");
  if (fs.existsSync(built)) {
    const xml = fs.readFileSync(built, "utf8");
    for (const c of COMPETITIONS) assert.ok(xml.includes(`${c.href}/</loc>`), `built sitemap lists ${c.href}/`);
  }
});
