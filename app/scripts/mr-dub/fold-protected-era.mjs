#!/usr/bin/env node
/**
 * Fold the official receipts into the protected Mr. Dub record under Rule S (P256 · Task 9).
 *
 *   node scripts/mr-dub/fold-protected-era.mjs --now <ISO>            # dry run: prints the change
 *   node scripts/mr-dub/fold-protected-era.mjs --now <ISO> --apply    # writes portfolio.json
 *
 * The founder authorized this write on 2026-09-10 (docs/PROTECTED_LEDGER_RECONCILIATION_PROPOSAL.md,
 * Rule S). The file is written ONLY when the result passes the protected invariant — history keys
 * unchanged, crown unchanged, bankroll and record equal to the July base plus a fresh fold — and a
 * re-run that folds nothing new rewrites nothing. It never restates a folded day: days fold
 * contiguously and an open placed day halts the fold (lib/mr-dub/protected-fold.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyFold, foldLedgerRows, foldReceipts } from "../../src/lib/mr-dub/protected-fold.mjs";
import { checkProtectedLedger, readReceiptsFrom } from "../../src/lib/mr-dub/protected-invariant.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("--now <ISO> required"); process.exit(2); }

const file = path.join(APP, "public", "data", "mr-dub", "portfolio.json");
const before = JSON.parse(fs.readFileSync(file, "utf8"));
const receipts = readReceiptsFrom(APP);
const pre = checkProtectedLedger(before, receipts);
if (!pre.ok) { console.error(`REFUSED: the record is not intact BEFORE folding — ${pre.reasons.join("; ")}`); process.exit(3); }

const fold = foldReceipts(receipts);
const APPLY = process.argv.includes("--apply");

/* The derived money files carry one row per folded day (health gate: Σ ledger == settledProfit, the
   day chain closes on the bankroll). Synced on every run — including a night with nothing new — and
   written only when a row is actually added; a folded day is never restated (foldLedgerRows throws). */
function syncLedgerFiles() {
  const ledgerFile = path.join(APP, "public", "data", "mr-dub", "ledger.json");
  const summaryFile = path.join(APP, "public", "data", "mr-dub", "daily-summary.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
  const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  const rows = foldLedgerRows(fold, { foldedAt: NOW, ledgerEvents: ledger.events ?? [], summaryDays: summary.days ?? [] });
  if (!rows.added) return;
  console.log(`  ledger + daily summary: ${rows.added} folded day(s) ${APPLY ? "added" : "would be added"}`);
  if (!APPLY) return;
  fs.writeFileSync(ledgerFile, JSON.stringify({ ...ledger, events: rows.events }, null, 2) + "\n");
  fs.writeFileSync(summaryFile, JSON.stringify({ ...summary, days: rows.days }, null, 2) + "\n");
}

if (before.protectedFold && before.protectedFold.foldedThrough === fold.foldedThrough) {
  console.log(`[fold] nothing new — folded through ${fold.foldedThrough}${fold.haltedAt ? ` (halted at open day ${fold.haltedAt})` : ""}; bankroll $${before.currentBankroll}`);
  syncLedgerFiles();
  process.exit(0);
}
const after = applyFold(before, fold, { foldedAt: NOW, receipts });
const post = checkProtectedLedger(after, receipts);
if (!post.ok) { console.error(`REFUSED: the folded record fails the invariant — ${post.reasons.join("; ")}`); process.exit(4); }

console.log(`[fold] Rule S through ${fold.foldedThrough}${fold.haltedAt ? ` (halted at open day ${fold.haltedAt})` : ""}: Bank Builder ${fold.bankBuilder.won}-${fold.bankBuilder.lost}, Moonshot ${fold.moonshot.won}-${fold.moonshot.lost}`);
console.log(`  bankroll $${before.currentBankroll} → $${after.currentBankroll} (Δ ${fold.bankrollDelta}) · record ${before.record.wins}-${before.record.losses} → ${after.record.wins}-${after.record.losses} · crown $${after.crownBankroll} unchanged`);
if (!APPLY) { syncLedgerFiles(); console.log("  dry run — nothing written. Re-run with --apply."); process.exit(0); }
fs.writeFileSync(file, JSON.stringify(after, null, 2) + "\n");
console.log(`  wrote ${path.relative(APP, file)}`);
syncLedgerFiles();

/* The daily view carries the canonical bankroll (health-check: daily activeBankroll === canonical). Its
   exposure and cards are the day's own and are NOT touched — only the two figures derived from the
   bankroll are re-derived, so today's page and the record agree the moment the fold lands. */
const dpFile = path.join(APP, "public", "data", "mr-dub", "daily-portfolio.json");
if (fs.existsSync(dpFile)) {
  const dp = JSON.parse(fs.readFileSync(dpFile, "utf8"));
  if (typeof dp.activeBankroll === "number" && dp.activeBankroll !== after.currentBankroll) {
    const exposure = Number(dp.openExposure) || 0;
    dp.activeBankroll = after.currentBankroll;
    dp.availableBankroll = Math.round((after.currentBankroll - exposure) * 100) / 100;
    fs.writeFileSync(dpFile, JSON.stringify(dp, null, 2) + "\n");
    console.log(`  daily view reconciled: active $${dp.activeBankroll} · available $${dp.availableBankroll} (exposure $${exposure} unchanged)`);
  }
}
