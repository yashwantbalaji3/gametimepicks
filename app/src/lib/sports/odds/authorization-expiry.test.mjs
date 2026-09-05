/**
 * THE HALF OF THE SENTENCE NOBODY READ — Program 235 · Release E.
 *
 * Run: npx tsx --test src/lib/sports/odds/authorization-expiry.test.mjs
 *
 * The NFL receipt's operative terms include:
 *
 *     Expiry | Program 171 close OR the 3,000-credit cumulative ceiling, whichever first
 *
 * Two conditions. Scope was enforced, the ceiling was enforced, and the first half was parsed by
 * nothing. It is now Program 235; the allowance never came near its ceiling (69 of 3,000), so
 * nothing overspent — the founder's own end condition simply had no code behind it.
 *
 * A program-scoped expiry cannot be evaluated from the receipt: nothing in the text says whether
 * that program is still open, and inferring it from the running session's name would be the script
 * deciding its own authorization. So it fails closed and names the renewal.
 *
 * UFC and EPL expire at their credit ceilings alone — self-evaluating, and current for as long as
 * their ledgers say so. They must keep working, or this guard would have disabled two live,
 * founder-authorized recurring acquisitions to fix a third.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { parseSportAuthorizationReceipt, parseAuthorizationReceipt, expiryTerm } from "./p171-authorization.mjs";

const RECEIPTS = path.join(process.cwd(), "..", "docs", "receipts");
const read = (f) => { try { return fs.readFileSync(path.join(RECEIPTS, f), "utf8"); } catch { return null; } };

test("all three committed receipts are readable — everything below is vacuous otherwise", () => {
  for (const f of ["ODDS_AUTHORIZATION_P171.md", "ODDS_AUTHORIZATION_UFC.md", "ODDS_AUTHORIZATION_EPL.md"]) {
    assert.ok(read(f), `${f} is missing`);
  }
});

test("A CEILING-ONLY EXPIRY IS SELF-EVALUATING and stays authorized", () => {
  for (const [sport, file] of [["ufc", "ODDS_AUTHORIZATION_UFC.md"], ["epl", "ODDS_AUTHORIZATION_EPL.md"]]) {
    const text = read(file);
    assert.equal(expiryTerm(text).kind, "CEILING_ONLY", `${sport}: unexpected expiry classification`);
    const parsed = parseSportAuthorizationReceipt(text, sport);
    assert.equal(parsed.ok, true, `${sport} lost its authorization: ${parsed.errors?.join("; ")}`);
  }
});

test("A PROGRAM-SCOPED EXPIRY FAILS CLOSED AND NAMES THE RENEWAL", () => {
  const text = read("ODDS_AUTHORIZATION_P171.md");
  const e = expiryTerm(text);
  assert.equal(e.kind, "PROGRAM_SCOPED");
  assert.match(e.programCloseCondition, /Program 171/);

  for (const parsed of [parseSportAuthorizationReceipt(text, "nfl"), parseAuthorizationReceipt(text)]) {
    assert.equal(parsed.ok, false, "an expired allowance still parsed as authorized");
    const why = parsed.errors.join("; ");
    assert.match(why, /expiry:/, "the refusal does not name the expiry");
    assert.match(why, /renewal is required/i, "the refusal does not say what is needed");
  }
});

test("THE REFUSAL IS ABOUT EXPIRY ALONE — scope and ceiling still parse", () => {
  /* If the receipt were also malformed, a caller could not tell a lapsed allowance from a damaged
     file, and the two need different responses. */
  const text = read("ODDS_AUTHORIZATION_P171.md");
  const errors = parseSportAuthorizationReceipt(text, "nfl").errors ?? [];
  assert.ok(errors.length > 0);
  assert.ok(errors.every((e) => e.startsWith("expiry:")), `other terms also failed: ${errors.join("; ")}`);
});

test("a receipt with NO expiry row is refused — absence is not permission", () => {
  const text = read("ODDS_AUTHORIZATION_UFC.md").replace(/^\|\s*Expiry\s*\|.*$/mi, "");
  assert.equal(expiryTerm(text).kind, "UNKNOWN");
  const parsed = parseSportAuthorizationReceipt(text, "ufc");
  assert.equal(parsed.ok, false, "a receipt with no stated expiry was treated as current");
  assert.match(parsed.errors.join("; "), /no expiry term found/);
});

test("A RENEWED RECEIPT RE-ENABLES ACQUISITION — the guard is not a one-way door", () => {
  /* The fix must be a founder edit to the receipt, not a code change. Rewriting the expiry row to a
     ceiling-only term restores authorization with nothing else altered. */
  const renewed = read("ODDS_AUTHORIZATION_P171.md")
    .replace(/^\|\s*Expiry\s*\|.*$/mi, "| Expiry | the 3,000-credit cumulative ceiling |");
  const parsed = parseSportAuthorizationReceipt(renewed, "nfl");
  assert.equal(parsed.ok, true, `a renewed receipt still refused: ${parsed.errors?.join("; ")}`);
  assert.equal(parsed.ceiling, 3000, "the renewal changed the ceiling");
  assert.equal(parsed.expiry.kind, "CEILING_ONLY");
});

test("ONE RECEIPT STILL AUTHORIZES ONE SPORT — the expiry check did not weaken the scope check", () => {
  const ufc = read("ODDS_AUTHORIZATION_UFC.md");
  assert.equal(parseSportAuthorizationReceipt(ufc, "nfl").ok, false, "a UFC receipt authorized NFL");
  assert.equal(parseSportAuthorizationReceipt(ufc, "epl").ok, false, "a UFC receipt authorized EPL");
});

test("THE CAPTURE REFUSES AN EXPIRED ALLOWANCE WITHOUT SPENDING, and without failing its workflow", () => {
  /* Exit 0 with a stated status, not exit 2. A lapsed allowance is a decision owed, not a broken
     job: the chain around it runs on the last committed capture, and a scheduled workflow that goes
     red three times a week for a state nobody can fix by rerunning it is as unreadable as one that
     is permanently green. */
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/capture-nfl-odds.mjs"), "utf8");
  assert.match(src, /AUTHORIZATION_EXPIRED/, "the capture has no distinct expired path");
  assert.match(src, /expiryOnly/, "the capture does not separate an expired allowance from a malformed receipt");
  const block = src.slice(src.indexOf("const expiryOnly"), src.indexOf("const expiryOnly") + 600);
  assert.match(block, /process\.exit\(0\)/, "the expired path does not exit cleanly");
});
