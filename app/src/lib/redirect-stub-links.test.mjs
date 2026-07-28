/**
 * Sprint 036 — internal links must not route users through a redirect stub.
 *
 * Four routes are pure client-redirect stubs kept so old and bookmarked links never break:
 *   /parlay-lab -> /picks · /parlays -> /picks · /nba/parlays -> /picks · /games -> /simulate
 *
 * Under `output: "export"` a stub is a REAL HTML page: the browser loads it, hydrates, then bounces.
 * That is the right cost to pay for an inbound link from outside. It is pure waste for a link we
 * control — 12 internal links were pointing at stubs, including four "All games" links on the game
 * report, one of the most-visited surfaces.
 *
 * The stubs themselves are deliberately KEPT. This guard is about not sending our own users through
 * them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();

/** stub route -> where it actually goes */
const STUBS = {
  "/parlay-lab": "/picks",
  "/parlays": "/picks",
  "/nba/parlays": "/picks",
  "/games": "/simulate",
};

/** The stub's own page.tsx is allowed to mention itself; nothing else is. */
const OWN_PAGE = {
  "/parlay-lab": "src/app/parlay-lab/page.tsx",
  "/parlays": "src/app/parlays/page.tsx",
  "/nba/parlays": "src/app/nba/parlays/page.tsx",
  "/games": "src/app/games/page.tsx",
};

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const FILES = [...walk(path.join(APP, "src/app")), ...walk(path.join(APP, "src/components"))];

test("no internal link points at a redirect stub", () => {
  const offenders = [];

  for (const [stub, target] of Object.entries(STUBS)) {
    const own = path.join(APP, OWN_PAGE[stub]);
    // `/games` must not match `/games/mlb/...`; require the href to END at the stub.
    const pattern = new RegExp(`href=(?:"${stub}/?"|\\{"${stub}/?"\\})|href:\\s*"${stub}/?"`, "g");

    for (const file of FILES) {
      if (file === own) continue;
      const src = fs.readFileSync(file, "utf8");
      if (pattern.test(src)) {
        offenders.push(`${path.relative(APP, file)} -> ${stub} (should be ${target})`);
      }
      pattern.lastIndex = 0;
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Internal links are routing users through a redirect stub, costing a load + bounce:\n  ` +
      `${offenders.join("\n  ")}\n\n  FIX: point the href at the canonical target. Leave the stub route ` +
      `itself in place — it exists for inbound links we do not control.`,
  );
});

test("the stubs themselves still exist, so external links keep working", () => {
  for (const [stub, target] of Object.entries(STUBS)) {
    const own = path.join(APP, OWN_PAGE[stub]);
    assert.ok(fs.existsSync(own), `${stub}: the stub must NOT be deleted — external links depend on it`);
    const src = fs.readFileSync(own, "utf8");
    assert.match(
      src,
      new RegExp(target.replace("/", "\\/")),
      `${stub}: must still redirect to ${target}`,
    );
  }
});

test("MUTATION · a reintroduced stub link is caught", () => {
  // Proves the guard fails rather than passing vacuously.
  const pattern = new RegExp(`href=(?:"/parlay-lab/?"|\\{"/parlay-lab/?"\\})|href:\\s*"/parlay-lab/?"`);
  assert.ok(pattern.test('<Link href="/parlay-lab">x</Link>'), "must match a JSX href");
  assert.ok(pattern.test('{ href: "/parlay-lab", label: "x" }'), "must match an object href");
  assert.ok(!pattern.test('<Link href="/picks">x</Link>'), "must not match the canonical target");
  // And must not over-match a nested route that merely shares a prefix.
  const games = new RegExp(`href=(?:"/games/?"|\\{"/games/?"\\})|href:\\s*"/games/?"`);
  assert.ok(!games.test('<Link href="/games/mlb/abc-123">x</Link>'), "must not flag a real game link");
});
