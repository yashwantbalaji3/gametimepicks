/**
 * The shared date/sport control family — one implementation, rendered from the built export.
 *
 * P216 shipped the URL owner and migrated six hand-built links to it; the CONTROLS stayed put, so
 * /simulate kept ~55 lines of inline prev/next/picker and every other date-capable surface had
 * none. An owner nothing renders is a contract with one consumer.
 *
 * These assert against `out/` rather than the source, because two of the three defects this
 * migration produced were invisible in the source and obvious in the built HTML.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const SRC = path.join(APP, "src");

const built = (rel) => {
  const p = path.join(OUT, rel, "index.html");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

test("SSR PARITY · the sport chips are in the prerendered HTML, not only after hydration", () => {
  /*
   * The first swap put the chips inside the Suspense boundary and they vanished from the
   * prerendered page entirely — a real capability loss, caught by diffing the built output against
   * what the inline implementation produced, not by looking at a screen. The server has no query
   * string, so the fallback renders them with "All" active, which is what the old code did too.
   */
  const html = built("simulate");
  if (!html) return;
  assert.match(html, /aria-label="Sport filter"/, "the chip row must be server-rendered");
  assert.match(html, /All ·/, "the All chip must be present before hydration");
});

test("SSR PARITY · the date bar keeps the surface's own accessible name", () => {
  const html = built("simulate");
  if (!html) return;
  // Genericising this to "Date" would quietly downgrade the page's a11y tree, so a surface passes
  // its own label and this pins that /simulate still does.
  assert.match(html, /aria-label="Simulation date"/);
});

test("the built date links are canonical and come from the owner", () => {
  const html = built("simulate");
  if (!html) return;
  const hrefs = [...html.matchAll(/href="(\/simulate\/d\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, "the date bar links somewhere");
  for (const h of hrefs) {
    assert.match(h, /^\/simulate\/d\/\d{4}-\d{2}-\d{2}\/$/, `${h} is not the canonical dated form`);
  }
});

test("NO SECOND CONTROL FAMILY · no surface rolls its own date bar or sport chips", () => {
  /*
   * The companion to the URL-ownership guard. That one stops a surface BUILDING a date url; this
   * one stops it building the control that renders one — which is how six private routers appeared
   * in the first place.
   */
  const OWNER = path.join(SRC, "components/nav/date-sport-controls.tsx");

  /*
   * SANCTIONED EXCEPTIONS — shrink-only, each with a removal condition.
   *
   * /projections carries a second control family AND a second date convention: it keeps both date
   * and sport in the query string (`?date=&sport=&game=`), where the canonical owner models the
   * date as a path segment. Migrating it needs the owner to gain a `query` date mode and the whole
   * four-step interactive experience to be re-verified, which is more than this release should
   * carry — so it is registered here with its condition rather than hidden by a looser regex.
   *
   * Removal condition: WS1 adds `dateMode: "query"` to lib/nav/date-sport-route, registers
   * `projections`, and migrates the component; then this entry goes and the count drops to zero.
   */
  const SANCTIONED = new Set(["components/projections-experience.tsx"]);
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.tsx$/.test(e.name) || full === OWNER) continue;
      const src = fs.readFileSync(full, "utf8");
      const blank = (m) => m.replace(/[^\n]/g, " ");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
      for (const [i, line] of code.split("\n").entries()) {
        if (/aria-label="Sport filter"/.test(line) || /aria-label="Simulation date"/.test(line)) {
          // A caller PASSING the label is fine; only rendering the control itself is not.
          const rel = path.relative(SRC, full);
          if (!/navLabel=/.test(line) && !SANCTIONED.has(rel)) offenders.push(`${rel}:${i + 1}`);
        }
      }
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, [],
    `these render their own date/sport control — use components/nav/date-sport-controls:\n  ${offenders.join("\n  ")}`);

  // The exception list may only shrink. A new entry here is a new second family, which is the
  // thing this guard exists to stop.
  assert.ok(SANCTIONED.size <= 1, `sanctioned exceptions must shrink, found ${SANCTIONED.size}`);
});

test("THE COUNT COMES FROM THE OWNER, not from the control's own arithmetic", () => {
  /*
   * A surface that computes its own total is a second opinion about the day. The control accepts
   * `totalCount` and only falls back to summing when a caller has no owner-supplied number — and
   * /simulate, which has one, must pass it.
   */
  const ctrl = fs.readFileSync(path.join(SRC, "components/nav/date-sport-controls.tsx"), "utf8");
  assert.match(ctrl, /totalCount \?\? sports\.reduce/, "the owner's total wins over the local sum");

  const sim = fs.readFileSync(path.join(SRC, "components/simulate/simulate-day.tsx"), "utf8");
  assert.match(sim, /totalCount=\{view\.totals\.events\}/, "/simulate must pass the day-view's own total");
});

test("the Suspense fallback contains no hook — otherwise it cannot be a fallback", () => {
  /*
   * `useSearchParams` opts a route into client bailout, and this export is statically prerendered.
   * The first fix put the boundary in place but had the fallback render the same hook-using
   * component, so every /simulate page still failed to prerender. The date bar and the chips are
   * both hook-free for exactly this reason.
   */
  const src = fs.readFileSync(path.join(SRC, "components/nav/date-sport-controls.tsx"), "utf8");
  for (const fn of ["function DateBar(", "function SportChips("]) {
    const start = src.indexOf(fn);
    assert.ok(start > 0, `${fn} must exist as a hook-free component`);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    assert.doesNotMatch(body, /useSearchParams\(/, `${fn} must not read the query string`);
  }
});

test("A SURFACE NAMES ITS OWN DEFAULT DAY — Results' default is not today", () => {
  /*
   * The first adoption rendered "Today · Wed, Aug 26" on a page showing Aug 26's SETTLED results,
   * because the control assumed every surface's default day is today. Results defaults to the newest
   * settled date, which is by definition not today, and calling it today is simply wrong on the one
   * page whose whole subject is the past.
   */
  const settled = fs.readdirSync(path.join(OUT, "results", "date"), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort().at(-1);
  if (!settled) return;
  const html = built(path.join("results", "date", settled));
  if (!html) return;
  const nav = /<nav[^>]*aria-label="Settled date"[\s\S]*?<\/nav>/.exec(html);
  assert.ok(nav, "the results date page uses the shared family");
  assert.match(nav[0], /Latest ·/, "the newest settled date is 'Latest', not 'Today'");
  assert.doesNotMatch(nav[0], /Today ·/, "no page may call a settled date today");
});

test("the results date page gained a picker it never had", () => {
  // Prev/next alone meant reaching a date three weeks back took three weeks of clicks.
  const settled = fs.readdirSync(path.join(OUT, "results", "date"), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort().at(-1);
  if (!settled) return;
  const html = built(path.join("results", "date", settled));
  if (!html) return;
  const nav = /<nav[^>]*aria-label="Settled date"[\s\S]*?<\/nav>/.exec(html);
  assert.ok(nav && (nav[0].match(/<option/g) ?? []).length > 10, "every settled date is reachable in one step");
});
