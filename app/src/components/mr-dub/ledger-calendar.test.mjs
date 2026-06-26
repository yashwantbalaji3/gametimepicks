/**
 * Structural/a11y tests for the LedgerCalendar component (the suite doesn't render React; this pins the
 * key UX + safety properties by asserting the source — same approach as the orchestrator invariant test).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "src", "components", "mr-dub", "ledger-calendar.tsx"), "utf8");

test("is an interactive client component", () => {
  assert.match(src, /^"use client"/, "marked use client (drawer interactivity)");
});

test("has an accessible day-detail drawer (role=dialog, ESC + backdrop close, labelled cells)", () => {
  assert.match(src, /role="dialog"/, "drawer is a dialog");
  assert.match(src, /aria-modal="true"/, "modal semantics");
  assert.match(src, /Escape/, "ESC closes the drawer");
  assert.match(src, /aria-label=\{d \?/, "day cells carry an aria-label with the day's result/bankroll");
  assert.match(src, /disabled=\{!clickable\}/, "empty/padding days are not clickable");
});

test("renders the success-visualisation stats strip", () => {
  for (const s of ["Current streak", "Best day", "Worst day", "High-water", "Rolling ROI", "Bankroll"]) {
    assert.ok(src.includes(s), `stats strip shows ${s}`);
  }
});

test("shows per-product icons + a 7-column month grid (mobile bottom-sheet, desktop centred)", () => {
  assert.match(src, /grid-cols-7/, "7-day week grid");
  assert.match(src, /PRODUCT_META\[p\]\?\.glyph/, "per-day product glyphs");
  assert.match(src, /items-end sm:items-center/, "mobile bottom-sheet → desktop centred modal");
});

test("PRESENTATION ONLY — no money mutation, no fs/network, reads the canonical lib model", () => {
  assert.match(src, /from "@\/lib\/mr-dub\/ledger-calendar"/, "consumes the canonical calendar model");
  assert.doesNotMatch(src, /writeFileSync|fetch\(|portfolio\.json|currentBankroll\s*=/, "never writes money or fetches");
  assert.doesNotMatch(src, /10176\.17|10376\.17|20065\.4|20465\.4/, "no hardcoded money constants");
});
