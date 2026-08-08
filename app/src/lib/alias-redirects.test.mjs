/**
 * Alias-route redirects must be static-export-safe. Next's server redirect() emits a Next ERROR SHELL
 * under output:export (a broken blank page), so every alias uses the client ClientRedirect instead.
 * Pins the source (ClientRedirect + target) and, when a build exists, that out/ has NO __next_error__ shell.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd(); // app/
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

// Program 143 retired /picks: it and every parlay-era alias now point at the FINAL destination,
// /build#suggested-cards, in ONE hop. Pointing the old aliases through /picks would have made
// them two-hop chains — a second thing to break.
const ALIASES = [
  { route: "games", target: "/simulate/" },
  { route: "picks", target: "/build#suggested-cards" },
  { route: "parlays", target: "/build#suggested-cards" },
  { route: "parlay-lab", target: "/build#suggested-cards" },
  { route: "nba/parlays", target: "/build#suggested-cards" },
  { route: "mlb/parlays", target: "/build#suggested-cards" },
];

test("every alias route uses the client-safe ClientRedirect (never server redirect())", () => {
  for (const { route, target } of ALIASES) {
    const src = read(`src/app/${route}/page.tsx`);
    assert.match(src, /ClientRedirect/, `/${route} uses ClientRedirect`);
    assert.match(src, new RegExp(`to="${target.replace(/\//g, "\\/")}"`), `/${route} redirects to ${target}`);
    assert.ok(!/from "next\/navigation"/.test(src) || !/\bredirect\(/.test(src), `/${route} does not use server redirect()`);
  }
});

test("ClientRedirect actually navigates on the client", () => {
  const c = read("src/components/client-redirect.tsx");
  assert.match(c, /window\.location\.replace/, "replaces the history entry");
  assert.match(c, /"use client"/, "is a client component");
});

test("if a build exists, no alias emits a Next error shell in out/", () => {
  for (const { route } of ALIASES) {
    const html = path.join(APP, "out", route, "index.html");
    if (!fs.existsSync(html)) continue;
    const body = fs.readFileSync(html, "utf8");
    assert.ok(!/__next_error__/.test(body), `out/${route}/index.html must not be a Next error shell`);
  }
});
