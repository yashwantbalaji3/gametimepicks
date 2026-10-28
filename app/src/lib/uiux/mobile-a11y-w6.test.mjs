/**
 * W6 · MOBILE AND ACCESSIBILITY (overnight 2026-10-28) — source and render guards for the shared fixes.
 *
 * Measured on Production the same night (390/430/768/1440): /models and /saved had no gutter (text from x=232 to
 * x=1440 at 1440, from x=0 at 768); every phone route had tap targets under 44px and text under 12px; wide tables
 * clipped their last columns with no sign that more existed; the homepage lanes stacked up to four 8.5px uppercase
 * chips. Each test below pins one of those fixes in the SHARED component, so a page never has to re-solve it.
 *
 * Run: npx tsx --test src/lib/uiux/mobile-a11y-w6.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const CSS = read("src/app/globals.css");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** The files this workstream owns as shared UI: every component in components/ui and the homepage/hub lanes. */
const SHARED = [
  ...fs.readdirSync(path.join(APP, "src/components/ui")).filter((f) => f.endsWith(".tsx")).map((f) => `src/components/ui/${f}`),
  ...fs.readdirSync(path.join(APP, "src/components/command-center")).filter((f) => f.endsWith(".tsx")).map((f) => `src/components/command-center/${f}`),
  "src/components/saved/saved-list.tsx",
  "src/components/saved/save-forecast-button.tsx",
  "src/app/models/page.tsx",
  "src/app/saved/page.tsx",
];

