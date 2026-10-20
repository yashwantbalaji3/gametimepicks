/**
 * NBA PRODUCT EXPOSURE INVARIANT. Run (from app/): npx tsx --test src/lib/products/nba/nba-product-exposure-invariant.test.mjs
 *
 * NBA reaches Bank Builder, Moonshot, Parlay Lab or the Smart Betslip only when EVERY gate below opens, in the order
 * docs/nba/NBA_PRODUCT_INTEGRATION_PLAN_2026-10-21.md sets out. While the capability registry keeps NBA
 * HISTORICAL_ONLY, each exclusion point must refuse NBA ON ITS OWN — so one flipped switch (a hand-set
 * `eligible: true`, a non-empty NBA candidate list, a lab SOURCES entry, a settler entry, a family grant) turns this
 * file red instead of leaking NBA into a product. Each test reports every leaking point it finds, not the first.
 *
 * It also asserts that nothing NBA emits a sportsbook URL or deep link (Terms: the Site does not "link to or partner
 * with any sportsbook").
 *
 * Synthetic legs below are TEST FIXTURES: invented ids and prices, labelled.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canEnterPredictionProducts, canShowLiveProjections, capabilityState } from "../../sport-capability-registry.ts";
import { SPORT_LEG_RULES, legSportEligibility } from "../../daily-portfolio/sport-eligibility.ts";
import { bbEligibility } from "../../daily-portfolio/accounting.ts";
import { CONTRACT_SPORTS, FORECAST_CLASS, evaluateLeg, guardLegs } from "../eligible-leg/contract.mjs";
import { EXCLUSION, LEG_FLOOR_V2, evaluateReceiptV2 } from "../engine-v2/eligibility.mjs";
import { FAMILY_PRODUCT_GRANTS } from "../engine-v2/family-gate.mjs";
import { LEG_CLASS, makeReceiptV2 } from "../engine-v2/receipt.mjs";
import { SETTLEABLE_SPORTS, buildMultiLadder } from "../../parlays/multi-sport.mjs";
import { labEligibility } from "../../../../scripts/parlays/lab-eligibility.mjs";
import { buildEligibleLegs } from "../../../../scripts/products/build-product-eligible-legs.mjs";
import { evaluateMarket, WITHHELD } from "../../consistency/market-evaluator.mjs";
import { LANE } from "../../sports/nba/experimental-public-lane.mjs";
import { LEGAL_DOCUMENTS } from "../../legal/texts.mjs";
import { nbaLegFromEvaluation, REFUSAL } from "./nba-leg.mjs";
import { toParlayCandidateInput, toSmartSlipRow } from "./cross-sport.mjs";
import { evaluate, permissiveSnapshot, PERMISSIVE_REGISTRY, realShapeSnapshot, verificationFor } from "./__fixtures__/permissive.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");
const REPO = path.resolve(APP, "..");
const PUBLIC = path.join(APP, "public", "data");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const FUTURE = new Date(Date.now() + 6 * 3600_000).toISOString();
const NOW = new Date().toISOString();
const TODAY = NOW.slice(0, 10);
const NBA_CLOSED = !canEnterPredictionProducts("nba");

/** Collects every leak, then fails once with all of them. */
function leakReport() {
  const leaks = [];
  return { leak: (point, why) => leaks.push(`${point}: ${why}`), done: () => assert.deepEqual(leaks, [], `NBA leaks while the registry is ${capabilityState("nba")}:\n  ${leaks.join("\n  ")}`) };
}

test("the registry itself is the first guarded switch: NBA is HISTORICAL_ONLY and may not enter products", () => {
  assert.equal(capabilityState("nba"), "HISTORICAL_ONLY",
    "the NBA registry state moved — that is step 4 of the activation sequence (docs/nba/NBA_PRODUCT_INTEGRATION_PLAN_2026-10-21.md) and must land with steps 1–3 evidenced, the prereg bars met and founder approval, in the same reviewed PR that updates this invariant");
  assert.equal(canEnterPredictionProducts("nba"), false);
  assert.equal(canShowLiveProjections("nba"), false);
});

