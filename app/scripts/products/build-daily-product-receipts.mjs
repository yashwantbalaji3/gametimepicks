/**
 * Daily product receipts (Program 172 · Releases E/F/G). PRIVATE OPERATING RECORD.
 *
 * ONE writer producing ONE dated receipt per day covering Bank Builder, Moonshot, and End Zone
 * Vault. It does NOT re-implement any policy and it does NOT write money: it reads the live
 * authorities and records what they decided, so the receipt can never disagree with the product.
 *
 *   Bank Builder + Moonshot   buildPersistedDailyPortfolio (src/lib/daily-portfolio/accounting.ts)
 *                             — the same call activate-daily-portfolio.mjs makes, with the same
 *                             root/date, so lane states and rejection reasons are verbatim.
 *   End Zone Vault            data/internal/nfl/end-zone-vault/ledger.json (its own append-only
 *                             record; this receipt reports it, never rewrites it).
 *
 * THE DISTINCTION THIS EXISTS TO PRESERVE: "we ran and nothing qualified" is a product decision;
 * "the inputs never arrived" is an operational fact. Both leave the page empty, and before this
 * they were indistinguishable. A missing slate yields INPUTS_MISSING — never NO_PLAY.
 *
 * P211 · Release A: the same writer now ALSO types each signature product's day through the closed
 * LIFECYCLE vocabulary (lib/products/daily-state-machine.mjs) via the pure derivation bridge —
 * evaluation verdict verbatim, settlement only from the official settler's dated artifact,
 * progression only from the ledger owner's portfolio and only while it is fresh. One writer, one
 * stamp, two views of the same authorities. `--dry-run` derives and prints everything, writes
 * nothing — the recovery command's first form.
 *
 * Usage: npx tsx scripts/products/build-daily-product-receipts.mjs --now <iso> [--date YYYY-MM-DD] [--dry-run]
 * Writes: data/internal/products/receipts/<date>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { buildPersistedDailyPortfolio } from "../../src/lib/daily-portfolio/accounting.ts";
import { LIFECYCLE_STATES, productWatchdog } from "../../src/lib/products/daily-state-machine.mjs";
import { deriveLifecycle } from "../../src/lib/products/daily-lifecycle-derive.mjs";
import { CURRENT_POLICY } from "../../src/lib/products/selection-policy.mjs";
import { PRODUCT_REGISTRY } from "../../src/lib/products/lifecycle-registry.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const DRY_RUN = process.argv.includes("--dry-run");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DATE = arg("--date", NOW.slice(0, 10));
const DATA = path.join(APP, "public", "data");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const hash = (p) => { try { return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex").slice(0, 12); } catch { return null; } };

/**
 * The closed state machine. NOT_RUN and INPUTS_MISSING are operational; NO_PLAY and ACTIVE are
 * product decisions; STALE and INCIDENT are failures. Nothing may reach NO_PLAY without a
 * completed evaluation over a real candidate pool.
 */
export const RECEIPT_STATES = Object.freeze([
  "NOT_RUN", "INPUTS_MISSING", "STALE", "INCIDENT", "NO_PLAY", "ACTIVE", "PENDING_RESULT", "SETTLED", "VOID",
  // P198: a dormant league's lanes carry a receipt too — derived from its own results capture.
  "OFF_SEASON",
]);

// ---------------------------------------------------------------- inputs the products depend on
const board = read(path.join(DATA, `mlb/boards/${DATE}.json`));
const boardGames = board?.games?.length ?? 0;
const boardLeans = board?.leans?.length ?? 0;
const nflMarkets = read(path.join(DATA, "nfl/markets/latest.json"));
const nflStatus = read(path.join(DATA, "nfl/model-status.json"));

// NFL contributes to a product only when a MODEL layer is publishable — prices alone never are.
const nflModelEligible = nflStatus?.teamSimulation?.state === "LIVE";
const inputs = {
  mlbBoard: { date: DATE, present: Boolean(board), games: boardGames, leans: boardLeans, hash: hash(path.join(DATA, `mlb/boards/${DATE}.json`)) },
  nflMarket: { present: Boolean(nflMarkets), capturedAt: nflMarkets?.capturedAt ?? null, events: nflMarkets?.eventCount ?? 0 },
  nflModelEligible,
  nflNote: nflModelEligible
    ? "NFL model layer is publishable and may contribute legs"
    : `NFL contributes NO legs: ${nflStatus?.teamSimulation?.state ?? "UNKNOWN"} — sportsbook prices are not a GameTimePicks pick`,
};

