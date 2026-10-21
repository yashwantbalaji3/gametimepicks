/**
 * NBA theater · feature manifest: public output stays OFF behind the September preregistration, and nothing public is
 * wired to the NBA Theater or its Projected Final Box Score.
 * Run: npx tsx --test src/lib/simulation-theater/nba/feature-manifest.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NBA_THEATER_REPLAY_ENGINE } from "../../consistency/theater-replay-engine.mjs";
import { NBA_THEATER_FEATURES, NBA_THEATER_PUBLIC_ENABLED, NBA_THEATER_PUBLIC_ENV, NBA_THEATER_PUBLIC_GATE, nbaTheaterPublicEnabled } from "./feature-manifest.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const SRC = fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/feature-manifest.mjs"), "utf8");

test("NBA_THEATER_PUBLIC_ENABLED is true ONLY with a recorded decision: the cited approval file exists and records the founder decision; the env act is still required", () => {
  assert.equal(NBA_THEATER_PUBLIC_ENABLED, true);
  assert.match(SRC, /^export const NBA_THEATER_PUBLIC_ENABLED = true;$/m);
  assert.match(SRC, /September preregistration/);
  assert.match(SRC, /docs\/V18_NBA_REGULAR_SEASON_PREREGISTRATION\.md/);
  assert.match(SRC, /RECORDED release-owner \/ founder decision/);
  assert.ok(fs.existsSync(path.join(REPO, "docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md")), "the cited preregistration exists");
  assert.equal(NBA_THEATER_PUBLIC_GATE.decisionRecorded, true);
  assert.equal(NBA_THEATER_PUBLIC_GATE.approvalFile, "docs/launch/approvals/NBA_THEATER_PUBLIC_2026-10-21.md");
  assert.match(SRC, /docs\/launch\/approvals\/NBA_THEATER_PUBLIC_2026-10-21\.md/, "the flip cites the approval file");
  const approval = fs.readFileSync(path.join(REPO, NBA_THEATER_PUBLIC_GATE.approvalFile), "utf8");
  assert.ok(approval.includes(NBA_THEATER_REPLAY_ENGINE.id), "the approval names the approved replay engine (the gate policy's own constant)");
  assert.ok(approval.includes(NBA_THEATER_REPLAY_ENGINE.label), "and its role C label");
  assert.equal(NBA_THEATER_REPLAY_ENGINE.decision, NBA_THEATER_PUBLIC_GATE.approvalFile, "the gate policy and the manifest cite the same approval file");
  assert.match(approval, /Research Possession Simulation — Unvalidated/);
  assert.match(approval, /not authorize promoting this research engine/i, "the approval is not a promotion");
  assert.match(approval, /## Gates/);
  assert.equal(NBA_THEATER_PUBLIC_ENV, "GTP_NBA_THEATER_PUBLIC");
  // The env act is still required, and only the exact value "1" counts.
  for (const env of [{}, { GTP_NBA_THEATER_PUBLIC: "true" }, { GTP_NBA_THEATER_PUBLIC: "0" }, { GTP_DEV_ROUTES: "1" }]) {
    assert.equal(nbaTheaterPublicEnabled(env), false, JSON.stringify(env));
  }
  assert.equal(nbaTheaterPublicEnabled({ GTP_NBA_THEATER_PUBLIC: "1" }), true);
  assert.equal(NBA_THEATER_FEATURES.boxScore.public, false);
  assert.equal(NBA_THEATER_FEATURES.boxScore.route, "dev");
  assert.equal(NBA_THEATER_FEATURES.theater.public, false, "the dev Theater stays dev; the public surface is the possession route");
});

// Lane C 2026-10-21: ONE public CANDIDATE route exists, /nba/simulation/[eventId]. It is inert while the constant is
// false (public-route.mjs: both acts required); possession/public-theater-route.test.mjs pins its source shape (static
// imports = the gate only; loader + island behind the compile-time flag) and the build-time define.
const PUBLIC_CANDIDATE = path.join("src", "app", "nba", "simulation", "[eventId]", "page.tsx");
const HUB_ENTRY_POINT = path.join("src", "app", "nba", "page.tsx");

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
      if (rel === HUB_ENTRY_POINT) continue; // its imports are pinned below (Theater links, release owner 2026-10-21)
      const src = fs.readFileSync(p, "utf8");
      if (/simulation-theater\/nba\/|NbaTheaterSection|NbaBoxScore|GTP_NBA_THEATER_PUBLIC/.test(src)) offenders.push(rel);
    }
  };
  walk(path.join(APP, "src/app"));
  assert.deepEqual(offenders, []);
  const page = fs.readFileSync(path.join(APP, PUBLIC_CANDIDATE), "utf8");
  const staticImports = [...page.matchAll(/^import (?!type )[^;]+ from "([^"]+)";$/gm)].map((m) => m[1]); // runtime imports only (import type is erased)
  assert.deepEqual(staticImports.filter((s) => /simulation-theater/.test(s)), ["@/lib/simulation-theater/nba/possession/public-route.mjs"], "the candidate statically imports only its gate");
  assert.doesNotMatch(page, /NbaTheaterSection|NbaBoxScore|nba\/loader\.mjs/, "the candidate never mounts the v1 quarter Theater or its box score");
  // ENTRY POINTS (release owner 2026-10-21): /nba links each lane card to its built Theater page. It may import ONLY the
  // route gate statically and the public loader dynamically inside the literal flag branch — never a Theater component.
  const hub = fs.readFileSync(path.join(APP, HUB_ENTRY_POINT), "utf8");
  const hubStatic = [...hub.matchAll(/^import (?!type )[^;]+ from "([^"]+)";$/gm)].map((m) => m[1]).filter((s) => /simulation-theater/.test(s));
  assert.deepEqual(hubStatic, ["@/lib/simulation-theater/nba/possession/public-route.mjs"]);
  const hubDynamic = [...hub.matchAll(/await import\("([^"]+)"\)/g)].map((m) => m[1]).filter((s) => /simulation-theater/.test(s));
  assert.deepEqual(hubDynamic, ["@/lib/simulation-theater/nba/possession/public-loader.mjs"]);
  assert.match(hub, /if \(process\.env\.GTP_NBA_THEATER_PUBLIC === "1"\) \{\s*const \{ publicPossessionEvents \} = await import\(/, "the loader import sits inside the literal flag branch");
  assert.doesNotMatch(hub, /NbaTheaterSection|NbaBoxScore|NbaPossession|nba\/loader\.mjs/);
  const nextConfig = fs.readFileSync(path.join(APP, "next.config.mjs"), "utf8");
  assert.match(nextConfig, /GTP_NBA_THEATER_PUBLIC: process\.env\.GTP_NBA_THEATER_PUBLIC === "1" \? "1" : "0"/, "the build defines the NBA public flag as a compile-time \"1\" / \"0\" (default OFF)");
});
