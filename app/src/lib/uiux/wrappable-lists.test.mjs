/**
 * A LIST OF LINKS MUST BE ABLE TO WRAP (P291).
 *
 * /results' archive index rendered 67 date links inside one <p>, spaced with `marginRight: 12`. A
 * margin produces a visual gap; it does not produce a BREAK OPPORTUNITY. With no whitespace text node
 * between the anchors the browser saw a single unbreakable token —
 *
 *     2026-09-082026-09-072026-09-062026-09-05…
 *
 * — 67 dates long. The container's `line-height: 2` was waiting for a wrap that could never happen.
 * At 390px the row extended past 5,000px and the page shell's `overflow-x: hidden` clipped it, so 59
 * of 63 archive links were both invisible and unreachable on a phone, with no scrollbar to suggest
 * anything was missing. Measured across every primary route, /results was the only offender — and the
 * page-weight cap that sent older days to their own pages is what made the list long enough to break.
 *
 * The symptom is unambiguous in the shipped HTML: two ISO dates with nothing between them. That is
 * what this checks, over the BUILT export, in the rendered <main> with scripts stripped so neither the
 * RSC payload nor the shared nav can satisfy or trip it.
 *
 * The fix at the render site is a wrapping flex row with `gap`, which is also the house convention:
 * let layout own the spacing rather than per-element margins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT = path.join(APP, "out");

/*
 * EVERY ROUTE THE EXPORT SERVES — not a hand-listed set.
 *
 * The first draft listed routes by hand and omitted /results/nba, which has exactly this pattern. A
 * curated list that someone must remember to extend is the same failure mode as the legal-gate
 * registry that let an unapproved page ship: the check is only as wide as the last person's memory.
 * Walking out/ costs about a second and cannot forget a page.
 */
function allRoutes(dir = OUT, base = "", acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) allRoutes(path.join(dir, e.name), base ? `${base}/${e.name}` : e.name, acc);
    else if (e.name === "index.html") acc.push(base);
  }
  return acc;
}
const ROUTES = fs.existsSync(OUT) ? allRoutes() : [];

function visibleText(route) {
  const file = path.join(OUT, route, "index.html");
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, "utf8");
  const i = html.indexOf("<main");
  const j = html.indexOf("</main>");
  const body = (i >= 0 && j > i ? html.slice(i, j) : html).replace(/<script\b[\s\S]*?<\/script>/g, " ");
  return body
    .replace(/<[^>]+>/g, "")                       // NO space: preserve exactly what the reader sees
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&").replace(/&(?:nbsp|#160);/g, " ");
}

test("the export exists — this phase must fail rather than skip when it cannot look", () => {
  assert.ok(fs.existsSync(OUT), "out/ is missing; build before the post-build phase");
  assert.ok(fs.existsSync(path.join(OUT, "results", "index.html")), "/results is the route this guard exists for");
});

/**
 * THE PROPERTY IS "CAN IT WRAP", NOT "IS THERE WHITESPACE".
 *
 * The first version of this guard failed the FIXED page. It flagged two ISO dates adjacent in the
 * markup — but adjacency is only a defect when the browser has to find a break opportunity inside a
 * text flow. Inside a `flex-wrap` container each child is its own flex item and wraps on its own,
 * whitespace or not, which is exactly what the fix uses and what /results/nba already used.
 *
 * So there are two legitimate mechanisms, and the guard must accept both:
 *   · a wrapping container (flex-wrap / grid), or
 *   · whitespace between the items, giving the text flow somewhere to break.
 * A margin-spaced run of inline anchors in a <p> has neither, and that is the defect.
 */
const WRAPPING_CONTAINER = /(?:flex-wrap|display:\s*grid|\bgrid\b)/;

/** Runs of ≥4 sibling elements whose entire text is an ISO date, with the tag that opens them. */
function dateRuns(html) {
  const runs = [];
  const re = /<(a|span|div|li)\b[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/\1>/g;
  let m, prevEnd = -1, count = 0, startIdx = 0, gluedRun = true;
  while ((m = re.exec(html))) {
    const adjacent = prevEnd >= 0 && m.index - prevEnd <= 1;
    if (adjacent) { count += 1; if (m.index !== prevEnd) gluedRun = false; }
    else {
      if (count >= 4) runs.push({ start: startIdx, count, glued: gluedRun });
      count = 1; startIdx = m.index; gluedRun = true;
    }
    prevEnd = m.index + m[0].length;
  }
  if (count >= 4) runs.push({ start: startIdx, count, glued: gluedRun });
  return runs;
}

/** The innermost container tag opened before `idx`. */
function enclosingTag(html, idx) {
  const before = html.slice(Math.max(0, idx - 1200), idx);
  const tags = [...before.matchAll(/<(?:div|p|ul|ol|section)[^>]*>/g)];
  return tags.length ? tags[tags.length - 1][0] : "";
}

test("every run of date links sits in a container that can wrap", () => {
  let checkedRoutes = 0, checkedRuns = 0;
  for (const route of ROUTES) {
    const file = path.join(OUT, route, "index.html");
    if (!fs.existsSync(file)) continue;
    checkedRoutes += 1;
    const html = fs.readFileSync(file, "utf8");
    const i = html.indexOf("<main");
    const j = html.indexOf("</main>");
    const main = (i >= 0 && j > i ? html.slice(i, j) : html).replace(/<script\b[\s\S]*?<\/script>/g, " ");

    for (const run of dateRuns(main)) {
      checkedRuns += 1;
      if (!run.glued) continue;                       // whitespace-separated: the flow can break
      const container = enclosingTag(main, run.start);
      assert.match(
        container,
        WRAPPING_CONTAINER,
        `/${route}: ${run.count} date items are adjacent with no whitespace inside "${container.slice(0, 90)}" — ` +
        "neither a wrapping container nor a break opportunity, so the row runs off the viewport and is clipped",
      );
    }
  }
  assert.ok(checkedRoutes >= 10, `only ${checkedRoutes} routes readable — the sweep is not covering the site`);
  assert.ok(checkedRuns >= 2, `only ${checkedRuns} date runs found — the guard is measuring nothing`);
});

test("the /results archive index still lists its older days, and they are separated", () => {
  /*
   * The fix must not have solved the wrapping by dropping the list. Both things are required: the
   * links are present, and consecutive ones are separated.
   */
  const file = path.join(OUT, "results", "index.html");
  const html = fs.readFileSync(file, "utf8");
  const i = html.indexOf("<main");
  const j = html.indexOf("</main>");
  const main = (i >= 0 && j > i ? html.slice(i, j) : html).replace(/<script\b[\s\S]*?<\/script>/g, " ");

  const dated = [...main.matchAll(/href="\/results\/date\/(\d{4}-\d{2}-\d{2})\/?"/g)].map((m) => m[1]);
  assert.ok(dated.length >= 10, `only ${dated.length} archive date links — the index lost its contents`);

  /* And the container must be a wrapping row rather than inline links spaced by margin alone. */
  const anchorsGluedByMargin = /<a[^>]+margin-right:\s*12px[^>]*>\d{4}-\d{2}-\d{2}<\/a><a/.test(main);
  assert.equal(anchorsGluedByMargin, false, "the archive links are margin-spaced inline anchors again — a margin is not a break opportunity");
});
