/**
 * W9 · the floating slip. Audit 2026-10-28 (functional.json `slip`): at 390 the "YOUR SLIP · 1" button sat under
 * the fixed bottom navigation and the click landed on RESULTS; the open panel had no dialog semantics.
 *
 * Run: cd app && npx tsx --test src/components/slip/slip-drawer.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const code = (p) => fs.readFileSync(path.join(APP, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const DRAWER = code("src/components/slip/slip-drawer.tsx");
const NAV = code("src/components/mobile-bottom-nav.tsx");

test("phones: the slip clears the fixed bottom navigation and the safe area; md+ keeps its 16px", () => {
  /* The bottom nav is the md:hidden fixed bar; the slip must sit above it at the same breakpoint. */
  assert.match(NAV, /fixed inset-x-0 bottom-0 z-40 md:hidden/, "precondition: the bottom nav is fixed and phone-only");
  const wrapper = DRAWER.match(/<div className="(fixed z-40[^"]*)"/);
  assert.ok(wrapper, "the slip's fixed wrapper");
  assert.match(wrapper[1], /bottom-\[calc\(env\(safe-area-inset-bottom,0px\)\+64px\)\]/, "64px + safe area above the bar on phones");
  assert.match(wrapper[1], /md:bottom-4/, "desktop placement unchanged (16px)");
  assert.doesNotMatch(DRAWER, /bottom: 16/, "no inline bottom offset that would override the phone clearance");
});

test("the open panel is a labelled modal dialog on the shared keyboard contract", () => {
  const tag = DRAWER.slice(DRAWER.indexOf("<section"), DRAWER.indexOf(">", DRAWER.indexOf('className="flex flex-col gap-2.5')));
  assert.match(tag, /role="dialog"/);
  assert.match(tag, /aria-modal="true"/);
  assert.match(tag, /aria-labelledby=\{titleId\}/);
  assert.match(DRAWER, /<h2 id=\{titleId\}/, "the title the dialog is named by");
  assert.match(DRAWER, /useDialogFocus\(panelRef, \{ onClose: close, active: open \}\)/, "focus in, Tab contained, Escape closes");
  assert.match(DRAWER, /if \(wasOpen\.current && !open\) triggerRef\.current\?\.focus\(\)/, "focus returns to the re-mounted trigger");
  assert.match(DRAWER, /<button ref=\{triggerRef\}/);
});