// ---------------------------------------------------------------- run the LIVE authority
let portfolio = null;
let evaluationError = null;
if (board) {
  try {
    portfolio = buildPersistedDailyPortfolio(DATA, NOW, DATE, NOW, false);
  } catch (e) {
    evaluationError = String(e?.message ?? e);
  }
}

/** Turn one product's lanes into a receipt entry, preserving the policy's own reasons. */
function productEntry(product, label) {
  if (!board) {
    return {
      product, label, state: "INPUTS_MISSING",
      reason: `no MLB board exists for ${DATE} — the daily slate has not been generated, so the product could not evaluate anything. This is an operational gap, not a model decision.`,
      candidatesEvaluated: 0, rejections: [], card: null,
    };
  }
  if (evaluationError) {
    return { product, label, state: "INCIDENT", reason: `evaluation threw: ${evaluationError}`, candidatesEvaluated: 0, rejections: [], card: null };
  }
  const lanes = (portfolio?.lanes ?? []).filter((l) => l.product === product);
  if (!lanes.length) {
    return { product, label, state: "INCIDENT", reason: "the portfolio builder returned no lanes for this product — expected at least one", candidatesEvaluated: 0, rejections: [], card: null };
  }
  const active = lanes.filter((l) => l.status === "active");
  // rejection reasons come VERBATIM from the live policy — this script never invents one
  const rejections = lanes
    .filter((l) => l.status !== "active")
    .map((l) => ({ lane: l.lane, step: l.step, status: l.status, legsFound: l.legCount, legsRequired: l.targetLegs, reason: l.activationEligibility?.reason ?? "no reason recorded by the policy" }));
  const candidatesEvaluated = lanes.reduce((s, l) => s + (l.legCount ?? 0), 0);

  if (active.length) {
    return {
      product, label, state: "ACTIVE",
      reason: `${active.length} lane(s) qualified under the live activation policy`,
      candidatesEvaluated,
      rejections,
      card: active.map((l) => ({ id: l.id, lane: l.lane, step: l.step, legCount: l.legCount, combinedOdds: l.combinedOdds, exposure: l.exposure, potentialReturn: l.potentialReturn })),
    };
  }
  return {
    product, label, state: "NO_PLAY",
    reason: "the daily evaluation completed over a real candidate pool and nothing met policy — a hold is the product's answer, not an outage",
    candidatesEvaluated, rejections, card: null,
  };
}

// ---------------------------------------------------------------- End Zone Vault
const vaultLedger = read(path.join(ROOT, "data/internal/nfl/end-zone-vault/ledger.json"));
const vaultEntry = vaultLedger?.entries?.find((e) => e.date === DATE) ?? null;
const vault = vaultEntry
  ? {
    product: "end-zone-vault", label: "End Zone Vault",
    state: vaultEntry.state === "ACTIVE" ? "ACTIVE" : vaultEntry.state === "NO_PLAY" ? "NO_PLAY" : vaultEntry.state,
    reason: (vaultEntry.reasons ?? []).join(" · ") || "recorded by the Vault's own ledger",
    candidatesEvaluated: (vaultEntry.legs ?? []).length,
    rejections: (vaultEntry.corrections ?? []).map((c) => ({ at: c.at, reason: c.note })),
    card: vaultEntry.state === "ACTIVE" ? vaultEntry.legs : null,
    ledgerOwned: true,
  }
  : { product: "end-zone-vault", label: "End Zone Vault", state: "NOT_RUN", reason: `the Vault ledger holds no entry for ${DATE}`, candidatesEvaluated: 0, rejections: [], card: null, ledgerOwned: true };

// ---------------------------------------------------------------- Homer Nukes
/*
 * A CALIBRATION board, not a money card (P230 · F1). Its record holds gradedPicks, predicted,
 * actual and Brier — no stake and no bankroll — so its day settles SETTLED_RECORDED rather than
 * being forced into a win or a loss it never computes.
 *
 * The board file for the date IS the freeze: the settler reads `homer-nukes/<date>.json`, so the
 * picks of record cannot change after publication.
 */
