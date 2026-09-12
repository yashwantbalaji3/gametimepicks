/**
 * EVERY TOKEN A SURFACE READS MUST EXIST (P270).
 *
 * A colour set from `--gtp-bank-cta` was written in fifteen files and that token was never defined anywhere.
 * CSS does not complain: an undefined custom property makes the declaration invalid at computed-value
 * time, so `color` silently becomes `inherit` and the link renders in body text. Twenty-five accent
 * links across the site had been indistinguishable from ordinary prose since the day they shipped,
 * and every existing guard passed — the ratchet counts raw colour literals, the accessibility gate
 * measures the colour that actually rendered (body text on the page background, which passes), and a
 * screenshot looks plausible because the page is not broken, only flat.
 *
 * So the check is the boring one nobody had written: collect what globals.css declares, collect what
 * components assign inline, and fail on any `var(--x)` with no fallback that neither provides.
 *
 * A reference WITH a fallback is not a finding: a fallback is the author saying "this may be absent",
 * which is exactly the contract a caller-provided variable needs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const GLOBALS = path.join(SRC, "app", "globals.css");

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    /* Tests are not surfaces, and this one deliberately contains a probe token that exists nowhere.
       Scanning them would make the guard report its own fixtures as site defects. */
    else if (/\.(tsx?|mjs|css)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) out.push(p);
  }
  return out;
};

/**
 * Every `var(--x, …)` in a text, with its fallback. Paren-balanced, because a fallback is very often
 * `color-mix(…)` or `rgba(…)` and a lazy `[^)]*` stops at the first inner bracket.
 */
export function scanFallbacks(text) {
  const out = [];
  const open = /var\(\s*(--[A-Za-z0-9-]+)\s*,/g;
  let m;
  while ((m = open.exec(text))) {
    let depth = 1, j = open.lastIndex;
    while (j < text.length && depth) {
      if (text[j] === "(") depth += 1;
      else if (text[j] === ")") depth -= 1;
      j += 1;
    }
    if (depth === 0) out.push({ token: m[1], fallback: text.slice(open.lastIndex, j - 1).trim() });
  }
  return out;
}

/** Every token a text reads with NO fallback. Exported shape so the probe below can exercise it. */
export function scanText(text) {
  const out = new Set();
  for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*\)/g)) out.add(m[1]);
  return out;
}

function survey() {
  const files = walk(SRC);
  const declared = new Set();
  const assignedInline = new Set();
  /** token → files that read it with no fallback */
  const read = new Map();

  const css = fs.readFileSync(GLOBALS, "utf8");
  for (const m of css.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) declared.add(m[1]);

  for (const p of files) {
    const t = fs.readFileSync(p, "utf8");
    /* A component may hand a variable to the stylesheet it styles:
         style={{ ["--gtp-tl-size" as string]: "40px" }}   or   { "--x": value }
       That is a definition — at the only place that can know the value. */
    for (const m of t.matchAll(/\[?["'](--[A-Za-z0-9-]+)["']\s*(?:as\s+string\s*\])?\s*\]?\s*:/g)) assignedInline.add(m[1]);
    /* `var(--x)` with nothing after the name: no fallback, so the value has to exist. */
    for (const token of scanText(t)) {
      if (!read.has(token)) read.set(token, new Set());
      read.get(token).add(path.relative(SRC, p));
    }
  }
  return { declared, assignedInline, read };
}

test("no surface reads a design token that does not exist", () => {
  const { declared, assignedInline, read } = survey();
  const missing = [];
  for (const [token, files] of read) {
    if (declared.has(token) || assignedInline.has(token)) continue;
    missing.push(`${token} — read in ${files.size} file(s), e.g. ${[...files].sort()[0]}`);
  }
  assert.deepEqual(
    missing.sort(),
    [],
    `these tokens are read with no fallback and defined nowhere, so every declaration using them is
     dropped and the property falls back to inherit:\n  ${missing.sort().join("\n  ")}`,
  );
});

test("the survey actually looked — a vacuous pass is a failing guard", () => {
  const { declared, read } = survey();
  assert.ok(declared.size > 150, `globals.css should declare the palette; found ${declared.size}`);
  assert.ok(read.size > 100, `components should read it; found ${read.size} tokens read without a fallback`);
  // The two tokens this guard was written for: one that must exist, one that must be reachable.
  assert.ok(declared.has("--gtp-bank-heat"), "the text-safe accent green is the palette's own token");
  assert.ok(read.has("--gtp-bank-heat"), "and surfaces read it directly rather than through a name nothing defines");
});

test("a planted undefined token would be caught", () => {
  /* MUTATION PROBE. The check above passing means nothing unless the scanner actually reports a
     defect, and this defect is invisible on screen — so the probe feeds the scanner both shapes and
     asserts it separates them. */
  const withoutFallback = scanText('style={{ color: "var(--gtp-probe-token)" }}');
  const withFallback = scanText('style={{ color: "var(--gtp-probe-token, #fff)" }}');
  assert.deepEqual([...withoutFallback], ["--gtp-probe-token"], "a bare read must be reported");
  assert.deepEqual([...withFallback], [], "a read with a fallback must not be");
});

test("a token that exists does not also carry a literal snapshot of its old value", () => {
  /* THE DEFECT: `var(--vault-bg, #120b07)` — the token resolves to #070B09, so the brown never
     renders. It is a snapshot of a palette retired months ago, and the next reader believes it.
     Seventy-five of these were removed; the check keeps them gone.

     FONTS ARE EXEMPT ON PURPOSE. A font stack's later entries are what a machine without the first
     face actually uses, and that is a real fallback rather than a dead colour. */
  const { declared } = survey();
  const offenders = [];
  const walkAll = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walkAll(p); continue; }
      if (!/\.(tsx?|mjs|css)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
      for (const { token, fallback } of scanFallbacks(fs.readFileSync(p, "utf8"))) {
        if (!declared.has(token) || token.startsWith("--font")) continue;
        offenders.push(`${path.relative(SRC, p)}: var(${token}, ${fallback.slice(0, 40)})`);
      }
    }
  };
  walkAll(SRC);
  assert.deepEqual(offenders.sort(), [], `these fallbacks can never render — the token is defined:\n  ${offenders.join("\n  ")}`);
});

test("the fallback scanner survives a nested fallback", () => {
  const one = scanFallbacks('background: var(--gtp-card, color-mix(in srgb, var(--x) 40%, transparent));');
  assert.deepEqual(one, [{ token: "--gtp-card", fallback: "color-mix(in srgb, var(--x) 40%, transparent)" }]);
  assert.deepEqual(scanFallbacks("color: var(--only-a-token);"), [], "a bare read has no fallback to report");
});
