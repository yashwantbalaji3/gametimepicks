/**
 * NBA "SEASON OPENS" IS OPENING NIGHT, NOT THE FIRST PRESEASON GAME (launch audit, 2026-10-13).
 *
 * Bucket Blitz read the earliest row of nba/schedule/latest.json — LON @ POR on Oct 12, a preseason game (ESPN
 * seasonType 1) — and said "Season opens October 12, 2026". The regular season (seasonType 2) opens Oct 20.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { productReadiness } from "./product-readiness.ts";

const ROOT = path.join(process.cwd(), "public", "data");
const pretty = (iso) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });

test("the NBA readiness fact names the first REGULAR-season game, never a preseason date", () => {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, "nba/schedule/latest.json"), "utf8")).rows ?? [];
  const regular = rows.filter((r) => r.seasonType === 2).map((r) => r.dateUtc).sort();
  const pre = rows.filter((r) => r.seasonType === 1).map((r) => r.dateUtc).sort();
  const text = JSON.stringify(productReadiness("nba", ROOT));
  if (regular.length) assert.ok(text.includes(`"Regular season opens"`) && text.includes(pretty(regular[0])), `opening night is ${pretty(regular[0])}`);
  if (pre.length && (!regular.length || pretty(pre[0]) !== pretty(regular[0]))) {
    assert.ok(!text.includes(`"detail":"${pretty(pre[0])}"`), `a preseason date (${pretty(pre[0])}) is not when the season opens`);
  }
  assert.ok(!/"Season opens"/.test(text), "the unqualified label read the first row of any kind");
});
