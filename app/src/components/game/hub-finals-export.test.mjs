/**
 * EXPORT GUARD (post-build): every final on a sport hub carries FINAL · settled — in the built HTML of /nba, /nfl, /mlb,
 * /epl and /ufc (the hubs on the shared hub header). A game element is any shared-card element (.gtp-cr row, .nbx-card
 * compact card, .gtp-ev card). It is a final when its status word reads "Final" or it prints a final score
 * ("BKN 93 – DAL 130"); a final under review is not settled and must carry no tag. Unit side: hub-finals-tag.test.mjs.
 * Run after a build: npx tsx --test src/components/game/hub-finals-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const HUBS = ["nba", "nfl", "mlb", "epl", "ufc"];
const GAME_EL = /<li\b[^>]*class="(?:gtp-cr|nbx-card|gtp-ev)\b[^"]*"[^>]*>[\s\S]*?<\/li>/g;
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const SCORE = /\b[A-Z]{2,4} \d{1,3} – [A-Z]{2,4} \d{1,3}\b/;
const STATUS_FINAL = /class="(?:gtp-cr-s|gtp-ev-status[^"]*|nbx-chip)">Final</;

test("every final on every hub carries FINAL · settled; a final under review carries none", () => {
  assert.ok(fs.existsSync(OUT), "needs a built export at app/out/");
  const seen = {};
  for (const hub of HUBS) {
    const file = path.join(OUT, hub, "index.html");
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    let finals = 0;
    for (const el of html.match(GAME_EL) ?? []) {
      const t = text(el);
      const underReview = /\(under review\)/.test(t);
      const isFinal = STATUS_FINAL.test(el) || SCORE.test(t);
      if (!isFinal) continue;
      if (underReview) { assert.doesNotMatch(el, /data-game-state="final"/, `/${hub}: a final under review is not settled — ${t.slice(0, 90)}`); continue; }
      finals += 1;
      assert.match(el, /data-game-state="final"[^>]*>FINAL · settled</, `/${hub}: a final without its FINAL · settled tag — ${t.slice(0, 90)}`);
    }
    seen[hub] = finals;
  }
  assert.ok(Object.keys(seen).length >= 4, `hubs found in the export: ${Object.keys(seen).join(", ")}`);
  assert.ok(seen.nba > 0, `/nba lists its recent finals (found ${seen.nba})`);
  console.log(`  finals tagged per hub: ${JSON.stringify(seen)}`);
});
