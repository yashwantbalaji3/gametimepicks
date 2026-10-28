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
import { nbaFirstGradedGameDate } from "../results/nba-official-record-reader.mjs";

const ROOT = path.join(process.cwd(), "public", "data");
const pretty = (iso) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });

test("the NBA readiness fact names the first REGULAR-season game, never a preseason date", () => {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, "nba/schedule/latest.json"), "utf8")).rows ?? [];
  const regular = rows.filter((r) => r.seasonType === 2).map((r) => r.dateUtc).sort();
  const pre = rows.filter((r) => r.seasonType === 1).map((r) => r.dateUtc).sort();
  const text = JSON.stringify(productReadiness("nba", ROOT));
  /* P0 10-28 — THIS ASSERTION ENCODED THE BUG ONCE THE SEASON STARTED. It required "Regular season opens <first regular
     row of the capture>", but the capture is a ROLLING window of upcoming games: on 10-27 its first row was that night's
     game, and the page said "Regular season opens October 27, 2026" a week after opening night (Oct 20). The intent —
     never print a date that is not when the season opened — is kept: once an official game is graded, the fact is the
     first graded game read from the record, and the capture's first row is never called the opening. */
  const firstGraded = nbaFirstGradedGameDate(ROOT);
  if (firstGraded) {
    assert.ok(text.includes(`"First graded Official Forecast game"`) && text.includes(pretty(`${firstGraded}T12:00:00Z`)), `first graded game is ${firstGraded}`);
    assert.ok(!text.includes(`"Regular season opens"`), "a rolling capture's first row is never called the season opening once games are graded");
  } else if (regular.length) assert.ok(text.includes(`"Regular season opens"`) && text.includes(pretty(regular[0])), `opening night is ${pretty(regular[0])}`);
  if (pre.length && (!regular.length || pretty(pre[0]) !== pretty(regular[0]))) {
    assert.ok(!text.includes(`"detail":"${pretty(pre[0])}"`), `a preseason date (${pretty(pre[0])}) is not when the season opens`);
  }
  assert.ok(!/"Season opens"/.test(text), "the unqualified label read the first row of any kind");
});
