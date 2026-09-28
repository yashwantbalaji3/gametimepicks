/**
 * SIMPLE / ANALYST — the presentation preference (SA1).
 * Rules on an injected store; the real toggle and AnalystOnly rendered in-process.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DEFAULT_VIEW_MODE, VIEW_MODES, VIEW_MODE_STORAGE_KEY, parseViewMode, readViewMode, writeViewMode,
} from "./view-mode-core.mjs";

const APP = path.resolve(new URL("../../..", import.meta.url).pathname);
const memStore = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };

test("🔴 new readers get Simple", () => {
  assert.equal(DEFAULT_VIEW_MODE, "simple");
  assert.equal(readViewMode(memStore()), "simple", "an empty device is Simple");
  assert.equal(readViewMode(null), "simple", "no storage at all (private mode) is Simple");
  assert.equal(readViewMode({ getItem: () => { throw new Error("blocked"); } }), "simple", "a throwing store is Simple");
});

test("only the two modes exist; anything else is the default — never a guess", () => {
  assert.deepEqual([...VIEW_MODES], ["simple", "analyst"]);
  assert.equal(parseViewMode('{"mode":"analyst"}'), "analyst");
  assert.equal(parseViewMode('"analyst"'), "analyst");
  assert.equal(parseViewMode("analyst"), "analyst");
  for (const bad of ['{"mode":"expert"}', "ANALYST", "{broken", '{"mode":null}', "", "constructor", "[]"]) {
    assert.equal(parseViewMode(bad), "simple", `${JSON.stringify(bad)} must fall back to Simple`);
  }
});

test("🔴 the choice persists on the device and round-trips", () => {
  const s = memStore();
  assert.equal(writeViewMode(s, "analyst"), "analyst");
  assert.equal(s._m.get(VIEW_MODE_STORAGE_KEY), '{"mode":"analyst"}');
  assert.equal(readViewMode(s), "analyst", "the next page load reads the same choice");
  assert.equal(writeViewMode(s, "simple"), "simple");
  assert.equal(readViewMode(s), "simple");
  assert.equal(writeViewMode(s, "nonsense"), "simple", "an unknown mode is refused, not stored");
  assert.equal(VIEW_MODE_STORAGE_KEY, "gtp.view.v1", "its own key — never inside the account-synced gtp.prefs.v1");
});

/* The components compile to the classic JSX runtime under tsx. */
globalThis.React = React;

test("🔴 Analyst content never renders on the server — even on a device that chose Analyst", async () => {
  /* A device that chose Analyst. The server (and the first client render) must still render nothing,
     or the markup disagrees with hydration (#418 → #423) and Simple pages would carry the Analyst DOM. */
  globalThis.window = { localStorage: memStore({ [VIEW_MODE_STORAGE_KEY]: '{"mode":"analyst"}' }), addEventListener() {}, removeEventListener() {} };
  try {
    const { default: AnalystOnly } = await import("../../components/view-mode/analyst-only.tsx");
    const html = renderToStaticMarkup(React.createElement(AnalystOnly, null, React.createElement("p", null, "MODEL DETAIL")));
    assert.equal(html, "", "no Analyst markup on the server render");
  } finally { delete globalThis.window; }
});

test("🔴 the toggle is a real radio group: two labelled radios, Simple checked by default, state not by colour alone", async () => {
  const { default: ViewModeToggle } = await import("../../components/view-mode/view-mode-toggle.tsx");
  const html = renderToStaticMarkup(React.createElement(ViewModeToggle));
  assert.match(html, /<fieldset[^>]*>[\s\S]*<legend[^>]*>Detail level<\/legend>/, "a fieldset with a legend names the group");
  const radios = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
  assert.equal(radios.length, 2, "exactly two native radios");
  const names = new Set(radios.map((r) => /name="([^"]+)"/.exec(r)?.[1]));
  assert.equal(names.size, 1, "one shared name, so arrow keys move between them");
  assert.ok(radios.some((r) => /value="simple"/.test(r) && /checked=""/.test(r)), "Simple is checked by default");
  assert.ok(radios.some((r) => /value="analyst"/.test(r) && !/checked=""/.test(r)), "Analyst is not");
  assert.match(html.replace(/<[^>]+>/g, " "), /✓\s+Simple/, "the selected option carries a check glyph, not just a colour");
  assert.match(html, /min-height:36px|min-height:44px/, "a real touch target");
});

test("the control is in both site-wide places: the desktop rail and the mobile Menu sheet", () => {
  for (const f of ["src/components/command-rail.tsx", "src/components/mobile-bottom-nav.tsx"]) {
    const src = fs.readFileSync(path.join(APP, f), "utf8");
    assert.match(src, /import ViewModeToggle from "@\/components\/view-mode\/view-mode-toggle"/, f);
    assert.match(src, /<ViewModeToggle\b/, f);
  }
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  assert.match(css, /\.gtp-view-mode-option:has\(\.gtp-view-mode-input:focus-visible\)\s*\{\s*outline:/, "keyboard focus is visible on the label");
});

test("🔴 the server render is identical on every device: the hook and the toggle ignore stored choices until mounted", async () => {
  globalThis.window = { localStorage: memStore({ [VIEW_MODE_STORAGE_KEY]: '{"mode":"analyst"}' }), addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  try {
    const { useViewMode } = await import("./view-mode.ts");
    let seen = null;
    const Probe = () => { seen = useViewMode(); return null; };
    renderToStaticMarkup(React.createElement(Probe));
    assert.deepEqual({ mode: seen.mode, ready: seen.ready, isAnalyst: seen.isAnalyst }, { mode: "simple", ready: false, isAnalyst: false },
      "reading the device during render would make this device's server HTML differ from its hydration");
    const { default: ViewModeToggle } = await import("../../components/view-mode/view-mode-toggle.tsx");
    const html = renderToStaticMarkup(React.createElement(ViewModeToggle));
    assert.ok([...html.matchAll(/<input[^>]*>/g)].some((m) => /value="simple"/.test(m[0]) && /checked=""/.test(m[0])), "the toggle's server render shows Simple even on an Analyst device");
  } finally { delete globalThis.window; }
});
/* Note: `isAnalyst: ready && …` is defence in depth — `mode` and `ready` change in the same effect, so
   removing `ready &&` alone is not observable; the render-time storage read above is the real hazard. */
