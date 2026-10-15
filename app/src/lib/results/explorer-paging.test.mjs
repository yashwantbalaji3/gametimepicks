/**
 * GTP-21/32 (2026-10-15): every settled card and every graded pick behind a Results record is reachable on the
 * page — paged, never silently capped — and provenance (slip IDs, source files) stays available behind a
 * disclosure instead of being printed as reading matter. Rendering is verified in a browser; this pins the source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("the Results explorer pages its cards (step + show all), resets on a new selection, and states the count", () => {
  const s = read("src/components/results/results-explorer.tsx");
  assert.doesNotMatch(s, /\.slice\(0, 50\)/, "no hard 50-row cap");
  assert.doesNotMatch(s, /Narrow the range to see the rest/, "the only way to the rest is no longer 'narrow the range'");
  assert.match(s, /setCardLimit\(\(n\) => n \+ CARD_STEP\)/, "Show more");
  assert.match(s, /setCardLimit\(selectedCards\.length\)/, "Show all");
  assert.match(s, /useEffect\(\(\) => \{ setCardLimit\(CARD_STEP\); \}, \[recordType, sport, tier, from, to\]\)/, "resets with the selection");
  assert.match(s, /role="status" aria-live="polite"[\s\S]{0,260}Showing the \$\{shownCards\.length\} most recent of \$\{selectedCards\.length\}[\s\S]{0,80}Showing all \$\{selectedCards\.length\}/, "the count is announced, and says 'all' once everything is shown");
  assert.match(s, /className="gtp-hit-44" onClick=\{\(\) => setCardLimit/, "44 px controls");
});

test("cards show sport NAMES; slip IDs and source files are kept, behind a disclosure", () => {
  const s = read("src/components/results/results-explorer.tsx");
  assert.match(s, /c\.sports\.map\(\(s\) => SPORT_LABEL\[s\] \?\? s\)/);
  assert.doesNotMatch(s, /c\.sports\.join\(" \+ "\)/);
  assert.match(s, /<details>[\s\S]{0,300}\{c\.slipId\}/, "the slip ID is one tap away, not deleted");
  assert.match(s, /Where these records come from[\s\S]{0,400}\{r\.source\}/, "each row's source file is listed in the disclosure");
  assert.doesNotMatch(s, /"Pending", "Source"\]/, "Source is no longer a reading column");
});

test("the MLB model explorer pages its graded picks the same way", () => {
  const s = read("src/components/results/model-results-explorer.tsx");
  assert.doesNotMatch(s, /\.slice\(0, 250\)/);
  assert.match(s, /setDetailLimit\(\(n\) => n \+ DETAIL_STEP\)/);
  assert.match(s, /setDetailLimit\(visibleDetail\.length\)/);
  assert.match(s, /useEffect\(\(\) => \{ setDetailLimit\(DETAIL_STEP\); \}, \[visibleDetail\]\)/);
});
