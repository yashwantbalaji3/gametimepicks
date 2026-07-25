/**
 * UNREACHABLE COMPONENT ANALYSIS (Sprint 016 Phase 2 · Phase 1).
 *
 *   npx tsx app/scripts/unreachable-components.mjs [--json]
 *
 * Deleting a file because "grep found no importer" is unsafe: an orphan can be imported by ANOTHER orphan,
 * so a per-file grep keeps a whole dead subtree alive. This instead computes REACHABILITY — it starts at the
 * real entry points (every route page/layout/template/error/not-found, plus next.config/middleware) and
 * transitively follows every import. Anything never reached is genuinely unreachable from the shipped app.
 *
 * It is deliberately CONSERVATIVE — a file is only reported unreachable when all of these hold:
 *   • no static import reaches it from an entry point,
 *   • no dynamic `import("…")` anywhere mentions it,
 *   • no string in src/ or scripts/ mentions its module path (catches next/dynamic and indirection),
 *   • no test file references it.
 * Anything it cannot resolve confidently is treated as REACHABLE (kept), never as dead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(APP, "src");

const walk = (dir, out = [], filter = /\.(tsx|ts)$/) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, filter);
    else if (filter.test(e.name)) out.push(p);
  }
  return out;
};

const ALL = walk(SRC);
const rel = (f) => path.relative(SRC, f);

/** Resolve an import specifier to a real file under src/, or null when it is external. */
function resolve(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // node_modules / bare package
  for (const cand of [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

const importsOf = (file) => {
  const src = fs.readFileSync(file, "utf8");
  const specs = [];
  // static: import … from "x" / export … from "x";  dynamic: import("x")
  for (const re of [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    let m;
    while ((m = re.exec(src))) specs.push(m[1]);
  }
  return specs.map((s) => resolve(s, file)).filter(Boolean);
};

// ── Entry points: everything Next.js renders, plus config that can pull components in ──
const ENTRIES = ALL.filter((f) => {
  const r = rel(f);
  return (
    /^app\/.*\/(page|layout|template|error|not-found|loading|default)\.tsx?$/.test(r) ||
    /^app\/(page|layout|template|error|not-found)\.tsx?$/.test(r) ||
    /^app\/.*\/route\.ts$/.test(r) ||
    /^middleware\.ts$/.test(r)
  );
});

const reachable = new Set();
const stack = [...ENTRIES];
while (stack.length) {
  const f = stack.pop();
  if (reachable.has(f)) continue;
  reachable.add(f);
  for (const dep of importsOf(f)) if (!reachable.has(dep)) stack.push(dep);
}

// ── Corroborating evidence before calling anything dead ──
const TEXT_FILES = [...walk(SRC, [], /\.(tsx|ts|mjs)$/), ...(fs.existsSync(path.join(APP, "scripts")) ? walk(path.join(APP, "scripts"), [], /\.(mjs|ts)$/) : [])];
const corpus = new Map(TEXT_FILES.map((f) => [f, fs.readFileSync(f, "utf8")]));

const unreachable = [];
for (const f of ALL) {
  if (reachable.has(f)) continue;
  const r = rel(f);
  if (/\.test\.(mjs|ts|tsx)$/.test(r)) continue; // tests are entry points of their own
  const moduleName = path.basename(f).replace(/\.(tsx|ts)$/, "");
  const stem = r.replace(/\.(tsx|ts)$/, "");

  // Does ANY file (including tests + scripts) mention this module? If so, keep it.
  //
  // This must be BROAD. An early version required a path separator before the basename, so guard tests that
  // enumerate files by bare name — `["odds-pill", "team-identity", …]` in moonshot-tracker.test.mjs, or
  // `"dual-bank-builder-teaser.tsx"` in no-run-labels.test.mjs — looked like no reference at all, and the
  // script reported protected files as safe to delete. Match the basename with or without its extension,
  // with or without a leading path, anywhere in any quoted string.
  const bare = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentionRe = new RegExp(`["'\`][^"'\`]*\\b${bare}(\\.tsx?)?["'\`]|["'\`]${bare}(\\.tsx?)?["'\`]`);
  let mentions = [];
  for (const [g, text] of corpus) {
    if (g === f) continue;
    if (text.includes(stem) || mentionRe.test(text)) mentions.push(rel(g));
  }
  unreachable.push({ file: r, mentionedBy: mentions });
}

const trulyDead = unreachable.filter((u) => u.mentionedBy.length === 0);
const referencedButUnreachable = unreachable.filter((u) => u.mentionedBy.length > 0);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ entries: ENTRIES.length, reachable: reachable.size, trulyDead, referencedButUnreachable }, null, 2));
} else {
  console.log(`entry points: ${ENTRIES.length} · reachable files: ${reachable.size} / ${ALL.length}`);
  console.log(`\n=== SAFE TO DELETE (unreachable AND unmentioned anywhere): ${trulyDead.length} ===`);
  for (const u of trulyDead) console.log("  " + u.file);
  console.log(`\n=== unreachable but still MENTIONED — do NOT delete without reading: ${referencedButUnreachable.length} ===`);
  for (const u of referencedButUnreachable) console.log(`  ${u.file}  <- ${u.mentionedBy.slice(0, 3).join(", ")}${u.mentionedBy.length > 3 ? ` (+${u.mentionedBy.length - 3})` : ""}`);
}
