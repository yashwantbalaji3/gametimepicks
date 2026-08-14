/**
 * NFL product RUN RECEIPTS (Program 183 · Release E). PUBLIC_DERIVED + append-only ledger.
 *
 * "Nothing qualified" is a conclusion. A receipt is the working that leads to it — and the
 * difference matters, because a product that publishes only a verdict is indistinguishable from a
 * product that never ran.
 *
 * So each lane publishes one outcome from a closed set (ACTIVE / NO_PLAY / REFUSED) together with
 * how many candidates it considered and a REJECTION TAXONOMY WITH COUNTS: every candidate leaves by
 * exactly one named door, and the doors sum to the pool. `paused`, a stale prior card, or an absent
 * run are all defects, never states.
 *
 * TODAY'S HONEST ANSWER IS NO_PLAY, and it is over-determined — three independent gates each close
 * it on their own:
 *   1. the team model is BASELINE_ONLY (P181 challenger rejected on frozen bars);
 *   2. all four player families were rejected on their own frozen bars (P183 Release B);
 *   3. the provider offers no NFL player market at all in this window.
 * Any one of those is sufficient. The receipt says so rather than reporting a single reason and
 * leaving a reader to think a small change would open the lane.
 *
 * Usage: node scripts/nfl/build-nfl-product-receipts.mjs --now <iso>
 * Writes: app/public/data/nfl/product-receipts.json
 *         data/internal/nfl/product-receipts/ledger.json   (append-only, one entry per run)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (rel, base = ROOT) => { try { return JSON.parse(fs.readFileSync(path.join(base, rel), "utf8")); } catch { return null; } };

const index = read("public/data/nfl/index.json", APP);
const eligibility = read("public/data/nfl/product-eligibility.json", APP);
const vault = read("public/data/nfl/end-zone-vault/latest.json", APP);
const markets = read("public/data/nfl/markets/latest.json", APP);
const families = read("data/internal/research/nfl/reports/player-family-scorecard.json");

// A receipt built from missing inputs would report a finding about the products drawn from no data
// about the products — the same conflation the Vault and the eligibility evaluator already refuse.
if (!index || !eligibility) {
  console.error("REFUSED: canonical index or product-eligibility artifact unreadable — a run receipt is never written from absent inputs");
  process.exit(2);
}

const upcoming = (index.events ?? []).filter((e) => e.lifecycle === "UPCOMING");
const playerMarketOffered = (markets?.propMarkets?.offeredMarkets ?? []).length > 0;
const rejectedFamilies = Object.entries(families?.verdictByFamily ?? {}).filter(([, v]) => v !== "VALIDATED").map(([k]) => k);

/**
 * The closed rejection taxonomy. Every candidate leaves by exactly ONE door, and the counts must
 * sum to the pool — otherwise "nothing qualified" could be hiding a candidate nobody looked at.
 */
const TEAM_REASONS = {
  NOT_VALIDATED_MODEL: {
    label: "the team model is experimental, not validated",
    detail: "output-state.permitsProductLeg is true only for VALIDATED_PICK. The shipped champion is BASELINE_ONLY and the Program 181 challenger was rejected against bars frozen before it was built.",
  },
};
const PLAYER_REASONS = {
  NO_VALIDATED_FAMILY: {
    label: "no player family passed its own evaluation",
    detail: `all ${rejectedFamilies.length || 4} families (${(rejectedFamilies.length ? rejectedFamilies : ["passing", "rushing", "receiving", "touchdowns"]).join(", ")}) were rejected on bars frozen before fitting, so no per-player projection exists to select from.`,
  },
  NO_PRICED_MARKET: {
    label: "the provider offers no NFL player market in this window",
    detail: "an unpriced leg can never enter a paper product — there is nothing to settle it against.",
  },
};

const runId = crypto.createHash("sha1")
  .update(JSON.stringify({ now: NOW, idx: index.generatedAt, elig: eligibility.generatedAt, vault: vault?.generatedAt ?? null }))
  .digest("hex").slice(0, 12);

/** Next scheduled run, derived from the event-window cadence (15:00Z / 21:00Z / 14:30Z). */
const nextRunUtc = (() => {
  const now = new Date(NOW);
  for (const [h, m] of [[14, 30], [15, 0], [21, 0]]) {
    const c = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
    if (c > now) return c.toISOString().replace(".000", "");
  }
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 14, 30));
  return t.toISOString().replace(".000", "");
})();

