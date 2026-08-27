/**
 * Colour-literal scanner (P210 · Release A) — ONE implementation shared by the exception registry
 * guard. Comments stripped (the denial trap), test files skipped, literals whitespace-normalised.
 * Deliberately simple and deterministic: same inputs → same counts.
 */
import fs from "node:fs";
import path from "node:path";

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,[^)]*\)/g;

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** @returns {Map<string, string[]>} repo-relative file → normalised literals (one entry per hit) */
export function scanColorLiterals(appRoot = process.cwd()) {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        walk(p);
      } else if (/\.(tsx|ts|mjs|css)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.includes(".mutation-probe.")) {
        /* ^ mutation probes create TRANSIENT sibling copies (gitignored) while the suite runs; a
           concurrent scan must never count a file that exists only for the seconds a probe lives. */
        const hits = [...strip(fs.readFileSync(p, "utf8")).matchAll(COLOR)].map((m) => m[0].replace(/\s+/g, ""));
        if (hits.length) out.set(path.relative(appRoot, p), hits);
      }
    }
  };
  walk(path.join(appRoot, "src"));
  return out;
}
