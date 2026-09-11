/**
 * The analytics switches must be written as LITERAL `process.env.NEXT_PUBLIC_…` references (P256).
 *
 * Next.js replaces only literal references when it builds the browser bundle. An alias
 * (`const e = process.env; e.NEXT_PUBLIC_ANALYTICS_ENABLED`) compiles fine, passes every unit test that
 * injects its own env, and ships a sink that is a no-op in every browser — which is exactly what
 * production shipped until P256 switched analytics on and found an empty store.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");
const sink = fs.readFileSync(path.join(SRC, "lib/analytics/sink.ts"), "utf8");

test("the sink reads both switches literally, so the build can inline them", () => {
  assert.match(sink, /process\.env\.NEXT_PUBLIC_ANALYTICS_ENABLED\b/);
  assert.match(sink, /process\.env\.NEXT_PUBLIC_ANALYTICS_ENDPOINT\b/);
});

test("no browser-facing file reads a NEXT_PUBLIC_ variable through an alias of process.env", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]));
  const offenders = [];
  for (const f of walk(SRC).filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !/\.test\./.test(f))) {
    // comments stripped (an explanatory comment quoting the bad form is not the bad form)
    const s = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // an alias bound to the BARE process.env object (not process.env.SOMETHING), then a NEXT_PUBLIC_ read off it
    const alias = /(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*\bprocess\.env\b(?!\.)/.exec(s);
    if (!alias) continue;
    const viaAlias = new RegExp(`\\b${alias[1]}\\.NEXT_PUBLIC_\\w+`).test(s);
    if (viaAlias) offenders.push(path.relative(SRC, f));
  }
  assert.deepEqual(offenders, [], `NEXT_PUBLIC_ read through an alias (never inlined in the browser): ${offenders.join(", ")}`);
});

test("probe: the pre-P256 line is exactly what the guard rejects", () => {
  const old = 'const e = env ?? (typeof process !== "undefined" && process.env ? process.env : {});\nconst flag = e.NEXT_PUBLIC_ANALYTICS_ENABLED;';
  const alias = /(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*\bprocess\.env\b(?!\.)/.exec(old);
  assert.ok(alias && new RegExp(`\\b${alias[1]}\\.NEXT_PUBLIC_\\w+`).test(old), "the old alias form is caught");
});
