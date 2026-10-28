/**
 * W9 · audit rows 27, 28, 33 (2026-10-28):
 *   27 · /bucket-blitz and /goal-rush are in-development placeholders served index,follow → noindex, never in the sitemap.
 *   28 · /bucket-blitz said "the two that publish today did" while six sports publish → the count comes from the registry.
 *   33 · /ask listed Official Forecasts "for MLB, NFL, Premier League" (Ask's own read access) and nothing else → the
 *        sports Ask does not read are named from the same registry. Ask's tools are unchanged.
 *
 * Run: cd app && npx tsx --test src/lib/uiux/registry-derived-copy-w9.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { PUBLIC_SPORTS, publishesOfficialForecast, officialForecastSportLabels, listInWords } = await import("../public-registry.ts");
const { ROUTE_TABLE } = await import("../audits/route-inventory.mjs");

const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
const render = async (rel) => text(renderToStaticMarkup(React.createElement((await import(rel)).default)));

test("the publishing sports are read from the families (NBA, Ligue 1 and UFC among them)", () => {
  const labels = officialForecastSportLabels();
  assert.deepEqual(labels, PUBLIC_SPORTS.filter((s) => publishesOfficialForecast(s.key)).map((s) => s.label));
  for (const l of ["MLB", "NFL", "NBA", "Premier League", "Ligue 1", "UFC"]) assert.ok(labels.includes(l), l);
  assert.equal(listInWords(["A", "B", "C"]), "A, B and C");
});

test("🔴 /bucket-blitz states the registry's count, never 'the two that publish today'", async () => {
  const t = await render("../../app/bucket-blitz/page.tsx");
  const labels = officialForecastSportLabels();
  assert.ok(t.includes(`${labels.length} sports publish Official Forecasts today (${listInWords(labels)})`), "derived count and list");
  assert.doesNotMatch(t, /the two that publish/);
});

test("🔴 /ask names the sports whose Official Forecasts it cannot read, beside the ones it can", async () => {
  const t = await render("../../app/ask/page.tsx");
  const askable = PUBLIC_SPORTS.filter((s) => s.assistant.forecasts).map((s) => s.label);
  const notRead = officialForecastSportLabels().filter((l) => !askable.includes(l));
  assert.ok(notRead.length > 0, "precondition: some publishing sport is outside Ask's read access");
  assert.ok(t.includes(`Official Forecasts for ${listInWords(askable)}, with each one`), "Ask's own access, unchanged");
  assert.ok(t.includes(`${listInWords(notRead)} also publish Official Forecasts; Ask cannot read those yet`), "the rest, named");
});

test("🔴 the two placeholders are noindex and never sitemapped; their URLs stay", async () => {
  for (const [route, rel] of [["/bucket-blitz", "../../app/bucket-blitz/page.tsx"], ["/goal-rush", "../../app/goal-rush/page.tsx"]]) {
    const mod = await import(rel);
    assert.equal(mod.metadata.robots?.index, false, `${route}: noindex`);
    assert.equal(mod.metadata.robots?.follow, true, `${route}: links still followed`);
    assert.equal(ROUTE_TABLE[route].indexable, false, `${route}: the inventory says so`);
    assert.equal(typeof mod.default, "function", `${route}: the page itself is kept`);
  }
  const { default: sitemap } = await import("../../app/sitemap.ts");
  const urls = sitemap().map((e) => e.url);
  assert.ok(urls.length > 20, "precondition: the sitemap built");
  assert.ok(!urls.some((u) => /\/(bucket-blitz|goal-rush)\/$/.test(u)), "neither placeholder is listed");
});
