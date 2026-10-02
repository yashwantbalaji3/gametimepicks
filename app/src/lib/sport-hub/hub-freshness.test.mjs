/**
 * Session 5 · B8 — the shared hub H1 says "updated" for the artifact the hub's reads come from, on every hub that has
 * one source: EPL (forecast set, existing), NFL (nfl/index.json), UFC (card-latest.json). MLB assembles rows from
 * several game-detail artifacts, so its stamp stays an open product choice rather than a guess.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { nflHub, ufcHub } from "./adapters.ts";

test("NFL: freshness is the forecast index's own generatedAt (when the hub reads the current period)", () => {
  const idx = JSON.parse(fs.readFileSync("public/data/nfl/index.json", "utf8"));
  const m = nflHub(new Date().toISOString());
  if (m.rows.length && m.periodLabel !== "Settled window" && m.periodLabel !== "Current window") assert.equal(m.freshness, idx.generatedAt);
});

test("UFC: freshness is the card artifact the page passes; absent stays absent", () => {
  assert.equal(ufcHub("2026-10-02T00:00:00Z", [], "Card", "2026-10-01T17:13:03Z").freshness, "2026-10-01T17:13:03Z");
  assert.equal(ufcHub("2026-10-02T00:00:00Z", [], "Card").freshness, null, "no stamp is invented");
  const page = fs.readFileSync("src/app/ufc/page.tsx", "utf8");
  assert.match(page, /typeof card\?\.generatedAt === "string" \? card\.generatedAt : null,\n\s*\);/, "the page passes the card's own stamp");
});
