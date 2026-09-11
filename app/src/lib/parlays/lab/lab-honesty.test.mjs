/**
 * Parlay Lab 2.0 honesty guards (P260). The "for you" spotlight, chance meter and replay chart
 * personalise a stream whose measured record is negative overall, so the same rules the entry panel
 * lives under apply here: match a stated preference, never advise; show a completed past, never a
 * projection; keep the reader's numbers in their browser.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const LAB = ["src/components/parlays/lab/for-you-spotlight.tsx", "src/components/parlays/lab/chance-meter.tsx", "src/components/parlays/lab/style-replay-chart.tsx", "src/components/parlays/lab/slip-gauges.tsx"];
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const prose = (rel) => code(rel).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

test("the lab never tells the reader to stake", () => {
  for (const f of LAB) for (const advice of [/you should (bet|stake|put|play)/i, /we recommend/i, /recommended (stake|card|bet)/i, /best bet/i, /place this/i, /\block\b/i, /\bedge\b/i])
    assert.doesNotMatch(prose(f), advice, `${f}: ${advice}`);
  assert.match(prose(LAB[0]), /nothing here is a recommendation to stake/i, "and the spotlight says so outright");
});

test("no projection: the replay is a completed past, and nothing forecasts", () => {
  for (const f of LAB) for (const p of [/expected (return|profit)/i, /you (will|can expect)/i, /projected profit/i, /Math\.random/, /\bprofitable\b/i, /guaranteed/i])
    assert.doesNotMatch(code(f), p, `${f}: ${p}`);
  assert.match(code(LAB[2]), /would have taken/, "the replay speaks in the past conditional");
  assert.match(code(LAB[2]), /replayBankroll\(/, "and is drawn from the settled-receipt replay, not a simulation");
});

test("the price's chance is labelled as including the margin, beside the measured record", () => {
  // code(), not prose(): these strings live in JSX attributes (sub="..."), which the tag-stripper removes.
  const m = code(LAB[1]);
  assert.match(m, /include the sportsbook's margin/);
  assert.match(m, /What this risk level has actually done/);
  assert.match(m, /decided cards at this level landed/, "the record names its sample");
});

test("the reader's numbers stay in their browser: the lab reuses the prefs store and sends nothing", () => {
  for (const f of LAB) for (const egress of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "/api/", "localStorage"])
    assert.ok(!code(f).includes(egress), `${f} must not ${egress} (the prefs store owns storage)`);
  assert.match(code(LAB[0]), /useReaderPrefs\(\)/);
});

test("the spotlight renders only where the page supplies the replay, and the page supplies it from settled receipts", () => {
  assert.match(code("src/components/parlays/risk-ladder-board.tsx"), /\{replay \? <ForYouSpotlight/);
  const page = code("src/app/build/page.tsx");
  assert.match(page, /buildTierReplay\(loadLabSettled\(dataRoot\), \{ sport: "mlb" \}\)/);
  assert.match(page, /replay=\{replay\}/);
});

test("switching level re-renders the card rather than hiding the others", () => {
  const s = code(LAB[0]);
  assert.match(s, /RISK_ORDER\.map\(/, "all four levels are always offered");
  assert.match(s, /aria-pressed=\{on\}/, "the chosen level is announced");
  assert.match(s, /key=\{pick\.main\.slipId\}/, "a new card animates in on switch");
});

test("the builder's gauges compare a built card to PUBLISHED cards at the same price, never to itself", () => {
  const g = code("src/components/parlays/lab/slip-gauges.tsx");
  assert.match(g, /bandRecord\(chance\.american, byTier\)/, "the comparison is the band's settled record");
  assert.match(g, /not this card, which/, "and it says the built card has never been graded");
  assert.ok(!/modelProb|winProbability/.test(g), "no model probability on a demoted market");
});

test("a linked pair is named with the engine's own reason, and a shared game is disclosed not blocked", () => {
  const g = code("src/components/parlays/lab/slip-gauges.tsx");
  assert.match(g, /linkedPairs\(engineLegs\)/);
  assert.match(g, /\{p\.reason\}/, "the engine's reason is what renders");
  assert.match(g, /vault-danger[\s\S]{0,80}vault-warn/, "provable conflicts read louder than disclosures");
});

test("the stand-in is offered as a trade and applied only on a tap", () => {
  const g = code("src/components/parlays/lab/slip-gauges.tsx");
  assert.match(g, /A trade, not an improvement/);
  assert.match(g, /onClick=\{\(\) => onSwap\(outgoingKey, alt\.incoming\.leg\)\}/, "nothing swaps itself");
  for (const banned of [/\bbetter\b/i, /\bsafer\b/i, /you should/i]) assert.doesNotMatch(g.replace(/\/\*[\s\S]*?\*\//g, ""), banned);
});

test("the builder renders the gauges, and the page supplies the published band record", () => {
  assert.match(code("src/components/build-experience.tsx"), /<SlipGauges[\s\S]{0,200}byTier=\{bandByTier\}/);
  assert.match(code("src/app/build/custom/page.tsx"), /loadRiskLadderRecord\(dataRoot\)\?\.byTier \?\? null/);
  assert.match(code("src/app/build/custom/page.tsx"), /bandByTier=\{bandByTier\}/);
});
