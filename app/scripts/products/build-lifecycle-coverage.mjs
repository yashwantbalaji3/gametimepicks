#!/usr/bin/env node
/**
 * SIGNATURE-PRODUCT LIFECYCLE COVERAGE — the evidence gatherer.
 *
 *   node app/scripts/products/build-lifecycle-coverage.mjs --now <ISO> [--fail-on-gaps]
 *
 * Judgement lives in `src/lib/products/lifecycle-coverage.mjs`. This only looks things up, and every
 * lookup is a FACT about the repository — a file that exists, a workflow that names a script, a
 * product listed in the shared state machine. Nothing here is a hand-kept status, so a product whose
 * producer is deleted shows up as ungoverned the same day without anyone remembering to edit a table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCoverage, publishesWithoutSettling } from "../../src/lib/products/lifecycle-coverage.mjs";
import { PRODUCT_REGISTRY } from "../../src/lib/products/lifecycle-registry.mjs";
import { LIFECYCLE_STATES } from "../../src/lib/products/daily-state-machine.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const DATA = path.join(APP, "public", "data");
const WF = path.join(ROOT, ".github", "workflows");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }

const exists = (...seg) => fs.existsSync(path.join(...seg));
const anyExists = (paths) => paths.some((p) => fs.existsSync(path.join(APP, p)) || fs.existsSync(path.join(ROOT, p)));

/** Does any workflow reference this script? A producer nothing schedules is not automation. */
const workflows = (() => {
  try {
    return fs.readdirSync(WF).filter((f) => f.endsWith(".yml")).map((f) => fs.readFileSync(path.join(WF, f), "utf8"));
  } catch { return []; }
})();
const scheduledSomewhere = (needle) => workflows.some((y) => y.includes(needle));

/**
 * Which products the shared lifecycle actually governs — asked of the REGISTRY, by exact id.
 *
 * This used to regex the state machine's SOURCE for the quoted id, so "has a lifecycle" and
 * "somebody typed the name" were the same test, and four PARTIAL products were one string edit from
 * reporting GOVERNED with no receipt behind it. Membership now costs an owner for the producer,
 * selection gate, freeze, settlement adapter, ledger and receipt (see lib/products/
 * lifecycle-registry.mjs), and this asks that registry rather than reading a file.
 *
 * It is also keyed EXACTLY. The old call sites passed "ufc" and "epl" while the products are
 * `ufc-cards` and `epl-cards`, so those two rows were answering about ids that do not exist —
 * a mention of "ufc" anywhere in the machine would have flipped the UFC row true.
 */
const governedByMachine = (id) => PRODUCT_REGISTRY.isGoverned(id);

