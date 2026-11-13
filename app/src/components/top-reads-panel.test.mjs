/**
 * The grouped "Top 10 by sport" panel shows each sport's top three and opens the rest in place (UX 2026-11-13).
 * Every ranked row stays in the document (no row is dropped, no ranking is changed); one chosen sport shows in full.
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: TopReadsPanel } = await import("./top-reads-panel.tsx");

const read = (sport, n, timeframe = "upcoming") => ({ sport, sportLabel: sport.toUpperCase(), market: "Game winner", subject: `${sport}-team-${n}`, title: `${sport} read ${n}`, detail: "d", probability: 0.9 - n / 100, timeframe, href: `/${sport}/g${n}` });
const set = { provenance: [], excluded: [] };
const reads = [...Array.from({ length: 10 }, (_, i) => read("nfl", i + 1)), ...Array.from({ length: 2 }, (_, i) => read("ufc", i + 1))];
const render = (props) => renderToStaticMarkup(React.createElement(TopReadsPanel, { set, reads, eyebrow: "e", title: "Top 10 by sport", groupBySport: true, ...props }));

test("each sport shows three rows, the rest are inside a details element, and no row is lost", () => {
  const html = render({});
  assert.equal((html.match(/href="\/nfl\/g\d+\/?"/g) ?? []).length, 10, "all ten NFL rows are in the document");
  const [before, inside] = [html.split("<details")[0], html.split("<details")[1].split("</details>")[0]];
  assert.equal((before.match(/href="\/nfl\//g) ?? []).length, 3);
  assert.equal((inside.match(/href="\/nfl\//g) ?? []).length, 7);
  assert.match(html, /Show NFL ranks 4–10/);
  assert.equal((html.match(/<details/g) ?? []).length, 1, "a sport with three or fewer rows has nothing to open");
  assert.ok(html.indexOf("/nfl/g1") < html.indexOf("/nfl/g2") && html.indexOf("/nfl/g3") < html.indexOf("/nfl/g4"), "ranking order unchanged");
});

test("one chosen sport is shown in full", () => {
  assert.doesNotMatch(render({ groupPreview: Number.POSITIVE_INFINITY }), /<details/);
});

test("the panel never claims the DAY has no games; it speaks only for its own rows", () => {
  const html = render({});
  assert.doesNotMatch(html, /Nothing plays today/);
  assert.match(html, /None of these is for today/);
  assert.doesNotMatch(render({ reads: [read("nfl", 1, "today")] }), /None of these is for today/);
});
