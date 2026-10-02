/**
 * Session 5 — /today states Moonshot's no-play reason from the lane (the producer's shortfallNote), never a fixed
 * sentence. 2026-10-01: the page said "no two-leg card on today's slate reaches its rung's price" while every
 * Moonshot lane said "Fewer than two eligible legs on the slate — awaiting a full card." (one MLB game).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const code = fs.readFileSync("src/app/today/page.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the Moonshot no-play note reads the lane's own reason", () => {
  assert.doesNotMatch(code, /reaches its rung's price/, "a fixed reason asserts a cause nobody measured");
  assert.match(code, /c\.product === "moonshot" && c\.shortfallNote/);
  assert.match(code, /Moonshot is no-play\$\{moonshotReason/);
});

test("LIVE: today's persisted lanes carry a reason for every no-card Moonshot lane", () => {
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/daily-portfolio.json", "utf8"));
  for (const l of (p.lanes ?? []).filter((x) => x.product === "moonshot" && x.status === "awaiting")) {
    assert.ok(l.shortfallNote, `${l.id}: an awaiting lane must say why`);
  }
});
