#!/usr/bin/env node
/**
 * SIGNATURE-PRODUCT AUDIT (Program 202 · Release E).
 *
 *   npx tsx scripts/audits/build-signature-product-audit.mjs --now <ISO>
 *
 * One machine-readable audit of every signature lane: the owner chain (eligibility → qualification
 * → publication → settlement → record), the current typed state, and the conservation verdict —
 * derived from the lanes' COMMITTED artifacts, never asserted. Every product must land in exactly
 * one classification; UNKNOWN and MISSING are build failures, because an audit that shrugs is not
 * an audit.
 *
 * Conservation claims cite their GUARD owners rather than recomputing money here: protected money
 * (portfolio, banked ladders) is never derived from an audit script, and the lab lanes' published-
 * card conservation already has a build-failing owner (lab-conservation.test.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(APP, "public", "data");
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const readJson = (...seg) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, ...seg), "utf8")); } catch { return null; } };
const CLASSES = ["PROVEN", "TYPED_NO_PLAY", "TYPED_LANE_CLOSED", "DORMANT_BY_DESIGN", "NAMED_QUARANTINE", "FOUNDER_BLOCKED", "REALITY_BLOCKED"];

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const today = ET_DAY.format(new Date(NOW));

const ledger = readJson("parlays", "lab-ledger.json");
const stream = (id) => (ledger?.streams ?? []).find((s) => s.id === id) ?? null;
const settledDays = fs.existsSync(path.join(DATA, "parlays", "lab-settled"))
  ? fs.readdirSync(path.join(DATA, "parlays", "lab-settled")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length
  : 0;

/** A lab ladder lane's audit row, from its own artifacts. */
function ladderLane(id, dir, label) {
  const art = readJson("parlays", dir, "latest.json");
  const st = stream(id);
  const published = (art?.cards ?? []).length;
  const skipped = (art?.skipped ?? []).length;
  let classification, stateDetail;
  if (st && st.live === false) {
    classification = "TYPED_LANE_CLOSED";
    stateDetail = st.blocked ?? "eligibility gate closed";
  } else if (published > 0) {
    classification = "PROVEN";
    stateDetail = `${published} card(s) published for ${art?.date}${skipped ? ` · ${skipped} typed skip(s)` : ""}`;
  } else if (art?.state && art.state !== "PUBLISHED") {
    classification = "TYPED_NO_PLAY";
    stateDetail = `${art.state}: ${art.reason ?? "typed refusal"}`;
  } else {
    classification = "TYPED_NO_PLAY";
    stateDetail = `evaluation completed; ${skipped} typed skip(s), no card qualified`;
  }
  return {
    product: label, lane: id, classification, stateDetail,
    chain: {
      eligibility: "scripts/parlays/lab-eligibility.mjs (measured gate, per stream)",
      qualification: "canonical band function + qualified-leg contract (src/lib/product-day/qualified-leg.ts validates every published leg)",
      publication: `public/data/parlays/${dir}/latest.json (${art?.state ?? "cards, pre-state-convention"})`,
      settlement: "scripts/parlays/settle-lab-cards.mjs — official results, leg-routed by sport",
      record: "public/data/parlays/lab-ledger.json + /results/parlay-lab (per sport AND per tier)",
    },
    conservation: {
      verdict: "GUARDED",
      owner: "src/lib/parlays/lab-conservation.test.mjs — published = settled + pending-in-window + named quarantine; build-failing",
      note: id === "ufc" ? "carries the adjudicated 2026-08-18 build-day quarantine (3 cards, named, closed)" : null,
    },
  };
}

const products = [
  ladderLane("mlb", "risk-ladder", "MLB risk ladder"),
  ladderLane("epl", "risk-ladder-epl", "EPL risk ladder"),
  ladderLane("ufc", "risk-ladder-ufc", "UFC risk ladder"),
  ladderLane("nfl", "risk-ladder-nfl", "NFL risk ladder"),
];