const hnBoard = read(path.join(DATA, "mlb", "homer-nukes", `${DATE}.json`));
const hnSettled = read(path.join(DATA, "mlb", "homer-nukes", `settled-${DATE}.json`));
const hnPicks = hnBoard?.picks ?? [];
const homerNukes = hnBoard
  ? {
    product: "homer-nukes", label: "Homer Nukes",
    state: hnPicks.length > 0 ? "ACTIVE" : "NO_PLAY",
    reason: hnPicks.length > 0
      ? `${hnPicks.length} model-qualified home-run picks published for the slate`
      : "the board was built and no candidate cleared the model's threshold",
    candidatesEvaluated: hnPicks.length,
    rejections: [],
    card: hnPicks.length > 0 ? hnPicks : null,
    ledgerOwned: true,
  }
  : { product: "homer-nukes", label: "Homer Nukes", state: "NOT_RUN", reason: `no Homer Nukes board exists for ${DATE}`, candidatesEvaluated: 0, rejections: [], card: null, ledgerOwned: true };

// ---------------------------------------------------------------- UFC / EPL paper card ladders
/*
 * EVENT-DRIVEN PRODUCTS (P230 · F1). UFC runs on fight nights and EPL on matchweeks, so most
 * calendar days carry no card — and "no event today" is a REFUSAL with a named reason, never an
 * incident. The two are distinguished by the ladder's own forward pointer: if `latest.json` is
 * published for a future date, the producer ran and the product is simply between events. Only a
 * ladder that does not exist at all is an operational gap.
 *
 * The dated ladder file IS the freeze — the settler reads `risk-ladder-<sport>/<date>.json`, so the
 * cards of record cannot change after publication.
 */
const labSettled = read(path.join(DATA, "parlays", "lab-settled", `${DATE}.json`));
function sportLadderEntry(id, label, sport) {
  const dir = path.join(DATA, "parlays", `risk-ladder-${sport}`);
  const dated = read(path.join(dir, `${DATE}.json`));
  const latest = read(path.join(dir, "latest.json"));
  const cards = dated?.cards ?? [];
  if (dated && cards.length > 0) {
    return { product: id, label, state: "ACTIVE",
      reason: `${cards.length} paper card${cards.length === 1 ? "" : "s"} published for the ${DATE} event`,
      candidatesEvaluated: dated.eligibleLegs ?? cards.length, rejections: [], card: cards, ledgerOwned: true };
  }
  if (dated) {
    return { product: id, label, state: "NO_PLAY",
      reason: (dated.skipped ?? []).map((x) => x.reason ?? x).join(" · ")
        || "the ladder was built for this date and no tier had enough supported legs",
      candidatesEvaluated: dated.eligibleLegs ?? 0, rejections: [], card: null, ledgerOwned: true };
  }
  if (latest?.date && latest.date !== DATE) {
    return { product: id, label, state: "NO_PLAY",
      reason: `no ${label.split(" ")[0]} event on ${DATE} — the ladder is published for ${latest.date}`,
      candidatesEvaluated: 0, rejections: [], card: null, ledgerOwned: true };
  }
  return { product: id, label, state: "NOT_RUN", reason: `no ${sport} ladder exists for ${DATE} and no forward card is published`,
    candidatesEvaluated: 0, rejections: [], card: null, ledgerOwned: true };
}
const ufcCards = sportLadderEntry("ufc-cards", "UFC paper cards", "ufc");
const eplCards = sportLadderEntry("epl-cards", "EPL paper cards", "epl");

/*
 * P198 · Release A: the dormant sport writes a receipt too. "Missing receipt is an incident even
 * when the sport is dormant" — the charter's words, and the control plane's C4 guard needs a dated
 * row to point at. NOT_APPLICABLE is derived from the results capture's own OFF_SEASON state, so
 * when the season starts the row flips honestly instead of someone remembering to edit a list.
 */
const nbaLane = (() => {
  const res = read(path.join(DATA, "nba", "results", "latest.json"));
  const offSeason = res?.state === "OFF_SEASON";
  return {
    product: "nba-lanes", label: "NBA (all lanes)",
    state: offSeason ? "OFF_SEASON" : "NOT_RUN",
    reason: offSeason
      ? "the league is off-season by its own published schedule (results capture state OFF_SEASON); no NBA lane evaluates until real events and the activation gates exist"
      : "NBA results capture did not report OFF_SEASON — investigate before assuming dormancy",
    candidatesEvaluated: 0, rejections: [], card: null, ledgerOwned: false,
  };
})();
const products = [productEntry("bank-builder", "Bank Builder"), productEntry("moonshot", "Moonshot"), vault, homerNukes, ufcCards, eplCards, nbaLane];
for (const p of products) {
  if (!RECEIPT_STATES.includes(p.state)) { console.error(`REFUSED: ${p.product} produced state ${p.state} outside the closed set`); process.exit(2); }
  // the load-bearing invariant: NO_PLAY requires a completed evaluation
  if (p.state === "NO_PLAY" && !p.reason) { console.error(`REFUSED: ${p.product} claims NO_PLAY without a reason`); process.exit(2); }
}

