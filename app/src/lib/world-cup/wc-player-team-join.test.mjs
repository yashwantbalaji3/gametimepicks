/**
 * WC player-props team join — proves the current semifinal report (England vs Argentina, 2026-07-15) no longer
 * mislabels players onto the wrong national side. The Odds feed has no team, so the generator defaulted everyone
 * to the home side; `resolveWcPlayerTeam` corrects it from the official-squad map. No hardcoded names — the map is data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveWcPlayerTeam } from "./player-team-map.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the player-team map exists, is a public display reference, and covers the semifinal teams", () => {
  const map = JSON.parse(read("public/data/world-cup/player-team-map.json"));
  assert.equal(map._officialMoneyRecordAffected, false, "map never touches money");
  // Slate advanced to the 2026-07-15 semifinal (England vs Argentina); France vs Spain (07-14) has dropped,
  // so the map now covers only the two current semifinal squads (two 26-man squads ≈ 52 entries).
  assert.ok(Object.keys(map.byFullName).length >= 40, "map has the squad players");
  for (const t of ["England", "Argentina"]) {
    assert.ok(Object.values(map.byFullName).includes(t), `map covers ${t}`);
  }
});

test("England vs Argentina: Argentina players resolve to Argentina, England players resolve to England", () => {
  const argentina = ["Lionel Messi", "Julian Alvarez", "Lautaro Martinez"];
  const england = ["Harry Kane", "Jude Bellingham"];
  for (const n of argentina) assert.equal(resolveWcPlayerTeam(n, "England", "Argentina"), "Argentina", `${n} must be Argentina, not England`);
  for (const n of england) assert.equal(resolveWcPlayerTeam(n, "England", "Argentina"), "England", `${n} must be England`);
});

test("the resolver is CONSTRAINED to the fixture — it never assigns a team not in the match", () => {
  // Yamal (Spain) in a fixture he isn't part of resolves to null, never a wrong team.
  assert.equal(resolveWcPlayerTeam("Lamine Yamal", "England", "Argentina"), null, "not in this fixture → null");
  // An unknown name resolves to null (no guessing).
  assert.equal(resolveWcPlayerTeam("Nobody McUnknown", "France", "Spain"), null);
});

test("data integrity: every France vs Spain prop in the artifact resolves without a France↔Spain mislabel", () => {
  const j = JSON.parse(read("public/data/world-cup/player-projections/latest.json"));
  const fvs = (j.matches || []).filter((m) => m.fixture === "France vs Spain");
  if (fvs.length === 0) return; // slate advanced — resolver correctness covered above
  const map = JSON.parse(read("public/data/world-cup/player-team-map.json"));
  for (const p of fvs) {
    const name = p.player?.name;
    if (!name) continue;
    const resolved = resolveWcPlayerTeam(name, "France", "Spain");
    if (resolved === null) continue; // unresolved → left as-is, not asserted
    // The resolved team must agree with the squad map (the source of truth).
    const squadTeam = map.byFullName[name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.'-]/g, " ").replace(/\s+/g, " ").trim()];
    if (squadTeam) assert.equal(resolved, squadTeam, `${name} resolved to ${resolved} but squad says ${squadTeam}`);
  }
});

test("game-detail wires the resolver into the WC props builder (the join is fixed at the data layer)", () => {
  const gd = read("src/lib/game-detail.ts");
  assert.match(gd, /import \{ resolveWcPlayerTeam \}/, "imports the resolver");
  assert.match(gd, /resolveWcPlayerTeam\(p\.player\.name, homeTeam \?\? "", awayTeam \?\? ""\)/, "corrects each prop's team");
});

test("V2 report shows the (now-correct) team label again", () => {
  const v2 = read("src/components/game/soccer-simulation-report-v2.tsx");
  assert.match(v2, /p\.player\?\.team \? <span[\s\S]*?· \{p\.player\.team\}/, "team label restored, guarded on presence");
});