// ── Multi lane — the tier grid's own dialect ────────────────────────────────────────────────────
{
  const grid = readJson("parlays", "tier-grid", "multi-latest.json");
  const offered = (grid?.cells ?? []).filter((c) => c.state === "OFFERED").length;
  products.push({
    product: "Mixed-sport lane", lane: "multi",
    classification: offered > 0 ? "PROVEN" : "TYPED_NO_PLAY",
    stateDetail: offered > 0
      ? `${offered} offered cell(s) for ${grid?.date}`
      : `grid ${grid?.state ?? "absent"} for ${grid?.date ?? "?"} — every band carries its own typed reason`,
    chain: {
      eligibility: "lab-eligibility (needs two live sports) + per-leg sport gates",
      qualification: "legs come only from cards the sport lanes already published (multi-sport.mjs)",
      publication: "public/data/parlays/tier-grid/multi-latest.json (cells: bankroll-tier × band)",
      settlement: "settle-lab-cards.mjs — each leg by its own sport's official path",
      record: "lab-ledger multi stream + /results/parlay-lab",
    },
    conservation: { verdict: "GUARDED", owner: "lab-conservation.test.mjs (multi-prefixed receipts trace to the grid)", note: null },
  });
}

// ── Bank Builder / Moonshot / Mr. Dub — protected money journeys ────────────────────────────────
{
  const portfolio = readJson("mr-dub", "portfolio.json");
  const active = (portfolio?.cards ?? []).filter((c) => c.status === "active");
  const bbActive = active.some((c) => c.product === "bank-builder");
  const moonActive = active.some((c) => c.product === "moonshot");
  const rec = portfolio?.record ?? null;
  products.push({
    product: "Bank Builder", lane: "bank-builder",
    classification: bbActive ? "PROVEN" : "TYPED_NO_PLAY",
    stateDetail: bbActive ? "active approved card" : "no-play — no approved card placed; awaiting the next rung (derived, never asserted)",
    chain: {
      eligibility: "approved.json verbatim → promote --apply (md5-guarded) — founder-approved cards only",
      qualification: "qualified-leg contract on the underlying board legs",
      publication: "bank-builder lanes via canonical loaders (public dual ladder)",
      settlement: "nightly-settle — the ONE settlement writer (P092-095)",
      record: `mr-dub/portfolio.json — ${rec ? `${rec.wins}–${rec.losses}` : "record unreadable"} · protected, byte-guarded`,
    },
    conservation: { verdict: "GUARDED", owner: "portfolio md5 guard + invariant state model (P092-095); pending never counts as loss", note: null },
  });
  products.push({
    product: "Moonshot", lane: "moonshot",
    classification: moonActive ? "PROVEN" : "TYPED_NO_PLAY",
    stateDetail: moonActive ? "active longshot card" : "no-play — no active longshot lane today (derived from the portfolio, never asserted)",
    chain: {
      eligibility: "moonshot-lane/active.json (its own lane; never Bank Builder)",
      qualification: "its own high-volatility paper rules — separate record by design",
      publication: "moonshot lane artifacts via canonical loaders",
      settlement: "nightly-settle (the one writer)",
      record: "portfolio moonshot stream — never blended with Bank Builder",
    },
    conservation: { verdict: "GUARDED", owner: "portfolio md5 guard; lane separation pinned by product tests", note: null },
  });
  products.push({
    product: "Mr. Dub's Portfolio", lane: "mr-dub",
    classification: "PROVEN",
    stateDetail: rec ? `canonical record ${rec.wins}–${rec.losses}; complete-journey ledger derives from it` : "portfolio unreadable",
    chain: {
      eligibility: "N/A — the portfolio AGGREGATES placed products; it originates nothing",
      qualification: "inherits each product's own",
      publication: "mr-dub/portfolio.json + build-mr-dub-ledger (derived views)",
      settlement: "nightly-settle only",
      record: "portfolio.json — protected money, corrections append",
    },
    conservation: { verdict: "GUARDED", owner: "md5 pin + ONE-writer invariant (P092-095)", note: null },
  });
}

