/**
 * NBA postgame evaluation component — renderToStaticMarkup over the real 10-20 report and synthetic states, the 320px
 * layout rules, design tokens only, and client safety (the component's import graph reaches no node: module).
 * Run (from app/): npx tsx --test src/components/nba/postgame-evaluation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: NbaPostgameEvaluation } = await import("./postgame-evaluation.tsx");
const { buildPostgameEvaluation } = await import("../../lib/sports/nba/postgame-evaluation.mjs");
const { loadInputs } = await import("../../../scripts/nba/nba-postgame-evaluation.mjs");
const F = await import("../../lib/sports/nba/__fixtures__/postgame-fixtures.mjs");

const APP = process.cwd();
const COMPONENT = path.join(APP, "src", "components", "nba", "postgame-evaluation.tsx");
const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const real = buildPostgameEvaluation({ date: "2026-10-20", generatedAt: "2026-10-21T12:00:00Z", ...loadInputs("2026-10-20") });

test("real 10-20: official result lines, per-model table with the n-caveat, role labels, pending box scores", () => {
  const h = html(React.createElement(NbaPostgameEvaluation, { report: real }));
  const t = text(h);
  assert.match(t, /Forecast vs actual · 2026-10-20/);
  assert.match(t, /Official winner side matched the actual winner in 1 of 3 graded games\./);
  assert.match(t, /3 graded games: the sample supports no model comparison \(fewer than 30\)\. Scores are reported, not ranked\./);
  assert.match(t, /Lower log loss and lower Brier are better\./);
  // One result line per game, each with the frozen pre-tip time.
  assert.equal((h.match(/<li data-state="GRADED"/g) ?? []).length, 3);
  assert.match(t, /Official side \(Elo\): Detroit Pistons · actual winner: Detroit Pistons \(BOS 113, DET 121\) · matched/);
  assert.match(t, /Official side \(Elo\): San Antonio Spurs · actual winner: Oklahoma City Thunder \(OKC 116, SA 104\) · missed/);
  assert.match(t, /Frozen Oct 20, 8:29 AM ET, before the Oct 20, 3:00 PM ET tip-off/);
  // Per-model table: the numbers are the report's.
  assert.match(h, /data-model="elo"><td[^>]*>Elo team rating.*?<\/td><td>.*?<\/td><td>3<\/td><td>0\.3559<\/td><td>0\.9382<\/td>/);
  assert.match(h, /data-model="v1"><td[^>]*>v1 coherent simulation.*?<td>0\.3355<\/td><td>0\.8839<\/td>/);
  assert.match(h, /data-model="possession-sim-v0">.*?<td>—<\/td><td>—<\/td><td>—<\/td>/);
  // Roles.
  assert.equal((h.match(/data-role="OFFICIAL"/g) ?? []).length >= 2, true);
  assert.match(t, /Supporting · research only/);
  assert.match(t, /Research only/);
  // Box scores for 10-20 are not committed: every player-capable model reads pending, dashes not zeros.
  if (real.models.find((m) => m.id === "v0.1").players.state === "PENDING_BOXSCORE") {
    assert.match(h, /data-player-state="PENDING_BOXSCORE" data-model="v0\.1"/);
    assert.match(t, /Box score pending — not graded/);
    assert.match(t, /Box score pending for 3 games: shown as a dash, never as zero\./);
    assert.doesNotMatch(h, /<tr data-state="PENDING_BOXSCORE"><td>Points<\/td><td>0<\/td>/);
  }
  // No win probability, no percentage, no beats / outperforms.
  assert.doesNotMatch(t, /0\.5955|0\.7781|\d%|\bbeats?\b|outperform/i);
  assert.match(t, /Team scores, margin and total are withheld/);
});

test("synthetic HELD, PENDING_FINAL and frozen-after-tip games render their own words", () => {
  const ids = ["401901822", "900001", "900002"];
  const games = [F.synthGame({ id: ids[0] }), F.synthGame({ id: ids[1] }), F.synthGame({ id: ids[2], frozenAt: `${F.DATE}T23:30:00Z` })];
  const r = buildPostgameEvaluation({ date: F.DATE, forecasts: { "v0.1": F.synthDoc("v0.1", games) }, finalsRecord: F.synthRecord([F.synthFinal(ids[0]), F.synthFinal(ids[2])]) });
  const h = html(React.createElement(NbaPostgameEvaluation, { report: r }));
  const t = text(h);
  assert.match(h, /data-state="HELD"/);
  assert.match(t, /Held — not graded\. HELD: the finals record holds a conflicting later observation/);
  assert.match(h, /data-state="PENDING_FINAL"/);
  assert.match(t, /final pending — not graded/);
  assert.match(h, /data-state="REFUSED_FROZEN_AFTER_TIP"/);
  assert.match(t, /Not graded\. frozen .* is not before tip/);
  assert.match(t, /0 graded games: the sample supports no model comparison/);
});

test("a null or malformed report renders nothing", () => {
  assert.equal(html(React.createElement(NbaPostgameEvaluation, { report: null })), "");
  assert.equal(html(React.createElement(NbaPostgameEvaluation, { report: {} })), "");
});

test("320px: no fixed widths; every table scrolls inside its own container", () => {
  const h = html(React.createElement(NbaPostgameEvaluation, { report: real }));
  const src = fs.readFileSync(COMPONENT, "utf8");
  assert.doesNotMatch(src, /\b(min-)?w-\[\d+(px|rem)\]|\bwidth:\s*\d|\bminWidth\b|\bw-(64|72|80|96)\b/);
  const tables = h.split("<table").length - 1;
  assert.ok(tables >= 2);
  const wrapped = h.match(/<div class="overflow-x-auto max-w-full" data-table="[a-z]+"><table/g) ?? [];
  assert.equal(wrapped.length, tables);
});

test("design tokens only: no colour literal in the component or the module", () => {
  const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,[^)]*\)/;
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const f of [COMPONENT, path.join(APP, "src", "lib", "sports", "nba", "postgame-evaluation.mjs")]) {
    assert.doesNotMatch(strip(fs.readFileSync(f, "utf8")), COLOR, f);
  }
  const h = html(React.createElement(NbaPostgameEvaluation, { report: real }));
  for (const v of h.matchAll(/var\(--([a-z0-9-]+)\)/g)) assert.match(v[1], /^vault-/);
});

/** Every module reachable from `file` through static imports (relative or "@/"). */
function importGraph(file, seen = new Map()) {
  if (seen.has(file)) return seen;
  const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specs = [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2]);
  seen.set(file, specs);
  for (const s of specs) {
    let target = null;
    if (s.startsWith("@/")) target = path.join(APP, "src", s.slice(2));
    else if (s.startsWith(".")) target = path.resolve(path.dirname(file), s);
    if (target && fs.existsSync(target)) importGraph(target, seen);
  }
  return seen;
}

