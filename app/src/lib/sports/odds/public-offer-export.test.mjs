/**
 * POST-BUILD GUARD (approval package O-6): no exported page — visible text, serialised RSC payload or embedded
 * JSON — and no exported `/data/**.json` names an offshore sportsbook, by provider key or by display title.
 *
 * The render-time checks alone left `"sportsbook":"betonlineag"` in /nfl/game/401872960's serialised props and in
 * the public `/data/nfl/live-props/401872960.json`. The loader sanitiser and the post-export offers sweep close
 * both; this scan is what keeps them closed, for every route and every exported data file, not only the two that
 * were found.
 *
 * Out of scope, documented: `_next/static/**` JavaScript (compiled code, e.g. the allowlist's own offshore key list
 * and `bookmakerLabel`'s name map — approval package O-8), which no reader sees as content.
 *
 * Run (after `npm run build`): npx tsx --test src/lib/sports/odds/public-offer-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BOOK_AVAILABILITY_NOTE, KNOWN_OFFSHORE_KEYS } from "./eligible-operators.mjs";
import { BOOK_WITHHELD_INELIGIBLE } from "./public-offer-sanitizer.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUT = path.join(APP, "out");

/** Provider keys and the provider's display titles ("BetOnline.ag", "MyBookie.ag", "BetUS", "LowVig.ag", "BetAnySports"). */
const OFFSHORE = new RegExp(`${KNOWN_OFFSHORE_KEYS.join("|")}|betonline|mybookie|bet ?any ?sports`, "gi");

/**
 * Files proven to be documented exceptions: path (relative to out/) → reason. EMPTY BY DESIGN. An entry needs a
 * founder decision recorded in the approval package; it is never the way to make this test pass.
 */
const DOCUMENTED_EXCEPTIONS = Object.freeze({});

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (p !== path.join(OUT, "_next")) walk(p, acc); }
    else acc.push(p);
  }
  return acc;
}

test("the export exists (this guard never passes by not looking)", () => {
  assert.ok(fs.existsSync(path.join(OUT, "index.html")), "out/index.html missing — run `npm run build` first");
});

test("no exported HTML, RSC payload or data JSON names an offshore sportsbook (key or title)", () => {
  const files = walk(OUT).filter((p) => /\.(html|txt)$/.test(p) || (p.startsWith(path.join(OUT, "data") + path.sep) && p.endsWith(".json")));
  assert.ok(files.length > 100, `expected a full export, scanned ${files.length} files`);
  const hits = [];
  for (const p of files) {
    const rel = path.relative(OUT, p).split(path.sep).join("/");
    if (DOCUMENTED_EXCEPTIONS[rel]) continue;
    const m = fs.readFileSync(p, "utf8").match(OFFSHORE);
    if (m) hits.push(`${rel}: ${m.length} (${[...new Set(m.map((x) => x.toLowerCase()))].join(", ")})`);
  }
  console.log(`[public-offer-export] scanned ${files.length} exported HTML/RSC/data files; offshore mentions in ${hits.length}`);
  assert.deepEqual(hits, [], "an offshore sportsbook reached a public payload");
});

test("O-6 regression: /nfl/game/401872960 serialises the withheld flag, keeps the projection, and carries the jurisdiction note", (t) => {
  const html = path.join(OUT, "nfl/game/401872960/index.html");
  if (!fs.existsSync(html)) { t.skip("route not in this export"); return; }
  const page = fs.readFileSync(html, "utf8");
  /* The anytime-TD tab is client-rendered after a click, so the static HTML proves the PAYLOAD; the rendered
     "Price not shown" state is proven by the unit render test in public-offer-sanitizer.test.mjs. */
  assert.ok(page.includes(`\\"anytime_td\\":{\\"probability\\":0.3874,\\"market\\":{\\"sportsbook\\":null,\\"bookWithheld\\":\\"${BOOK_WITHHELD_INELIGIBLE}\\"}}`),
    "the serialised board carries Zay Flowers' projection unchanged, beside the withheld flag and nothing of the offer");
  assert.ok(page.includes(BOOK_AVAILABILITY_NOTE), "the jurisdiction note sits under the lists that name a book");
});

test("O-6 regression: the exported live-props copy is sanitised; the committed record is not", (t) => {
  const outFile = path.join(OUT, "data/nfl/live-props/401872960.json");
  const srcFile = path.join(APP, "public/data/nfl/live-props/401872960.json");
  if (!fs.existsSync(outFile) || !fs.existsSync(srcFile)) { t.skip("artifact not present"); return; }
  const out = JSON.parse(fs.readFileSync(outFile, "utf8"));
  const src = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  assert.match(JSON.stringify(src), /"sportsbook":"betonlineag"/, "the committed artifact is history and is not rewritten");
  assert.equal(out.rows.length, src.rows.length);
  out.rows.forEach((r, i) => {
    const o = src.rows[i];
    assert.deepEqual(r.settlement, o.settlement, `${o.predictionId}: settlement record unchanged`);
    assert.deepEqual(r.live, o.live, `${o.predictionId}: live facts unchanged`);
    assert.deepEqual(r.frozen?.projection, o.frozen?.projection, `${o.predictionId}: projection unchanged`);
    assert.equal(r.frozenIdentity, o.frozenIdentity);
  });
  const zay = out.rows.find((r) => r.predictionId === "401872960:nfl-athlete-4429615:anytime_td");
  assert.deepEqual(zay.frozen.market, { sportsbook: null, bookWithheld: BOOK_WITHHELD_INELIGIBLE });
});
