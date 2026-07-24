/**
 * DAILY JOURNEY guard (Sprint 004, Phase 5). The consumer loop — Homepage → Today → Game Report → Results →
 * Return — must stay navigable end-to-end. This pins every hop in one place so a future edit can't silently
 * break the loop. Source-grep style (runs pre-build); it asserts links, not layout.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("Homepage → Today: the homepage routes into the daily brief", () => {
  assert.match(read("src/components/home/home-today-mlb.tsx"), /href="\/today"/, "homepage hook links to /today");
  assert.match(read("src/app/page.tsx"), /<HomeTodayMlb\b/, "homepage renders the daily-MLB hook");
});

test("Today → Game Report: the brief + slate rows link to canonical /games/<sport>/<slug> reports", () => {
  // The report href is built canonically in the shared libs and rendered via g.href in the components.
  assert.match(read("src/lib/today/daily-brief.ts"), /`\/games\/\$\{d\.sport\}\/\$\{d\.slug\}`/, "brief builds canonical report hrefs");
  assert.match(read("src/lib/today/slate-games.ts"), /availability\.canonicalHref/, "slate rows carry the canonical report href");
  assert.match(read("src/components/today/today-mlb-brief.tsx"), /href=\{spotlight\.href\}/, "brief spotlight links to its report");
});

test("Today → Results: the hub links to the settled recap", () => {
  assert.match(read("src/components/today/status-modules.tsx"), /href="\/results"/, "today links to /results");
});

test("Results → Today (Return): the recap routes back to today's slate", () => {
  assert.match(read("src/app/results/page.tsx"), /href="\/today\/?"/, "results links back to /today");
  assert.match(read("src/app/results/page.tsx"), /See today(&apos;|')s slate/, "explicit return action");
});

test("the loop is closed: every hop of Homepage→Today→Report→Results→Today is present", () => {
  const hops = [
    ["src/components/home/home-today-mlb.tsx", /href="\/today"/],
    ["src/lib/today/daily-brief.ts", /\/games\/\$\{d\.sport\}/],
    ["src/components/today/status-modules.tsx", /href="\/results"/],
    ["src/app/results/page.tsx", /href="\/today\/?"/],
  ];
  for (const [file, re] of hops) assert.match(read(file), re, `loop hop present in ${file}`);
});
