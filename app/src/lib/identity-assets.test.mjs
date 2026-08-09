/**
 * Identity-asset coverage guards (Program 144 · Release E).
 *
 * The identity system is already centralized — TeamLogo (ESPN CDN by abbr), PlayerAvatar (MLB
 * midfield / ESPN by id, or an explicit artifact URL), FlagBadge — each with a deterministic
 * fallback that can never show the browser broken-image icon. What was NOT guarded:
 *
 *   1. the safe-domain allowlist (a future edit could point at any host),
 *   2. the fallback invariants (onError → initials/monogram, dimensions, alt policy),
 *   3. raw `<img>` tags OUTSIDE the identity components — the exact class behind the founder's
 *      "broken team artwork in places" observation. Eight existed; three high-visibility ones were
 *      migrated; the rest are RATCHETED: the list can only shrink, and any NEW raw <img> fails.
 *
 * Run: npx tsx --test src/lib/identity-assets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const IDENTITY_COMPONENTS = ["src/components/team-logo.tsx", "src/components/player-avatar.tsx", "src/components/flag-badge.tsx"];

/** Hosts the identity system may load from — official league/API CDNs already in use, nothing else. */
const SAFE_HOSTS = ["a.espncdn.com", "midfield.mlbstatic.com", "media.api-sports.io", "flagcdn.com"];

test("identity components load ONLY from the approved host allowlist", () => {
  for (const f of IDENTITY_COMPONENTS) {
    const src = read(f);
    for (const url of src.match(/https:\/\/[a-z0-9.-]+/gi) ?? []) {
      const host = url.replace("https://", "");
      assert.ok(SAFE_HOSTS.some((h) => host.startsWith(h)), `${f} loads from unapproved host ${host}`);
    }
    assert.ok(!/http:\/\//.test(src), `${f} must not load over plaintext http`);
  }
});

test("every identity component that loads an image has an error fallback", () => {
  for (const f of IDENTITY_COMPONENTS) {
    const src = read(f);
    // FlagBadge renders emoji, not <img> — nothing can fail to load, so requiring onError there
    // was asserting about an image that does not exist.
    if (!src.includes("<img")) continue;
    assert.match(src, /onError/, `${f} must handle load failure`);
  }
  // PlayerAvatar's explicit-URL path must fall to the SAME initials disc (no separate branch).
  const avatar = read("src/components/player-avatar.tsx");
  assert.match(avatar, /photoUrl\s*\?\s*photoUrl/, "an explicit artifact URL wins over the derived one");
  assert.match(avatar, /initialsFor/, "the fallback is the initials disc");
});

test("identity images always carry explicit dimensions — no layout shift", () => {
  for (const f of IDENTITY_COMPONENTS) {
    const src = read(f);
    if (!src.includes("<img")) continue;
    assert.match(src, /width=\{/, `${f}: <img> needs explicit width`);
    assert.match(src, /height=\{/, `${f}: <img> needs explicit height`);
  }
});

/**
 * THE RATCHET. Raw `<img>` outside the identity components (and the brand mark, which renders a
 * local static asset). Each entry is a known legacy usage; migrating one removes it here. Adding a
 * NEW raw <img> anywhere fails this test — new imagery must go through the identity components.
 */
const KNOWN_LEGACY_RAW_IMG = [
  // Sibling avatar implementations predating the canonical player-avatar.tsx. Each has its own
  // internal monogram fallback (verified — no broken-icon risk), but three implementations of one
  // idea is drift waiting to happen; consolidation is tracked as a follow-up. They stay in the
  // ratchet so they cannot multiply.
  "src/components/ui/player-avatar.tsx",
  "src/components/bank-builder/moonshot-lane-card.tsx",
  "src/components/awaiting-settlement-table.tsx",
  "src/components/ui/team-mark.tsx",
  "src/components/home/featured-simulations.tsx",
  "src/components/world-cup/wc-player-props.tsx",
  "src/components/world-cup/world-cup-specials-preview-box.tsx",
];

function rawImgFiles() {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(APP, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".tsx") && !IDENTITY_COMPONENTS.includes(rel) && !rel.endsWith("brand-mark.tsx")) {
        if (/<img[\s>]/.test(fs.readFileSync(path.join(APP, rel), "utf8"))) hits.push(rel);
      }
    }
  };
  walk("src/components");
  walk("src/app");
  return hits.sort();
}

test("RATCHET · no new raw <img> outside the identity components; the legacy list only shrinks", () => {
  const current = rawImgFiles();
  const newOffenders = current.filter((f) => !KNOWN_LEGACY_RAW_IMG.includes(f));
  assert.deepEqual(newOffenders, [],
    `new raw <img> outside the identity system — route it through PlayerAvatar/TeamLogo/FlagBadge instead:\n${newOffenders.join("\n")}`);
  // And the list itself must stay honest: entries that no longer have a raw <img> must be removed.
  const stale = KNOWN_LEGACY_RAW_IMG.filter((f) => !current.includes(f));
  assert.deepEqual(stale, [], `these files no longer carry a raw <img> — remove them from KNOWN_LEGACY_RAW_IMG so the ratchet tightens:\n${stale.join("\n")}`);
});

test("the three migrated surfaces route through PlayerAvatar", () => {
  for (const f of ["src/components/parlays/parlays-explorer.tsx", "src/components/build-experience.tsx", "src/components/ui/projection-card.tsx"]) {
    const src = read(f);
    assert.match(src, /<PlayerAvatar/, `${f} must use PlayerAvatar`);
    assert.ok(!/<img[\s>]/.test(src), `${f} must carry no raw <img> after migration`);
  }
});
