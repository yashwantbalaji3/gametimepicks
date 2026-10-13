/**
 * "NOT OFFERED" IS A CLAIM ABOUT THE BOOK; "NOT CHECKED" IS A CLAIM ABOUT US (P250-W1, 2026-10-13).
 *
 * The NFL product receipt (rendered on /nfl) said "the provider offers no NFL player market in this window" on every
 * run, and printed it beside "offeredMarkets: present". In Week 6 no game was probed at all (the odds budget is
 * exhausted), so the sentence asserted something about the provider that nobody had asked. The receipt may only say
 * the provider offers nothing when the window's games were actually probed and nothing was offered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "public/data/nfl");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return null; } };

test("the receipt says the provider offers no player market only when this window's games were probed and none was offered", () => {
  const receipts = read("product-receipts.json");
  const index = read("index.json");
  const markets = read("markets/latest.json");
  if (!receipts || !index) return; // pre-first-run tree
  const upcoming = (index.events ?? []).filter((e) => e.lifecycle === "UPCOMING");
  const probed = new Set(markets?.propMarkets?.probedEventIds ?? []);
  const windowProbed = upcoming.filter((e) => probed.has(e.canonicalEventId ?? `nfl-${e.providerEventId}`)).length;
  const offered = (markets?.propMarkets?.offeredMarkets ?? []).length > 0;
  const text = JSON.stringify(receipts);
  const claimsNotOffered = /provider offers no NFL player market/.test(text);
  if (claimsNotOffered) {
    assert.ok(windowProbed > 0, `the receipt says the provider offers no player market, but none of this window's ${upcoming.length} games was probed — that is "not checked"`);
    assert.equal(offered, false, "the receipt says the provider offers no player market while the capture lists offered markets");
  }
  assert.doesNotMatch(text, /offers no NFL player market[^"]*offeredMarkets: present/, "a sentence may not contradict its own evidence");
});
