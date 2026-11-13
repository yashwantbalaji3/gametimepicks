/**
 * The NBA game page's Official Forecast panel at phone width (found on production 2026-11-13 at 375px): `.nbx-kv` put
 * each label beside its value with a max-content label column, so long values (the Elo disclosure, the withheld-score
 * note) wrapped one word per line and the panel alone ran ~2,700px. At phone width the list must stack.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");

test("the label/value list keeps two columns on wide screens", () => {
  assert.match(css, /^\.nbx-kv \{[^}]*grid-template-columns: max-content minmax\(0, 1fr\)/m);
});

test("at phone width the label/value list is one column, label above value", () => {
  const block = css.match(/@media \(max-width: 559px\) \{\s*\.nbx-kv \{([^}]*)\}\s*\.nbx-kv dt \{([^}]*)\}/);
  assert.ok(block, "a phone-width rule for .nbx-kv follows its base rule");
  assert.match(block[1], /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(block[2], /margin-top/, "stacked pairs are separated");
  // the phone rule must come after the base rule or the base rule would win at equal specificity
  assert.ok(css.indexOf("@media (max-width: 559px) {\n  .nbx-kv {") > css.indexOf(".nbx-kv { display: grid;"));
});
