/**
 * §11's LAST LINE: "Responsible Use is not a substitute for Privacy or Terms."
 *
 * Today that risk is live rather than hypothetical. Terms and Privacy are correctly WITHHELD — the
 * publish gate wants a named reviewer, an effective date, and four founder facts — so
 * `/responsible-use` is the only policy-shaped link in the footer. A reader looking for a privacy
 * notice finds nothing, which is the honest state; what must not happen is Responsible Use quietly
 * growing into the thing that answers for them.
 *
 * Nothing here unblocks the gate. These guards keep the gap HONEST while it is open.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LEGAL_ROUTES, legalRouteIsPublic, legalReadiness } from "./texts.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const RESPONSIBLE_USE = read("src/app/responsible-use/page.tsx");

test("responsible-use makes no contractual or privacy claim", () => {
  /* Not a blanket ban on the WORDS — a page may legitimately point AT the policies. What it must not
     do is speak as them. These are the phrasings that would make it an agreement or a notice. */
  const speaksAsPolicy = [
    /\bthese terms\b/i,
    /\bterms of (use|service)\b/i,
    /\bprivacy (notice|policy)\b/i,
    /\bby (using|accessing) (this|the) (site|service)\b.*\byou agree\b/is,
    /\bwe (collect|retain|process|store) (your|personal)\b/i,
    /\bgoverned by\b/i,
    /\bbinding\b/i,
  ];
  for (const re of speaksAsPolicy) {
    assert.doesNotMatch(RESPONSIBLE_USE, re, `/responsible-use must not speak as a policy: ${re}`);
  }
});

test("while the gate is closed, no legal route is linked — and the reason is recorded", () => {
  for (const id of Object.keys(LEGAL_ROUTES)) {
    const ready = legalReadiness(id);
    if (ready.publishable) continue;
    assert.equal(legalRouteIsPublic(id), false, `${id} is unpublishable and must not be public`);
    /* An unpublishable document must SAY why. A silent withholding is indistinguishable from a
       missing page, and a founder cannot act on it. */
    assert.ok(ready.reasons.length > 0, `${id} is withheld with no stated reason`);
  }
});

test("the withheld documents name the founder facts that are missing, not just 'not approved'", () => {
  /* The gate is a FOUNDER gate, and the value of this test is that the outstanding items stay
     legible. If these ever collapse to a bare "not approved", the founder loses the checklist. */
  const outstanding = new Set();
  for (const id of Object.keys(LEGAL_ROUTES)) {
    const r = legalReadiness(id);
    for (const p of r.unresolved ?? []) outstanding.add(p);
    for (const p of r.placeholders ?? []) outstanding.add(p);
  }
  if (outstanding.size === 0) return; // the gate has opened; nothing to keep legible
  for (const expected of ["contact", "effectiveDate"]) {
    assert.ok(outstanding.has(expected), `the outstanding list should still name ${expected}`);
  }
});

test("a placeholder operator can never become a party to the terms", () => {
  const r = legalReadiness("terms");
  if (!r.placeholders?.includes("operator")) return; // resolved; the rule below no longer applies
  assert.equal(r.publishable, false);
  assert.ok(
    r.reasons.some((x) => /stand-in cannot be a party/i.test(x)),
    "the refusal must say why a placeholder operator is disqualifying, not merely that it is",
  );
});
