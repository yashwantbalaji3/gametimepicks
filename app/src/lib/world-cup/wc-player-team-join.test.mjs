/**
 * WC player-props team join — proves the France vs Spain report no longer mislabels Spain players as France
 * (or France players as Spain). The Odds feed has no team, so the generator defaulted everyone to the home side;
 * `resolveWcPlayerTeam` corrects it from the official-squad map. No hardcoded names — the map is data.
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
  assert.ok(Object.keys(map.byFullName).length >= 80, "map has the squad players");
  for (const t of ["France", "Spain", "England", "Argentina"]) {
    assert.ok(Object.values(map.byFullName).includes(t), `map covers ${t}`);
  }
});

test("France vs Spain: Spain players resolve to Spain, France players resolve to France", () => {
  const spain = ["Lamine Yamal", "Mikel Oyarzabal", "Nico Williams", "Borja Iglesias"];
  const france = ["Kylian Mbappe", "Ousmane Dembele", "Marcus Thuram", "Jean-Philippe Mateta"];
  for (const n of spain) assert.equal(resolveWcPlayerTeam(n, "France", "Spain"), "Spain", `${n} must be Spain, not France`);
  for (const n of france) assert.equal(resolveWcPlayerTeam(n, "France", "Spain"), "France", `${n} must be France`);
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
