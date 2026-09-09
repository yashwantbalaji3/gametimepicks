/**
 * P251-F1 — THE SHARE CARD IS PART OF THE PAGE, AND IT IS MEASURED ON THE BYTES.
 *
 * Every one of 377 pages shipped the root layout's Open Graph block verbatim — same title, same
 * description, same image, and `og:url` pointing at the homepage — so a shared game report
 * previewed as the generic site card and sent whoever tapped it to the front page. `rel=canonical`
 * was absent on every route but two for the same reason: the metadata object never knew its route.
 *
 * Stated over the built export, because that is what a scraper reads. A page's own metadata is
 * allowed to say anything; what is not allowed is for it to claim to BE another page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const ORIGIN = "https://gametimepicks.yashwantbalaji.com";

function pages() {
  const acc = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "index.html") acc.push(p);
    }
  })(OUT);
  return acc;
}
const routeOf = (f) => "/" + path.relative(OUT, f).replace(/index\.html$/, "");
const headOf = (f) => { const h = fs.readFileSync(f, "utf8"); return h.slice(0, h.indexOf("</head>")); };
const attr = (head, re) => (head.match(re) ?? [])[1] ?? null;

test("BUILT · every page's og:url is its OWN url", () => {
  const wrong = [];
  for (const f of pages()) {
    const route = routeOf(f);
    if (route === "/404/") continue;
    const url = attr(headOf(f), /property="og:url" content="([^"]*)"/);
    if (url == null) { wrong.push(`${route} — no og:url`); continue; }
    const expected = `${ORIGIN}${route}`;
    if (url !== expected) wrong.push(`${route} — og:url=${url}`);
  }
  assert.deepEqual(wrong.slice(0, 12), [], `pages whose share card points somewhere else (${wrong.length}):\n  ${wrong.slice(0, 12).join("\n  ")}`);
});

test("BUILT · a page that can be indexed names itself as canonical", () => {
  const wrong = [];
  for (const f of pages()) {
    const route = routeOf(f);
    if (route === "/404/") continue;
    const head = headOf(f);
    /* A deliberately non-canonical page says so with noindex — a doubleheader's ambiguous base
       slug is the real case, and nominating it as the home of two games would be the defect. */
    if (/name="robots" content="[^"]*noindex/.test(head)) continue;
    const canon = attr(head, /rel="canonical" href="([^"]*)"/);
    if (canon !== `${ORIGIN}${route}`) wrong.push(`${route} — canonical=${canon ?? "missing"}`);
  }
  assert.deepEqual(wrong.slice(0, 12), [], `indexable pages with a wrong or missing canonical (${wrong.length}):\n  ${wrong.slice(0, 12).join("\n  ")}`);
});

test("BUILT · share titles are distinct enough to tell two pages apart", () => {
  /*
   * The failure was not "no title" — every page HAD one, the site's. So the claim is about
   * variety: the hubs and event reports, the pages people actually share, must not all carry one
   * headline. Utility routes (redirect stubs) legitimately share the default.
   */
  const titles = new Map();
  for (const f of pages()) {
    const route = routeOf(f);
    if (!/^\/(nfl|mlb|epl|ufc|results|today|simulate|markets|build)\/?$|^\/(games|nfl\/game|epl\/match)\//.test(route)) continue;
    const t = attr(headOf(f), /property="og:title" content="([^"]*)"/);
    assert.ok(t, `${route} has no og:title`);
    titles.set(route, t);
  }
  assert.ok(titles.size > 20, `expected the shareable routes to be present, saw ${titles.size}`);
  const distinct = new Set(titles.values());
  assert.ok(
    distinct.size >= titles.size * 0.9,
    `${titles.size} shareable pages carry only ${distinct.size} distinct share titles`,
  );
});

test("BUILT · the site is installable — manifest, icon and touch icon all ship", () => {
  for (const asset of ["manifest.webmanifest", "icon.png", "apple-icon.png"]) {
    assert.ok(fs.existsSync(path.join(OUT, asset)), `${asset} is missing from the export`);
  }
  const head = headOf(path.join(OUT, "index.html"));
  assert.match(head, /rel="manifest"/, "the manifest is linked");
  assert.match(head, /rel="apple-touch-icon"/, "the touch icon is linked");
  const mf = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.webmanifest"), "utf8"));
  assert.ok(mf.name && mf.short_name, "the manifest names the app");
  assert.ok((mf.icons ?? []).some((i) => i.purpose === "maskable"), "a maskable icon exists for Android");
  assert.match(mf.start_url, /^\//, "start_url is a real route on this origin");
});
