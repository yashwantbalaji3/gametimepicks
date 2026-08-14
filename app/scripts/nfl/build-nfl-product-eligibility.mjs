/**
 * Daily NFL paper-product evaluation (Program 177 · Release C). PUBLIC_DERIVED.
 *
 * Runs every NFL event window and records, in writing, whether any NFL output may enter a paper
 * product today — and if not, exactly why and what would change it. The point is that a reader who
 * asks "why is there no NFL in Bank Builder?" gets a dated answer from an evaluation that actually
 * ran, instead of inferring one from an empty space.
 *
 * It consumes the CANONICAL index rather than the raw forecasts: the index already owns lifecycle,
 * classification and the kickoff lock, and re-deriving them here would create a second truth for
 * the same events. It writes an append-only ledger entry alongside the current artifact, so the
 * answer for any past day stays recoverable.
 *
 * Usage: node scripts/nfl/build-nfl-product-eligibility.mjs --now <iso>
 * Writes: app/public/data/nfl/product-eligibility.json
 *         data/internal/nfl/product-eligibility/ledger.json  (append-only)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateNflProductEligibility } from "../../src/lib/sports/nfl/product-eligibility.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const index = read(path.join(APP, "public/data/nfl/index.json"));
const vault = read(path.join(APP, "public/data/nfl/end-zone-vault/latest.json"));

// No index, no evaluation. Writing "nothing qualifies" when the input is missing would report a
// finding about the model from an absence of data about the model — the exact conflation this
// repository has already had to fix once in the Vault.
if (!index || !Array.isArray(index.events)) {
  console.error("REFUSED: no canonical NFL index — cannot report an evaluation that did not happen");
  process.exit(2);
}

const evaluation = evaluateNflProductEligibility({
  events: index.events,
  nowIso: NOW,
  vault: vault ? { state: vault.state, reason: vault.reason } : null,
});

const artifact = {
  schemaVersion: 1,
  artifact: "nfl-product-eligibility",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  indexGeneratedAt: index.generatedAt,
  note: "Whether any NFL output may enter a paper product today, evaluated against the same gate the money path enforces. A refusal here is a finding, not an absence.",
  ...evaluation,
};

const outPath = path.join(APP, "public/data/nfl/product-eligibility.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");

// ── append-only ledger: one entry per evaluation day, never rewritten ────────────────────────
const ledgerPath = path.join(ROOT, "data/internal/nfl/product-eligibility/ledger.json");
fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
const ledger = read(ledgerPath) ?? { schemaVersion: 1, product: "nfl-product-eligibility", entries: [] };
const day = NOW.slice(0, 10);
if (!ledger.entries.some((e) => e.date === day)) {
  ledger.entries.push({
    date: day,
    evaluatedAt: NOW,
    consideredEvents: evaluation.consideredEvents,
    qualifyingEvents: evaluation.qualifyingEvents,
    products: evaluation.products.map((p) => ({ product: p.product, state: p.state, eligible: p.eligible })),
  });
  ledger.entries.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
}

const summary = evaluation.products.map((p) => `${p.product}=${p.state}`).join(" · ");
console.log(`nfl product eligibility: ${evaluation.consideredEvents} considered · ${evaluation.qualifyingEvents} qualify · ${summary}`);
