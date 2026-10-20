/**
 * Simulation Theater · the ILLUSTRATIVE PAIRING audit (iteration 8), shared by the NFL and NBA theater tests.
 *
 * The rule: every element marked `data-st-interp` sits inside a `data-st-interp-scope` that holds a VISIBLE (not screen-
 * reader only, not hidden) `data-st-interp-tag` reading "illustrative". untaggedInterp(html) returns the violations of
 * React static markup. Moved here verbatim from theater-broadcast.test.mjs so both sports run the same check.
 */
/** A minimal tree from React's static markup (tags, attributes, text), enough to walk ancestors and subtrees. */
export function tree(html) {
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  const rootNode = { tag: "#root", attrs: {}, kids: [], parent: null, text: "" };
  let cur = rootNode;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] != null) { cur.kids.push({ tag: "#text", text: m[5], kids: [], parent: cur, attrs: {} }); continue; }
    const [, close, tag, attrStr, self] = m;
    if (close) { cur = cur.parent ?? cur; continue; }
    const attrs = {};
    for (const a of attrStr.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? "";
    const node = { tag, attrs, kids: [], parent: cur };
    cur.kids.push(node);
    if (!self && !VOID.has(tag)) cur = node;
  }
  return rootNode;
}
export const walk = (n, f) => { f(n); for (const k of n.kids) walk(k, f); };
export const textOf = (n) => { let t = ""; walk(n, (x) => { if (x.tag === "#text") t += x.text; }); return t; };
export const hiddenNode = (n) => { for (let x = n; x; x = x.parent) { const a = x.attrs ?? {}; if ("hidden" in a || a["aria-hidden"] === "true" || /\bst-sr\b/.test(a.class ?? "")) return true; } return false; };

/**
 * The rule: every element marked data-st-interp sits inside a data-st-interp-scope that holds a VISIBLE (not screen-reader
 * only, not hidden) data-st-interp-tag reading "illustrative". Returns the violations.
 */
export function untaggedInterp(html) {
  const bad = [];
  walk(tree(html), (n) => {
    if (!n.attrs || !("data-st-interp" in n.attrs)) return;
    let scope = n.parent;
    while (scope && !(scope.attrs && "data-st-interp-scope" in scope.attrs)) scope = scope.parent;
    if (!scope) { bad.push(`${n.attrs["data-st-interp"]}: no scope`); return; }
    const tags = [];
    walk(scope, (x) => { if (x.attrs && "data-st-interp-tag" in x.attrs) tags.push(x); });
    if (!tags.some((t) => /illustrative/i.test(textOf(t)) && !hiddenNode(t))) bad.push(`${n.attrs["data-st-interp"]}: no visible illustrative tag in its scope`);
  });
  return bad;
}

