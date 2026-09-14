#!/usr/bin/env node
/**
 * Rebuild the EPL blind forward receipt from the graded ledger (P304 adoption). $0.
 *
 *   node scripts/epl/build-epl-forward-receipt.mjs --now <ISO>
 *
 * Reads app/public/data/soccer/epl/results/graded-forecasts.jsonl and the forward protocol, writes
 * data/internal/research/epl/forward/receipt.json only when its content changes. Runs before the forecasts build,
 * so a breach demotes the model in the same run. Lives in app/scripts but changes no page.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEplForwardReceipt } from "../../src/lib/sports/epl/forward-receipt.mjs";
import { EPL_ELO_POISSON_MODEL_ID } from "../../src/lib/sports/epl/elo-poisson.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!Number.isFinite(Date.parse(NOW ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const protocol = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/epl/reports/epl-elo-poisson-forward-protocol.json"), "utf8"));
const ledgerPath = path.join(APP, "public/data/soccer/epl/results/graded-forecasts.jsonl");
const gradedRows = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
const receipt = buildEplForwardReceipt({ gradedRows, modelId: EPL_ELO_POISSON_MODEL_ID, frozen: protocol.frozen, nowIso: NOW });

const outPath = path.join(REPO, "data/internal/research/epl/forward/receipt.json");
const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;
const strip = (d) => JSON.stringify({ ...d, updatedAt: null });
if (prev && strip(prev) === strip(receipt)) console.log(`EPL forward receipt unchanged · ${receipt.state} (n ${receipt.n})`);
else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(receipt, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v), 1));
  console.log(`EPL forward receipt: ${receipt.state} · n ${receipt.n}/${receipt.needed} · new ${receipt.modelLogLoss ?? "—"} vs previous ${receipt.controlLogLoss ?? "—"}`);
}
if (receipt.state === "FORWARD_BREACHED" && process.env.GITHUB_ACTIONS) console.log("::warning title=EPL forward receipt BREACHED::the Elo-Poisson model is significantly worse than the model it replaced — the previous model publishes from this run");
