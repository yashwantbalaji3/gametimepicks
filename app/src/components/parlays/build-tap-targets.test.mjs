/**
 * /build/ tap targets (release owner 2026-10-24): at 320px the settled-history list had 8 block links 19px tall —
 * the four "last published card" links and the four "Other lanes" links. Each is now a 44px inline-flex target with
 * the same text. Run: npx tsx --test src/components/parlays/build-tap-targets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: EmptyTierContext } = await import("./empty-tier-context.tsx");
const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
const minHeightOf = (styleAttr) => Number(/min-height:\s*(\d+)px/.exec(styleAttr ?? "")?.[1] ?? 0);

test("the last-published-card links are 44px targets (FIXTURE cards), text unchanged", () => {
  const lastCards = ["low", "medium", "high", "longshot"].map((tier, i) => ({ tier, tierLabel: tier, last: { date: `2026-09-2${i}`, legs: i + 2, combinedAmerican: 100 + i, result: "loss" } }));
  const html = renderToStaticMarkup(React.createElement(EmptyTierContext, { emptyTiers: ["low", "medium", "high", "longshot"], lastCards, lanes: [] }));
  const links = [...html.matchAll(/<a [^>]*href="[^"]*results[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => /legs/.test(m[1]));
  assert.ok(links.length >= 1, "the fixture renders last-card links");
  for (const m of links) {
    assert.match(m[0], /class="[^"]*inline-flex[^"]*items-center/);
    assert.ok(minHeightOf(/style="([^"]*)"/.exec(m[0])?.[1]) >= 44, m[1]);
    assert.match(m[1], /\d+ legs/);
  }
});

test("the four 'Other lanes' links on /build are 44px targets with the same text", () => {
  const s = read("src/app/build/page.tsx");
  const section = s.slice(s.indexOf('aria-label="Other suggested-card lanes and history"'), s.indexOf("</section>", s.indexOf('aria-label="Other suggested-card lanes and history"')));
  const links = [...section.matchAll(/<Link [^>]*>([^<]+)<\/Link>/g)];
  assert.deepEqual(links.map((m) => m[1]), ["Premier League cards", "UFC cards", "NFL cards", "Every settled card (history)"]);
  for (const m of links) {
    assert.match(m[0], /className="inline-flex items-center"/, m[1]);
    assert.ok(Number(/minHeight: (\d+)/.exec(m[0])?.[1] ?? 0) >= 44, m[1]);
  }
});
