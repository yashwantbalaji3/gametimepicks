/**
 * SA3 · BUILT EXPORT. What a Simple reader's HTML actually carries on the report pages.
 *
 * The export is Simple (the server never knows a device's preference), so the rendered HTML must hold
 * every trust line and the "more in Analyst" line, and none of the Analyst detail.
 *
 * ⚠ <script> BODIES ARE STRIPPED FIRST. Server children handed to <AnalystOnly> still travel in the RSC
 *   payload (`self.__next_f.push(...)`), so a raw-HTML scan would find the hidden text and an "absent"
 *   assertion would be meaningless. What is asserted here is what renders. How much of the payload
 *   still carries the detail is announced, never hidden: that is the weight SA4 addresses.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const rendered = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const pages = (rel) => {
  const dir = path.join(OUT, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((d) => path.join(dir, d, "index.html")).filter((f) => fs.existsSync(f));
};

function check(t, rel, { absent, present, pairs = [] }) {
  const files = pages(rel);
  if (!fs.existsSync(OUT)) return t.skip("no export built");
  assert.ok(files.length > 0, `${rel}: the export has report pages to check`);
  let inPayload = 0;
  for (const f of files) {
    const raw = fs.readFileSync(f, "utf8");
    const html = rendered(raw);
    const where = path.relative(OUT, f);
    for (const re of present) assert.match(html, re, `${where}: ${re} renders in Simple`);
    // A conditional section: where its heading renders, the part of it that stays in Simple renders too.
    for (const [when, re] of pairs) if (when.test(html)) assert.match(html, re, `${where}: ${re} renders wherever ${when} does`);
    for (const re of absent) {
      assert.ok(!re.test(html), `${where}: ${re} is Analyst detail and must not render in Simple`);
      if (re.test(raw)) inPayload += 1;
    }
  }
  t.diagnostic(`${rel}: ${files.length} page(s) — detail absent from rendered HTML; ${inPayload} detail marker(s) still ride the RSC payload`);
}

test("🔴 NFL game reports: Simple renders the tiles, the market read, the reading key, the limit and the disclaimer — not the range table, exact scores or receipt", (t) => {
  check(t, "nfl/game", {
    present: [/Show Analyst detail/, /Us versus the sportsbooks/, /What these numbers mean/, /Where this came from/],
    absent: [/How wide the outcomes are/, /The likeliest final scores/, /input hash/],
  });
});

test("🔴 EPL match pages: the banner, the over/under ladder and the limitation render — not the distributions or scoring rates", (t) => {
  check(t, "epl/match", {
    present: [/Show Analyst detail/, /no lineup, injury or team-news input exists in this model/],
    pairs: [[/Total goals in the match/, /Over \/ under ladder/]],
    absent: [/How many each side scores/, /Scoring rates \(λ\)/, /Probability of each total/],
  });
});

test("🔴 UFC bout pages: paper-only renders; the method claim and its receipt are Analyst together", (t) => {
  check(t, "ufc/bout", {
    present: [/Show Analyst detail/, /Educational and paper-only/],
    absent: [/held-out fights/, /beat its baseline/],
  });
});