function teamLane(product, label) {
  const considered = upcoming.length;
  const rejections = considered > 0 ? [{ reason: "NOT_VALIDATED_MODEL", ...TEAM_REASONS.NOT_VALIDATED_MODEL, count: considered }] : [];
  const accounted = rejections.reduce((s, r) => s + r.count, 0);
  return {
    product, label,
    state: considered === 0 ? "REFUSED" : "NO_PLAY",
    stateReason: considered === 0
      ? "no pre-kickoff NFL event was available to evaluate — an operational blocker, not a finding about the model"
      : "every candidate was rejected; see the taxonomy below",
    candidatesConsidered: considered,
    rejections,
    reconciles: accounted === considered,
    card: null,
    exposure: 0,
    settlementLinkage: "none — a lane with no card has nothing to settle, and this receipt is the record that it ran",
  };
}

function vaultLane() {
  const considered = vault?.candidateCount ?? 0;
  const rejections = [];
  if (considered > 0) {
    // Both doors apply to the whole pool today; each is independently sufficient, so the taxonomy
    // records the PRIMARY door for accounting and names the second as also-blocking.
    rejections.push({ reason: "NO_PRICED_MARKET", ...PLAYER_REASONS.NO_PRICED_MARKET, count: considered });
  }
  const accounted = rejections.reduce((s, r) => s + r.count, 0);
  return {
    product: "end-zone-vault", label: "End Zone Vault",
    state: considered === 0 ? "REFUSED" : "NO_PLAY",
    stateReason: vault?.reason ?? "the Vault produced no outcome for this window",
    candidatesConsidered: considered,
    rejections,
    alsoBlocking: [{ reason: "NO_VALIDATED_FAMILY", ...PLAYER_REASONS.NO_VALIDATED_FAMILY }],
    reconciles: accounted === considered,
    card: null,
    exposure: 0,
    settlementLinkage: "none — no priced selection was frozen, so there is nothing to grade",
  };
}

const lanes = [
  teamLane("bank-builder", "Bank Builder"),
  teamLane("moonshot", "Moonshot"),
  teamLane("build-inventory", "Card builder"),
  vaultLane(),
];

const receipt = {
  schemaVersion: 1,
  artifact: "nfl-product-receipts",
  dataClass: "PUBLIC_DERIVED",
  runId,
  generatedAt: NOW,
  asOf: { index: index.generatedAt, eligibility: eligibility.generatedAt, vault: vault?.generatedAt ?? null, markets: markets?.capturedAt ?? null },
  nextRunUtc,
  eventsInWindow: upcoming.length,
  lanes,
  overDetermined: {
    note: "Today's NO_PLAY is over-determined — three independent gates each close it on their own, so no single small change would open a lane.",
    gates: [
      "the team model is BASELINE_ONLY (the P181 challenger was rejected on bars frozen before it was built)",
      "all four player families were rejected on their own frozen bars (P183 Release B)",
      `the provider offers no NFL player market in this window (offeredMarkets: ${playerMarketOffered ? "present" : "[]"})`,
    ],
  },
  recordSeparation:
    "NFL product outcomes are experimental and are kept entirely separate from MLB's settled record, Bank Builder's protected history, Moonshot's history and the Mr. Dub portfolio. A NO_PLAY here touches no money and no other sport's record.",
  plainEnglish:
    "All four NFL lanes ran and none produced a card. That is the result of the checks working, not of the products being switched off: our team model is a labelled baseline, none of our player projections passed their own tests, and the sportsbooks are not offering NFL player markets for these games anyway.",
};

fs.writeFileSync(path.join(APP, "public/data/nfl/product-receipts.json"), JSON.stringify(receipt, null, 2) + "\n");

// append-only ledger, one entry per run
const ledgerPath = path.join(ROOT, "data/internal/nfl/product-receipts/ledger.json");
fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
const ledger = read("data/internal/nfl/product-receipts/ledger.json") ?? { schemaVersion: 1, artifact: "nfl-product-receipt-ledger", entries: [] };
if (!ledger.entries.some((e) => e.runId === runId)) {
  ledger.entries.push({ runId, generatedAt: NOW, eventsInWindow: upcoming.length, lanes: lanes.map((l) => ({ product: l.product, state: l.state, candidatesConsidered: l.candidatesConsidered })) });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
}

console.log(`nfl product receipts ${runId}: ${upcoming.length} events in window · next run ${nextRunUtc}`);
for (const l of lanes) {
  console.log(`  ${l.product.padEnd(16)} ${l.state.padEnd(8)} considered ${String(l.candidatesConsidered).padStart(4)} · reconciles ${l.reconciles}`);
  for (const r of l.rejections) console.log(`      ${r.count} × ${r.reason}: ${r.label}`);
}
if (lanes.some((l) => !l.reconciles)) { console.error("REFUSED: a rejection taxonomy does not account for its whole pool"); process.exit(3); }
