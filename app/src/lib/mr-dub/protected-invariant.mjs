/**
 * The protected record's invariant — replaces the whole-file md5 pins (P256 · Task 9).
 *
 * The md5 pins held while the file never changed. Since the founder's 2026-09-10 reconciliation the
 * bankroll moves nightly by Rule S, so the guard asserts what must never change, and what every change
 * must be: history (the July-7 keys) byte-identical by hash; the crown untouched; and the bankroll and
 * record equal to the July base plus a FRESH fold of the official receipts — so a tampered number or a
 * restated day fails.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HISTORY_HASH, HISTORY_KEYS, PROTECTED_BASE, foldReceipts } from "./protected-fold.mjs";

const round2 = (n) => Math.round(n * 100) / 100;

export function historyHash(portfolio) {
  return crypto.createHash("sha256").update(JSON.stringify(HISTORY_KEYS.map((k) => [k, portfolio?.[k]]))).digest("hex");
}

/** Pure check. `receipts` are the settled receipts ({date, lanes}). */
export function checkProtectedLedger(portfolio, receipts) {
  const reasons = [];
  if (historyHash(portfolio) !== HISTORY_HASH) reasons.push("history changed: a July-7 history key (ladders, cards, identity, crown) no longer matches its hash");
  if (portfolio?.crownBankroll !== PROTECTED_BASE.crownBankroll) reasons.push(`crown moved: ${portfolio?.crownBankroll}`);
  const f = portfolio?.protectedFold;
  if (!f) {
    if (portfolio?.currentBankroll !== PROTECTED_BASE.currentBankroll) reasons.push(`unfolded record but the bankroll is ${portfolio?.currentBankroll}, not the July base`);
    if (JSON.stringify(portfolio?.record) !== JSON.stringify(PROTECTED_BASE.record)) reasons.push("unfolded record but the record moved");
    return { ok: reasons.length === 0, reasons };
  }
  const fresh = foldReceipts((receipts ?? []).filter((r) => r.date <= f.foldedThrough));
  if (fresh.foldedThrough !== f.foldedThrough) reasons.push(`the receipts fold through ${fresh.foldedThrough}, the record claims ${f.foldedThrough}`);
  if (JSON.stringify(fresh.days) !== JSON.stringify(f.days)) reasons.push("a folded day no longer matches its receipt — a settled day was restated");
  const expected = round2(PROTECTED_BASE.currentBankroll + fresh.bankrollDelta);
  if (portfolio.currentBankroll !== expected) reasons.push(`bankroll ${portfolio.currentBankroll} ≠ base ${PROTECTED_BASE.currentBankroll} + folded ${fresh.bankrollDelta} = ${expected}`);
  const rec = { wins: PROTECTED_BASE.record.wins + fresh.bankBuilder.won, losses: PROTECTED_BASE.record.losses + fresh.bankBuilder.lost };
  if (portfolio.record?.wins !== rec.wins || portfolio.record?.losses !== rec.losses) reasons.push(`record ${portfolio.record?.wins}-${portfolio.record?.losses} ≠ ${rec.wins}-${rec.losses}`);
  return { ok: reasons.length === 0, reasons };
}

export function readReceiptsFrom(appDir) {
  const dir = path.join(appDir, "public", "data", "mr-dub", "settled");
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map((f) => ({ date: f.slice(0, 10), ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), date: f.slice(0, 10) }));
}

/** Same check against a DATA root (a `public/data` folder or a fixture copy of one). */
export function assertProtectedDataIntact(dataRoot) {
  const portfolio = JSON.parse(fs.readFileSync(path.join(dataRoot, "mr-dub", "portfolio.json"), "utf8"));
  const dir = path.join(dataRoot, "mr-dub", "settled");
  const receipts = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => ({ ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), date: f.slice(0, 10) }))
    : [];
  const v = checkProtectedLedger(portfolio, receipts);
  if (!v.ok) throw new Error(`protected Mr. Dub record is not intact: ${v.reasons.join("; ")}`);
  return true;
}

/** The drop-in replacement for the md5 pins. Throws with every reason when the record is not intact. */
export function assertProtectedLedgerIntact(appDir = process.cwd()) {
  return assertProtectedDataIntact(path.join(appDir, "public", "data"));
}

/**
 * The settled bankroll a data root's protected record carries right now. Daily views must reconcile to
 * THIS (P256) — the figure moves nightly under Rule S, so a test pins the relationship, not a number.
 */
export function canonicalBankroll(dataRoot = path.join(process.cwd(), "public", "data")) {
  return JSON.parse(fs.readFileSync(path.join(dataRoot, "mr-dub", "portfolio.json"), "utf8")).currentBankroll;
}
