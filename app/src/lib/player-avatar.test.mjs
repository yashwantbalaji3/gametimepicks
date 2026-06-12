/**
 * PlayerAvatar contract (source-level, matching the repo's component-test convention):
 * the single real-vs-fallback decision point must render a real <img> ONLY when given a
 * photo URL, and otherwise an initials monogram — never a fabricated photo. Also asserts
 * its three consumers route through it (no duplicated inline headshot logic).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("src/components/ui/player-avatar.tsx", "utf8");

test("renders <img> only inside the `if (photo)` branch", () => {
  const imgAt = src.indexOf("<img");
  const guardAt = src.indexOf("if (photo)");
  assert.ok(guardAt > 0 && imgAt > guardAt, "the <img> is gated behind a real photo URL");
  assert.ok(src.includes("alt={name}"), "image carries alt text");
});

test("falls back to an initials monogram (no image) when photo is absent", () => {
  assert.ok(src.includes("initials(name)"), "monogram fallback present");
  // The only <img> in the file is the real-photo branch; the fallback is a <div>.
  assert.equal((src.match(/<img/g) || []).length, 1, "exactly one image path (the real-URL branch)");
});

test("the three consumers route through PlayerAvatar (no duplicated inline headshots)", () => {
  for (const f of [
    "src/components/ui/player-prop-card.tsx",
    "src/components/ui/suggested-card.tsx",
    "src/components/bank-builder/official-candidate-card.tsx",
  ]) {
    const c = fs.readFileSync(f, "utf8");
    assert.ok(c.includes("PlayerAvatar"), `${f} uses PlayerAvatar`);
  }
});