/** Every opening JSX tag of `name` in `src`, read to its closing `>` (braces and `=>` inside attributes are skipped). */
export function openingTags(src, name) {
  const out = [];
  const re = new RegExp(`<${name}[\\s>]`, "g");
  let m;
  while ((m = re.exec(src))) {
    let depth = 0, i = m.index + 1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && src[i - 1] !== "=") break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

/* ── 1. /models and /saved: the page gutter ───────────────────────────────────────────────────────────────────── */

test("/models and /saved carry the shared page gutters (16px phone, 32px from sm) like /results", () => {
  for (const rel of ["src/app/models/page.tsx", "src/app/saved/page.tsx"]) {
    const shell = read(rel).match(/<div className="(vault-page-shell[^"]*)"/);
    assert.ok(shell, `${rel}: the page shell`);
    const cls = shell[1].split(/\s+/);
    for (const c of ["px-4", "sm:px-8", "py-6", "sm:py-10", "overflow-x-hidden"]) assert.ok(cls.includes(c), `${rel}: shell lacks ${c} — text runs to the rail and the viewport edge (audit 10-28: x=232→1440)`);
  }
  // the grid columns on /models can shrink: a long evidence line wraps inside its column instead of pushing it off-screen
  const panel = read("src/components/command-center/model-status-panel.tsx");
  assert.equal((panel.match(/className="scroll-mt-24 min-w-0 /g) ?? []).length, 2, "both panel shapes are min-w-0 grid items");
});

/* ── 2. Tap targets ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** A control is a 44px target when it carries one of these; the CSS behind each is asserted below. */
const TARGET = /minHeight: (44|48)\b|gtp-hit-44|gtp-hit-area|min-h-\[44px\]|nbx-lane-row/;
/** Controls that are 44px+ by their own shape, with the reason. Nothing else may be added without one. */
const TARGET_EXEMPT = new Map([
  ["src/components/ui/sport-card.tsx", "the whole sport tile is the link (≈130px tall)"],
  ["src/components/saved/save-forecast-button.tsx", "`const minHeight = 44` spread through its shared style (pinned by mobile-home.test)"],
]);

/** A link inside running text (no class, colour only) — WCAG 2.5.8 exempts it; a 44px inline box would break the line. */
const PROSE_LINK = /^<(Link|a) href=("[^"]*"|\{[^}]*\}) style=\{\{ color: "[^"]+" \}\}>$/;

test("every link, button and field in the shared components is a 44px touch target", () => {
  const misses = [];
  for (const rel of SHARED) {
    if (TARGET_EXEMPT.has(rel)) continue;
    const src = stripComments(read(rel));
    for (const tag of ["button", "Link", "a", "input", "select", "textarea"]) {
      for (const t of openingTags(src, tag)) if (!TARGET.test(t) && !PROSE_LINK.test(t.replace(/\s+/g, " "))) misses.push(`${rel}: ${t.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }
  assert.deepEqual(misses, [], `under 44px on a phone — grow the hit area (gtp-hit-area / an inner pill), not the look:\n${misses.join("\n")}`);
});

test("the target utilities exist: gtp-hit-44 grows the box, gtp-hit-area grows only the hit area, summaries are 44px", () => {
  assert.match(CSS, /\.gtp-hit-44 \{[^}]*min-height: 44px;[^}]*min-width: 44px;/);
  assert.match(CSS, /\.gtp-hit-area \{ position: relative; \}/);
  assert.match(CSS, /\.gtp-hit-area::after \{[^}]*position: absolute;[^}]*width: max\(100%, 44px\); height: max\(100%, 44px\);/);
  assert.match(CSS, /main summary \{ min-height: 44px;/, "every disclosure in the page body (Explain, What does this mean?) is 44px");
  assert.match(CSS, /\.nbx-lane-row \{[^}]*min-height: 44px;/);
  // research tables on touch screens: a cell's single link takes the whole cell (bounded, so rows never overlap)
  assert.match(CSS, /@media \(pointer: coarse\) \{\s*td:has\(> a\.ent-link:only-of-type\), td:has\(> a\.prv-glink\) \{ position: relative; \}\s*td > a\.ent-link:only-of-type::after, td > a\.prv-glink::after \{ content: ""; position: absolute; inset: 0; \}/);
});

/* ── 3. Text under 12px ─────────────────────────────────────────────────────────────────────────────────────────── */

/** Decorative glyphs only (aria-hidden carets) may sit under 12px. */
const DECORATIVE = [/aria-hidden[^\n]*fontSize: \d/, /display: "inline-block", fontSize: 8 \}/];

test("no information-carrying text under 12px in the shared components, /models or /saved", () => {
  const small = [];
  for (const rel of SHARED) {
    const lines = stripComments(read(rel)).split("\n");
    lines.forEach((l, i) => {
      const hits = [...l.matchAll(/fontSize: (\d+(?:\.\d+)?)\b|text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1] ?? m[2])).filter((n) => n < 12);
      if (hits.length && !DECORATIVE.some((d) => d.test(l))) small.push(`${rel}:${i + 1} ${l.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(small, [], `text under 12px on a phone:\n${small.join("\n")}`);
});

/* ── 4. Calm status chips on the homepage/hub lanes ─────────────────────────────────────────────────────────────── */

const { BUSIEST_LANES } = await import("./busiest-state.test.mjs");
const { PUBLIC_STATE_LABEL } = await import("../command-center/contract.ts");
const CC = await import("../../components/command-center/command-center.tsx");
const CommandCenter = CC.default?.default ?? CC.default;
const esc = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("a lane prints ONE calm chip (its state); the model statuses are one plain line; the featured card keeps one chip", () => {
  const html = renderToStaticMarkup(React.createElement(CommandCenter, { lanes: BUSIEST_LANES, heading: "Simulation Hub", subtitle: "4 sports" }));
  assert.match(html, /<h2 [^>]*>Simulation Hub<\/h2>/, "the heading text is untouched");
  const lanes = html.split('data-sport="').slice(1);
  assert.equal(lanes.length, BUSIEST_LANES.length);
  lanes.forEach((laneHtml, i) => {
    const lane = BUSIEST_LANES[i];
    const card = laneHtml.indexOf('<article class="gtp-pcard');
    const outside = card >= 0 ? laneHtml.slice(0, card) : laneHtml;
    const inside = card >= 0 ? laneHtml.slice(card) : "";
    assert.equal((outside.match(/class="gtp-calm-chip"/g) ?? []).length, 1, `${lane.sport}: one chip for the lane — its state`);
    assert.match(outside, new RegExp(`data-lane-state="${lane.state}">${lane.stateLabel}<`), `${lane.sport}: the state label is unchanged`);
    if (card >= 0) assert.equal((inside.match(/class="gtp-status-chip gtp-calm-chip"/g) ?? []).length, 1, `${lane.sport}: the featured card keeps exactly one status chip`);
    // every model status is still said, in its public label, with its evidence on hover
    for (const s of lane.statuses) {
      const label = PUBLIC_STATE_LABEL[s.state];
      assert.ok(outside.toLowerCase().includes(label.toLowerCase()), `${lane.sport}: "${label}" (${s.family}) is still on the lane`);
      assert.ok(outside.includes(`title="${esc(`${s.headline}. ${s.detail}`)}"`), `${lane.sport}: ${s.family} keeps its evidence title`);
      assert.match(outside, new RegExp(`data-state="${s.state}"`), `${lane.sport}: ${s.family} keeps its state attribute`);
    }
    assert.doesNotMatch(laneHtml, /class="[^"]*\buppercase\b/, `${lane.sport}: no uppercase label left in the lane`);
    // a TeamMark monogram is a logo stand-in sized to its 18px box (the name is printed beside it), not text to read
    const readable = laneHtml.replace(/<span class="inline-flex items-center justify-center rounded-\[5px\] shrink-0 font-bold"[^>]*>[^<]*<\/span>/g, "");
    const tiny = [...readable.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n < 12);
    assert.deepEqual(tiny, [], `${lane.sport}: rendered text under 12px`);
  });
});

test("the calm chip: sentence case, 12px, muted text, the tone on a dot", () => {
  const rule = CSS.slice(CSS.indexOf(".gtp-calm-chip {"), CSS.indexOf("}", CSS.indexOf(".gtp-calm-chip {")));
  for (const d of ["font-size: 12px", "text-transform: none", "color: var(--vault-text-mute)"]) assert.ok(rule.includes(d), `.gtp-calm-chip: ${d}`);
  assert.match(CSS, /\.gtp-calm-chip::before \{[^}]*background: var\(--chip-tone, var\(--vault-text-faint\)\);/);
  for (const rel of ["src/components/command-center/model-status-chip.tsx", "src/components/ui/status-chip.tsx"]) {
    assert.match(read(rel), /className="[^"]*gtp-calm-chip[^"]*"/, `${rel} renders the calm chip`);
    assert.doesNotMatch(stripComments(read(rel)), /uppercase/, `${rel}: no uppercase status`);
  }
});

/* ── 5. Focus and wide tables ───────────────────────────────────────────────────────────────────────────────────── */

test("keyboard focus: the baseline ring covers links, buttons, fields AND native disclosures; the skip link targets <main>", () => {
  assert.match(CSS, /button:focus-visible,\s*a:focus-visible,\s*select:focus-visible,\s*input:focus-visible,\s*\[role="button"\]:focus-visible,\s*\[tabindex\]:focus-visible \{[^}]*box-shadow: var\(--vault-focus-ring\);/);
  assert.match(CSS, /summary:focus-visible,\s*textarea:focus-visible \{ outline: none; box-shadow: var\(--vault-focus-ring\);/);
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<a href="#main-content" className="gtp-skip-link">/);
  assert.match(layout, /<main id="main-content" tabIndex=\{-1\}/);
  // no shared component switches the ring off
  for (const rel of SHARED) assert.doesNotMatch(read(rel), /outline: ?"?none|focus:outline-none/, `${rel} removes the focus outline`);
});

const { scrollEdge } = await import("../../components/a11y/scroll-edge.ts");

test("scrollEdge: which side of a wide table still hides columns", () => {
  assert.equal(scrollEdge(0, 390, 390), null, "fits: nothing marked");
  assert.equal(scrollEdge(0, 391, 390), null, "a 1px sub-pixel overflow is not a scroller");
  assert.equal(scrollEdge(0, 800, 390), "start");
  assert.equal(scrollEdge(200, 800, 390), "middle");
  assert.equal(scrollEdge(410, 800, 390), "end");
  assert.equal(scrollEdge(409.4, 800, 390), "end", "sub-pixel short of the end is the end");
  assert.equal(scrollEdge(-200, 800, 390), "middle", "RTL reports a negative scrollLeft");
});

test("the table-scroll affordance is wired: every table scroller is tracked, faded on the hidden side, hinted on phones", () => {
  const a11y = read("src/components/a11y/scroll-region-a11y.tsx");
  assert.match(a11y, /import \{ scrollEdge \} from "\.\/scroll-edge";/);
  assert.match(a11y, /trackTableScroll\(el, scrolls\);/, "every sideways scroller in <main> passes through the tracker");
  assert.match(a11y, /if \(!el\.querySelector\("table"\)\) return;/, "only boxes holding a table are marked");
  assert.match(a11y, /addEventListener\("scroll", \(\) => syncEdge\(el\), \{ passive: true \}\)/);
  assert.match(read("src/app/layout.tsx"), /<ScrollRegionA11y \/>/, "mounted once for every route");
  for (const edge of ["start", "middle", "end"]) assert.match(CSS, new RegExp(`\\[data-x-scroll="${edge}"\\] \\{ -webkit-mask-image: linear-gradient\\(to right,[^}]*mask-image: linear-gradient\\(to right,`), `${edge}: the hidden side fades`);
  assert.match(CSS, /\[data-x-scroll\]:focus-visible \{ -webkit-mask-image: none; mask-image: none; \}/, "the focus ring is never masked");
  assert.match(CSS, /@media \(max-width: 767px\) \{\s*\[data-x-scroll\]\[data-x-hint\]::after \{ content: "Swipe sideways for more columns →";[^}]*visibility: hidden; \}\s*\[data-x-scroll="start"\]\[data-x-hint\]::after \{ visibility: visible; \}/);
});
