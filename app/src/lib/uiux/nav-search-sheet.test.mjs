/**
 * RAIL, SEARCH DIALOG AND MENU SHEET (overnight 2026-10-28 · W3) — source guards for what the rendered audit found.
 *
 *  1. The desktop rail folded "Picks & parlays", so Parlays, Bank Builder and Moonshot were invisible to a first-time
 *     visitor. It now starts open; the groups that stay folded name their first destinations.
 *  2. Search opened inside its host: the rail (backdrop blur 12px) and the phone header (backdrop-blur-xl) are each the
 *     containing block of a `position: fixed` descendant, so the "full-screen" dialog was 231px wide on desktop and
 *     header-sized on a phone. It is portaled to <body>, is a full-screen sheet on phones, and is a combobox over a
 *     listbox for screen readers.
 *  3. The Menu sheet had a focus trap and Escape (useDialogFocus) but no scroll lock, and on tablets it hosts search,
 *     whose trap fought its own.
 *
 * Run: npx tsx --test src/lib/uiux/nav-search-sheet.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { destinationsFor } from "../navigation.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const RAIL = strip(read("src/components/command-rail.tsx"));
const SEARCH = strip(read("src/components/search/site-search.tsx"));
const SHEET = strip(read("src/components/mobile-bottom-nav.tsx"));

test("rail: Picks & parlays starts open, and its products are rail destinations", () => {
  assert.match(RAIL, /const OPEN_BY_DEFAULT: readonly NavGroup\[\] = \["products"\];/);
  assert.match(RAIL, /open=\{holdsActive \|\| OPEN_BY_DEFAULT\.includes\(g\.key\)\}/);
  const products = destinationsFor("rail").filter((d) => d.group === "products").map((d) => d.label);
  for (const l of ["Parlays", "Bank Builder", "Moonshot"]) assert.ok(products.includes(l), `${l} is in the group that now starts open`);
});

test("rail: a folded group names its first destinations, and the preview hides once it is open", () => {
  assert.match(RAIL, /className="gtp-rail-group group /, "the <details> is the Tailwind group the preview keys off");
  assert.match(RAIL, /gtp-rail-group-preview[^"]*group-open:hidden/);
  assert.match(RAIL, /\{previewOf\(g\.items\)\}/);
  const record = destinationsFor("rail").filter((d) => d.group === "record").map((d) => d.label);
  assert.equal(record[0], "How It Works", "the Learn group's preview leads with How It Works");
});

test("search: the dialog is portaled to <body>, never rendered inside the rail or the header", () => {
  assert.match(SEARCH, /import \{ createPortal \} from "react-dom";/);
  assert.match(SEARCH, /\{open \? createPortal\(\s*<div\s+ref=\{dialogRef\}\s+role="dialog"/);
  assert.match(SEARCH, /document\.body,\s*\) : null\}/);
});

test("search: full-screen sheet on phones, centred panel from 640px", () => {
  assert.match(SEARCH, /className="fixed inset-0 flex justify-center items-stretch sm:items-start p-0 /);
  assert.match(SEARCH, /className="flex flex-col w-full sm:w-\[min\(620px,100%\)\] h-full sm:h-auto/);
  assert.match(SEARCH, /fontSize: 16 \}\}/, "a 16px field, so iOS does not zoom the page on focus");
});

test("search: accessible name, combobox over a listbox, arrows / Home / End / Enter, Escape from the shared hook", () => {
  assert.match(SEARCH, /role="dialog"\s+aria-modal="true"\s+aria-label="Search players, teams, games and pages"/);
  assert.match(SEARCH, /role="combobox"/);
  assert.match(SEARCH, /aria-controls=\{listId\}/);
  assert.match(SEARCH, /aria-activedescendant=\{results\[active\] \? optionId\(active\) : undefined\}/);
  assert.match(SEARCH, /<div id=\{listId\} role="listbox" aria-label="Search results">/);
  assert.match(SEARCH, /role="option"\s+aria-selected=\{i === active\}/);
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) assert.ok(SEARCH.includes(`e.key === "${key}"`), key);
  assert.match(SEARCH, /useDialogFocus\(dialogRef, \{ onClose: closeSearch, active: open, initialFocus: inputRef \}\)/);
  assert.match(SEARCH, /useScrollLock\(open\)/);
});

test("search: '/' opens only a VISIBLE trigger — the hidden twin (rail on a phone, header on desktop) stays shut", () => {
  assert.match(SEARCH, /const visible = triggerRef\.current\?\.offsetParent != null;/);
  assert.match(SEARCH, /e\.key === "\/" && !typing && !open && visible/);
  assert.match(SEARCH, /minHeight: 44, width: "100%"/, "the trigger is a 44px target");
});

test("Menu sheet: focus trap, Escape and scroll lock; search inside it takes over the trap while open", () => {
  assert.match(SHEET, /useDialogFocus\(sheetRef, \{ onClose, initialFocus: closeRef, active: !searchOpen \}\)/);
  assert.match(SHEET, /useScrollLock\(\);/);
  assert.match(SHEET, /<SiteSearch onOpenChange=\{setSearchOpen\} \/>/);
  assert.match(SHEET, /overscroll-contain/);
  /* The sheet's own opener is read BEFORE the hook moves focus, so it can be restored after a search round-trip. */
  assert.ok(SHEET.indexOf("const menuOpener = document.activeElement") < SHEET.indexOf("useDialogFocus(sheetRef"));
  /* Tap targets: every row, the Close button and the bar items are at least 44px. */
  assert.match(SHEET, /style=\{\{ minHeight: 44, color: active/);
  assert.match(SHEET, /minHeight: 44, minWidth: 44/);
});

test("the scroll lock is counted, and restores the page's own overflow", () => {
  const lock = strip(read("src/components/nav/use-scroll-lock.ts"));
  assert.match(lock, /if \(holders === 0\) \{\s*saved = \{ html: html\.style\.overflow, body: body\.style\.overflow \};/);
  assert.match(lock, /if \(holders === 0 && saved\) \{\s*html\.style\.overflow = saved\.html;\s*body\.style\.overflow = saved\.body;/);
});
