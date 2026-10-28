/* Audit 2026-10-28 F07: a forecast row's date is the game's ET date — the factual game log's rule — never a UTC prefix. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { formatGameDate } = await import("../../lib/research-pages/format.mjs");

test("forecast history rows date the game in ET from its start instant", () => {
  const src = fs.readFileSync(new URL("./forecast-history-section.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /eventStart[^\n]*\.slice\(0, 10\)/, "no UTC date prefix");
  assert.match(src, /formatGameDate\(r\.eventStart\)/);
  // KC @ SEA kicked off Sun Oct 25, 8:20 PM ET = 2026-10-26T00:20Z — the case the audit caught.
  assert.equal(formatGameDate("2026-10-26T00:20Z"), "Oct 25, 2026");
  assert.equal(formatGameDate("2026-10-25T17:00Z"), "Oct 25, 2026");
});