const PRODUCTS = [
  {
    id: "bank-builder",
    label: "Bank Builder",
    evidence: {
      producer: anyExists(["scripts/build-bank-builder-ladder.mjs", "scripts/promote-approved-cards.mjs"]) || scheduledSomewhere("bank-builder"),
      publicRoute: exists(APP, "src/app/bank-builder/page.tsx"),
      automation: scheduledSomewhere("bank-builder"),
      ledger: exists(DATA, "product-ledger/bank-builder.json") || exists(DATA, "mr-dub/portfolio.json"),
      settlement: scheduledSomewhere("settle-paper-product-cards") || scheduledSomewhere("nightly-settle"),
      lifecycle: governedByMachine("bank-builder"),
    },
  },
  {
    id: "moonshot",
    label: "Moonshot",
    /*
     * Paused on an exact token, with its engineering deliberately left where P224 put it. Reported
     * as gated rather than as a coverage failure so the open-gap count stays a list of things
     * somebody can actually do today.
     */
    founderGate: "MOONSHOT_REPAIR_PAUSE_OR_RETIRE",
    evidence: {
      producer: anyExists(["scripts/activate-moonshot-candidates.mjs"]),
      publicRoute: exists(APP, "src/app/moonshot/page.tsx"),
      automation: scheduledSomewhere("activate-moonshot-candidates"),
      ledger: exists(DATA, "product-ledger/moonshot.json"),
      settlement: false,
      lifecycle: governedByMachine("moonshot"),
    },
    note: "P224 proved it can neither generate nor settle; the state owner tells the truth publicly while it waits.",
  },
  {
    id: "homer-nukes",
    label: "Homer Nukes",
    evidence: {
      producer: exists(APP, "scripts/mlb/build-homer-nukes.mjs"),
      publicRoute: exists(APP, "src/app/homer-nukes/page.tsx"),
      automation: scheduledSomewhere("build-homer-nukes"),
      ledger: exists(DATA, "mlb/homer-nukes/record.json"),
      settlement: scheduledSomewhere("settle-homer-nukes") || scheduledSomewhere("Settle Homer Nukes"),
      lifecycle: governedByMachine("homer-nukes"),
    },
  },
  {
    id: "end-zone-vault",
    label: "End Zone Vault",
    evidence: {
      producer: exists(APP, "scripts/nfl/build-end-zone-vault.mjs"),
      publicRoute: exists(APP, "src/app/nfl/page.tsx"),
      automation: scheduledSomewhere("build-end-zone-vault"),
      ledger: exists(DATA, "nfl/product-receipts.json"),
      settlement: scheduledSomewhere("settle-nfl-experimental"),
      lifecycle: governedByMachine("end-zone-vault"),
    },
  },
  {
    id: "ufc-cards",
    label: "UFC paper cards",
    evidence: {
      producer: anyExists(["scripts/ufc/build-ufc-risk-ladder.mjs", "scripts/parlays/build-sport-risk-ladder.mjs"]) || scheduledSomewhere("risk-ladder-ufc"),
      publicRoute: exists(APP, "src/app/ufc/page.tsx"),
      automation: scheduledSomewhere("ufc-fight-week"),
      ledger: exists(DATA, "ufc/graded-picks.json"),
      /* NOT `scheduledSomewhere("ufc")` — that matched the odds-capture and stats-refresh
         workflows, so "this product can be settled" was satisfied by a job that buys prices. The
         real settler is the post-card results capture and grade. */
      settlement: scheduledSomewhere("capture-ufc-results") || scheduledSomewhere("grade-ufc-model-vs-market"),
      lifecycle: governedByMachine("ufc-cards"),
    },
  },
  {
    id: "epl-cards",
    label: "EPL paper cards",
    evidence: {
      producer: anyExists(["scripts/epl/build-epl-risk-ladder.mjs", "scripts/parlays/build-sport-risk-ladder.mjs"]) || scheduledSomewhere("risk-ladder-epl"),
      publicRoute: exists(APP, "src/app/epl/page.tsx"),
      automation: scheduledSomewhere("epl-matchweek"),
      ledger: exists(DATA, "epl/graded-picks.json"),
      settlement: scheduledSomewhere("settle-epl") || scheduledSomewhere("epl-settle"),
      lifecycle: governedByMachine("epl-cards"),
    },
  },
];

const coverage = buildCoverage({ products: PRODUCTS });
const unsettleable = publishesWithoutSettling(coverage);

const payload = {
  schemaVersion: 1,
  artifact: "signature-product-lifecycle-coverage",
  dataClass: "INTERNAL_DERIVED",
  generatedAt: NOW,
  state: coverage.state,
  note:
    "Every field is evidence — a path that exists, a workflow that names a script, a product the shared state machine lists. No hand-kept statuses.",
  lifecycleStates: LIFECYCLE_STATES,
  ...coverage,
  publishesWithoutSettling: unsettleable,
};

const OUT = arg("--json", path.join(ROOT, "data", "internal", "products", "lifecycle-coverage.json"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

for (const r of coverage.rows) {
  const line = `[coverage] ${r.id.padEnd(15)} ${r.verdict.padEnd(15)} have:${r.present.length}/6`;
  if (r.verdict === "PARTIAL" || r.verdict === "UNGOVERNED") console.error(`${line}  missing: ${r.missing.join(", ")}`);
  else console.log(`${line}${r.founderGate ? `  gate: ${r.founderGate}` : ""}`);
}
if (unsettleable.length) {
  console.error(`[coverage] ⚠ PUBLISHES WITHOUT SETTLING: ${unsettleable.join(", ")} — the shape that produces an unfalsifiable public record`);
}
console.log(`[coverage] ${coverage.state} · ${coverage.openGaps.length} product(s) with an open gap`);
console.log(`[coverage] wrote ${path.relative(process.cwd(), OUT)}`);

process.exit(process.argv.includes("--fail-on-gaps") && coverage.state === "GAPS" ? 1 : 0);