const NODE = /^node:|^(fs|path|crypto|child_process|os|url|http|https|net)$/;
const nodeImportsOf = (g) => [...g.entries()].flatMap(([f, specs]) => specs.filter((s) => NODE.test(s)).map((s) => `${path.relative(APP, f)} → ${s}`));

test("client safety: the component imports only the vocabulary module, whose graph reaches no node: module", () => {
  const g = importGraph(COMPONENT);
  const files = [...g.keys()].map((f) => path.relative(APP, f));
  assert.ok(files.includes("src/lib/sports/nba/postgame-evaluation-vocab.mjs"), "the component reads the shared vocabulary");
  assert.deepEqual(nodeImportsOf(g), []);
  // The builder is server/CLI-only: since grader v2 (PR 1154) grader-metrics reaches node:crypto through
  // experimental-grading-ledger → forecast-receipt. So the component must never import it — pinned here.
  assert.ok(!files.includes("src/lib/sports/nba/postgame-evaluation.mjs"), "the component must not import the server-only builder");
  const builder = importGraph(path.join(APP, "src", "lib", "sports", "nba", "postgame-evaluation.mjs"));
  assert.ok(nodeImportsOf(builder).some((x) => /forecast-receipt\.mjs → node:crypto/.test(x)), "if this changes, the builder may become client-safe; revisit");
  // The vocabulary module imports nothing at all.
  assert.deepEqual(importGraph(path.join(APP, "src", "lib", "sports", "nba", "postgame-evaluation-vocab.mjs")).values().next().value, []);
});
