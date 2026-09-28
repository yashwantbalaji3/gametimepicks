/**
 * SA3 · WHAT MAY HIDE IN SIMPLE. Source guards over every <AnalystOnly> in the app.
 *
 * Simple / Analyst is presentation only. Simple may leave out model DETAIL; it may never leave out a
 * trust signal — stale, unavailable, pending, withheld, experimental, not validated, paper-only, a
 * limitation, a disclaimer — or the live / save controls. A caveat about a number that is itself hidden
 * may hide with it; a caveat about a visible number may not. And an omission must be discoverable: a
 * page that wraps detail says so with <AnalystMore>.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(e.name)) acc.push(full);
  }
  return acc;
};
// JSX and line comments are stripped: a comment explaining why a caveat stays OUTSIDE must not trip the scan.
const stripComments = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every <AnalystOnly>…</AnalystOnly> body in `src`, with its file. Nesting is refused — it has no meaning. */
export function analystBlocks(files) {
  const out = [];
  for (const f of files) {
    const src = stripComments(fs.readFileSync(f, "utf8"));
    let i = 0;
    for (;;) {
      const open = src.indexOf("<AnalystOnly>", i);
      if (open < 0) break;
      const close = src.indexOf("</AnalystOnly>", open);
      assert.ok(close > open, `${path.relative(SRC, f)}: an <AnalystOnly> is never closed`);
      const body = src.slice(open + "<AnalystOnly>".length, close);
      assert.ok(!body.includes("<AnalystOnly>"), `${path.relative(SRC, f)}: nested <AnalystOnly>`);
      out.push({ file: path.relative(SRC, f), body });
      i = close + 1;
    }
  }
  return out;
}

/** The trust vocabulary and the controls that are never Analyst-only. Matched case-insensitively. */
export const NEVER_HIDDEN = [
  /honestLimit/, /disclaimer/, /not validated/, /\bstale\b/, /unavailable/, /\bpending\b/, /withheld/,
  /paper-only/, /not betting advice/, /experimental/, /degraded/, /\bpaused\b/, /not used by the model/,
  /no lineup, injury or team-news/, /calibration notice/, /FreshnessBadge/, /LivePanel/, /SaveForecastButton/,
  /UnavailableNote/, /ModelStatusPanel/,
];

const FILES = walk(SRC);
const BLOCKS = analystBlocks(FILES);

test("🔴 no <AnalystOnly> block anywhere carries a trust signal or a live/save control", (t) => {
  assert.ok(BLOCKS.length >= 8, `the scan found the Analyst blocks (${BLOCKS.length}) — a scan that finds none proves nothing`);
  for (const { file, body } of BLOCKS) {
    for (const re of NEVER_HIDDEN) {
      assert.ok(!new RegExp(re.source, "i").test(body), `${file}: an <AnalystOnly> block contains ${re} — that stays visible in Simple`);
    }
  }
  t.diagnostic(`${BLOCKS.length} Analyst blocks across ${new Set(BLOCKS.map((b) => b.file)).size} files, none carrying trust copy`);
});

test("an omission is discoverable: every page that wraps detail offers <AnalystMore>", () => {
  /* Exempt, with reasons. A per-row disclosure on a live card would repeat the hint on every row. */
  const EXEMPT = new Map([
    ["components/view-mode/analyst-only.tsx", "the component itself"],
    ["components/live/featured-forecast-row.tsx", "per-row 'Model detail' on /live — the toggle's hint names what Analyst adds"],
  ]);
  const users = FILES.filter((f) => /<AnalystOnly>/.test(stripComments(fs.readFileSync(f, "utf8")))).map((f) => path.relative(SRC, f));
  for (const u of users) {
    if (EXEMPT.has(u)) continue;
    assert.match(stripComments(fs.readFileSync(path.join(SRC, u), "utf8")), /<AnalystMore\b/, `${u} hides detail in Simple without saying so`);
  }
});

test("SA3 report pages keep every trust line OUTSIDE their Analyst blocks", () => {
  const src = (rel) => stripComments(fs.readFileSync(path.join(SRC, rel), "utf8"));
  const outside = (rel) => { let s = src(rel); for (const b of analystBlocks([path.join(SRC, rel)])) s = s.replace(b.body, ""); return s; };
  const nfl = outside("app/nfl/game/[eventId]/page.tsx");
  for (const must of [/card\?\.honestLimit/, /\{f\.disclaimer\}/, /What these numbers mean/, /Us versus the sportsbooks/, /Model details/, /<LivePanel/]) {
    assert.match(nfl, must, `NFL game: ${must} stays in Simple`);
  }
  const epl = outside("app/epl/match/[slug]/page.tsx");
  for (const must of [/Not validated out of sample/i, /no lineup, injury or team-news input/, /Over \/ under ladder/, /The ten likeliest scorelines/]) {
    assert.match(epl, must, `EPL match: ${must} stays in Simple`);
  }
  const ufc = outside("app/ufc/bout/[boutId]/page.tsx");
  assert.match(ufc, /Educational and paper-only/, "UFC bout: the paper-only line stays in Simple");
  // A claim never travels without its receipt: the UFC method claim and the held-out evidence share one block.
  const ufcBlocks = analystBlocks([path.join(SRC, "app/ufc/bout/[boutId]/page.tsx")]);
  assert.ok(ufcBlocks.some((b) => /beat its baseline/.test(b.body) && /<EvidenceRow/.test(b.body)), "UFC: the claim and its receipt are hidden or shown together");
});
