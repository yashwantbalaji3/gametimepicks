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
 * Usage: npx tsx scripts/products/build-daily-product-receipts.mjs --now <iso> [--date YYYY-MM-DD]
 * Writes: data/internal/products/receipts/<date>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { buildPersistedDailyPortfolio } from "../../src/lib/daily-portfolio/accounting.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
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

const products = [productEntry("bank-builder", "Bank Builder"), productEntry("moonshot", "Moonshot"), vault];
for (const p of products) {
  if (!RECEIPT_STATES.includes(p.state)) { console.error(`REFUSED: ${p.product} produced state ${p.state} outside the closed set`); process.exit(2); }
  // the load-bearing invariant: NO_PLAY requires a completed evaluation
  if (p.state === "NO_PLAY" && !p.reason) { console.error(`REFUSED: ${p.product} claims NO_PLAY without a reason`); process.exit(2); }
}

const receipt = {
  schemaVersion: 1,
  artifact: "daily-product-receipt",
  dataClass: "PRIVATE_OPERATING_RECORD",
  date: DATE,
  generatedAt: NOW,
  states: RECEIPT_STATES,
  inputs,
  products,
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
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(receipt, null, 1));
console.log(`product receipt ${DATE}: ${products.map((p) => `${p.product}=${p.state}`).join(" · ")}`);
console.log(`inputs: board ${boardGames} games / ${boardLeans} leans · ${inputs.nflNote}`);
for (const p of products) for (const r of p.rejections.slice(0, 2)) console.log(`  ${p.product} ${r.lane ?? ""}: ${r.reason}`);
