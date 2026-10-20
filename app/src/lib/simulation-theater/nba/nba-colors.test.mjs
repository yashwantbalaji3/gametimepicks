/**
 * NBA theater · team colours: data matches its evidence, every palette role meets its contrast floor, clashes carry
 * non-colour cues, the court surfaces mirror globals.css, and the colour-literal registry is untouched.
 * Run: npx tsx --test src/lib/simulation-theater/nba/nba-colors.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  COURT_DISTINCT_DE00, NBA_TOKEN_RGB, TEXT_MIN, UI_MIN, bestInk, canonicalAbbr, clashOf, courtColour, courtSurfaces, nbaPalette, nbaTeamColor, paintTint,
} from "./nba-team-colors.mjs";
import { contrastRatio, deltaE2000 } from "../nfl-team-colors.mjs";
import { scanColorLiterals } from "../../uiux/color-scan.mjs";
import { exceptionCeilings } from "../../uiux/token-exception-registry.mjs";

const APP = process.cwd();
const read = (rel) => JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8"));
const DATA = read("src/lib/simulation-theater/nba/nba-team-colors.json");
const EVIDENCE = read("src/lib/simulation-theater/nba/nba-team-colors-evidence.json");
const ALL = Object.keys(DATA.teams);
const OPENING = ["BOS", "DET", "PHI", "NYK", "OKC", "SAS"];

test("all 30 teams; every value is a 6-digit hex; the map equals the primary source's listing (evidence)", () => {
  assert.equal(ALL.length, 30);
  for (const a of OPENING) assert.ok(DATA.teams[a], a);
  for (const [a, t] of Object.entries(DATA.teams)) {
    assert.ok(t.listed.length >= 2, a);
    for (const c of t.listed) assert.match(c, /^#[0-9A-F]{6}$/, `${a} ${c}`);
    assert.deepEqual(t.listed, EVIDENCE.teams[a].sources[EVIDENCE.primarySource].listed, `${a} differs from its evidence`);
  }
  assert.equal(DATA.status, "single-source-unvalidated", "the status says what the evidence supports");
  assert.equal(EVIDENCE.sources[EVIDENCE.primarySource].official, false);
});

test("court surfaces mirror globals.css tokens (--bg, --vault-crown, --lava-text, --gtp-card-elevated)", () => {
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  const hex = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  assert.deepEqual([...NBA_TOKEN_RGB.bg], rgb(hex("bg")));
  assert.deepEqual([...NBA_TOKEN_RGB.crown], rgb(hex("vault-crown")));
  assert.deepEqual([...NBA_TOKEN_RGB.lavaText], rgb(hex("lava-text")));
  assert.deepEqual([...NBA_TOKEN_RGB.cardElevated], rgb(hex("gtp-card-elevated")));
  const s = courtSurfaces();
  for (const f of s.floor) assert.ok(contrastRatio(s.line, f) >= 7, `court lines on floor ${f}: ${contrastRatio(s.line, f).toFixed(2)}`);
});

test("contrast: block ink ≥ 4.5:1 on every primary; trim ≥ 3:1 or the ink; band ink ≥ 4.5:1; court lines ≥ 3:1 on every paint tint", () => {
  const s = courtSurfaces();
  let worst = { ink: 99, tint: 99 };
  for (const a of ALL) {
    const t = nbaTeamColor(DATA, a);
    const ink = bestInk(DATA, t.primary);
    const ci = contrastRatio(ink, t.primary);
    assert.ok(ci >= TEXT_MIN, `${a} ink ${ci.toFixed(2)}`);
    const p = nbaPalette(DATA, a, a === "BOS" ? "DET" : "BOS").home;
    assert.ok(p.trim === p.ink || contrastRatio(p.trim, p.fill) >= UI_MIN, `${a} trim`);
    assert.ok(contrastRatio(p.courtInk, p.court) >= TEXT_MIN, `${a} band ink`);
    const { tint } = paintTint(courtColour(t));
    const lt = contrastRatio(s.line, tint);
    assert.ok(lt >= UI_MIN, `${a} lines on paint ${lt.toFixed(2)}`);
    // the court colour, and its tint, can be told from the floor
    assert.ok(s.floor.every((f) => deltaE2000(courtColour(t), f) >= COURT_DISTINCT_DE00), `${a} court colour vs floor`);
    assert.ok(s.floor.every((f) => deltaE2000(tint, f) >= 15), `${a} tint vs floor`);
    worst = { ink: Math.min(worst.ink, ci), tint: Math.min(worst.tint, lt) };
  }
  console.log(`# NBA palette: worst ink ${worst.ink.toFixed(2)}:1, worst line-on-paint ${worst.tint.toFixed(2)}:1`);
});

test("Brooklyn's black cannot carry it on a dark floor: its court colour is the next listed colour (white)", () => {
  assert.equal(courtColour(nbaTeamColor(DATA, "BKN")), "#FFFFFF");
  assert.equal(courtColour(nbaTeamColor(DATA, "BOS")), "#007A33");
});

test("clashes: PHI @ NYK (same primary) patterns the AWAY side only; BOS @ DET and OKC @ SAS do not clash; no colour is swapped", () => {
  const ny = nbaPalette(DATA, "NY", "PHI"); // ESPN abbreviation resolves
  assert.equal(ny.clash, "both");
  assert.equal(ny.away.patterned, true);
  assert.equal(ny.home.patterned, false);
  assert.equal(ny.away.fill, nbaTeamColor(DATA, "PHI").primary, "the away team keeps its own primary");
  for (const [h, a] of [["DET", "BOS"], ["SA", "OKC"]]) {
    const p = nbaPalette(DATA, h, a);
    assert.equal(p.clash, null, `${a} @ ${h}`);
    assert.equal(p.home.fill, nbaTeamColor(DATA, h).primary);
    assert.equal(p.away.fill, nbaTeamColor(DATA, a).primary);
  }
  // every pairing: exactly the away side carries cues when (and only when) the pair clashes
  let clashing = 0;
  for (const h of ALL) for (const a of ALL) {
    if (h === a) continue;
    const p = nbaPalette(DATA, h, a);
    assert.equal(p.away.patterned, p.clash !== null);
    assert.equal(p.home.patterned, false);
    assert.equal(p.clash, clashOf(nbaTeamColor(DATA, h), nbaTeamColor(DATA, a)));
    if (p.clash) clashing++;
  }
  console.log(`# NBA pairings with clash cues: ${clashing} of ${30 * 29}`);
  assert.equal(canonicalAbbr(DATA, "SA"), "SAS");
  assert.equal(nbaPalette(DATA, "XXX", "BOS").home.fill.startsWith("var("), true, "unknown team → neutral token");
  assert.equal(nbaPalette(DATA, "NYK", "PHI", { neutral: true }).mode, "neutral");
});

test("no colour literal in the NBA theater's runtime code, and the registry gained no entry (shrink-only)", () => {
  const hits = scanColorLiterals(APP);
  const nbaFiles = [...hits.keys()].filter((f) => /simulation-theater\/nba\//.test(f));
  assert.deepEqual(nbaFiles, [], `colour literals in ${nbaFiles.join(", ")}`);
  assert.ok(![...exceptionCeilings().keys()].some((f) => /nba/.test(f)), "no NBA file in the token exception registry");
  assert.equal(exceptionCeilings().get("src/lib/simulation-theater/nfl-team-colors.mjs").max, 70, "NFL ceiling untouched");
});
