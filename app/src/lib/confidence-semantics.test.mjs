/**
 * Sprint 035 — confidence semantics guards.
 *
 * The tier is a relabelled edge bucket (90.8% deterministic) and is ANTI-PREDICTIVE on 21,192 settled
 * outcomes: A .4934, B .5063, C .5172. The old product labels — "Stronger signal" for the worst
 * category and "High-variance … treat as noisier" for the best — did not merely fail to help, they
 * inverted the reader's instruction and did so more persuasively than the raw tier names had.
 *
 * These guards keep the label descriptive. They do NOT ban the word "confidence" — the tier is real
 * and is still shown; what is banned is any label or caption that ranks the tiers against each other.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { confidenceLabel, confidenceCaption } from "./confidence-labels.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const TIERS = ["High", "Medium", "Low"];

/** Words that assert one tier is better than another. */
const ENDORSEMENT = /\bstronger\b|\bstrong\b|\bbest\b|\bbetter\b|\btop\b|\belite\b|\bpremium\b|\bhigh[- ]confidence\b|\bmost reliable\b|\btrust(ed|worthy)?\b/i;
/** Words that push a reader away from a tier. */
const DISPARAGEMENT = /\bnoisier\b|\brisky\b|\bweak\b|\bpoor\b|\bavoid\b|\bcautious\b|\bsoft\b/i;

// ── labels must not rank ───────────────────────────────────────────────────

test("no tier label endorses or disparages", () => {
  for (const t of TIERS) {
    const label = confidenceLabel(t);
    assert.ok(label.length > 0, `${t} needs a label`);
    assert.doesNotMatch(label, ENDORSEMENT, `${t} label must not endorse: "${label}"`);
    assert.doesNotMatch(label, DISPARAGEMENT, `${t} label must not disparage: "${label}"`);
  }
});

test("the specific inverted strings are gone from the label layer", () => {
  const src = read("src/lib/confidence-labels.ts");
  // The old mapping told readers to trust the worst bucket and distrust the best.
  assert.doesNotMatch(
    src.replace(/\/\*[\s\S]*?\*\//g, ""),
    /return "Stronger signal"|return "High-variance"|treat as noisier/,
    "the inverted label mapping must not return",
  );
  for (const t of TIERS) {
    assert.notEqual(confidenceLabel(t), "Stronger signal");
    assert.notEqual(confidenceLabel(t), "High-variance");
  }
});

test("labels are distinguishable and carry no implied ordering word", () => {
  const labels = TIERS.map(confidenceLabel);
  assert.equal(new Set(labels).size, TIERS.length, "each tier needs a distinct label");
  for (const l of labels) {
    assert.doesNotMatch(l, /high|low|medium/i, `"${l}" reuses a ranking word`);
  }
});

// ── captions must carry the measured rate ─────────────────────────────────

test("every caption states the measured settle rate, so no tier can imply quality unchallenged", () => {
  for (const t of TIERS) {
    const cap = confidenceCaption(t);
    assert.match(cap, /\d{2}\.\d%/, `${t} caption must quote a measured rate: "${cap}"`);
    assert.doesNotMatch(cap, DISPARAGEMENT, `${t} caption must not disparage: "${cap}"`);
  }
});

test("the caption for the worst-performing category does not read as an endorsement", () => {
  // "High" is the worst performer (.4934). Its caption must not sell it.
  const cap = confidenceCaption("High");
  assert.match(cap, /49\.3%/, "must quote its real settle rate");
  assert.match(cap, /lowest/i, "must say plainly that it is the lowest of the three");
});

test("the caption for the best-performing category is not undersold", () => {
  const cap = confidenceCaption("Low");
  assert.match(cap, /51\.7%/);
  assert.match(cap, /highest/i, "must say plainly that it is the highest of the three");
});

// ── surfaces must not resurrect the ranking language ──────────────────────

const SURFACES = [
  "src/components/vault-player-card.tsx",
  "src/components/player-recent-form-drawer.tsx",
  "src/components/tonight-matchup-card.tsx",
  "src/components/confidence-tooltip.tsx",
  "src/app/about/page.tsx",
  "src/app/mlb/page.tsx",
  "src/app/nba/page.tsx",
];

test("no surface ASSIGNS or RENDERS the old ranking labels as a tier label", () => {
  // Matched precisely rather than by bare substring. Two legitimate uses must survive:
  //   - about/page.tsx reports a past calibration experiment using that experiment's own tier names.
  //     Renaming it would falsify a historical record, and historical visibility is deliberately kept.
  //   - mlb/page.tsx calls the home-run Power Board "high-variance", which describes a market's spread,
  //     not a confidence tier.
  const TIER_LABEL_ASSIGNMENT = /(?:label:\s*|return\s*)"(?:Stronger signals?|High-variance|Watch)"/;
  const TIER_LABEL_JSX = /<[^>]*>\s*(?:Stronger signals?|High-variance)\s*</;
  for (const rel of SURFACES) {
    const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    assert.doesNotMatch(code, TIER_LABEL_ASSIGNMENT, `${rel} assigns an old ranking label to a tier`);
    assert.doesNotMatch(code, TIER_LABEL_JSX, `${rel} renders an old ranking label as a chip`);
  }
});

test("the glossary no longer claims confidence gates data quality, and states the inversion", () => {
  const g = read("src/lib/glossary.ts");
  assert.match(g, /ANTI-PREDICTIVE/i, "the glossary must state the inversion plainly");
  assert.match(g, /49\.3%|50\.6%|51\.7%/, "the glossary must quote the measured rates");
  assert.match(g, /does not up-weight/i, "the promise the code now keeps must stay stated");
});

// ── the promise and the code must agree ───────────────────────────────────

test("the glossary promise is actually enforced in the scoring code", () => {
  // This is the exact contradiction Sprint 034 found: the glossary said confidence does not up-weight,
  // while leg-scoring gave High 30 points and Low 8. Assert both halves in one place so they cannot
  // drift apart again.
  const glossary = read("src/lib/glossary.ts");
  assert.match(glossary, /does not up-weight/i);

  const scoring = read("src/lib/parlays/leg-scoring.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  assert.doesNotMatch(scoring, /High:\s*\d+/, "leg scoring must not assign a numeric weight to a tier");
  assert.doesNotMatch(scoring, /confidenceTier\s*\]/, "leg scoring must not index a weight map by tier");
});

// ── mutation: prove these guards can fail ─────────────────────────────────

test("MUTATION · restoring the inverted labels trips the guard", () => {
  const rel = "src/lib/confidence-labels.ts";
  const abs = path.join(APP, rel);
  const original = fs.readFileSync(abs, "utf8");
  const before = createHash("md5").update(original).digest("hex");
  try {
    const mutated = original.replace('return "Category A";', 'return "Stronger signal";');
    assert.notEqual(mutated, original, "mutation must change the file");
    fs.writeFileSync(abs, mutated);
    const code = fs.readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(code, /return "Stronger signal"/, "the guard must detect the restored label");
  } finally {
    fs.writeFileSync(abs, original);
    assert.equal(
      createHash("md5").update(fs.readFileSync(abs, "utf8")).digest("hex"),
      before,
      "file must be restored byte-identically",
    );
  }
  assert.doesNotMatch(
    read("src/lib/confidence-labels.ts").replace(/\/\*[\s\S]*?\*\//g, ""),
    /return "Stronger signal"/,
  );
});

// ── money guard ────────────────────────────────────────────────────────────

test("money file untouched", () => {
  const md5 = createHash("md5")
    .update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json")))
    .digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
