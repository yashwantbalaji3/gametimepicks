/**
 * P1-D · an EPL match report states its limitation above the first number in ONE line, and keeps the
 * evidence (how it was tested, the live record) one tap away in Model detail — never deleted.
 * Reads the built export (out/), so it runs in the post-build phase.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out", "epl", "match");
const pages = fs.existsSync(OUT) ? fs.readdirSync(OUT).map((d) => path.join(OUT, d, "index.html")).filter((f) => fs.existsSync(f)) : [];
const mainOf = (html) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));

test("the built export has EPL match reports — otherwise this suite proves nothing", () => {
  assert.ok(pages.length > 0, `no out/epl/match/*/index.html under ${OUT}`);
});

test("🔴 the limitation headline precedes the first percentage, and the evidence sits inside Model detail", () => {
  for (const f of pages) {
    const main = mainOf(fs.readFileSync(f, "utf8"));
    const lim = main.search(/Tested blind on past seasons\.|Not validated out of sample\./);
    const firstPct = main.search(/\d{1,3}(\.\d)?%/);
    assert.ok(lim > -1, `${path.basename(path.dirname(f))}: limitation missing`);
    assert.ok(firstPct === -1 || lim < firstPct, `${path.basename(path.dirname(f))}: a number appears before the limitation`);
    const det = main.indexOf("Model detail · how it was tested and its live record");
    assert.ok(det > lim, "the evidence disclosure follows the one-line limitation");
    const detailsOpen = main.lastIndexOf("<details", det);
    const detailsClose = main.indexOf("</details>", det);
    const inside = main.slice(detailsOpen, detailsClose);
    assert.ok(inside.length > 80, "the disclosure carries the evidence text, not an empty box");
    const para = main.slice(lim, detailsOpen);
    assert.ok(para.replace(/<[^>]+>/g, "").split(/\s+/).length < 60, "the visible limitation is one short statement, not the full evidence");
  }
});
