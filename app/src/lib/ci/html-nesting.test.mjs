/** The parser-repair classes behind hydration failure #418 → #423, on fixed markup (#782). */
import test from "node:test";
import assert from "node:assert/strict";

import { invalidNesting } from "./html-nesting.mjs";

test("an <li> opened inside an <li> is reported — the exact Production /live shape (#782)", () => {
  /* The pre-V2B NFL card: the card's own <li> wrapping PredictionRow's <li>. */
  const prodShape = '<ul style="margin:0"><li style="list-style:none"><li style="list-style:none;padding:8px 0"><div>Cole Kmet</div></li></li></ul>';
  const r = invalidNesting(prodShape);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "LI_IN_LI");
});

test("valid nesting is not reported — a list inside a list item is fine", () => {
  assert.deepEqual(invalidNesting("<ul><li><div>Card</div><ul><li>row</li><li>row</li></ul></li></ul>"), []);
  assert.deepEqual(invalidNesting('<li><img src="a.png" alt=""><span>x</span><br/></li>'), [], "void elements never stay open");
});

test("a block element inside a <p> is reported — the parser closes the paragraph", () => {
  assert.deepEqual(invalidNesting("<p>text <div>block</div></p>").map((x) => x.kind), ["BLOCK_IN_P"]);
  assert.deepEqual(invalidNesting("<p>text <span>inline</span> <a href=\"/x\">link</a></p>"), []);
});

test("script and style contents are not parsed as markup", () => {
  assert.deepEqual(invalidNesting('<li><script>self.__next_f.push("<li><li>")</script></li>'), []);
  assert.deepEqual(invalidNesting("<p><style>.a>div{}</style>ok</p>"), []);
});
