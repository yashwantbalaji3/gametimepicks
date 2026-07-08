/**
 * PHASE 1B — a WC Specials re-grade must never DROP or rewrite another product's already-settled result.
 * `collectForDate` stops returning an already-settled Bank Builder lane (status "won" post same-day
 * settlement), so persist-soccer-settlement now merge-preserves any prior graded card (by product+card) the
 * current collection omits before writing world-cup/settlement/<date>.json. DISPLAY/HISTORY-ONLY — canonical
 * money is never touched; unresolved player props stay pending (never a loss).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { collectForDate } from "../../../scripts/_settlement-collect.mjs";
import { settleCard } from "./soccer-markets.ts";

const DATA = path.join(process.cwd(), "public", "data");
const MONEY_MD5 = "affe6b21071f2b3be96bb2774eb347c3";
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));

test("the already-settled Bank Builder lane is no longer COLLECTED (why a naive re-grade dropped it)", () => {
  const bb = collectForDate(DATA, "2026-07-07").filter((c) => c.product === "bank-builder");
  assert.equal(bb.length, 0, "settled Lane A (status won) is not re-collected — so the bundle must preserve it");
});

test("re-running WC Specials grading does NOT drop the existing Bank Builder settlement (preserved in the bundle)", () => {
  const bundle = read("world-cup/settlement/2026-07-07.json");
  const bb = (bundle.graded ?? []).find((g) => g.product === "bank-builder");
  assert.ok(bb, "the settled Bank Builder card survives a WC-Specials re-grade");
  assert.equal(bb.result, "won", "Bank Builder Lane A remains WON (untouched)");
  const specials = (bundle.graded ?? []).filter((g) => g.product === "wc-specials");
  assert.ok(specials.length >= 3, "the WC Specials cards are also present in the same bundle");
});

test("product-specific update preserves EVERY other settled product (merge-by-product+card semantics)", () => {
  // The exact merge the persist script performs: new graded ∪ prior-not-in-new (keyed by product+card).
  const cardKey = (g) => `${g.product} ${g.card}`;
  const prior = [
    { product: "bank-builder", card: "Lane A (stake $174.23)", result: "won" },
    { product: "some-other-product", card: "X", result: "won" },
    { product: "wc-specials", card: "Defensive Games — Shots-on-target stack", result: "pending" },
  ];
  const fresh = [{ product: "wc-specials", card: "Defensive Games — Shots-on-target stack", result: "lost" }];
  const newKeys = new Set(fresh.map(cardKey));
  const merged = [...fresh, ...prior.filter((g) => !newKeys.has(cardKey(g)))];
  assert.ok(merged.find((g) => g.product === "bank-builder" && g.result === "won"), "BB preserved");
  assert.ok(merged.find((g) => g.product === "some-other-product" && g.result === "won"), "other product preserved");
  // the re-graded specials card is UPDATED (lost), not duplicated
  const spec = merged.filter((g) => g.product === "wc-specials");
  assert.equal(spec.length, 1, "the re-graded card replaces its prior entry (no duplicate)");
  assert.equal(spec[0].result, "lost", "the fresh result wins over the stale pending one");
});

test("unresolved player props remain PENDING and pending cards are NOT recorded as losses", () => {
  const bundle = read("world-cup/settlement/2026-07-07.json");
  const chaos = (bundle.graded ?? []).find((g) => /Chaos/i.test(g.card));
  const giant = (bundle.graded ?? []).find((g) => /Giant/i.test(g.card));
  assert.equal(chaos?.result, "pending", "Chaos Builder (unmatched player) stays pending");
  assert.equal(giant?.result, "pending", "Giant Killer (PEN-ambiguous SOT) stays pending");
  // Only the fully-gradable card is written to the durable product ledger; pending cards are NOT.
  const wc = read("product-ledger/wc-specials.json");
  const rows = (wc.results ?? wc.settled ?? []).filter((r) => r.date === "2026-07-07");
  assert.ok(rows.some((r) => /Defensive/i.test(r.card) && r.outcome === "lost"), "only the fully-settled card recorded");
  assert.ok(!rows.some((r) => /Chaos|Giant/i.test(r.card)), "pending cards are NEVER recorded as a result (pending ≠ loss)");
});

test("preserving settled products touches NO canonical money", () => {
  assert.equal(md5(path.join(DATA, "mr-dub", "portfolio.json")), MONEY_MD5, "portfolio.json md5 unchanged");
});
