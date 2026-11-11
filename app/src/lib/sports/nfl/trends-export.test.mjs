/**
 * EXPORT GUARD (post-build) for /nfl/trends: in a flag-ON export, the trends section and its drawer file carry no price,
 * odds, book or (in the drawer file) line; in a flag-OFF export the route is pruned. Unit side: trends.test.mjs.
 * Run after a build: npx tsx --test src/lib/sports/nfl/trends-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");

test("/nfl/trends export: no price, odds or book; the drawer file carries no line; flag OFF → pruned", () => {
  assert.ok(fs.existsSync(OUT), "needs a built export at app/out/");
  const page = path.join(OUT, "nfl", "trends", "index.html"), data = path.join(OUT, "data", "nfl-trends.json");
  if (!fs.existsSync(page)) {
    // flag-OFF export: no page, and no trends data ships
    if (fs.existsSync(data)) assert.deepEqual(JSON.parse(fs.readFileSync(data, "utf8")), { disabled: true });
    return;
  }
  for (const f of [page, path.join(OUT, "nfl", "trends", "index.txt")].filter((x) => fs.existsSync(x))) {
    const all = fs.readFileSync(f, "utf8");
    const from = all.indexOf("trn-root");
    assert.ok(from > 0, `${path.basename(f)}: the trends section is in the file`);
    // the section ends before the site footer, which credits "The Odds API" on every page (attribution, not a price)
    const body = all.slice(from).split(/the-odds-api|The Odds API/)[0];
    assert.ok(body.includes("trn-table"), `${path.basename(f)}: the section reaches the table`);
    const visible = f.endsWith(".html") ? body.replace(/<script[^]*?<\/script>/g, "").replace(/<[^>]+>/g, " ") : body;
    assert.doesNotMatch(visible, /(?<![\w.:-])[+-]\d{3}(?!\d)/, `${path.basename(f)}: an American price`);
    assert.doesNotMatch(body, /overAmerican|underAmerican|overPrice|underPrice|"book"|\bodds\b/i, `${path.basename(f)}: a price or odds field`);
    assert.match(body, /model threshold, not a sportsbook line/);
  }
  const doc = fs.readFileSync(data, "utf8");
  assert.doesNotMatch(doc, /"lines?"|capturedAt|overPrice|underPrice|\bodds\b/i, "the drawer file: no line, no price");
  assert.ok(Object.keys(JSON.parse(doc).players ?? {}).length > 0, "the drawer file carries the QBs");
});