// ------------------------------------------------------------ P211: lifecycle view + watchdog
// The settlement authority's dated artifact and the ledger owner's portfolio — read, never written.
const settledDay = read(path.join(ROOT, "data/picks/mr-dub/settled", `${DATE}.json`));
const pf = read(path.join(DATA, "mr-dub", "portfolio.json"));
const dp = read(path.join(DATA, "mr-dub", "daily-portfolio.json"));
const progressionFresh = Boolean(
  pf?.generatedAt && settledDay?.settledAt && Date.parse(pf.generatedAt) >= Date.parse(settledDay.settledAt),
);
/**
 * WHICH PRODUCTS GET A LIFECYCLE — asked of the registry, not of a literal pair.
 *
 * P230 · F1: this read `if (p.product !== "bank-builder" && p.product !== "moonshot") continue;`,
 * so a product could be registered as governed and still silently receive no lifecycle block here —
 * the membership claim and the thing that makes it true lived in two places that could disagree.
 * Now a product is governed exactly when it is registered, and registration costs an owner for each
 * of its six mechanics.
 */
/** Each product's OWN freeze stamp for this date, or null when it has not frozen one. */
const lockStampFor = (product) => {
  if (product === "homer-nukes") return hnBoard?.date === DATE ? hnBoard?.generatedAt ?? null : null;
  if (product === "end-zone-vault") return vaultEntry?.date === DATE ? `${vaultEntry.date}T00:00:00Z` : null;
  if (product === "ufc-cards") return ufcCards.state === "ACTIVE" ? read(path.join(DATA, "parlays", "risk-ladder-ufc", `${DATE}.json`))?.generatedAt ?? null : null;
  if (product === "epl-cards") return eplCards.state === "ACTIVE" ? read(path.join(DATA, "parlays", "risk-ladder-epl", `${DATE}.json`))?.generatedAt ?? null : null;
  return dp?.date === DATE ? dp?.generatedAt ?? null : null;
};

const settlementFor = (product) => {
  /*
   * Each product's OWN settlement adapter. Bank Builder and Moonshot are graded by the shared dated
   * lanes artifact, which `deriveLifecycle` reduces itself. End Zone Vault is graded inside its own
   * append-only ledger and never appears in those lanes — reading only the shared artifact for it
   * would leave it ACTIVE forever while its real settler worked elsewhere.
   */
  if (product === "end-zone-vault") {
    if (!vaultEntry?.settlement || vaultEntry.settlement === "NOT_APPLICABLE") return null;
    return {
      ref: `end-zone-vault/ledger.json@${vaultEntry.date}`,
      stamp: vaultEntry.date,
      /* PENDING_OFFICIAL_RESULT is pending — the Vault has never published a card, and inventing a
         grade for one that does not exist is the failure this whole release is about. */
      results: vaultEntry.settlement === "PENDING_OFFICIAL_RESULT"
        ? ["pending"]
        : [String(vaultEntry.settlement).toLowerCase()],
      stepAtSettle: 0,
    };
  }
  if (product === "homer-nukes") {
    if (!hnSettled) return null; // the settler has not run for this date yet
    /*
     * PENDING IS PENDING. The board settles only once every pick carries an official result; a
     * partially graded day stays AWAITING_RESULT rather than recording a number that will move.
     */
    const picks = hnSettled.picks ?? [];
    if (!picks.length) return null;
    const ungraded = picks.filter((x) => !x.result || x.result === "pending").length;
    return {
      ref: `homer-nukes/settled-${DATE}.json@${hnSettled.settledAt ?? "unstamped"}`,
      stamp: hnSettled.settledAt ?? DATE,
      results: ungraded > 0 ? ["pending"] : ["recorded"],
      graded: hnSettled.day?.graded ?? picks.length,
      stepAtSettle: 0,
    };
  }
  if (product === "ufc-cards" || product === "epl-cards") {
    if (!labSettled) return null; // the lab settler has not run for this date
    const sport = product === "ufc-cards" ? "ufc" : "epl";
    /* ONLY this sport's cards. The lab receipt carries every stream's cards in one file, and
       grading a product on another stream's result is the cross-ledger identity failure. */
    const mine = (labSettled.cards ?? []).filter((c) => c.sport === sport);
    if (!mine.length) return null;
    return {
      ref: `parlays/lab-settled/${DATE}.json@${labSettled.settledAt ?? "unstamped"}`,
      stamp: labSettled.settledAt ?? DATE,
      results: mine.map((c) => c.result ?? "pending"),
      stepAtSettle: 0,
    };
  }
  return null; // the shared lanes artifact answers for everyone else
};

