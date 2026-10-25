/**
 * Horizontally scrolling tables must be reachable by keyboard (axe `scrollable-region-focusable`, WCAG 2.1.1), and links
 * inside a sentence must not rely on colour alone (axe `link-in-text-block`, WCAG 1.4.1).
 *
 * Audit 2026-10-25 (axe-core 4.10.2 injected into the live site, read-only, 14 routes at 390px): 14 scroll regions on
 * /nba, the NBA simulation, the NFL game page, /bank-builder, /moonshot, /results and /methodology had no focusable
 * content, and 8 in-text links were colour-only. After the fix, a local render of /, /today, /nba, /nfl, /build,
 * /bank-builder, /moonshot, /results and /methodology reports 0 violations.
 * Run: npx tsx --test src/lib/a11y-scroll-regions.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
/* Each opening tag of a scroll wrapper must carry role="region", a name, and tabIndex={0} — the convention the NFL
   tables (nfl-all-players-table, nfl-postgame-box-score) already used. */
const tagsOf = (src, re) => [...src.matchAll(re)].map((m) => src.slice(src.lastIndexOf("<", m.index), src.indexOf(">", m.index) + 1));

test("every NBA hub / Theater scroll wrapper is a named, focusable region", () => {
  for (const f of ["src/components/simulation-theater/nba/possession/possession-parts.tsx", "src/components/nba/experimental-lane.tsx", "src/components/nba/official-predictions.tsx"]) {
    const tags = tagsOf(read(f), /className="nb[px]-scroll"/g);
    assert.ok(tags.length > 0, `${f}: no wrapper found (the test would be vacuous)`);
    for (const t of tags) assert.match(t, /role="region" aria-label=\{?[^ ]+.*tabIndex=\{0\}/s, `${f}: ${t.slice(0, 90)}`);
  }
});

test("the results, products, methodology and NFL game scroll wrappers are named, focusable regions", () => {
  for (const [f, re, n] of [
    ["src/components/results/results-explorer.tsx", /style=\{\{ overflowX: "auto" \}\}/g, 4],
    ["src/components/results/model-suggestions-record.tsx", /className="overflow-x-auto"/g, 1],
    ["src/components/results/risk-ladder-stream.tsx", /className="overflow-x-auto"/g, 1],
    ["src/components/products/lifecycle-record.tsx", /className="overflow-x-auto"/g, 1],
    ["src/app/nfl/game/[eventId]/page.tsx", /style=\{\{ overflowX: "auto", marginTop: 12 \}\}/g, 2],
  ]) {
    const tags = tagsOf(read(f), re);
    assert.equal(tags.length, n, `${f}: expected ${n} wrappers`);
    for (const t of tags) assert.match(t, /role="region"[\s\S]*aria-label=[\s\S]*tabIndex=\{0\}/, `${f}: ${t.slice(0, 90)}`);
  }
});

test("in-sentence links flagged by the audit are underlined, not colour-only", () => {
  for (const [f, text] of [
    ["src/components/products/level-a-suggestions.tsx", "How suggestions are chosen →"],
    ["src/components/products/level-a-suggestions.tsx", "These suggestions as data"],
    ["src/components/parlays/empty-tier-context.tsx", "Every settled card (Historical Results) →"],
    ["src/app/nfl/page.tsx", ">methodology</Link>"],
    ["src/app/nfl/page.tsx", ">all sports coverage</Link>"],
  ]) {
    const src = read(f), at = src.indexOf(text);
    assert.ok(at > 0, `${f}: ${text}`);
    assert.match(src.slice(src.lastIndexOf("<", at), at), /textDecoration: "underline"/, `${f}: ${text}`);
  }
});

/* Only a FINAL game renders the postgame box score, so a scan of upcoming games never saw this link. Found 2026-10-26
   by axe on the built export (/nfl/game/401873011/): "the NFL week report" at 1.42:1 against the note text. */
test("the postgame box-score note's link is underlined", () => {
  assert.match(read("src/components/game/nfl-postgame-box-score.tsx"), /\.pg-note a\{[^}]*text-decoration:underline/);
});
