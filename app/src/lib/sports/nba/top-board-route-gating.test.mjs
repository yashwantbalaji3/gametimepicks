/**
 * NBA Top Boards stay PRIVATE — the route is internal, pruned from the export, and nothing public can reach the board
 * code. NBA stays HISTORICAL_ONLY; the public-state switch is OFF.
 *
 * Run (from app/): node --test src/lib/sports/nba/top-board-route-gating.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ROUTE_TABLE } from "../../audits/route-inventory.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const PAGE = "src/app/preview/nba/boards/page.tsx";
const COMPONENT = "src/components/nba/top-board.tsx";
const TABLE = "src/components/nba/top-board-table.tsx";
const BOARD_MODULES = [COMPONENT, TABLE, "src/lib/sports/nba/top-boards.mjs", "src/lib/sports/nba/top-board-grading.mjs", "src/lib/sports/nba/top-board-report.mjs", "src/lib/sports/nba/top-board-rows.mjs", "src/lib/sports/nba/top-board-evaluation.mjs"];

test("the preview page is guarded (404 in the production export), noindex, and carries the private banner", () => {
  const src = read(PAGE);
  assert.match(src, /import \{ guardInternalRoute \} from "@\/lib\/internal-route-guard"/);
  assert.match(src, /export default function [A-Za-z]+\(\) \{\s*guardInternalRoute\(\);/, "guard is the first statement");
  assert.match(src, /robots: \{ index: false, follow: false \}/);
  assert.match(src, /PRIVATE PREVIEW — shadow model, not validated, not published/);
  const guard = read("src/lib/internal-route-guard.ts");
  assert.match(guard, /NODE_ENV === "production" && !exposed/);
  assert.match(guard, /NEXT_PUBLIC_INTERNAL_ROUTES === "1"/);
});

test("the route is classified internal and its whole tree is pruned from out/", () => {
  assert.equal(ROUTE_TABLE["/preview/nba/boards"]?.classification, "internal");
  const prune = read("scripts/prune-internal-routes.mjs");
  assert.match(prune.match(/const INTERNAL_ROUTES = \[([^\]]*)\]/)?.[1] ?? "", /"preview"/, "out/preview/ (HTML, RSC and chunks) is deleted");
  assert.match(JSON.parse(read("package.json")).scripts.build, /prune-internal-routes/);
});

/* The static import closure of every page/layout/route OUTSIDE the internal trees (ops, launch, preview). */
const SRC_FILES = fs.readdirSync(path.join(APP, "src"), { recursive: true }).filter((f) => /\.(m?[jt]sx?)$/.test(f)).map((f) => `src/${f.split(path.sep).join("/")}`);
const SRC_SET = new Set(SRC_FILES);
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  for (const c of [base, ...[".ts", ".tsx", ".mjs", ".js", ".jsx"].map((e) => base + e), ...["ts", "tsx", "mjs", "js"].map((e) => `${base}/index.${e}`)]) if (SRC_SET.has(c)) return c;
  return null;
}
function publicClosure() {
  const entries = SRC_FILES.filter((f) => /^src\/app\//.test(f) && /\/(page|layout|route|template|not-found|error|loading|opengraph-image|sitemap|robots|manifest)\.(m?[jt]sx?)$/.test(f) && !/^src\/app\/(ops|launch|preview)\//.test(f));
  const seen = new Set(entries); const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    for (const m of fs.readFileSync(path.join(APP, f), "utf8").matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
      const r = resolveImport(f, m[1]);
      if (r && !seen.has(r)) { seen.add(r); stack.push(r); }
    }
  }
  return seen;
}

test("no public route can reach the board component or the board/grading/report modules", () => {
  const reach = publicClosure();
  assert.ok(reach.size > 100 && reach.has("src/app/page.tsx") && reach.has("src/app/nba/page.tsx"), "positive control: the walk found the public site, incl. /nba");
  for (const m of BOARD_MODULES) assert.ok(!reach.has(m), `${m} is reachable from a public route`);
  // and the probe works: the preview page itself does reach them
  assert.match(read(PAGE), /@\/components\/nba\/top-board/);
});

test("NBA stays HISTORICAL_ONLY and the board's public switch is OFF", () => {
  const reg = read("src/lib/sport-capability-registry.ts");
  assert.match(reg, /key: "nba",\s*label: "NBA",\s*state: "HISTORICAL_ONLY",/, "registry NBA entry is HISTORICAL_ONLY");
  assert.match(read(COMPONENT), /export const NBA_TOP_BOARD_PUBLIC_STATE: "OFF" \| "EXPERIMENTAL" = "OFF";/);
});

test("the component says 'No market line — model projection only' and never prints odds, an edge or an over/under probability", () => {
  const src = read(COMPONENT).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /No market line — model projection only/);
  const rendered = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(" ");
  assert.doesNotMatch(rendered, /\b(over probability|under probability|implied|edge:|value bet|best bet|lock|\+EV)\b/i);
  assert.doesNotMatch(src, /\b(odds|moneyline)\s*[:=]\s*[-+]?\d/i);
});

test("if a public build exists, out/ holds no NBA board route or chunk", () => {
  const out = path.join(APP, "out");
  if (!fs.existsSync(path.join(out, "index.html"))) return; // no build in this run — the prune is pinned above
  if (process.env.NEXT_PUBLIC_INTERNAL_ROUTES === "1") return; // an intentional internal build keeps it
  assert.ok(!fs.existsSync(path.join(out, "preview", "nba")), "out/preview/nba must be absent");
  assert.ok(!fs.existsSync(path.join(out, "_next", "static", "chunks", "app", "preview")), "the preview chunks must be absent");
});

test("the board table prints price columns only as 'No authorized NBA price' and never imports the evaluator or a price", () => {
  const src = read(TABLE).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /No authorized NBA price/);
  assert.doesNotMatch(src, /market-evaluator|top-board-evaluation|evaluateMarket/, "the client table never evaluates");
  assert.doesNotMatch(src, /\b(odds|moneyline|line|edge)\s*[:=]\s*[-+]?\d/i);
  // the page passes no price/evaluation today — every cell is NO_AUTHORIZED_PRICE
  const page = read(PAGE).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(page, /boardTableModel\(doc\)/);
  assert.doesNotMatch(page, /evaluations\s*:/);
  assert.doesNotMatch(page, /top-board-evaluation/);
  const rows = read("src/lib/sports/nba/top-board-rows.mjs");
  assert.doesNotMatch(rows, /from "[^"]*market-evaluator/, "the row view model is evaluator-free (client-safe)");
});
