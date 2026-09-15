#!/usr/bin/env node
/**
 * Rebuild the EPL totals SHADOW receipt from the graded ledger (P305-F). $0. Publishes nothing.
 *
 *   node scripts/epl/build-epl-totals-shadow-receipt.mjs --now <ISO>
 *
 * Reads app/public/data/soccer/epl/results/graded-forecasts.jsonl and the shadow protocol, writes
 * data/internal/research/epl/forward-totals/receipt.json only when its content changes. The receipt is evidence for a
 * founder decision; no build reads it to change what publishes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEplTotalsShadowReceipt } from "../../src/lib/sports/epl/totals-shadow-receipt.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!Number.isFinite(Date.parse(NOW ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const protocolPath = path.join(REPO, "data/internal/research/epl/reports/epl-totals-shadow-forward-protocol.json");
if (!fs.existsSync(protocolPath)) { console.log("no totals shadow protocol — nothing to receipt"); process.exit(0); }
const protocol = JSON.parse(fs.readFileSync(protocolPath, "utf8"));
const ledgerPath = path.join(APP, "public/data/soccer/epl/results/graded-forecasts.jsonl");
const gradedRows = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
const receipt = buildEplTotalsShadowReceipt({ gradedRows, frozen: protocol.frozen, nowIso: NOW });

const outPath = path.join(REPO, "data/internal/research/epl/forward-totals/receipt.json");
const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;
const strip = (d) => JSON.stringify({ ...d, updatedAt: null });
if (prev && strip(prev) === strip(receipt)) console.log(`EPL totals shadow receipt unchanged · ${receipt.state} (n ${receipt.n})`);
else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 1));
  console.log(`EPL totals shadow receipt: ${receipt.state} · n ${receipt.n}/${receipt.needed} · shadow total LL ${receipt.shadow.totalLogLoss ?? "—"} vs P304 ${receipt.control.totalLogLoss ?? "—"}`);
}
