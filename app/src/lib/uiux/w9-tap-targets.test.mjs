/**
 * W9 · tap targets and small text handed over from the 10-28 rendered audit (metrics.json, 390px), plus the Research Lab
 * date inputs (row 71). Each control below was measured under 44px (or the text at 10px); each guard reads the control's
 * own markup or rule, so a regression on that control fails here.
 *
 * Run: cd app && npx tsx --test src/lib/uiux/w9-tap-targets.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("site-wide disclaimer: 12px, the full sentence kept", () => {
  const b = src("src/components/disclaimer-banner.tsx");
  assert.match(b, /gap-y-0\.5 text-\[12px\] tracking/, "the strip's text is 12px (was 10px on every phone route)");
  assert.doesNotMatch(b, /text-\[10px\]/);
  assert.match(b, /Educational analytics/);
  assert.match(b, /Not betting advice · research use only\./, "KEEP: the compliance sentence, in full");
  assert.doesNotMatch(b, /className="[^"]*\btruncate\b/, "never clipped");
});

test("top-bar Search trigger is a 44px target (W3), and footer links get a 44px width on touch", () => {
  assert.match(src("src/components/search/site-search.tsx"), /className="gtp-site-search-trigger[^"]*"\s*style=\{\{[\s\S]{0,400}?minHeight: 44/);
  assert.match(src("src/app/globals.css"), /@media \(pointer: coarse\) \{[\s\S]{0,200}?a\.ft-link \{ min-height: 44px; min-width: 44px;/);
});

test("+ Slip on /mlb grows its hit area, not its box", () => {
  assert.match(src("src/components/slip/add-to-slip.tsx"), /className="gtp-slip-btn gtp-hit-area /);
});

test("/results/nfl 'Every graded row' and each week's summary are 44px", () => {
  const d = src("src/components/results/nfl-family-drilldown.tsx");
  assert.equal((d.match(/<summary[^>]*minHeight: 44/g) ?? []).length, 2);
  assert.doesNotMatch(d, /minHeight: 32/);
});

test("/today sort buttons and /simulate filters reach 44px", () => {
  assert.match(src("src/components/games-experience-table.tsx"), /className="gt-sort gtp-hit-area"/);
  const ds = src("src/components/nav/date-sport-controls.tsx");
  assert.match(ds, /const PILL: React\.CSSProperties = \{\s*minHeight: 44,/);
  assert.doesNotMatch(ds, /minHeight: 40/);
  const ex = src("src/components/games/explorer-controls.tsx");
  assert.match(ex, /className="gtp-hit-area font-mono uppercase/);
  /* grown hit areas must not overlap when the chip rows wrap: the vertical gap is at least the growth (2 × 6px) */
  assert.equal((ex.match(/gap-x-1\.5 gap-y-3 flex-wrap" role="group"/g) ?? []).length, 2);
});

test("/matchups 'Game →' is a 44px target (like the team page's)", () => {
  assert.match(src("src/app/matchups/[sport]/[gameId]/page.tsx"), />Game →<\/Link>/);
  assert.match(src("src/app/matchups/[sport]/[gameId]/page.tsx"), /minHeight: 44, display: "inline-flex", alignItems: "center" \}\}>Game →/);
});

test("Research Lab date inputs carry an accessible name containing the visible label", () => {
  const lab = src("src/components/lab/research-lab-app.tsx");
  assert.match(lab, /<Field id="lab-from" label="From">\s*<input id="lab-from" type="date" aria-label="From date"/);
  assert.match(lab, /<Field id="lab-to" label="To">\s*<input id="lab-to" type="date" aria-label="To date"/);
});
