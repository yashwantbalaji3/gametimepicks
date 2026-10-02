/**
 * SESSION 5 · FOUNDER DECISION D2 — one public risk taxonomy.
 *
 * The four public labels (Low Risk · Medium Risk · High Risk · Longshot) on the canonical price bands live in ONE owner,
 * risk-odds-bands.mjs. No surface keeps its own label table, no producer writes its own spelling, and nothing that is not
 * one of those price bands is called by one of those names — a reader style that holds Low Risk AND Medium Risk cards
 * is "Balanced", never "Medium".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PARLAY_ODDS_BANDS, PUBLIC_RISK_TIERS, PUBLIC_RISK_LABELS, PUBLIC_RISK_BAND_TEXT, publicRiskLabel,
  READER_STYLE_LABELS, readerStyleBlurb, getRiskBucketForCombinedOdds,
} from "./risk-odds-bands.mjs";

const OWNER = "src/lib/parlays/risk-odds-bands.mjs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
  return /\.(m?js|tsx?)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name) ? [p] : [];
});
const SOURCES = ["src", "scripts"].flatMap(walk);

test("the owner: four labels, on the canonical bands, with the band text derived from the numbers", () => {
  assert.deepEqual([...PUBLIC_RISK_TIERS], ["low", "medium", "high", "longshot"]);
  assert.deepEqual({ ...PUBLIC_RISK_LABELS }, { low: "Low Risk", medium: "Medium Risk", high: "High Risk", longshot: "Longshot" });
  for (const t of PUBLIC_RISK_TIERS) assert.equal(PUBLIC_RISK_LABELS[t], PARLAY_ODDS_BANDS[t].label);
  assert.deepEqual({ ...PUBLIC_RISK_BAND_TEXT }, { low: "−200 to +100", medium: "+100 to +300", high: "+300 to +600", longshot: "> +600" });
  assert.equal(publicRiskLabel("MEDIUM"), "Medium Risk");
  assert.equal(publicRiskLabel("balanced"), null, "an alias or style is not a public tier");
  assert.equal(getRiskBucketForCombinedOdds(450), "high");
});

test("no source keeps a second tier-label table or a second spelling", () => {
  const offenders = [];
  const TABLE = /\b(low|medium|high)\s*:\s*["'`](Low|Medium|High)( risk| Risk)?["'`]/;
  const SPELLING = /["'`](Low risk|Medium risk|High risk)\b/;
  const LIST = /\[\s*["'`]Low Risk["'`]\s*,\s*["'`]Medium Risk["'`]/;
  /* Not public tier labels: normalize.ts's RiskTier is an internal enum ("Low"…) that RiskPill maps to the public label;
     the UFC engine's CONF_LABEL is a confidence scale. */
  const NOT_TIER_LABELS = new Set(["src/lib/normalize.ts", "src/lib/ufc/ufc-prediction-engine.ts"]);
  for (const f of SOURCES) {
    if (f === OWNER || NOT_TIER_LABELS.has(f)) continue;
    const code = strip(fs.readFileSync(f, "utf8"));
    for (const [name, re] of [["label table", TABLE], ["lower-case spelling", SPELLING], ["literal list", LIST]]) {
      if (re.test(code)) offenders.push(`${f}: ${name} — ${code.match(re)[0]}`);
    }
  }
  assert.deepEqual(offenders, [], "read PUBLIC_RISK_LABELS / publicRiskLabel from risk-odds-bands.mjs");
});

test("reader styles never borrow a risk level's name unless they ARE exactly that band", async () => {
  const ladder = fs.readFileSync("scripts/parlays/build-risk-ladder.mjs", "utf8");
  assert.match(ladder, /label: READER_STYLE_LABELS\[t\.id\], blurb: readerStyleBlurb\(t\.bands, t\.cardsPerDay\)/, "the producer names styles from the owner");
  assert.doesNotMatch(strip(ladder), /id: "balanced", label: "Medium"|id: "adventurous", label: "High"|id: "steady", label: "Low"/);
  const riskNames = new Set(Object.values(PUBLIC_RISK_LABELS).map((l) => l.toLowerCase()).concat(["low", "medium", "high"]));
  const BANDS = { steady: ["low"], balanced: ["low", "medium"], adventurous: ["medium", "high"], longshot: ["longshot"] };
  for (const [id, label] of Object.entries(READER_STYLE_LABELS)) {
    if (!riskNames.has(label.toLowerCase())) continue;
    assert.deepEqual(BANDS[id], [Object.keys(PUBLIC_RISK_LABELS).find((t) => PUBLIC_RISK_LABELS[t].toLowerCase() === label.toLowerCase() || t === label.toLowerCase())],
      `${id} is called "${label}" — only a style that is exactly that one band may share its name`);
  }
  assert.equal(readerStyleBlurb(["low", "medium"], 2), "Low Risk and Medium Risk cards, two a day.");
  const entry = strip(fs.readFileSync("src/components/parlays/parlay-lab-entry.tsx", "utf8"));
  assert.match(entry, /READER_STYLE_LABELS\[RISK_TO_TIER\[key\]/, "the style buttons are named by the owner");
  assert.doesNotMatch(entry, /\{ key: "medium", label: "Medium" \}/);
  assert.match(entry, /Your style/);
});

test("the live artifact (when regenerated) carries the canonical labels; a stale one is never relabelled by hand", () => {
  const doc = JSON.parse(fs.readFileSync("public/data/parlays/risk-ladder/latest.json", "utf8"));
  for (const c of doc.cards ?? []) {
    if (c.tierLabel === PUBLIC_RISK_LABELS[c.tier]) continue;
    assert.equal(c.tierLabel.toLowerCase(), PUBLIC_RISK_LABELS[c.tier].toLowerCase(), `${c.tier}: a pre-D2 artifact differs only by case`);
  }
});

test("D4 · /build's suggested-card lobby admits UFC cards only through the capability registry", () => {
  const src = strip(fs.readFileSync("src/lib/picks/suggested-cards.ts", "utf8"));
  assert.match(src, /ufcSettled\(\) \? null : !canEnterPredictionProducts\("ufc"\) \? null :/);
});
