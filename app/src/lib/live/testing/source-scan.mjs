/**
 * Source-scanning helper for the Live guard suites. TEST UTILITY — no app code imports this.
 *
 * WHY IT EXISTS. Two guard suites needed the same thing and the naive version is wrong in two
 * opposite ways, both of which actually fired here:
 *
 *   - a regex over raw text finds the banned token inside the COMMENT that documents the ban
 *     (`safety.test.mjs` failed this way on its first run; `rollout.test.mjs` failed the same way on
 *     `process.env[`, which appears only in a warning comment);
 *   - naive comment-stripping eats the `//` inside a URL string literal.
 *
 * Only tracking string state gets both right, so the scanner lives in one place rather than being
 * re-approximated per suite.
 */

/** Split a source file into executable CODE and rendered STRING literals; comments are discarded. */
export function partition(source) {
  let code = "";
  const strings = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      let lit = "";
      while (j < source.length) {
        if (source[j] === "\\") { lit += source[j + 1] ?? ""; j += 2; continue; }
        if (source[j] === quote) break;
        lit += source[j];
        j += 1;
      }
      strings.push(lit);
      code += quote + quote; // empty placeholder keeps the surrounding code shape intact
      i = j + 1;
      continue;
    }
    code += c;
    i += 1;
  }
  return { code, strings: strings.join("\n") };
}

/** Rendered copy only — string and template literals, comments excluded. */
export function renderedStrings(source) {
  return partition(source).strings;
}

/** Executable code only — comments and string contents excluded. */
export function codeOnly(source) {
  return partition(source).code;
}

/**
 * The text of ONE JSX element, from `<Name` to its closing `/>` or `>`.
 *
 * Scoping a guard to the element it is about is the difference between asserting something real and
 * asserting something about the whole file: `sport={detail.sport}` is correct on `<CompetitionBadge>`
 * and would be a rollout defect on `<LivePanel>`.
 */
export function jsxElement(source, name) {
  const start = source.indexOf(`<${name}`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    else if (source[i] === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return null;
}
