/**
 * Founder decision 2026-10-23 (independent audit F03 / A-T03): no public sign-in, sign-up or email-collection
 * invitation until approved privacy and terms notices are published. Existing sessions and the auth infrastructure stay.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PUBLIC_SIGNUP_OPEN, SIGNUP_CLOSED_DETAIL, SIGNUP_CLOSED_NOTICE } from "./public-entry.mjs";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("closed by default: only an explicit NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN=1 build opens public sign-up", () => {
  if (process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN === undefined) assert.equal(PUBLIC_SIGNUP_OPEN, false);
  const src = read("src/lib/accounts/public-entry.mjs");
  assert.match(src, /export const PUBLIC_SIGNUP_OPEN = process\.env\.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN === "1";/, "a literal read (Next inlines only literal NEXT_PUBLIC_* reads)");
});

test("the closed notice names no environment variable and promises nothing it cannot keep", () => {
  for (const s of [SIGNUP_CLOSED_NOTICE, SIGNUP_CLOSED_DETAIL]) {
    assert.doesNotMatch(s, /NEXT_PUBLIC|SUPABASE|env/i);
  }
  assert.match(SIGNUP_CLOSED_DETAIL, /already signed in on this device, you still are/);
});

test("nav: the account link needs Supabase AND the public sign-up switch (literal reads)", () => {
  const nav = read("src/lib/navigation.ts");
  assert.match(nav, /\.\.\.\(process\.env\.NEXT_PUBLIC_SUPABASE_URL && process\.env\.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN === "1"\s*\? \[\{\s*href: "\/account"/);
});

test("/account: a signed-out visitor gets the paused notice, never the sign-in form; a signed-in person keeps their record", () => {
  const exp = read("src/components/accounts/account-experience.tsx");
  const closed = exp.indexOf("if (!user && !PUBLIC_SIGNUP_OPEN)");
  const panel = exp.indexOf("if (!user) return <SignInPanel />;");
  assert.ok(closed > 0 && panel > closed, "the closed gate is checked before the sign-in panel");
  assert.match(exp, /\{SIGNUP_CLOSED_NOTICE\}/);
  assert.doesNotMatch(read("src/app/account/page.tsx"), /description: "Sign in/, "no sign-in invitation in the page metadata");
});

test("no other public sign-up / sign-in invitation renders while closed", () => {
  const news = read("src/components/newsletter-signup.tsx");
  assert.match(news, /if \(!PUBLIC_SIGNUP_OPEN\) return null;/, "the email form renders nothing while closed");
  assert.ok(news.indexOf("if (!PUBLIC_SIGNUP_OPEN) return null;") > news.lastIndexOf("useState"), "after every hook");
  const feedback = read("src/components/accounts/beta-feedback-form.tsx");
  assert.match(feedback, /\{PUBLIC_SIGNUP_OPEN \? <> <Link href="\/account"/, "the testers' sign-in link is gated");
  for (const f of ["src/components/no-current-slate.tsx", "src/components/empty-results-card.tsx"]) {
    assert.doesNotMatch(read(f), /sign up below/i, `${f} no longer points at a hidden form`);
  }
});
