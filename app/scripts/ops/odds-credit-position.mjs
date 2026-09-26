#!/usr/bin/env node
/**
 * WHERE THE NFL ODDS ALLOWANCE STANDS — read from the receipt and the ledger, never remembered.
 *
 * Usage: node app/scripts/ops/odds-credit-position.mjs
 *
 * ⚠ ONE LEDGER SERVES TWO ALLOWANCES, so `cumulativeCredits` alone has never told anyone which
 * ceiling is binding. The Phase H sub-budget binds long before the season ceiling does, and a
 * decision package once read a SUPERSEDED receipt and reported 2,606 credits of headroom when the
 * real figure was 766. So every number below is parsed from the operative receipt at read time:
 * nothing here is a constant, and a superseded receipt is refused by name rather than quietly used.
 *
 * READ-ONLY, AND FREE. No provider call — the provider's own balance is not queried, because the
 * self-imposed ceiling is what binds and the ledger is the record of it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEDGER_RELPATH, inPlayAuthorization, parseSportAuthorizationReceipt,
  purposeBudget, spentOnPurpose, supersededBy,
} from "../../src/lib/sports/odds/p171-authorization.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RECEIPT_REL = "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md";
const PHASE_H_PURPOSE = "phase-h in-play";

const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return null; } };

const receiptMd = read(RECEIPT_REL);
if (!receiptMd) { console.error(`REFUSED: cannot read ${RECEIPT_REL} — an allowance with no receipt is not an allowance`); process.exit(2); }

const corpus = (() => {
  const dir = path.join(ROOT, "docs/receipts");
  try { return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")])); }
  catch { return {}; }
})();
const superseded = supersededBy(path.basename(RECEIPT_REL), corpus);
if (superseded) { console.error(`REFUSED: ${path.basename(RECEIPT_REL)} is superseded by ${superseded}`); process.exit(2); }

const auth = parseSportAuthorizationReceipt(receiptMd, "nfl");
const inPlay = inPlayAuthorization(receiptMd);
const budget = purposeBudget(receiptMd);
const ledger = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, LEDGER_RELPATH.nfl ?? LEDGER_RELPATH), "utf8")); } catch { return null; } })();

const spent = ledger?.cumulativeCredits ?? null;
const ceiling = auth?.ceiling ?? null;
const phaseH = ledger ? spentOnPurpose(ledger, PHASE_H_PURPOSE) : null;

const n = (x) => (x == null ? "UNKNOWN" : Number(x).toLocaleString("en-US"));
console.log(`NFL ODDS CREDIT POSITION · receipt ${path.basename(RECEIPT_REL)}`);
console.log(`  receipt parses            ${auth?.ok ? "yes" : `NO — ${(auth?.errors ?? []).join("; ")}`}`);
console.log(`  effective ceiling         ${n(ceiling)}`);
console.log(`  spent (shared ledger)     ${n(spent)}  across ${n(ledger?.requests?.length)} request(s)`);
console.log(`  remaining                 ${ceiling != null && spent != null ? n(ceiling - spent) : "UNKNOWN"}`);
console.log();
console.log(`  in-play authorized        ${inPlay.authorized ? `yes · ${inPlay.markets.join(", ")}` : `no — ${inPlay.reason}`}`);
console.log(`  in-play player props      ${inPlay.propsAuthorized ? "YES" : "no"}`);
console.log(`  Phase H budget            ${n(budget)}`);
console.log(`  Phase H spent             ${n(phaseH)}${budget != null && phaseH != null ? `  → ${n(budget - phaseH)} left in the pilot` : ""}`);

/*
 * ⚠ THE SUB-BUDGET IS THE BINDING NUMBER, and saying so is the whole point of printing both. The
 * season ceiling is a circuit breaker; a pilot authorized for 90 credits that only checked the outer
 * one would be an open tab.
 */
const blocking = [];
if (!auth?.ok) blocking.push("the receipt does not parse");
/*
 * ⚠ AN UNREADABLE NUMBER REFUSES. The first draft printed "effective ceiling UNKNOWN" — it had the
 * field name wrong — and then reported that paid calls remained permitted, because `ceiling != null`
 * guarded the comparison. A guard that skips itself when it cannot read its own input is a guard that
 * permits everything the moment the document it reads changes shape.
 */
if (ceiling == null) blocking.push("the effective ceiling could not be read from the receipt");
if (spent == null) blocking.push("the ledger could not be read");
if (budget == null) blocking.push("the Phase H budget could not be read from the receipt");
if (ceiling != null && spent != null && spent >= ceiling) blocking.push("the season ceiling is reached");
if (budget != null && phaseH != null && phaseH >= budget) blocking.push("the Phase H budget is exhausted");
console.log();
console.log(blocking.length ? `⚠ NO FURTHER PAID CALL IS PERMITTED: ${blocking.join("; ")}` : "paid calls remain permitted inside both the ceiling and the Phase H budget");
process.exit(blocking.length ? 1 : 0);
