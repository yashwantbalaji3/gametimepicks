/**
 * June 14 final cleanup invariants: /picks shows only TODAY's slate (stale daily-mixed +
 * World Cup artifacts are date-gated out), the Bank Builder crown teases the next ladder,
 * UFC fight cards carry real fighter comparison stats, and no cool "dusty" theme remnants
 * survive (hot-lava end-to-end).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (rel) => fs.readFileSync(rel, "utf8");

test("loadDailyMixedCards date-gates a stale slate (no stale cards as active picks)", () => {
  const src = read("src/lib/normalize.ts");
  assert.ok(/loadDailyMixedCards\(today\?: string\)/.test(src), "accepts a today gate");
  assert.ok(src.includes('if (today && d.date && d.date !== today) return []'), "stale (non-today) slate returns []");
  // /picks passes today + gates the World Cup artifact to today.
  const picks = read("src/app/picks/page.tsx");
  assert.ok(picks.includes("loadDailyMixedCards(today)"), "/picks passes the today gate");
  assert.ok(/wcParlays\.date === today/.test(picks), "/picks gates World Cup cards to today");
});

test("Bank Builder shows the LIVE Dual Bank Builder (no stale Coming Soon teaser)", () => {
  const page = read("src/app/bank-builder/page.tsx");
  // The next run is now LIVE, so the old "coming soon" teaser is gone.
  assert.ok(!/Coming Soon/i.test(page), "stale 'Coming Soon' teaser removed");
  // The live dual lanes now render via the ClimbHero flagship — both Lane A and Lane B, built from the
  // public dual-ladder view models — which replaced the old standalone teaser.
  assert.ok(/<ClimbHero/.test(page) && /buildPublicDualLadder\(/.test(page),
    "live dual lanes rendered from the public dual-ladder artifact");
  assert.ok(/lane-a/.test(page) && /lane-b/.test(page), "both Lane A and Lane B render");
  // 2026-07-07 Option-1 simplify: the completed-crown proof is handled by the ClimbHero (real banked
  // finals fed via completedLadders), not a separate page `completed ?` conditional.
  assert.ok(/completedLadders=\{completedLadders\}/.test(page), "the completed-crown proof is fed to the ClimbHero");
});

test("UFC expanded projections carry real fighter comparison stats for every fight", () => {
  const e = JSON.parse(read(path.join(process.cwd(), "public", "data", "ufc", "expanded-projections-latest.json")));
  for (const f of e.projections) {
    assert.ok(f.fighterStats, `${f.fighters?.join(" vs ")}: fighter comparison stats present`);
    assert.ok(f.moneyline, "every fight (incl. limited-data) still shows the moneyline leg");
  }
});

test("hot-lava theme end-to-end — no cool-blue 'dusty' panel remnants in src", () => {
  let hits = 0;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      // The /design-lab preview routes are an intentional multi-palette exploration
      // (e.g. a navy dashboard, a violet app) — they are not the production theme, so the
      // hot-lava guard skips them.
      if (ent.isDirectory()) { if (ent.name !== "design-lab") walk(p); }
      else if (/\.tsx$/.test(ent.name)) {
        const s = fs.readFileSync(p, "utf8");
        // cool blue-gray panel tuples (R<25, B≥28) that read as the retired dusty theme
        if (/rgba\(1[0-9], ?1[0-9], ?2[0-9]|rgba\(20, ?24, ?3[0-9]|rgba\(20,24,3[0-9]|rgba\(14, ?18, ?28/.test(s)) hits++;
      }
    }
  };
  walk("src");
  assert.equal(hits, 0, "no cool-blue dusty-theme rgba panels remain");
});
