/**
 * THE LEGAL DRAFTS DESCRIBE THE ACCOUNTS THAT EXIST (launch audit, 2026-10-13; founder: accurate drafts, no publication).
 *
 * Accounts are live in Production (Supabase magic-link sign-in, "Your bets", synced follows/saves), and Ask GameTime sends
 * questions to Google's Gemini API — yet the drafts said "The Site has no user accounts" and "does not operate user
 * accounts". These facts must be in the text counsel reviews. Publication stays behind the content-manifest gate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderLegal, legalReadiness } from "./texts.mjs";

const privacy = renderLegal("privacy").text;
const terms = renderLegal("terms").text;

test("neither draft denies the accounts that exist", () => {
  assert.doesNotMatch(privacy, /has no user accounts/);
  assert.doesNotMatch(terms, /operate user accounts/);
  assert.match(terms, /Optional accounts/);
});

test("the privacy draft names what an account stores, who holds it, and how to delete it", () => {
  for (const re of [/one-time sign-in link/, /email address/, /bets you enter/, /screenshot/, /Supabase/, /private storage/, /delete your account/, /sign-in session in its local storage/]) {
    assert.match(privacy, re, String(re));
  }
});

test("the privacy draft discloses where Ask GameTime questions go, and that slip reading is off until it says otherwise", () => {
  assert.match(privacy, /Google's Gemini API/);
  assert.match(privacy, /We do not store your questions/);
  assert.match(privacy, /Reading slip screenshots automatically is not currently switched on/);
  const ask = fs.readFileSync(path.join(process.cwd(), "api/_ask-core.mjs"), "utf8");
  const audit = ask.slice(ask.indexOf("export function askAuditLine"), ask.indexOf("export function askAuditLine") + 900);
  assert.doesNotMatch(audit, /\b(question|messages|userMessage|content)\s*:/, "the audit log must not record question text while the notice says we do not store it");
});

test("still not publishable: drafting is not approval", () => {
  for (const id of ["terms", "privacy"]) assert.equal(legalReadiness(id).publishable, false, `${id} stays behind the counsel gate`);
});