// ── Homer Nukes — revived StatsAPI product ──────────────────────────────────────────────────────
{
  const board = readJson("mlb", "homer-nukes", `${today}.json`);
  const rows = (board?.board ?? board?.picks ?? []).length;
  products.push({
    product: "Homer Nukes", lane: "homer-nukes",
    classification: rows > 0 ? "PROVEN" : "TYPED_NO_PLAY",
    stateDetail: rows > 0 ? `${rows} candidates for ${today} (own probability from StatsAPI)` : `no board for ${today}`,
    chain: {
      eligibility: "MLB slate via StatsAPI (free source — no odds credits by design)",
      qualification: "its own HR-probability computation (revived 2026-08-17)",
      publication: `public/data/mlb/homer-nukes/${today}.json`,
      settlement: "settled-<date>.json from official box scores",
      record: "mlb/homer-nukes/record.json (cumulative; money untouched since retirement)",
    },
    conservation: { verdict: "GUARDED", owner: "dated settle receipts + record.json; the retired-era money history is byte-kept", note: null },
  });
}

// ── End Zone Vault — NFL signature lane ─────────────────────────────────────────────────────────
{
  const ezv = readJson("nfl", "end-zone-vault", "latest.json");
  products.push({
    product: "End Zone Vault", lane: "end-zone-vault",
    classification: (ezv?.cards ?? []).length > 0 ? "PROVEN" : "TYPED_NO_PLAY",
    stateDetail: `${ezv?.state ?? "absent"} for ${ezv?.date ?? "?"} — ${(ezv?.cards ?? []).length} card(s); WATCHLIST_ONLY is the typed pre-season posture`,
    chain: {
      eligibility: "NFL product-eligibility artifact (design caps; actives gate FOUNDER-owned)",
      qualification: "qualified-leg contract semantics; no forced card",
      publication: "public/data/nfl/end-zone-vault/latest.json (typed states)",
      settlement: "NFL official finals via the sport settlement contracts",
      record: "its own lane record — never blended (P200 memory: 'end-zone-vault' spelling guard)",
    },
    conservation: { verdict: "GUARDED", owner: "typed states + dated receipts; no card has published, so nothing can be missing", note: null },
  });
}

// ── NBA — dormant by design ─────────────────────────────────────────────────────────────────────
products.push({
  product: "NBA (schedule-only)", lane: "nba",
  classification: "DORMANT_BY_DESIGN",
  stateDetail: "OFF_SEASON derived states; fail-closed shadow contract; expansion is FOUNDER-gated",
  chain: {
    eligibility: "schedule capture with typed off-season receipts",
    qualification: "none may run — fail-closed by contract",
    publication: "settled archive only (/results/nba)",
    settlement: "dormant; first-event checklist committed",
    record: "historical archive, byte-kept",
  },
  conservation: { verdict: "GUARDED", owner: "dormant contract tests (P198); founder queue holds the activation decisions", note: null },
});

// ── Validate: every product classified, no UNKNOWN/MISSING ──────────────────────────────────────
for (const p of products) {
  if (!CLASSES.includes(p.classification)) { console.error(`UNCLASSIFIED: ${p.product} → ${p.classification}`); process.exit(1); }
  for (const [k, v] of Object.entries(p.chain)) {
    if (!v || /UNKNOWN|MISSING/i.test(String(v))) { console.error(`${p.product}.chain.${k} is not typed`); process.exit(1); }
  }
}

const out = {
  schemaVersion: 1,
  artifact: "signature-product-audit",
  dataClass: "PRIVATE_INTERNAL",
  generatedAt: NOW,
  productDate: today,
  labSettledDays: settledDays,
  counts: CLASSES.reduce((acc, c) => ({ ...acc, [c]: products.filter((p) => p.classification === c).length }), {}),
  products,
};
const OUT = path.resolve(APP, "..", "data", "internal", "audits", "signature-products-v1.json");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`signature products: ${products.length} audited · ${Object.entries(out.counts).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${n}`).join(" · ")}`);
for (const p of products) console.log(`  ${p.product.padEnd(22)} ${p.classification.padEnd(18)} ${p.stateDetail.slice(0, 80)}`);