test("every exclusion point refuses NBA on its own while the registry is HISTORICAL_ONLY", { skip: !NBA_CLOSED && "registry admits NBA — the activation PR owns this invariant" }, async () => {
  const { leak, done } = leakReport();

  // 1 · daily-portfolio/sport-eligibility.ts — hand-set rule
  if (SPORT_LEG_RULES.NBA?.eligible !== false) leak("sport-eligibility.ts SPORT_LEG_RULES.NBA", `eligible is ${SPORT_LEG_RULES.NBA?.eligible}`);
  for (const spelling of ["NBA", "nba", " Nba "]) if (legSportEligibility({ sport: spelling }).eligible) leak("sport-eligibility.ts legSportEligibility", `admits ${JSON.stringify(spelling)}`);

  // 2 · daily-portfolio/accounting.ts bbEligibility — Bank Builder / Moonshot activation (TEST FIXTURE legs)
  const fx = (sport, gameId) => ({ sport, gameId, matchup: `${gameId} TEST FIXTURE`, kickoffUtc: FUTURE });
  for (const legs of [[fx("NBA", "n1"), fx("NBA", "n2")], [fx("MLB", "m1"), fx("NBA", "n1")], [fx("nba", "n1"), fx("MLB", "m1")]]) {
    const v = bbEligibility({ legs, fitsTarget: true, step: 1 }, Date.now());
    if (v.eligible) leak("accounting.ts bbEligibility", `activates a card holding ${legs.map((l) => l.sport).join("+")}`);
  }

  // 3 · scripts/products/build-product-eligible-legs.mjs — the NBA candidate list is empty by construction
  const builder = strip(read("scripts/products/build-product-eligible-legs.mjs"));
  if (!/\bnba:\s*\{\s*candidates:\s*\[\]\s*,/.test(builder)) leak("build-product-eligible-legs.mjs", "the NBA entry is no longer the hardcoded empty candidate list");
  const built = buildEligibleLegs({ date: TODAY, now: NOW, root: PUBLIC });
  const nbaLegs = built.artifact.legs.filter((l) => l.sport === "nba");
  if (nbaLegs.length) leak("build-product-eligible-legs.mjs buildEligibleLegs", `${nbaLegs.length} NBA legs built`);
  if ((built.manifest.sports.nba?.eligibleLegCount ?? 0) !== 0) leak("build-product-eligible-legs.mjs manifest", "NBA eligible legs counted");
  if ((built.availability.sports.nba?.eligibleLegs ?? 0) !== 0) leak("build-product-eligible-legs.mjs availability", "NBA availability counts eligible legs");

  // 4 · products/eligible-leg/contract.mjs — a PERFECT validated NBA candidate is still refused by the registry
  const perfect = {
    sport: "nba", eventId: "TEST-FIXTURE-1", eventStartUtc: FUTURE, marketKey: "player_points", marketFamily: "player_points", side: "over", line: 23.5,
    forecastOwner: "TEST FIXTURE", sourceReceiptRefs: ["TEST-FIXTURE"], forecastClass: FORECAST_CLASS.VALIDATED_MODEL, modelStatus: "PUBLISHED", probability: 0.55,
    oddsForSide: { american: -110, bookmaker: "draftkings", capturedAt: NOW, receipt: "TEST-FIXTURE" },
  };
  if (!CONTRACT_SPORTS.includes("nba")) leak("eligible-leg/contract.mjs CONTRACT_SPORTS", "nba missing — the registry gate, not SPORT_UNKNOWN, must be what refuses");
  const evaluated = evaluateLeg(perfect, { asOf: NOW });
  if (evaluated.productEligible || !evaluated.eligibilityReasonCodes.includes("SPORT_NOT_ELIGIBLE")) leak("eligible-leg/contract.mjs evaluateLeg", `NBA leg productEligible=${evaluated.productEligible} (${evaluated.eligibilityReasonCodes})`);
  const guarded = guardLegs([{ ...evaluated, productEligible: true }], { asOf: NOW });
  if (guarded.kept.length) leak("eligible-leg/contract.mjs guardLegs", "an artifact claiming an eligible NBA leg was kept at read time");

  // 5 · products/engine-v2/eligibility.mjs — SPORT_GATED, and no NBA family grant
  const receipt = makeReceiptV2({
    legClass: LEG_CLASS.PLAYER, sport: "nba", eventId: "TEST-FIXTURE-1", eventStartUtc: FUTURE, participantId: "11", family: "player_points", side: "over", line: 23.5,
    sportsbook: "draftkings", price: -110, marketCapturedAt: NOW, probabilityDetail: "MODEL_PUBLISHED", modelProbability: 0.55, publicationStatus: "PUBLISHED",
    availabilityState: "ACTIVE", roleState: "CONFIRMED_STARTER", settlementSupport: LEG_FLOOR_V2.requireSettlement,
  });
  const v2 = evaluateReceiptV2(receipt, { asOf: NOW });
  if (v2.eligible || !v2.exclusionCodes.includes(EXCLUSION.SPORT_GATED)) leak("engine-v2/eligibility.mjs evaluateReceiptV2", `NBA receipt eligible=${v2.eligible} (${v2.exclusionCodes})`);
  const nbaGrants = FAMILY_PRODUCT_GRANTS.filter((g) => String(g.sport).toLowerCase() === "nba");
  if (nbaGrants.length) leak("engine-v2/family-gate.mjs FAMILY_PRODUCT_GRANTS", `${nbaGrants.length} NBA family grant(s)`);

  // 6 · scripts/parlays/lab-eligibility.mjs — no NBA source; the measured lab never lists NBA live
  const labSrc = strip(read("scripts/parlays/lab-eligibility.mjs"));
  const sourcesBlock = labSrc.slice(labSrc.indexOf("const SOURCES = {"), labSrc.indexOf("export function capabilityGateOf"));
  if (/^\s{2}nba:\s*\{/m.test(sourcesBlock)) leak("lab-eligibility.mjs SOURCES", "an nba entry exists");
  if (/\bnba:\s*"risk-ladder/.test(labSrc)) leak("lab-eligibility.mjs LADDER_DIR", "an nba ladder dir is mapped");
  const lab = labEligibility(PUBLIC, TODAY, NOW);
  if (lab.some((s) => s.id === "nba" && s.live)) leak("lab-eligibility.mjs labEligibility", "NBA stream live");
  const multi = lab.find((s) => s.id === "multi");
  if (multi?.evidence?.liveSports?.includes("nba")) leak("lab-eligibility.mjs multi", "NBA among live sports");
  if (fs.existsSync(path.join(PUBLIC, "parlays", "risk-ladder-nba"))) leak("public/data/parlays", "a risk-ladder-nba directory exists");

  // 7 · parlays/multi-sport.mjs — no NBA settler, and a built cross-sport ladder carries no NBA leg (TEST FIXTURE ladders)
  if (SETTLEABLE_SPORTS.map((s) => s.toLowerCase()).includes("nba")) leak("multi-sport.mjs SETTLEABLE_SPORTS", "nba listed");
  const ladder = (sport, n) => ({ cards: [{ legs: Array.from({ length: n }, (_, i) => ({ gameId: `${sport}-TEST-FIXTURE-${i}`, market: "moneyline", side: "home", odds: 120 })) }] });
  const out = buildMultiLadder({ liveSports: ["mlb", "nba"], riskOrder: ["low", "medium", "high", "longshot"], date: TODAY, ladderFor: (s) => ladder(s, 6) });
  if (out.cards.some((c) => c.legs.some((l) => l.sport === "nba"))) leak("multi-sport.mjs buildMultiLadder", "a published cross-sport card holds an NBA leg");

  // 8 · consistency: the official NBA snapshot is private and product-closed; evaluations are never qualified
  const snap = realShapeSnapshot();
  if (snap.capability.canEnterPredictionProducts !== false) leak("official-snapshot.mjs capability", "NBA snapshot stamped product-eligible");
  const e = evaluateMarket({ snapshot: snap, playerId: "11", family: "pts", line: 23.5, book: "draftkings", overAmerican: 110, underAmerican: -130, capturedAt: "2026-11-01T12:30:00Z", now: "2026-11-01T13:00:00Z" });
  if (e.eligibility.qualified || !e.withheldReasons.includes(WITHHELD.SPORT_NOT_PRODUCT_ELIGIBLE)) leak("market-evaluator.mjs", "an NBA evaluation is qualified");

  // 9 · the NBA leg adapter (this directory): the real registry refuses even a fully permissive TEST FIXTURE input
  const ps = permissiveSnapshot(); const pe = evaluate(ps);
  const r = nbaLegFromEvaluation({ evaluation: pe, snapshot: ps, verification: verificationFor(pe) });
  if (r.ok || !r.refusal.reasons.includes(REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE)) leak("products/nba/nba-leg.mjs", "produced a leg under the real registry");

  // 10 · the experimental public lane stays on /nba
  if (LANE.surfaces.some((s) => s !== "/nba")) leak("experimental-public-lane.mjs LANE.surfaces", `${LANE.surfaces}`);

  // 11 · PR #1141's candidate gate, once it is on this branch (checked against the real registry regardless of injection)
  const candPath = path.join(APP, "src", "lib", "parlays", "v2", "candidate.mjs");
  if (fs.existsSync(candPath)) {
    const { evaluateCandidate } = await import("../../parlays/v2/candidate.mjs");
    const c = { schema: "gtp.parlay.candidate@1", league: "nba", eventId: "TEST-FIXTURE-1", market: "player_points", selection: "Over 23.5", line: 23.5, gameStart: FUTURE, eventLockAt: new Date(Date.parse(FUTURE) - 1800_000).toISOString(), americanOdds: -110, capturedAt: NOW, book: "draftkings" };
    const ev = evaluateCandidate(c, { now: NOW, coverage: {}, isVerifiedOperator: () => true, canEnterLeague: () => true });
    if (ev.eligibility.state === "ELIGIBLE") leak("parlays/v2/candidate.mjs evaluateCandidate", "an NBA candidate is eligible with a permissive injected league gate");
  }

  done();
});

test("the NBA product modules are INERT: nothing outside their own tests imports them", () => {
  let hits = "";
  try {
    hits = execFileSync("git", ["grep", "-l", "-E", "products/nba/|from \"\\./nba-leg\\.mjs\"|from \"\\./product-tiers\\.mjs\"|from \"\\./cross-sport\\.mjs\"", "--", "src", "scripts"], { cwd: APP, encoding: "utf8" });
  } catch (e) { hits = e.status === 1 ? "" : String(e.stdout ?? ""); }
  const importers = hits.split("\n").filter(Boolean).filter((f) => !/^src\/lib\/products\/nba\/[^/]+\.test\.mjs$/.test(f) && !/^src\/lib\/products\/nba\/(nba-leg|product-tiers|cross-sport)\.mjs$/.test(f) && !/^src\/lib\/products\/nba\/__fixtures__\//.test(f));
  assert.deepEqual(importers, [], "a build/page/script imports the inert NBA product adapter — activation must follow the plan");
});

/* ─────────────────────────────── no sportsbook link, anywhere NBA ─────────────────────────────── */

const BOOK = "(draftkings|fanduel|betmgm|caesars|williamhill|betrivers|fanatics|espnbet|betparx|bovada|betonline|mybookie|betus|lowvig|betanysports|bet365|pointsbet|hardrock|sportsbook)";
const SPORTSBOOK_URL = new RegExp(`(?:https?:)?//[^\\s"'<>()]*${BOOK}[^\\s"'<>()]*`, "i");
const DEEP_LINK = new RegExp(`\\b(?:dksb|fdsb|${BOOK.slice(1, -1)})[a-z]*://`, "i");
const SLIP_WORDS = /BetSlipDeepLink|addToBetslip|betslip\?|[?&]outcomes=|affiliate[_-]?(?:id|url|link)/i;
const linkHit = (text) => text.match(SPORTSBOOK_URL)?.[0] ?? text.match(DEEP_LINK)?.[0] ?? text.match(SLIP_WORDS)?.[0] ?? null;

function walk(dir, keep) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (ent.name !== "node_modules") out.push(...walk(p, keep)); } else if (keep(p)) out.push(p);
  }
  return out;
}

test("the scan patterns catch the real deep-link shapes (ESPN's recorded DraftKings betslip gateway)", () => {
  assert.ok(linkHit("https://sportsbook.draftkings.com/gateway?wpcrn=BetSlipDeepLink&preurl=x"));
  assert.ok(linkHit("dksb://sb/addbet/123"));
  assert.ok(linkHit("fanduel://launch?betslip?legs=1"));
  assert.equal(linkHit("Sportsbook availability varies by state."), null, "the availability sentence is not a link");
  assert.equal(linkHit("https://www.espn.com/nba/game/_/gameId/401"), null);
});

test("no NBA source file emits a sportsbook URL or deep link", () => {
  const isSource = (p) => /\.(m?js|tsx?)$/.test(p) && !/\.test\.m?[jt]sx?$/.test(p) && !/__fixtures__/.test(p);
  const files = [
    ...walk(path.join(APP, "src", "lib", "sports", "nba"), isSource),
    ...walk(path.join(APP, "src", "lib", "simulation-theater", "nba"), isSource),
    ...walk(path.join(APP, "scripts", "nba"), isSource),
    ...walk(path.join(APP, "src", "components", "nba"), isSource),
    ...walk(path.join(APP, "src", "app", "nba"), isSource),
    ...walk(HERE, isSource),
    path.join(APP, "src", "lib", "consistency", "official-snapshot.mjs"),
    path.join(APP, "src", "lib", "consistency", "market-evaluator.mjs"),
  ];
  assert.ok(files.length > 20, `scanned ${files.length} files`);
  const hits = files.map((f) => [path.relative(APP, f), linkHit(fs.readFileSync(f, "utf8"))]).filter(([, h]) => h);
  assert.deepEqual(hits, []);
});

test("no committed NBA data file (public or internal forecast/board artifacts) carries a sportsbook URL or deep link", () => {
  const json = (p) => /\.json$/.test(p);
  const files = [
    ...walk(path.join(PUBLIC, "nba"), json),
    ...walk(path.join(PUBLIC, "products"), json),
    ...["experimental", "experimental-v0.1", "experimental-v0.2", "experimental-v1", "top-boards", "reports"].flatMap((d) => walk(path.join(REPO, "data", "internal", "research", "nba", d), json)),
  ];
  assert.ok(files.length > 20, `scanned ${files.length} files`);
  const hits = files.map((f) => [path.relative(REPO, f), linkHit(fs.readFileSync(f, "utf8"))]).filter(([, h]) => h);
  assert.deepEqual(hits, []);
});

test("a produced NBA leg (TEST FIXTURE) and its Parlay Lab / Smart Betslip projections carry no link of any kind", () => {
  const s = permissiveSnapshot(); const e = evaluate(s);
  const { leg } = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e), registry: PERMISSIVE_REGISTRY });
  const ANY_URL = /[a-z][a-z0-9+.-]*:\/\/|www\./i;
  for (const [name, obj] of [["leg", leg], ["parlay candidate input", toParlayCandidateInput(leg)], ["smart slip row", toSmartSlipRow(leg)]]) {
    const text = JSON.stringify(obj);
    assert.doesNotMatch(text, ANY_URL, `${name} carries a URL`);
    assert.equal(linkHit(text), null, name);
    assert.doesNotMatch(Object.keys(flatten(obj)).join(","), /(^|\.)(url|href|deepLink|link)$/i, `${name} has no populated link field`);
  }
  assert.equal(leg.handoff.link, null);
  assert.equal(toSmartSlipRow(leg).handoff.status, "HANDOFF_NOT_AVAILABLE");
  // the Terms sentence this rests on is still the published one
  assert.ok(JSON.stringify(LEGAL_DOCUMENTS.terms).includes("link to or partner with any sportsbook"), "Terms still forbid sportsbook links");
});

function flatten(o, p = "", out = {}) {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (v != null) out[key] = v;
  }
  return out;
}
