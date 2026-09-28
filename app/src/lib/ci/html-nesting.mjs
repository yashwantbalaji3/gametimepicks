/**
 * HTML THE BROWSER WILL SILENTLY RESTRUCTURE — and React will then fail to hydrate (#418 → #423).
 *
 * The HTML parser does not reject invalid nesting; it REPAIRS it. An `<li>` opened while another `<li>`
 * is the innermost open element implicitly closes the first one, and a block element opened inside a
 * `<p>` implicitly closes the paragraph. The DOM the browser builds then differs from the tree React
 * rendered, so hydration fails and React throws the whole root away and re-renders it on the client.
 *
 * ⚠ FOUND ON PRODUCTION /live (#782, 2026-09-28). The pre-V2B NFL card wrapped `PredictionRow` — which
 *   itself returned an `<li>` — in another `<li>`, emitting `<li><li>` five times. The server's text was
 *   correct, so every text-level check passed; only the structure was wrong.
 *
 * A tiny tag-stack scanner over the markup React emits (it quotes attributes and closes every
 * non-void element). It ignores script/style/template contents. It is a guard, not a validator: it
 * reports exactly the two repair classes above.
 */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "template", "textarea", "title", "noscript"]);
/* Elements whose start tag closes an open <p> (the HTML spec's list, abridged to what React emits). */
const CLOSES_P = new Set(["address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul"]);

/** @returns {Array<{ kind: "LI_IN_LI" | "BLOCK_IN_P", tag: string, at: number }>} */
export function invalidNesting(html) {
  const out = [];
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(String(html ?? "")))) {
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (!closing && RAW.has(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      re.lastIndex = end === -1 ? html.length : end;
      continue;
    }
    if (closing) {
      const i = stack.lastIndexOf(tag);
      if (i !== -1) stack.length = i;
      continue;
    }
    const top = stack[stack.length - 1];
    if (tag === "li" && top === "li") out.push({ kind: "LI_IN_LI", tag, at: m.index });
    if (top === "p" && CLOSES_P.has(tag)) out.push({ kind: "BLOCK_IN_P", tag, at: m.index });
    if (!VOID.has(tag) && m[4] !== "/") stack.push(tag);
  }
  return out;
}
