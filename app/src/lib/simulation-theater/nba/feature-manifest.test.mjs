/**
 * NBA theater · feature manifest: public output stays OFF behind the September preregistration, and nothing public is
 * wired to the NBA Theater or its Projected Final Box Score.
 * Run: npx tsx --test src/lib/simulation-theater/nba/feature-manifest.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NBA_THEATER_FEATURES, NBA_THEATER_PUBLIC_ENABLED, NBA_THEATER_PUBLIC_ENV, NBA_THEATER_PUBLIC_GATE, nbaTheaterPublicEnabled } from "./feature-manifest.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const SRC = fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/feature-manifest.mjs"), "utf8");

test("NBA_THEATER_PUBLIC_ENABLED is false, its comment names the governance gate, and the flag cannot turn it on", () => {
  assert.equal(NBA_THEATER_PUBLIC_ENABLED, false);
  assert.match(SRC, /^export const NBA_THEATER_PUBLIC_ENABLED = false;$/m);
  assert.match(SRC, /September preregistration/);
  assert.match(SRC, /docs\/V18_NBA_REGULAR_SEASON_PREREGISTRATION\.md/);
  assert.match(SRC, /RECORDED release-owner \/ founder decision/);
  assert.ok(fs.existsSync(path.join(REPO, "docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md")), "the cited preregistration exists");
  assert.equal(NBA_THEATER_PUBLIC_GATE.decisionRecorded, false);
  assert.equal(NBA_THEATER_PUBLIC_ENV, "GTP_NBA_THEATER_PUBLIC");
  for (const env of [{}, { GTP_NBA_THEATER_PUBLIC: "1" }, { GTP_NBA_THEATER_PUBLIC: "true" }, { GTP_DEV_ROUTES: "1", GTP_NBA_THEATER_PUBLIC: "1" }]) {
    assert.equal(nbaTheaterPublicEnabled(env), false, JSON.stringify(env));
  }
  assert.equal(NBA_THEATER_FEATURES.boxScore.public, false);
  assert.equal(NBA_THEATER_FEATURES.boxScore.route, "dev");
  assert.equal(NBA_THEATER_FEATURES.theater.public, false);
});

// Lane C 2026-10-21: ONE public CANDIDATE route exists, /nba/simulation/[eventId]. It is inert while the constant is
// false (public-route.mjs: both acts required); possession/public-theater-route.test.mjs pins its source shape (static
// imports = the gate only; loader + island behind the compile-time flag) and the build-time define.
const PUBLIC_CANDIDATE = path.join("src", "app", "nba", "simulation", "[eventId]", "page.tsx");

test("no public route is wired: outside src/app/dev nothing imports the NBA theater, its box score or this manifest, or reads the flag — except the gated public candidate", () => {
  const offenders = [];
  const walk = (d) => {
    for (const x of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, x.name);
      if (x.isDirectory()) { walk(p); continue; }
      if (!/\.(tsx?|mjs)$/.test(x.name)) continue;
      const rel = path.relative(APP, p);
      if (rel.startsWith(`src${path.sep}app${path.sep}dev${path.sep}`)) continue;
      if (rel === PUBLIC_CANDIDATE) continue;
      const src = fs.readFileSync(p, "utf8");
      if (/simulation-theater\/nba\/|NbaTheaterSection|NbaBoxScore|GTP_NBA_THEATER_PUBLIC/.test(src)) offenders.push(rel);
    }
  };
  walk(path.join(APP, "src/app"));
  assert.deepEqual(offenders, []);
  const page = fs.readFileSync(path.join(APP, PUBLIC_CANDIDATE), "utf8");
  const staticImports = [...page.matchAll(/^import [^;]+ from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(staticImports.filter((s) => /simulation-theater/.test(s)), ["@/lib/simulation-theater/nba/possession/public-route.mjs"], "the candidate statically imports only its gate");
  assert.doesNotMatch(page, /NbaTheaterSection|NbaBoxScore|nba\/loader\.mjs/, "the candidate never mounts the v1 quarter Theater or its box score");
  const nextConfig = fs.readFileSync(path.join(APP, "next.config.mjs"), "utf8");
  assert.match(nextConfig, /GTP_NBA_THEATER_PUBLIC: process\.env\.GTP_NBA_THEATER_PUBLIC === "1" \? "1" : "0"/, "the build defines the NBA public flag as a compile-time \"1\" / \"0\" (default OFF)");
});
