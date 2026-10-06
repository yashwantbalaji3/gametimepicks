/**
 * RESEARCH HOME (2026-10-05) — built-export guards. Post-build phase: reads out/.
 *
 *  RHB1 /research/ links every team research page and every Research tool, every link resolves, no stale beta copy
 *  RHB2 team forecast history appears exactly for teams the Forecast Ledger holds rows for, with every row rendered
 *  RHB3 player forecast history links games, and every such link is a page this export serves
 *
 * Run (after `npm run build`): npx tsx --test src/lib/research-pages/research-home-built.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out");
const ROOT = path.join(APP, "..");
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "data/research-projection/v1/index.json"), "utf8")).entries;
const htmlOf = (p) => fs.readFileSync(path.join(OUT, p.replace(/^\//, ""), "index.html"), "utf8");
const exists = (p) => fs.existsSync(path.join(OUT, p.replace(/^\//, ""), "index.html")) || fs.existsSync(path.join(OUT, p.replace(/^\//, "")));
const mainOf = (html) => /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? "";
const historyOf = (html) => /<section aria-labelledby="forecast-history"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'");

const ledgerCounts = (() => {
  const dir = path.join(ROOT, "data/internal/forecast-ledger/v1");
  const n = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const id = JSON.parse(line).subjectId;
      n.set(id, (n.get(id) ?? 0) + 1);
    }
  }
  return n;
})();

test("RHB1 /research/ is the Research directory and every link on it resolves", () => {
  assert.ok(fs.existsSync(OUT), "run after `npm run build` (post-build phase)");
  const main = mainOf(htmlOf("/research/"));
  const hrefs = new Set([...main.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]));
  for (const t of ["/research/lab/", "/compare/", "/results/forecasts/", "/models/", "/ask/"]) assert.ok(hrefs.has(t), `missing tool link ${t}`);
  const teams = index.filter((e) => e.kind === "team");
  assert.ok(teams.length >= 80, `teams: ${teams.length}`);
  for (const e of teams) assert.ok(hrefs.has(e.path), `team directory misses ${e.path}`);
  for (const h of hrefs) assert.ok(exists(h), `/research/ links to ${h}, which this export does not serve`);
  const text = decode(main.replace(/<[^>]+>/g, " "));
  for (const stale of ["Public Beta", "30 qualifying", "observation dates"]) assert.ok(!text.includes(stale), stale);
  for (const leak of ["noindex", "ESPN", "data/internal", "research-projection"]) assert.ok(!main.includes(leak), leak);
});

test("RHB2 team forecast history appears exactly where the ledger holds that team's rows, all rows rendered", () => {
  let withHistory = 0;
  let without = 0;
  for (const e of index.filter((x) => x.kind === "team")) {
    const html = htmlOf(e.path);
    const sec = historyOf(html);
    const n = ledgerCounts.get(e.id) ?? 0;
    assert.equal(Boolean(sec), n > 0, `${e.path}: history section ⇔ ledger rows (${n})`);
    if (!sec) { without += 1; continue; }
    withHistory += 1;
    assert.match(decode(sec), new RegExp(`Our forecasts for ${e.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    const bodyRows = (sec.match(/<tr>/g) ?? []).length - (sec.match(/<thead>/g) ?? []).length;
    assert.equal(bodyRows, n, `${e.path}: every ledger row is on the page`);
  }
  assert.ok(withHistory >= 32 && without > 0, `non-vacuous: ${withHistory} with, ${without} without`);
});

test("RHB3 player forecast history links games, only to pages this export serves, and keeps older rows", () => {
  let linked = 0;
  let collapsed = 0;
  for (const e of index.filter((x) => x.kind === "player" && (ledgerCounts.get(x.id) ?? 0) > 0)) {
    const sec = historyOf(htmlOf(e.path));
    assert.ok(sec, `${e.path}: ledger rows but no history section`);
    for (const m of sec.matchAll(/href="(\/[^"#?]*)(#[^"]*)?"/g)) {
      if (m[1].startsWith("/results/forecasts/")) continue;
      assert.ok(exists(m[1]), `${e.path} → ${m[1]}`);
      linked += 1;
    }
    const n = ledgerCounts.get(e.id);
    const bodyRows = (sec.match(/<tr>/g) ?? []).length - (sec.match(/<thead>/g) ?? []).length;
    assert.equal(bodyRows, n, `${e.path}: every ledger row is on the page`);
    if (n > 8) { assert.match(sec, /<details/, `${e.path}: older rows collapsed, not dropped`); collapsed += 1; }
  }
  assert.ok(linked > 100, `game links in forecast history: ${linked}`);
  assert.ok(collapsed > 0, "a subject with more than 8 rows exists (non-vacuous)");
});
