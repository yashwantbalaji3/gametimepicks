/**
 * Phase A-2 · every sport hub follows one order — events first, results before model health — and one page
 * width. Model health is never removed: it is collapsed with every family's state in its summary line.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("🔴 on MLB, UFC and EPL the events lead, and model health comes after results — collapsed, not removed", () => {
  for (const hub of ["mlb", "ufc", "epl"]) {
    const src = code(read(`src/app/${hub}/page.tsx`));
    const games = src.indexOf(`id="${hub}-games"`);
    const results = src.indexOf("<GradedPicksSection");
    const health = src.indexOf("<ModelStatusPanel collapsed");
    assert.ok(games > -1 && results > -1 && health > -1, `${hub}: games, results and model health all render`);
    assert.ok(games < results && results < health, `${hub}: events → … → results → model health`);
    assert.equal((src.match(/<ModelStatusPanel /g) ?? []).length, 1, `${hub}: one model-health panel, not a second copy up top`);
  }
});

test("the collapsed panel keeps every family and its state in the summary line", () => {
  const p = read("src/components/command-center/model-status-panel.tsx");
  const start = p.indexOf("if (collapsed)");
  const collapsed = p.slice(start, p.indexOf("\n  }\n  return (", start));
  assert.match(collapsed, /<summary[\s\S]*items\.map\(\(s\) =>[\s\S]*<ModelStatusChip state=\{s\.state\}/, "states are visible without opening");
  assert.match(collapsed, /<ModelStatusPanel items=\{items\} sportLabel=\{sportLabel\}/, "the full panel is inside the disclosure");
});

test("all four hubs share the one page shell width", () => {
  for (const hub of ["mlb", "nfl", "ufc", "epl"]) assert.match(read(`src/app/${hub}/page.tsx`), /className="vault-page-shell /, `${hub}: shared shell`);
  assert.doesNotMatch(read("src/app/epl/page.tsx"), /max-w-\[1100px\]/, "EPL no longer a narrower document");
});
