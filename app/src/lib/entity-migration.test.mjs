/**
 * ENTITY MIGRATION GUARDS (Sprint 016).
 *
 * The migration is measured by scripts/entity-census.mjs, so these tests pin the two things that make that
 * measurement trustworthy and keep it moving in one direction:
 *
 *   1. the census cannot MISREPORT — it must resolve canonical positively (by import), so a legacy call site
 *      that merely shares a component NAME is never counted as migrated;
 *   2. the surfaces already migrated stay migrated, and total canonical adoption never falls.
 *
 * This is a ratchet, not a target: raise MIN_CANONICAL as batches land. Never lower it to make a change pass
 * — a drop means a surface regressed to a rival component.
 *
 * Run: npx tsx --test src/lib/entity-migration.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const census = () =>
  JSON.parse(execFileSync("npx", ["tsx", path.join(APP, "scripts", "entity-census.mjs"), "--json"], {
    cwd: APP,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }));

/** Ratchet: canonical call sites must never fall below this. Raise it as batches land. */
const MIN_CANONICAL = 16;

/** Surfaces already migrated — every identity site in these files must be canonical. */
const MIGRATED_FILES = [
  "components/parlay-ticket-card.tsx",
  "components/player-recent-form-drawer.tsx",
  "components/settled-player-accordion.tsx",
  "components/player-results-cards.tsx",
];

const data = census();

test("the census resolves canonical POSITIVELY, so a name collision cannot fake progress", () => {
  const src = fs.readFileSync(path.join(APP, "scripts", "entity-census.mjs"), "utf8");
  assert.match(src, /components\/entity/, "canonical detection keys off the entity import path");
  assert.match(src, /canonicalNames/, "it builds the set of names actually imported from entity");
  // The trap this defends against: `TeamLogo` is exported BOTH by @/components/entity and by
  // components/team-logo, and imports mix alias and relative paths. A file that imports the legacy one must
  // never be counted as canonical.
  const legacyTeamLogoRows = data.rows.filter((r) => r.key === "rival:TeamLogo(legacy)");
  assert.ok(legacyTeamLogoRows.length > 0, "legacy TeamLogo call sites are still detected as legacy");
  for (const r of legacyTeamLogoRows) assert.equal(r.canonical, false);
});

test("migrated surfaces stay migrated — no rival identity component returns", () => {
  for (const file of MIGRATED_FILES) {
    const rows = data.rows.filter((r) => r.file === file);
    assert.ok(rows.length > 0, `${file}: still renders identity (guard would silently pass if it did not)`);
    for (const r of rows) {
      assert.equal(r.canonical, true, `${file}:${r.line} regressed to ${r.key}`);
    }
    // And the import itself must be the canonical module, not a relative legacy path.
    const src = fs.readFileSync(path.join(APP, "src", file), "utf8");
    assert.match(src, /from "@\/components\/entity"/, `${file}: imports the canonical entity module`);
    assert.ok(!/import\s+PlayerAvatar\s+from/.test(src), `${file}: no rival PlayerAvatar import`);
    assert.ok(!/import\s+TeamLogo\s+from\s+"\.\//.test(src), `${file}: no legacy relative TeamLogo import`);
  }
});

test("canonical adoption ratchets up, never down", () => {
  assert.ok(
    data.totals.canonical >= MIN_CANONICAL,
    `canonical call sites fell to ${data.totals.canonical} (floor ${MIN_CANONICAL}) — a surface regressed`,
  );
});

test("the TeamLogo facade keeps BOTH capabilities — neither path may be dropped", () => {
  const entity = fs.readFileSync(path.join(APP, "src", "components", "entity", "index.tsx"), "utf8");
  // Artifact-URL path (server-renderable) and CDN path (client, with the 404 -> monogram fallback).
  assert.match(entity, /TeamMark/, "artifact-URL path still routes to team-mark");
  assert.match(entity, /CdnTeamLogo/, "CDN path still routes to the client component that handles onError");
  assert.match(entity, /if \(!logoUrl && team && sport\)/, "an explicit artifact URL wins over CDN derivation");
  // The legacy component must keep its error fallback — that is the whole reason the facade exists.
  const legacy = fs.readFileSync(path.join(APP, "src", "components", "team-logo.tsx"), "utf8");
  assert.match(legacy, /onError/, "the CDN logo keeps its 404 fallback");
});

test("EntityHeader is either used or knowingly unused — it must not be silently deleted while referenced", () => {
  const used = data.rows.some((r) => r.key.includes("EntityHeader"));
  const entity = fs.readFileSync(path.join(APP, "src", "components", "entity", "index.tsx"), "utf8");
  const exported = /export function EntityHeader/.test(entity);
  assert.ok(exported || !used, "if any surface renders EntityHeader, the export must still exist");
});