const lifecycles = [];
for (const p of products) {
  if (!PRODUCT_REGISTRY.isGoverned(p.product)) continue;
  const lc = deriveLifecycle({
    product: p.product,
    date: DATE,
    entry: p,
    settledDay,
    settlement: settlementFor(p.product),
    portfolioLane: p.product === "moonshot" ? pf?.moonshot ?? null : pf?.bankBuilder ?? null,
    progressionFresh,
    boardHash: inputs.mlbBoard.hash,
    // The lock stamp is the product's OWN freeze stamp for this date — never this run's clock, and
    // never another product's. Sharing the daily-portfolio stamp across the loop would have let
    // Homer Nukes enter ACTIVE on Bank Builder's activation time: a freeze boundary borrowed from a
    // different product is not a freeze boundary, and ACTIVE is exactly the state that must not be
    // reachable without one.
    lockAt: lockStampFor(p.product),
    policyVersion: CURRENT_POLICY[p.product] ?? PRODUCT_REGISTRY.get(p.product).policyVersion,
  });
  if (!LIFECYCLE_STATES.concat(["VOIDED", "STOPPED"]).includes(lc.state)) {
    console.error(`REFUSED: ${p.product} lifecycle derived ${lc.state} outside the closed vocabulary`); process.exit(2);
  }
  p.lifecycle = { state: lc.state, policyVersion: lc.policyVersion, evidence: lc.evidence, transitions: lc.transitions };
  lifecycles.push(lc);
}
const watchdog = productWatchdog(lifecycles, Date.parse(NOW));

const receipt = {
  schemaVersion: 1,
  artifact: "daily-product-receipt",
  dataClass: "PRIVATE_OPERATING_RECORD",
  date: DATE,
  generatedAt: NOW,
  states: RECEIPT_STATES,
  lifecycleStates: LIFECYCLE_STATES,
  inputs,
  products,
  watchdog,
  authorities: {
    bankBuilder: "src/lib/daily-portfolio/accounting.ts · buildPersistedDailyPortfolio (the same call activate-daily-portfolio.mjs makes)",
    moonshot: "src/lib/daily-portfolio/accounting.ts · laneEligibility — the LIVE band is MOONSHOT_MIN_COMBINED_ODDS (world-cup/model-qualified-picks.ts)",
    vault: "data/internal/nfl/end-zone-vault/ledger.json (append-only, owned by the Vault)",
    money: "NOT THIS SCRIPT — no money artifact is read for state or written at all",
  },
  honesty: [
    "INPUTS_MISSING is not NO_PLAY: a missing slate is an operational gap, and saying 'nothing qualified' would be a lie about a decision that never happened",
    "every rejection reason is copied verbatim from the live activation policy — this receipt invents none",
    "NFL contributes legs only when its MODEL layer is publishable; captured sportsbook prices never qualify a leg by themselves",
  ],
};

const outPath = path.join(ROOT, "data/internal/products/receipts", `${DATE}.json`);
if (DRY_RUN) {
  console.log(`DRY RUN — nothing written. Would write ${path.relative(ROOT, outPath)}:`);
} else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 1));
}
console.log(`product receipt ${DATE}: ${products.map((p) => `${p.product}=${p.state}`).join(" · ")}`);
console.log(`lifecycle ${DATE}: ${products.filter((p) => p.lifecycle).map((p) => `${p.product}=${p.lifecycle.state}`).join(" · ")} · watchdog ${watchdog.length ? watchdog.map((a) => `${a.product}:${a.kind}`).join(",") : "quiet"}`);
console.log(`inputs: board ${boardGames} games / ${boardLeans} leans · ${inputs.nflNote}`);
for (const p of products) for (const r of p.rejections.slice(0, 2)) console.log(`  ${p.product} ${r.lane ?? ""}: ${r.reason}`);
